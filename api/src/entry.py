import json
import time
from typing import Literal

from fastapi import FastAPI, HTTPException, Path, Request
from pydantic import BaseModel, Field
from workers import fetch
from workers.asgi import entrypoint, env

from review.analyze import AnalysisError, AnalyzeRequest, analyze, parse_game
from review.coach import add_coach
from review.player import summarize
from review.fetchers import UpstreamError, fetch_game_by_url, fetch_games, parse_game_url
from review.store import (
    add_coach_report,
    allow_analysis,
    claim_ai_slot,
    get_review,
    platform_of,
    player_reviews,
    put_review,
    stored_accuracies,
)

GAMES_TTL = 300  # seconds a fetched game list stays in KV
GAME_URL_TTL = 3600  # seconds a single game fetched by URL stays in KV
# Hard ceiling on coach AI calls per rolling day; past it, reviews still work with fact-based comments.
AI_DAILY_CAP = 300

app = FastAPI()


class GameByUrlRequest(BaseModel):
    url: str = Field(max_length=500)


class CoachReportRequest(BaseModel):
    game_hash: str = Field(pattern=r"^[0-9a-f]{64}$")
    ply: int = Field(ge=0, le=1000)
    reason: str = Field(min_length=1, max_length=200)


@app.get("/api/health")
async def health():
    return {"ok": True}


USERNAME = Path(pattern=r"^[A-Za-z0-9_-]{1,30}$")


def _game_hash(pgn: str) -> str | None:
    try:
        return parse_game(pgn).hash
    except AnalysisError:
        return None


async def cached_games(env, platform: str, username: str) -> list[dict]:
    """Recent games from KV or upstream."""
    key = f"games:{platform}:{username.lower()}"
    if cached := await env.CACHE.get(key):
        return json.loads(cached)
    try:
        result = await fetch_games(fetch, platform, username)
    except UpstreamError as e:
        raise HTTPException(e.status, str(e)) from e
    await env.CACHE.put(key, json.dumps(result), {"expirationTtl": GAMES_TTL})
    return result


@app.get("/api/games/{platform}/{username}")
async def games(platform: Literal["chesscom", "lichess"], username: str = USERNAME, env=env):
    return {"games": await cached_games(env, platform, username)}


@app.post("/api/game-by-url")
async def game_by_url(req: GameByUrlRequest, env=env):
    ref = parse_game_url(req.url)
    if ref is None:
        raise HTTPException(422, "Paste a Chess.com or Lichess game link")
    key = ref.cache_key
    if cached := await env.CACHE.get(key):
        return json.loads(cached)
    try:
        game = await fetch_game_by_url(fetch, ref)
    except UpstreamError as e:
        raise HTTPException(e.status, str(e)) from e
    try:
        parsed = parse_game(game["pgn"])
    except AnalysisError as e:
        msg = "Only standard chess games are supported" if "standard" in str(e).lower() else "Could not read moves from that game"
        raise HTTPException(422, msg) from e
    result = {**game, "hash": parsed.hash}
    await env.CACHE.put(key, json.dumps(result), {"expirationTtl": GAME_URL_TTL})
    return result


@app.get("/api/player/{platform}/{username}")
async def player(platform: Literal["chesscom", "lichess"], username: str = USERNAME, env=env):
    """Recent games (marked when already reviewed) plus the player's reviewed history and recurring mistakes."""
    recent = await cached_games(env, platform, username)
    me = username.lower()
    if any("hash" not in g for g in recent):
        for g in recent:
            g.setdefault("hash", _game_hash(g["pgn"]))
        await env.CACHE.put(f"games:{platform}:{me}", json.dumps(recent), {"expirationTtl": GAMES_TTL})
    stored = await stored_accuracies(env.DB, [g["hash"] for g in recent if g.get("hash")])
    for g in recent:
        acc = stored.get(g.get("hash"))
        side = "white" if g["white"]["name"].lower() == me else "black" if g["black"]["name"].lower() == me else None
        g["reviewed"] = {"accuracy": acc[side]} if acc and side else None
    summary_key = f"player_summary:{platform}:{me}"
    if cached_summary := await env.CACHE.get(summary_key):
        summary = json.loads(cached_summary)
    else:
        summary = summarize(await player_reviews(env.DB, platform, username), username)
        await env.CACHE.put(summary_key, json.dumps(summary), {"expirationTtl": GAMES_TTL})
    return {"username": username, "platform": platform, "games": recent, **summary}


@app.get("/api/review/{game_hash}")
async def review(game_hash: str = Path(pattern=r"^[0-9a-f]{64}$"), env=env):
    """A shared review by its game hash: what share links (/review?g=<hash>) open."""
    if report := await get_review(env.DB, game_hash):
        return report
    raise HTTPException(404, "review not found")


@app.post("/api/report")
async def report_coach(req: CoachReportRequest, request: Request, env=env):
    """Record a user report flagging an AI-generated coach note."""
    reason = req.reason.strip()
    if not reason:
        raise HTTPException(422, "Please choose or enter a reason")
    ip = request.headers.get("cf-connecting-ip", "unknown")
    if not await add_coach_report(env.DB, req.game_hash, req.ply, reason, ip, int(time.time())):
        raise HTTPException(429, "Too many reports from your connection today. Try again later.")
    return {"ok": True}


@app.post("/api/analyze")
async def analyze_game(req: AnalyzeRequest, request: Request, env=env):
    try:
        parsed = parse_game(req.pgn)
        if not req.fresh and (cached := await get_review(env.DB, parsed.hash)):
            return cached
        if req.evals is None:
            raise HTTPException(404, "not analyzed yet")
        # Only new analyses cost anything (CPU, and an AI call for shared ones), so only they are limited.
        # Counted in D1 rather than with Workers rate limits, which count per Cloudflare location.
        if not await allow_analysis(env.DB, request.headers.get("cf-connecting-ip", "unknown"), int(time.time())):
            raise HTTPException(429, "Too many new analyses from your connection. Try again later.")
        report = analyze(parsed, req.evals)
    except AnalysisError as e:
        raise HTTPException(422, str(e)) from e

    if req.fresh:
        # Private re-analysis: no AI spend, and the shared copy is never touched.
        await add_coach(report, None)
        return report
    use_ai = await claim_ai_slot(env.DB, parsed.hash, int(time.time()), AI_DAILY_CAP)
    await add_coach(report, (lambda model, inputs: env.AI.run(model, inputs)) if use_ai else None)
    await put_review(env.DB, report, req.pgn)
    plat = platform_of(report["headers"])
    if plat in ("chesscom", "lichess"):
        for side_key in ("White", "Black"):
            if name := report["headers"].get(side_key):
                await env.CACHE.delete(f"player_summary:{plat}:{name.lower()}")
    return report


Default = entrypoint(app)

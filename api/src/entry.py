import json
import time
from typing import Literal

from fastapi import FastAPI, HTTPException, Path, Request
from workers import fetch
from workers.asgi import entrypoint, env

from review.analyze import AnalysisError, AnalyzeRequest, analyze, parse_game
from review.coach import add_coach
from review.player import summarize
from review.fetchers import UpstreamError, fetch_games
from review.store import allow_analysis, get_review, player_reviews, put_review, reviews_last_day, stored_accuracies

GAMES_TTL = 300  # seconds a fetched game list stays in KV
# Hard ceiling on coach AI calls per rolling day; past it, reviews still work with fact-based comments.
AI_DAILY_CAP = 300

app = FastAPI()


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
    """Recent games from KV or upstream, each stamped with its review hash (computed once, on a cache miss)."""
    key = f"games:{platform}:{username.lower()}"
    if cached := await env.CACHE.get(key):
        return json.loads(cached)
    try:
        result = await fetch_games(fetch, platform, username)
    except UpstreamError as e:
        raise HTTPException(e.status, str(e)) from e
    for game in result:
        game["hash"] = _game_hash(game["pgn"])
    await env.CACHE.put(key, json.dumps(result), {"expirationTtl": GAMES_TTL})
    return result


@app.get("/api/games/{platform}/{username}")
async def games(platform: Literal["chesscom", "lichess"], username: str = USERNAME, env=env):
    return {"games": await cached_games(env, platform, username)}


@app.get("/api/player/{platform}/{username}")
async def player(platform: Literal["chesscom", "lichess"], username: str = USERNAME, env=env):
    """Recent games (marked when already reviewed) plus the player's reviewed history and recurring mistakes."""
    recent = await cached_games(env, platform, username)
    stored = await stored_accuracies(env.DB, [g["hash"] for g in recent if g.get("hash")])
    me = username.lower()
    for g in recent:
        acc = stored.get(g.get("hash"))
        side = "white" if g["white"]["name"].lower() == me else "black"
        g["reviewed"] = {"accuracy": acc[side]} if acc else None
    return {"username": username, "platform": platform, "games": recent, **summarize(await player_reviews(env.DB, username), username)}


@app.get("/api/review/{game_hash}")
async def review(game_hash: str = Path(pattern=r"^[0-9a-f]{64}$"), env=env):
    """A shared review by its game hash: what share links (/review?g=<hash>) open."""
    if report := await get_review(env.DB, game_hash):
        return report
    raise HTTPException(404, "review not found")


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
    use_ai = await reviews_last_day(env.DB) < AI_DAILY_CAP
    await add_coach(report, (lambda model, inputs: env.AI.run(model, inputs)) if use_ai else None)
    await put_review(env.DB, report, req.pgn)
    return report


Default = entrypoint(app)

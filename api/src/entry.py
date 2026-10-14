import json
from typing import Literal

from fastapi import FastAPI, HTTPException, Path
from workers import fetch
from workers.asgi import entrypoint, env

from review.analyze import AnalysisError, AnalyzeRequest, analyze, parse_game
from review.coach import add_coach
from review.fetchers import UpstreamError, fetch_games
from review.store import get_review, put_review

GAMES_TTL = 300  # seconds a fetched game list stays in KV

app = FastAPI()


@app.get("/api/health")
async def health():
    return {"ok": True}


@app.get("/api/games/{platform}/{username}")
async def games(platform: Literal["chesscom", "lichess"], username: str = Path(pattern=r"^[A-Za-z0-9_-]{1,30}$"), env=env):
    key = f"games:{platform}:{username.lower()}"
    if cached := await env.CACHE.get(key):
        return {"games": json.loads(cached)}
    try:
        result = await fetch_games(fetch, platform, username)
    except UpstreamError as e:
        raise HTTPException(e.status, str(e)) from e
    await env.CACHE.put(key, json.dumps(result), {"expirationTtl": GAMES_TTL})
    return {"games": result}


@app.post("/api/analyze")
async def analyze_game(req: AnalyzeRequest, env=env):
    try:
        parsed = parse_game(req.pgn)
        if cached := await get_review(env.DB, parsed.hash):
            return cached
        if req.evals is None:
            raise HTTPException(404, "not analyzed yet")
        report = analyze(parsed, req.evals)
    except AnalysisError as e:
        raise HTTPException(422, str(e)) from e

    await add_coach(report, lambda model, inputs: env.AI.run(model, inputs))
    await put_review(env.DB, report, req.pgn)
    return report


Default = entrypoint(app)

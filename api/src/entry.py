from typing import Literal

from fastapi import FastAPI, HTTPException, Path
from workers import fetch
from workers.asgi import entrypoint

from review.analyze import AnalysisError, AnalyzeRequest, analyze
from review.fetchers import UpstreamError, fetch_games

app = FastAPI()


@app.get("/api/health")
async def health():
    return {"ok": True}


@app.get("/api/games/{platform}/{username}")
async def games(platform: Literal["chesscom", "lichess"], username: str = Path(pattern=r"^[A-Za-z0-9_-]{1,30}$")):
    try:
        return {"games": await fetch_games(fetch, platform, username)}
    except UpstreamError as e:
        raise HTTPException(e.status, str(e)) from e


@app.post("/api/analyze")
async def analyze_game(req: AnalyzeRequest):
    try:
        return analyze(req)
    except AnalysisError as e:
        raise HTTPException(422, str(e)) from e


Default = entrypoint(app)

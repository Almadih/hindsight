"""Chess.com / Lichess recent-game fetchers.

`fetch` is injected (workers.fetch in the Worker) so the parsers stay testable without the runtime.
"""

import json

# Chess.com asks API clients to identify themselves with a way to reach them.
USER_AGENT = "chess-game-review/0.2 (+https://chess-review.almadih.workers.dev)"
MAX_GAMES = 30


class UpstreamError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def _result(white_won: bool, black_won: bool) -> str:
    return "1-0" if white_won else "0-1" if black_won else "1/2-1/2"


def parse_chesscom(archives: list[dict]) -> list[dict]:
    games = [g for month in archives for g in month.get("games", []) if g.get("rules") == "chess" and g.get("pgn")]
    games.sort(key=lambda g: g.get("end_time", 0), reverse=True)
    return [
        {
            "id": g["url"].rsplit("/", 1)[-1],
            "url": g["url"],
            "pgn": g["pgn"],
            "white": {"name": g["white"]["username"], "rating": g["white"].get("rating")},
            "black": {"name": g["black"]["username"], "rating": g["black"].get("rating")},
            "result": _result(g["white"].get("result") == "win", g["black"].get("result") == "win"),
            "timeClass": g.get("time_class"),
            "endTime": g.get("end_time", 0) * 1000,
        }
        for g in games[:MAX_GAMES]
    ]


def _lichess_player(p: dict) -> dict:
    name = p["user"]["name"] if "user" in p else f'Stockfish level {p.get("aiLevel", "?")}'
    return {"name": name, "rating": p.get("rating")}


def parse_lichess(ndjson: str) -> list[dict]:
    out = []
    for line in ndjson.splitlines():
        if not line.strip():
            continue
        g = json.loads(line)
        if g.get("variant") != "standard" or not g.get("pgn"):
            continue
        out.append(
            {
                "id": g["id"],
                "url": f'https://lichess.org/{g["id"]}',
                "pgn": g["pgn"],
                "white": _lichess_player(g["players"]["white"]),
                "black": _lichess_player(g["players"]["black"]),
                "result": _result(g.get("winner") == "white", g.get("winner") == "black"),
                "timeClass": g.get("speed"),
                "endTime": g.get("lastMoveAt", 0),
            }
        )
    return out


async def _get(fetch, url: str, accept: str = "application/json"):
    resp = await fetch(url, headers={"User-Agent": USER_AGENT, "Accept": accept})
    if resp.status == 404:
        raise UpstreamError(404, "player not found")
    if resp.status != 200:
        raise UpstreamError(502, f"upstream returned {resp.status}")
    return resp


async def fetch_games(fetch, platform: str, username: str) -> list[dict]:
    """platform and username must already be validated; they go straight into the URL."""
    if platform == "chesscom":
        index = await (await _get(fetch, f"https://api.chess.com/pub/player/{username.lower()}/games/archives")).json()
        months = [await (await _get(fetch, url)).json() for url in index.get("archives", [])[-2:]]
        return parse_chesscom(months)
    text = await (
        await _get(fetch, f"https://lichess.org/api/games/user/{username}?max={MAX_GAMES}&pgnInJson=true", "application/x-ndjson")
    ).text()
    return parse_lichess(text)

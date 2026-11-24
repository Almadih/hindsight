"""Chess.com / Lichess game fetchers (recent player games and single-game URL lookup).

`fetch` is injected (workers.fetch in the Worker) so the parsers stay testable without the runtime.
"""

import asyncio
from dataclasses import dataclass
import json
import re
from typing import Literal
from urllib.parse import urlsplit

import chess
import chess.pgn

# Chess.com asks API clients to identify themselves with a way to reach them.
USER_AGENT = "chess-game-review/0.2 (+https://chess-review.almadih.workers.dev)"
MAX_GAMES = 30

CHESSCOM_HOSTS = frozenset({"chess.com", "www.chess.com", "m.chess.com"})
LICHESS_HOSTS = frozenset({"lichess.org", "www.lichess.org", "m.lichess.org"})
# Non-game 8-char Lichess routes so pasting e.g. lichess.org/training fails fast with 422.
LICHESS_RESERVED = frozenset(
    {"training", "analysis", "practice", "settings", "insights", "timeline", "streamer", "broadcast"}
)
_LICHESS_ID_RE = re.compile(r"^[A-Za-z0-9]{8}(?:[A-Za-z0-9]{4})?$")
_CHESSCOM_ID_RE = re.compile(r"^[0-9]{1,20}$")
_LOCALE_RE = re.compile(r"^[a-z]{2}(?:-[a-z]{2})?$")
_CHESSCOM_ANALYSIS_TABS = frozenset({"review", "analysis", "explorer", "moves"})

# Chess.com Two-Character Notation (TCN) alphabet: 0..63 map to a1..h8; >63 encode promotions/drops.
_TCN_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?{~}(^)[_]@#$,./&-*++="
_TCN_PROMOS = (chess.QUEEN, chess.KNIGHT, chess.ROOK, chess.BISHOP)
_CASTLE_KING_TO_ROOK = {
    (chess.E1, chess.H1): chess.G1,
    (chess.E1, chess.A1): chess.C1,
    (chess.E8, chess.H8): chess.G8,
    (chess.E8, chess.A8): chess.C8,
}
_LICHESS_DRAW_STATUSES = frozenset(
    {"draw", "stalemate", "insufficientMaterialClaim", "fiftyMoves", "threefoldRepetition"}
)


class UpstreamError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


@dataclass(frozen=True)
class GameRef:
    platform: Literal["chesscom", "lichess"]
    kind: Literal["live", "daily", "game"]
    game_id: str

    @property
    def canonical_url(self) -> str:
        if self.platform == "chesscom":
            return f"https://www.chess.com/game/{self.kind}/{self.game_id}"
        return f"https://lichess.org/{self.game_id}"

    @property
    def cache_key(self) -> str:
        return f"game_url:{self.platform}:{self.kind}:{self.game_id}"


def parse_game_url(raw: str) -> GameRef | None:
    """Strictly parse a Chess.com or Lichess game URL into a validated GameRef.

    Never returns raw user host/path; callers construct upstream API URLs from hardcoded templates.
    """
    if not isinstance(raw, str):
        return None
    s = raw.strip()
    if not s or len(s) > 500:
        return None
    # Reject whitespace, control characters, and backslashes (classic authority-confusion bypass).
    if "\\" in s or any(ord(c) <= 0x20 or ord(c) == 0x7F for c in s):
        return None

    if "://" in s:
        parsed = urlsplit(s)
        if parsed.scheme.lower() not in ("http", "https"):
            return None
    else:
        # Reject scheme-relative ("//host") and non-http schemes ("javascript:", "chess.com:8080/...").
        if s.startswith("//") or ":" in s.split("/", 1)[0]:
            return None
        parsed = urlsplit(f"https://{s}")

    # Exact match on netloc simultaneously rejects userinfo (@), explicit ports, IPs, and lookalike subdomains.
    host = parsed.netloc.lower()
    parts = [p for p in parsed.path.split("/") if p]
    if not parts:
        return None

    if host in LICHESS_HOSTS:
        raw_id: str | None = None
        if len(parts) == 1:
            if parts[0].lower() not in LICHESS_RESERVED:
                raw_id = parts[0]
        elif len(parts) == 2 and parts[1].lower() in ("white", "black"):
            if parts[0].lower() not in LICHESS_RESERVED:
                raw_id = parts[0]
        elif len(parts) == 2 and parts[0].lower() == "game":
            raw_id = parts[1]
        elif len(parts) == 3 and parts[0].lower() == "game" and parts[1].lower() == "export":
            raw_id = parts[2][:-4] if parts[2].lower().endswith(".pgn") else parts[2]
        if raw_id and _LICHESS_ID_RE.fullmatch(raw_id):
            return GameRef(platform="lichess", kind="game", game_id=raw_id[:8])
        return None

    if host in CHESSCOM_HOSTS:
        if _LOCALE_RE.fullmatch(parts[0].lower()):
            parts = parts[1:]
        kind: Literal["live", "daily"] | None = None
        gid: str | None = None
        if len(parts) == 3 and parts[0].lower() == "game" and parts[1].lower() in ("live", "daily"):
            kind = parts[1].lower()  # type: ignore[assignment]
            gid = parts[2]
        elif len(parts) == 3 and parts[0].lower() in ("live", "daily") and parts[1].lower() == "game":
            kind = parts[0].lower()  # type: ignore[assignment]
            gid = parts[2]
        elif (
            len(parts) in (4, 5)
            and parts[0].lower() == "analysis"
            and parts[1].lower() == "game"
            and parts[2].lower() in ("live", "daily")
            and (len(parts) == 4 or parts[4].lower() in _CHESSCOM_ANALYSIS_TABS)
        ):
            kind = parts[2].lower()  # type: ignore[assignment]
            gid = parts[3]
        if kind and gid and _CHESSCOM_ID_RE.fullmatch(gid):
            return GameRef(platform="chesscom", kind=kind, game_id=gid)
        return None

    return None


def _result(white_won: bool, black_won: bool) -> str:
    return "1-0" if white_won else "0-1" if black_won else "1/2-1/2"


def _opt_int(value) -> int | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, int):
        return value
    try:
        return int(str(value).strip())
    except ValueError:
        return None


def _clean_header(value) -> str:
    return str(value).replace("\\'", "'").strip()


def decode_tcn(move_list: str, board: chess.Board) -> list[chess.Move]:
    """Decode Chess.com's 2-character-per-move TCN string against `board`."""
    if not isinstance(move_list, str) or not move_list or len(move_list) % 2 != 0:
        raise ValueError("invalid moveList")
    b = board.copy(stack=False)
    moves: list[chess.Move] = []
    for i in range(0, len(move_list), 2):
        from_idx = _TCN_CHARS.find(move_list[i])
        to_idx = _TCN_CHARS.find(move_list[i + 1])
        if from_idx < 0 or to_idx < 0:
            raise ValueError(f"unknown TCN character at {i}")
        if from_idx > 63:
            # Piece drops (crazyhouse / bughouse) are non-standard variants.
            raise UpstreamError(422, "Only standard chess games are supported")
        promo: int | None = None
        if to_idx > 63:
            promo_idx = (to_idx - 64) // 3
            if promo_idx >= len(_TCN_PROMOS):
                raise ValueError(f"unsupported promotion at {i}")
            promo = _TCN_PROMOS[promo_idx]
            delta = (to_idx - 64) % 3 - 1
            if not (0 <= (from_idx % 8) + delta <= 7):
                raise ValueError(f"promotion file out of bounds at {i}")
            to_idx = from_idx + (-8 if from_idx < 16 else 8) + delta
            if not (0 <= to_idx <= 63):
                raise ValueError(f"promotion square out of bounds at {i}")
        move = chess.Move(from_idx, to_idx, promotion=promo)
        if move not in b.legal_moves and promo is None and b.piece_type_at(from_idx) == chess.KING:
            alt_to = _CASTLE_KING_TO_ROOK.get((from_idx, to_idx))
            if alt_to is not None:
                alt = chess.Move(from_idx, alt_to)
                if alt in b.legal_moves:
                    move = alt
        if move not in b.legal_moves:
            raise ValueError(f"illegal move {move.uci()} at ply {len(moves)}")
        b.push(move)
        moves.append(move)
    return moves


def _chesscom_time_class(game: dict, kind: str, headers: dict) -> str | None:
    if kind == "daily" or game.get("daysPerTurn"):
        return "daily"
    base_s: float | None = None
    inc_s: float = 0.0
    tc = game.get("timeControl")
    if isinstance(tc, dict) and isinstance(tc.get("baseMs"), (int, float)):
        base_s = tc["baseMs"] / 1000.0
        inc_s = float(tc.get("incrementMs") or 0) / 1000.0
    elif isinstance(game.get("baseTime1"), (int, float)):
        # Chess.com callback baseTime1/timeIncrement1 are in tenths of a second.
        base_s = game["baseTime1"] / 10.0
        inc_s = float(game.get("timeIncrement1") or 0) / 10.0
    else:
        raw_tc = str(headers.get("TimeControl") or "").strip()
        if raw_tc.startswith("1/"):
            return "daily"
        if raw_tc and raw_tc != "-":
            parts = raw_tc.split("+", 1)
            try:
                base_s = float(parts[0])
                inc_s = float(parts[1]) if len(parts) == 2 else 0.0
            except ValueError:
                base_s = None
    if base_s is None:
        return None
    estimated = base_s + 40.0 * inc_s
    if estimated < 180:
        return "bullet"
    if estimated < 600:
        return "blitz"
    return "rapid"


def _chesscom_players(data: dict, headers: dict) -> tuple[dict, dict]:
    by_color: dict[str, dict] = {}
    players = data.get("players")
    if isinstance(players, dict):
        for slot in ("bottom", "top"):
            p = players.get(slot)
            if isinstance(p, dict) and p.get("color") in ("white", "black"):
                by_color[p["color"]] = p

    def _side(color: str, name_hdr: str, elo_hdr: str) -> dict:
        p = by_color.get(color, {})
        name = p.get("username") or headers.get(name_hdr) or "?"
        rating = _opt_int(p.get("rating"))
        if rating is None:
            rating = _opt_int(headers.get(elo_hdr))
        return {"name": str(name), "rating": rating}

    return _side("white", "White", "WhiteElo"), _side("black", "Black", "BlackElo")


def parse_chesscom_game(data: dict, kind: str, game_id: str) -> dict:
    """Parse a Chess.com callback live/daily game payload into PGN + normalized metadata."""
    if not isinstance(data, dict) or not isinstance(data.get("game"), dict):
        raise UpstreamError(404, "Game not found")
    game = data["game"]
    headers = game.get("pgnHeaders") if isinstance(game.get("pgnHeaders"), dict) else {}

    game_type = str(game.get("type") or "").strip().lower()
    variant_hdr = str(headers.get("Variant") or "").strip().lower()
    type_name = str(game.get("typeName") or "").strip().lower()
    if (
        (game_type and game_type != "chess")
        or (variant_hdr and variant_hdr not in ("standard", "chess"))
        or (not game_type and type_name and "standard" not in type_name and type_name != "chess")
    ):
        raise UpstreamError(422, "Only standard chess games are supported")

    raw_fen = str(game.get("initialSetup") or headers.get("FEN") or "").strip()
    if raw_fen and raw_fen != chess.STARTING_FEN:
        try:
            board = chess.Board(raw_fen)
        except ValueError as e:
            raise UpstreamError(422, "Only standard chess games are supported") from e
    else:
        board = chess.Board()

    white, black = _chesscom_players(data, headers)
    hdr_result = str(headers.get("Result") or "").strip()
    if game.get("isFinished") is False:
        result = "*"
    elif hdr_result in ("1-0", "0-1", "1/2-1/2"):
        result = hdr_result
    elif game.get("colorOfWinner") == "white":
        result = "1-0"
    elif game.get("colorOfWinner") == "black":
        result = "0-1"
    elif game.get("isFinished"):
        result = "1/2-1/2"
    else:
        result = "*"

    canonical_url = f"https://www.chess.com/game/{kind}/{game_id}"
    move_list = game.get("moveList")
    if isinstance(move_list, str) and move_list:
        try:
            moves = decode_tcn(move_list, board)
        except UpstreamError:
            raise
        except ValueError as e:
            raise UpstreamError(422, "Could not read moves from that game") from e
        pgn_game = chess.pgn.Game()
        pgn_game.headers["Event"] = _clean_header(headers.get("Event") or ("Live Chess" if kind == "live" else "Daily Chess"))
        pgn_game.headers["Site"] = _clean_header(headers.get("Site") or "Chess.com")
        pgn_game.headers["Date"] = _clean_header(headers.get("Date") or "????.??.??")
        pgn_game.headers["White"] = white["name"]
        pgn_game.headers["Black"] = black["name"]
        pgn_game.headers["Result"] = result
        if white["rating"] is not None:
            pgn_game.headers["WhiteElo"] = str(white["rating"])
        if black["rating"] is not None:
            pgn_game.headers["BlackElo"] = str(black["rating"])
        for extra in ("TimeControl", "ECO", "Termination", "EndDate", "EndTime"):
            if headers.get(extra) not in (None, ""):
                pgn_game.headers[extra] = _clean_header(headers[extra])
        pgn_game.headers["Link"] = canonical_url
        if board.fen() != chess.STARTING_FEN:
            pgn_game.setup(board)
        node = pgn_game
        for move in moves:
            node = node.add_variation(move)
        pgn = str(pgn_game)
    elif isinstance(game.get("pgn"), str) and game["pgn"].strip():
        pgn = game["pgn"]
    else:
        raise UpstreamError(422, "Could not read moves from that game")

    return {
        "pgn": pgn,
        "url": canonical_url,
        "platform": "chesscom",
        "white": white,
        "black": black,
        "result": result,
        "timeClass": _chesscom_time_class(game, kind, headers),
    }


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
    if isinstance(p.get("user"), dict) and p["user"].get("name"):
        name = p["user"]["name"]
    elif "aiLevel" in p:
        name = f'Stockfish level {p["aiLevel"]}'
    else:
        name = "Anonymous"
    return {"name": name, "rating": _opt_int(p.get("rating"))}


def parse_lichess_game(data: dict, game_id: str) -> dict:
    """Parse a single Lichess JSON game export payload into PGN + normalized metadata."""
    if not isinstance(data, dict):
        raise UpstreamError(502, "Invalid response from Lichess")
    if data.get("variant") != "standard":
        raise UpstreamError(422, "Only standard chess games are supported")
    pgn = data.get("pgn")
    if not isinstance(pgn, str) or not pgn.strip():
        raise UpstreamError(422, "Could not read moves from that game")
    players = data.get("players") if isinstance(data.get("players"), dict) else {}
    winner = data.get("winner")
    status = data.get("status")
    if winner == "white":
        result = "1-0"
    elif winner == "black":
        result = "0-1"
    elif status in _LICHESS_DRAW_STATUSES:
        result = "1/2-1/2"
    else:
        result = "*"
    return {
        "pgn": pgn,
        "url": f"https://lichess.org/{game_id}",
        "platform": "lichess",
        "white": _lichess_player(players.get("white") or {}),
        "black": _lichess_player(players.get("black") or {}),
        "result": result,
        "timeClass": data.get("speed"),
    }


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


async def _get(fetch, url: str, accept: str = "application/json", not_found: str = "player not found"):
    resp = await fetch(url, headers={"User-Agent": USER_AGENT, "Accept": accept})
    if resp.status == 404:
        raise UpstreamError(404, not_found)
    if resp.status != 200:
        raise UpstreamError(502, f"upstream returned {resp.status}")
    return resp


async def fetch_game_by_url(fetch, ref: GameRef) -> dict:
    """Fetch a single game using a validated GameRef and hardcoded upstream URL templates."""
    if ref.platform == "chesscom":
        if ref.kind not in ("live", "daily"):
            raise UpstreamError(422, "Paste a Chess.com or Lichess game link")
        url = f"https://www.chess.com/callback/{ref.kind}/game/{ref.game_id}"
        resp = await _get(fetch, url, "application/json", not_found="Game not found")
        try:
            data = await resp.json()
        except (ValueError, TypeError) as e:
            raise UpstreamError(502, "Invalid response from Chess.com") from e
        return parse_chesscom_game(data, ref.kind, ref.game_id)

    url = f"https://lichess.org/game/export/{ref.game_id}?pgnInJson=true&clocks=false&evals=false"
    resp = await _get(fetch, url, "application/json", not_found="Game not found")
    try:
        data = await resp.json()
    except (ValueError, TypeError) as e:
        raise UpstreamError(502, "Invalid response from Lichess") from e
    return parse_lichess_game(data, ref.game_id)


async def fetch_games(fetch, platform: str, username: str) -> list[dict]:
    """platform and username must already be validated; they go straight into the URL."""
    if platform == "chesscom":
        index = await (await _get(fetch, f"https://api.chess.com/pub/player/{username.lower()}/games/archives")).json()
        urls = index.get("archives", [])[-2:]
        if not urls:
            return []
        resps = await asyncio.gather(*[_get(fetch, u) for u in urls])
        months = await asyncio.gather(*[r.json() for r in resps])
        return parse_chesscom(months)
    text = await (
        await _get(fetch, f"https://lichess.org/api/games/user/{username}?max={MAX_GAMES}&pgnInJson=true", "application/x-ndjson")
    ).text()
    return parse_lichess(text)

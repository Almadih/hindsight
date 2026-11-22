"""Coach comments for key moves: one batched Workers AI call, with deterministic facts as the fallback.

`run_ai(model, inputs) -> dict` is injected (env.AI.run in the Worker) so this stays testable without the runtime.
"""

import json
import logging
import re

import chess

from .tactics import parse_move

# plan.md named @cf/meta/llama-3.1-8b-instruct; it was deprecated on 2026-05-30. This one supports JSON mode.
MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
MAX_MOVES = 8
PRIORITY = ["blunder", "miss", "mistake", "brilliant", "great"]
MAX_COMMENT = 300

SYSTEM = (
    "You are a sharp, friendly chess coach reviewing one game for the people who played it. "
    "For each move listed, write one or two short sentences that explain the idea behind it: what it attacks, "
    "defends, gives up or allows. Name the player and use the concrete pieces and squares from the facts. "
    "The verdict is already shown as a badge, so never restate it: do not start with 'This move', and do not "
    "write filler such as 'increasing winning chances' or 'maintaining a strong position'. "
    "Use only the facts given; never invent moves, variations or evaluations. "
    "Name only moves and squares that appear in the facts, the move itself or the engine's best move: "
    "a comment that names any other move or square is thrown away. With few facts, write less. "
    # The example must not come from any game we might review, or the model parrots it.
    "Good: 'Anna's Nf5 forks the queen on d6 and the rook on h6, so one of them falls next move.' "
    "Bad: 'This move was brilliant as it offers material, increasing White's winning chances.' "
    "Each move starts with [id N]; copy N exactly into the reply (it is not the move number). "
    'Reply with JSON only: {"comments": [{"id": <N>, "comment": "<text>"}]}.'
)

RESPONSE_FORMAT = {
    "type": "json_schema",
    "json_schema": {
        "type": "object",
        "properties": {
            "comments": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {"id": {"type": "integer"}, "comment": {"type": "string"}},
                    "required": ["id", "comment"],
                },
            }
        },
        "required": ["comments"],
    },
}


def key_moves(moves: list[dict]) -> list[dict]:
    """The most instructive moves, worst first by badge, capped and returned in game order."""
    picked = sorted((m for m in moves if m["badge"] in PRIORITY), key=lambda m: (PRIORITY.index(m["badge"]), m["ply"]))
    return sorted(picked[:MAX_MOVES], key=lambda m: m["ply"])


def _move_label(m: dict) -> str:
    number = (m["ply"] + 1) // 2
    return f"{number}.{'' if m['color'] == 'white' else '..'} {m['san']}"


# Moves and squares as they appear in text: Nf6, exd5, O-O, e4 (a pawn push reads as a square).
_TOKEN = re.compile(r"O-O(?:-O)?|\b(?:[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x[a-h][1-8]|[a-h][1-8])(?:=[QRBN])?[+#]?")
_SQUARE = re.compile(r"[a-h][1-8]")
_URL = re.compile(r"https?://|www\.|\b[a-z0-9-]+\.(?:com|net|org|io|dev|co|gg|xyz|me|ru|cn)\b", re.I)
MAX_NAME = 40


def _safe_name(raw: str | None, default: str) -> str:
    """Single-line, bounded player name safe to place in an LLM prompt."""
    if not raw:
        return default
    clean = " ".join(ch for ch in raw.replace("\r", " ").replace("\n", " ").split() if ch)
    if not clean or len(clean) > MAX_NAME or _URL.search(clean):
        return default
    return clean


def _sentence(fact: str) -> str:
    # Never capitalise a leading move: "bxa6" is not "Bxa6".
    return fact if _TOKEN.match(fact) else fact[0].upper() + fact[1:]


def _line_sans(fen: str | None, pv: list[str] | None, n: int = 6) -> list[str]:
    if not fen or not pv:
        return []
    board, out = chess.Board(fen), []
    for uci in pv[:n]:
        move = parse_move(board, uci)
        if move is None:
            break
        out.append(board.san(move))
        board.push(move)
    return out


def _grounded(comment: str, m: dict, report: dict) -> bool:
    """True if every move and square the comment names comes from this move's facts or engine lines."""
    if "\n" in comment or "\r" in comment or _URL.search(comment):
        return False
    by_ply = {x["ply"]: x for x in report["moves"]}
    prev = by_ply.get(m["ply"] - 1)
    before_fen = prev["fen"] if prev and prev.get("fen") else report["headers"].get("FEN", chess.STARTING_FEN)
    nxt = by_ply.get(m["ply"] + 1) or {}
    texts = [m["san"], *(a["san"] for a in m.get("alternatives") or []), *(m.get("tactics") or [])]
    texts += _line_sans(before_fen, m.get("bestPv")) + _line_sans(m.get("fen"), nxt.get("bestPv"))
    ucis = [m.get("uci") or "", *(a.get("uci") or "" for a in m.get("alternatives") or [])]
    ucis += (m.get("bestPv") or [])[:6] + (nxt.get("bestPv") or [])[:6]
    moves = {t.rstrip("+#") for text in texts for t in _TOKEN.findall(text)}
    squares = {sq for text in texts + ucis for sq in _SQUARE.findall(text)}
    for side in ("White", "Black"):
        name = _safe_name(report["headers"].get(side), side)
        comment = re.sub(rf"(?<!\w){re.escape(name)}(?!\w)", " ", comment)  # a name like "Kd4" isn't a move
    for token in _TOKEN.findall(comment):
        token = token.rstrip("+#")
        if token not in moves and not (_SQUARE.fullmatch(token) and token in squares):
            return False
    return True


def fallback(m: dict) -> str:
    facts = list(m.get("tactics") or [])
    best = m["alternatives"][0]["san"] if m.get("alternatives") else None
    if not facts and best and best != m["san"] and m["badge"] not in ("brilliant", "great"):
        facts.append(f"{best} was stronger")
    return " ".join(_sentence(f) + "." for f in facts)


def build_messages(report: dict, moves: list[dict]) -> list[dict]:
    h = report["headers"]
    white, black = _safe_name(h.get("White"), "White"), _safe_name(h.get("Black"), "Black")
    lines = [f"Game: {white} (White) vs {black} (Black). Opening: {report.get('opening') or 'unknown'}."]
    for m in moves:
        best = m["alternatives"][0]["san"] if m.get("alternatives") else None
        player = white if m["color"] == "white" else black
        line = (
            f"[id {m['ply']}] {player} ({m['color']}) played {_move_label(m)}, rated {m['badge']}. "
            f"Their winning chances went from {m['wBefore']:.0f}% to {m['wAfter']:.0f}%."
        )
        if best and best != m["san"]:
            line += f" The engine's best move was {best}."
        if m.get("tactics"):
            line += " Facts: " + "; ".join(m["tactics"]) + "."
        lines.append(line)
    return [{"role": "system", "content": SYSTEM}, {"role": "user", "content": "\n".join(lines)}]


def _content(raw):
    """The model's output from either Workers AI reply shape: {"response": ...} or OpenAI-style {"choices": [...]}."""
    if not isinstance(raw, dict):
        return raw
    if "response" in raw:
        return raw["response"]
    try:
        return raw["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        return raw


def parse_comments(raw, plies: set[int]) -> dict[int, str]:
    """Pull {ply: comment} out of whatever the model returned; anything malformed is skipped."""
    payload = _content(raw)
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except ValueError:
            return {}
    items = payload.get("comments", []) if isinstance(payload, dict) else payload
    out = {}
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict):
            continue
        ply, comment = item.get("id", item.get("ply")), item.get("comment")
        if isinstance(ply, str) and ply.isdigit():  # models sometimes quote numbers
            ply = int(ply)
        if isinstance(ply, int) and ply in plies and isinstance(comment, str) and comment.strip():
            out[ply] = comment.strip()[:MAX_COMMENT]
    return out


async def add_coach(report: dict, run_ai) -> None:
    """Set `coach` on key moves in place. Never raises: a failed AI call just means fact-based comments.

    Pass run_ai=None to skip the AI entirely (daily budget used up, or a private re-analysis).
    """
    moves = key_moves(report["moves"])
    if not moves:
        return
    comments = {}
    try:
        if run_ai is None:
            raise LookupError("AI skipped")
        raw = await run_ai(MODEL, {"messages": build_messages(report, moves), "response_format": RESPONSE_FORMAT, "max_tokens": 900})
        comments = parse_comments(raw, {m["ply"] for m in moves})
        if not comments:
            logging.warning("coach: AI reply had no usable comments: %.500r", raw)
    except LookupError:
        pass
    except Exception as e:  # noqa: BLE001 - the coach is optional; the review must still be returned
        logging.warning("coach: AI call failed, using fact-based comments: %r", e)
    for m in moves:
        comment = comments.get(m["ply"])
        if comment and not _grounded(comment, m, report):
            logging.warning("coach: dropped AI comment naming moves or squares outside the facts: %r", comment)
            comment = None
        m["coach"] = comment or fallback(m) or None

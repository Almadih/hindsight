"""Coach comments for key moves: one batched Workers AI call, with deterministic facts as the fallback.

`run_ai(model, inputs) -> dict` is injected (env.AI.run in the Worker) so this stays testable without the runtime.
"""

import json
import logging
import re

import chess

from .classify import VALUE
from .tactics import NAME, parse_move

# plan.md named @cf/meta/llama-3.1-8b-instruct; it was deprecated on 2026-05-30. This one supports JSON mode.
MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
MAX_MOVES = 10
PRIORITY = ["blunder", "miss", "brilliant", "mistake", "great"]
MAX_COMMENT = 500
MAX_TOKENS = 2400

SYSTEM = (
    "You are a sharp, encouraging chess coach reviewing one game so the players learn what went wrong, "
    "what to play instead, and what pattern to spot next time. "
    "For each move, write 2 to 3 crisp sentences on a single line (no newlines). "
    "Make sentence 1 a punchy, self-contained takeaway (under 110 characters) naming the core mistake or idea. "
    "Then explain the concrete consequence (punishment, missed tactic, or why alternatives fall short), "
    "what the stronger move achieves, and—only when the position clearly supports it—a brief practical pattern "
    "to watch for next time (never generic advice like 'calculate carefully' or 'stay alert'). "
    "Vary your sentence openings across the game: do not start every note with '<Player>'s <Move>', and never start "
    "with 'This move'. The verdict badge is already shown in the UI, so never restate it or quote raw win percentages. "
    "Never copy full engine lines verbatim; name only the 1 to 3 key moves that carry the idea. "
    "Use ONLY moves, squares, pieces, and facts present in that move's brief: any comment that names a move or square "
    "outside its brief is discarded. "
    "Good (error): 'Nxf2 drops the knight because the bishop on e3 guards f2 and leaves the d8-rook loose. "
    "Castling with O-O instead tucks the king away and keeps the rooks connected—check overloaded defenders before grabbing pawns.' "
    "Good (strong): 'Re7+ seizes the seventh rank and drives the king to g8 into a back-rank pin. "
    "Playing Kg1 instead lets the opponent trade rooks and equalize.' "
    "Bad: 'This move was a blunder that reduces winning chances. Next time, calculate more carefully.' "
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
    """The most instructive moves, prioritized by badge and win-chance swing, capped and returned in game order."""
    picked = sorted(
        (m for m in moves if m["badge"] in PRIORITY),
        key=lambda m: (PRIORITY.index(m["badge"]), -(m["wBefore"] - m["wAfter"]), m["ply"]),
    )
    if len(picked) < MAX_MOVES:
        extras = sorted(
            (m for m in moves if m["badge"] == "inaccuracy" and (m["wBefore"] - m["wAfter"]) >= 5.0),
            key=lambda m: (-(m["wBefore"] - m["wAfter"]), m["ply"]),
        )
        picked.extend(extras[: MAX_MOVES - len(picked)])
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


def _strip_names(text: str, report: dict) -> str:
    for side in ("White", "Black"):
        name = _safe_name(report["headers"].get(side), side)
        text = re.sub(rf"(?<!\w){re.escape(name)}(?!\w)", " ", text)  # a name like "Kd4" isn't a move
    return text


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


def _numbered_line(fen: str | None, pv: list[str] | None, n: int = 6) -> str:
    if not fen or not pv:
        return ""
    board, parts = chess.Board(fen), []
    for i, uci in enumerate(pv[:n]):
        move = parse_move(board, uci)
        if move is None:
            break
        san = board.san(move)
        if board.turn == chess.WHITE:
            parts.append(f"{board.fullmove_number}. {san}")
        elif i == 0:
            parts.append(f"{board.fullmove_number}... {san}")
        else:
            parts.append(san)
        board.push(move)
    return " ".join(parts)


def _board_notes(
    before_fen: str | None,
    after_fen: str | None,
    uci: str | None,
    phase: str | None,
) -> tuple[str | None, str | None, list[str]]:
    """Concise factual board context for one move: moved piece, material balance, pins/king/check notes."""
    moved_desc = None
    if before_fen and uci:
        try:
            before = chess.Board(before_fen)
        except ValueError:
            before = None
        if before is not None:
            move = parse_move(before, uci)
            if move is not None:
                pt = before.piece_type_at(move.from_square)
                f_sq, t_sq = chess.square_name(move.from_square), chess.square_name(move.to_square)
                if before.is_castling(move):
                    side_castle = "kingside" if chess.square_file(move.to_square) > chess.square_file(move.from_square) else "queenside"
                    moved_desc = f"king {f_sq} -> {t_sq} (castles {side_castle})"
                elif pt is not None:
                    details = []
                    if before.is_capture(move):
                        cap_pt = chess.PAWN if before.is_en_passant(move) else before.piece_type_at(move.to_square)
                        if cap_pt is not None:
                            details.append(f"captures {NAME[cap_pt]}")
                    if move.promotion:
                        details.append(f"promotes to {NAME[move.promotion]}")
                    suffix = f" ({', '.join(details)})" if details else ""
                    moved_desc = f"{NAME[pt]} {f_sq} -> {t_sq}{suffix}"

    if not after_fen:
        return moved_desc, None, []
    try:
        after = chess.Board(after_fen)
    except ValueError:
        return moved_desc, None, []

    diff = sum(
        (VALUE[p.piece_type] if p.color == chess.WHITE else -VALUE[p.piece_type])
        for p in after.piece_map().values()
        if p.piece_type != chess.KING
    )
    material_desc = "equal" if diff == 0 else f"White +{diff}" if diff > 0 else f"Black +{-diff}"

    notes: list[str] = []
    if phase == "middlegame":
        for color, home, label in ((chess.WHITE, chess.E1, "White"), (chess.BLACK, chess.E8, "Black")):
            if after.king(color) == home:
                notes.append(f"{label} king still uncastled on {chess.square_name(home)}")

    pin_count = 0
    for sq, p in after.piece_map().items():
        if p.piece_type in (chess.PAWN, chess.KING) or not after.is_pinned(p.color, sq):
            continue
        ksq = after.king(p.color)
        if ksq is None:
            continue
        mask = after.pin_mask(p.color, sq)
        pinner = next((a for a in after.attackers(not p.color, sq) if mask & chess.BB_SQUARES[a]), None)
        side_lbl = "White" if p.color == chess.WHITE else "Black"
        if pinner is not None:
            pinner_pt = after.piece_type_at(pinner)
            notes.append(
                f"{side_lbl} {NAME[p.piece_type]} on {chess.square_name(sq)} pinned to king on {chess.square_name(ksq)} "
                f"by {NAME[pinner_pt]} on {chess.square_name(pinner)}"
            )
        else:
            notes.append(f"{side_lbl} {NAME[p.piece_type]} on {chess.square_name(sq)} pinned to king on {chess.square_name(ksq)}")
        pin_count += 1
        if pin_count >= 2:
            break

    if after.is_check() and not after.is_checkmate():
        notes.append("gives check")

    return moved_desc, material_desc, notes[:3]


def _move_brief(report: dict, m: dict, by_ply: dict[int, dict], white: str, black: str) -> str:
    player = white if m["color"] == "white" else black
    prev = by_ply.get(m["ply"] - 1)
    nxt = by_ply.get(m["ply"] + 1) or {}
    before_fen = prev["fen"] if prev and prev.get("fen") else report["headers"].get("FEN", chess.STARTING_FEN)
    after_fen = m.get("fen")

    eval_str = ""
    if m.get("mateWhite") is not None:
        mw = m["mateWhite"]
        eval_str = " | eval checkmate" if mw == 0 else f" | eval {'White' if mw > 0 else 'Black'} mates in {abs(mw)}"
    elif m.get("evalWhite") is not None:
        eval_str = f" | eval {m['evalWhite']:+.1f}"

    lines = [
        f"[id {m['ply']}] {_move_label(m)} by {player} ({m['color']}) | {m.get('phase') or 'unknown'} | "
        f"{m['badge']} | win chances {m['wBefore']:.0f}% -> {m['wAfter']:.0f}%{eval_str}"
    ]
    if prev:
        lines.append(f"Previous move: {_move_label(prev)}")

    moved_desc, material_desc, notes = _board_notes(before_fen if after_fen else None, after_fen, m.get("uci"), m.get("phase"))
    if moved_desc and material_desc:
        lines.append(f"Moved: {moved_desc}. Material: {material_desc}.")
    elif material_desc:
        lines.append(f"Material: {material_desc}.")
    if notes:
        lines.append(f"Board: {'; '.join(notes)}.")
    if m.get("tactics"):
        lines.append("Facts: " + "; ".join(m["tactics"]) + ".")

    alts = m.get("alternatives") or []
    best = alts[0]["san"] if alts else None
    if m["badge"] in ("brilliant", "great"):
        cont = _numbered_line(before_fen, m.get("bestPv"))
        if cont:
            lines.append(f"Continuation: {cont}")
        if len(alts) >= 2:
            lines.append(
                f"Why other moves fall short: {alts[1]['san']} keeps only {alts[1]['w']:.0f}% win chances (vs {alts[0]['w']:.0f}%)."
            )
    else:
        refut = _numbered_line(after_fen, nxt.get("bestPv"))
        if refut:
            lines.append(f"Punishment after {m['san']}: {refut}")
        if best and best != m["san"]:
            best_line = _numbered_line(before_fen, m.get("bestPv"))
            lines.append(f"Better was {best}: {best_line}" if best_line else f"The engine's best move was {best}.")

    return "\n".join(lines)


def _grounded(comment: str, m: dict, report: dict, brief: str | None = None) -> bool:
    """True if every move and square the comment names comes from this move's brief, facts, or engine lines."""
    if "\n" in comment or "\r" in comment or _URL.search(comment):
        return False
    by_ply = {x["ply"]: x for x in report["moves"]}
    prev = by_ply.get(m["ply"] - 1)
    before_fen = prev["fen"] if prev and prev.get("fen") else report["headers"].get("FEN", chess.STARTING_FEN)
    nxt = by_ply.get(m["ply"] + 1) or {}
    texts = [m["san"], *(a["san"] for a in m.get("alternatives") or []), *(m.get("tactics") or [])]
    if prev and prev.get("san"):
        texts.append(prev["san"])
    texts += _line_sans(before_fen, m.get("bestPv")) + _line_sans(m.get("fen"), nxt.get("bestPv"))
    ucis = [m.get("uci") or "", *(a.get("uci") or "" for a in m.get("alternatives") or [])]
    if prev and prev.get("uci"):
        ucis.append(prev["uci"])
    ucis += (m.get("bestPv") or [])[:6] + (nxt.get("bestPv") or [])[:6]

    if brief is None and m.get("fen"):
        h = report["headers"]
        brief = _move_brief(report, m, by_ply, _safe_name(h.get("White"), "White"), _safe_name(h.get("Black"), "Black"))
    if brief:
        texts.append(_strip_names(brief, report))

    moves = {t.rstrip("+#") for text in texts for t in _TOKEN.findall(text)}
    squares = {sq for text in texts + ucis for sq in _SQUARE.findall(text)}
    clean_comment = _strip_names(comment, report)
    for token in _TOKEN.findall(clean_comment):
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


def build_messages(report: dict, moves: list[dict], briefs: dict[int, str] | None = None) -> list[dict]:
    h = report["headers"]
    white, black = _safe_name(h.get("White"), "White"), _safe_name(h.get("Black"), "Black")
    w_elo = str(h.get("WhiteElo") or "").strip()
    b_elo = str(h.get("BlackElo") or "").strip()
    w_label = f"{white} (White)" + (f" [{w_elo}]" if w_elo.isdigit() else "")
    b_label = f"{black} (Black)" + (f" [{b_elo}]" if b_elo.isdigit() else "")
    res = h.get("Result")
    res_str = f" Result: {res}." if res in ("1-0", "0-1", "1/2-1/2") else ""
    header = f"Game: {w_label} vs {b_label}.{res_str} Opening: {report.get('opening') or 'unknown'}."

    by_ply = {x["ply"]: x for x in report["moves"]}
    blocks = [header]
    for m in moves:
        blocks.append(briefs[m["ply"]] if briefs and m["ply"] in briefs else _move_brief(report, m, by_ply, white, black))
    return [{"role": "system", "content": SYSTEM}, {"role": "user", "content": "\n\n".join(blocks)}]


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
    h = report["headers"]
    white, black = _safe_name(h.get("White"), "White"), _safe_name(h.get("Black"), "Black")
    by_ply = {x["ply"]: x for x in report["moves"]}
    briefs = {m["ply"]: _move_brief(report, m, by_ply, white, black) for m in moves}
    comments = {}
    try:
        if run_ai is None:
            raise LookupError("AI skipped")
        raw = await run_ai(
            MODEL,
            {
                "messages": build_messages(report, moves, briefs=briefs),
                "response_format": RESPONSE_FORMAT,
                "max_tokens": MAX_TOKENS,
                "temperature": 0.4,
            },
        )
        comments = parse_comments(raw, {m["ply"] for m in moves})
        if not comments:
            logging.warning("coach: AI reply had no usable comments: %.500r", raw)
    except LookupError:
        pass
    except Exception as e:  # noqa: BLE001 - the coach is optional; the review must still be returned
        logging.warning("coach: AI call failed, using fact-based comments: %r", e)
    for m in moves:
        comment = comments.get(m["ply"])
        if comment and not _grounded(comment, m, report, brief=briefs[m["ply"]]):
            logging.warning("coach: dropped AI comment naming moves or squares outside the facts: %r", comment)
            comment = None
        m["coach"] = comment or fallback(m) or None

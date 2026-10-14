"""Coach comments for key moves: one batched Workers AI call, with deterministic facts as the fallback.

`run_ai(model, inputs) -> dict` is injected (env.AI.run in the Worker) so this stays testable without the runtime.
"""

import json
import logging

# plan.md named @cf/meta/llama-3.1-8b-instruct; it was deprecated on 2026-05-30. This one supports JSON mode.
MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
MAX_MOVES = 8
PRIORITY = ["blunder", "miss", "mistake", "brilliant", "great"]
MAX_COMMENT = 300

SYSTEM = (
    "You are a friendly, concise chess coach reviewing a student's game. "
    "For each move listed, write one or two short sentences explaining why it was good or bad. "
    "Use only the facts given; never invent moves or variations. "
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


def fallback(m: dict) -> str:
    facts = list(m.get("tactics") or [])
    best = m["alternatives"][0]["san"] if m.get("alternatives") else None
    if not facts and best and best != m["san"] and m["badge"] not in ("brilliant", "great"):
        facts.append(f"{best} was stronger")
    return " ".join(f[0].upper() + f[1:] + "." for f in facts)


def build_messages(report: dict, moves: list[dict]) -> list[dict]:
    h = report["headers"]
    lines = [f"Game: {h.get('White', 'White')} (White) vs {h.get('Black', 'Black')} (Black). Opening: {report.get('opening') or 'unknown'}."]
    for m in moves:
        best = m["alternatives"][0]["san"] if m.get("alternatives") else None
        line = (
            f"[id {m['ply']}] {m['color'].capitalize()} played {_move_label(m)}, rated {m['badge']}. "
            f"{m['color'].capitalize()}'s winning chances went from {m['wBefore']:.0f}% to {m['wAfter']:.0f}%."
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
    """Set `coach` on key moves in place. Never raises: a failed AI call just means fact-based comments."""
    moves = key_moves(report["moves"])
    if not moves:
        return
    try:
        raw = await run_ai(MODEL, {"messages": build_messages(report, moves), "response_format": RESPONSE_FORMAT, "max_tokens": 900})
        comments = parse_comments(raw, {m["ply"] for m in moves})
        if not comments:
            logging.warning("coach: AI reply had no usable comments: %.500r", raw)
    except Exception as e:  # noqa: BLE001 - the coach is optional; the review must still be returned
        logging.warning("coach: AI call failed, using fact-based comments: %r", e)
        comments = {}
    for m in moves:
        m["coach"] = comments.get(m["ply"]) or fallback(m) or None

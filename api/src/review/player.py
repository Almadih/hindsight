"""A player's reviewed games and recurring mistakes, from stored reviews (store.player_reviews rows)."""

import json
from collections import Counter

BAD = {"inaccuracy", "mistake", "miss", "blunder"}

# Mistake themes read off the tactical facts tactics.describe() attaches to each bad move.
THEMES: list[tuple[str, callable]] = [
    ("Left a piece hanging", lambda m: any(f.endswith(" hanging") for f in m["tactics"])),
    ("Walked into mate", lambda m: any(f.startswith("it allows mate") for f in m["tactics"])),
    ("Missed a mate", lambda m: any("would have started mate" in f for f in m["tactics"])),
    ("Let a capture through", lambda m: any(f.startswith("it allows ") and ", winning the " in f for f in m["tactics"])),
    ("Didn't punish a mistake", lambda m: m["badge"] == "miss"),
]


def _result(result: str | None, side: str) -> str:
    if result == "1/2-1/2":
        return "draw"
    if result in ("1-0", "0-1"):
        return "won" if (result == "1-0") == (side == "white") else "lost"
    return "unknown"


def summarize(rows: list[dict], username: str) -> dict:
    """Per-game history (newest first, as given) and the most common mistake themes for `username`."""
    me = username.lower()
    history = []
    themes = Counter()
    examples: dict[str, dict] = {}
    for row in rows:
        side = "white" if (row["white_username"] or "").lower() == me else "black" if (row["black_username"] or "").lower() == me else None
        if side is None:
            continue
        report = json.loads(row["report_json"])
        mine = [m for m in report["moves"] if m["color"] == side]
        other = "black" if side == "white" else "white"
        history.append(
            {
                "hash": row["game_hash"],
                "date": row["created_at"],
                "side": side,
                "opponent": report["headers"].get(other.capitalize(), "?"),
                "result": _result(report["headers"].get("Result"), side),
                "accuracy": report["accuracy"][side],
                "estElo": report.get("elo", {}).get(side),
                "counts": report["counts"][side],
            }
        )
        for m in mine:
            if m["badge"] not in BAD:
                continue
            for label, matches in THEMES:
                if matches(m):
                    themes[label] += 1
                    examples.setdefault(label, {"hash": row["game_hash"], "ply": m["ply"]})
    return {
        "history": history,
        "themes": [{"label": label, "count": n, "example": examples[label]} for label, n in themes.most_common()],
    }

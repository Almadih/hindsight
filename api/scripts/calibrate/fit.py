"""Fit Hindsight's accuracy and rating curves to real Chess.com games.

Input: data/games.jsonl from web/scripts/calibrate/collect.ts (Chess.com accuracies + our engine evals).
Run from api/: uv run python scripts/calibrate/fit.py
"""

import json
import math
import pathlib
import statistics
import sys
from collections import Counter

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "src"))

from review import elo, winprob  # noqa: E402
from review.analyze import AnalysisError, PositionEval, analyze, parse_game  # noqa: E402

DATA = pathlib.Path(__file__).parent / "data" / "games.jsonl"
BANDS = [0, 1000, 1500, 2000, 2500, 4000]


def band_label(r: float) -> str:
    i = next(i for i in range(len(BANDS) - 1) if BANDS[i] <= r < BANDS[i + 1])
    return f"{BANDS[i]}–{BANDS[i + 1] - 1}"


def game_acc(losses: list[float], k: float, w: float) -> float | None:
    """Our game accuracy with tunable loss scale k and harmonic weight w (current code: k=1, w=0.5)."""
    if not losses:
        return None
    accs = [max(0.0, min(100.0, 103.1668 * math.exp(-0.04354 * k * dw) - 3.1669)) for dw in losses]
    arith = sum(accs) / len(accs)
    harm = len(accs) / sum(1 / max(a, 1.0) for a in accs)
    return (1 - w) * arith + w * harm


def load():
    rows = []
    for line in DATA.read_text().splitlines():
        row = json.loads(line)
        try:
            report = analyze(parse_game(row["pgn"]), [PositionEval(**e) for e in row["evals"]])
        except AnalysisError as e:
            print("skip:", row["url"], e)
            continue
        for side in ("white", "black"):
            moves = [m for m in report["moves"] if m["color"] == side]
            rows.append(
                {
                    "url": row["url"],
                    "side": side,
                    "rating": row["ratings"][side],
                    "theirs": row["chesscom"][side],
                    "ours": report["accuracy"][side],
                    "losses": [max(0.0, m["wBefore"] - m["wAfter"]) for m in moves],
                    "badges": Counter(m["badge"] for m in moves),
                }
            )
    return rows


def errors(rows, k, w):
    diffs = [game_acc(r["losses"], k, w) - r["theirs"] for r in rows if r["losses"]]
    return statistics.mean(diffs), statistics.mean(abs(d) for d in diffs)


def main():
    rows = load()
    games = len({r["url"] for r in rows})
    print(f"{games} games, {len(rows)} player-games\n")

    bias, mae = errors(rows, 1.0, 0.5)
    print(f"current formula (k=1.00, w=0.50): bias {bias:+.1f}  MAE {mae:.1f}")
    best = min(((k / 100, w / 100) for k in range(50, 201, 5) for w in range(0, 101, 5)), key=lambda p: errors(rows, *p)[1])
    bias_b, mae_b = errors(rows, *best)
    print(f"best fit        (k={best[0]:.2f}, w={best[1]:.2f}): bias {bias_b:+.1f}  MAE {mae_b:.1f}\n")

    print("per band (current → fitted, our minus Chess.com):")
    for label in sorted({band_label(r["rating"]) for r in rows}, key=lambda s: int(s.split("–")[0])):
        sub = [r for r in rows if band_label(r["rating"]) == label]
        print(f"  {label:>10}: n={len(sub):2d}  {errors(sub, 1.0, 0.5)[0]:+5.1f} → {errors(sub, *best)[0]:+5.1f}")

    # Rating curve: fit elo's logistic to (fitted accuracy, real rating). Single games are noisy; report honestly.
    pts = [(game_acc(r["losses"], *best), r["rating"]) for r in rows if r["losses"]]

    def rating_mae(low, span, mid, scale):
        tot = 0.0
        for acc, rating in pts:
            a = min(max(acc, low + 0.5), low + span - 0.5)
            tot += abs(mid - scale * math.log(span / (a - low) - 1) - rating)
        return tot / len(pts)

    cur = (elo._LOW, elo._SPAN, elo._MID, elo._SCALE)
    grid = ((low, span, mid, scale) for low in range(30, 61, 5) for span in range(35, 71, 5) for mid in range(1000, 2201, 100) for scale in range(200, 1001, 50) if low + span <= 101)
    fit = min(grid, key=lambda p: rating_mae(*p))
    naive = statistics.mean(abs(statistics.mean(r for _, r in pts) - r) for _, r in pts)
    print(f"\nrating curve  current {cur}: MAE {rating_mae(*cur):.0f}")
    print(f"              fitted  {fit}: MAE {rating_mae(*fit):.0f}   (always guessing the mean: {naive:.0f})")

    print("\nbadges per player-game by band (brilliant / great / mistake / blunder / miss):")
    for label in sorted({band_label(r["rating"]) for r in rows}, key=lambda s: int(s.split("–")[0])):
        sub = [r for r in rows if band_label(r["rating"]) == label]
        tot = sum((r["badges"] for r in sub), Counter())
        per = {b: tot[b] / len(sub) for b in ("brilliant", "great", "mistake", "blunder", "miss")}
        print(f"  {label:>10}: " + "  ".join(f"{v:.2f}" for v in per.values()))

    print(json.dumps({"move_loss_scale": best[0], "harmonic_weight": best[1], "elo": dict(zip(("low", "span", "mid", "scale"), fit))}))


if __name__ == "__main__":
    main()

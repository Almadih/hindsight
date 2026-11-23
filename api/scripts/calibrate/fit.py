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
    """Our game accuracy with tunable loss scale k and harmonic weight w (current code: winprob constants)."""
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
                    "opp_rating": row["ratings"]["black" if side == "white" else "white"],
                    "theirs": row["chesscom"][side],
                    "ours": report["accuracy"][side],
                    "est_elo": report["elo"][side],
                    "opp_acc": report["accuracy"]["black" if side == "white" else "white"],
                    "result": (
                        1.0
                        if (report["headers"].get("Result") == "1-0" and side == "white")
                        or (report["headers"].get("Result") == "0-1" and side == "black")
                        else (0.5 if report["headers"].get("Result") == "1/2-1/2" else 0.0)
                    ),
                    "nonbook": sum(1 for m in moves if m["badge"] != "book"),
                    "time_control": report["headers"].get("TimeControl"),
                    "losses": [0.0 if (m["badge"] in ("book", "best", "great", "brilliant") or m.get("accuracy", 0) == 100.0) else max(0.0, m["wBefore"] - m["wAfter"]) for m in moves],
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

    cur_k, cur_w = winprob.LOSS_SCALE, winprob.HARMONIC_WEIGHT
    bias, mae = errors(rows, cur_k, cur_w)
    print(f"current formula (k={cur_k:.2f}, w={cur_w:.2f}): bias {bias:+.1f}  MAE {mae:.1f}")
    best = min(((k / 100, w / 100) for k in range(50, 401, 10) for w in range(0, 101, 5)), key=lambda p: errors(rows, *p)[1])
    bias_b, mae_b = errors(rows, *best)
    print(f"best fit        (k={best[0]:.2f}, w={best[1]:.2f}): bias {bias_b:+.1f}  MAE {mae_b:.1f}\n")

    print("per band (current → fitted, our minus Chess.com):")
    for label in sorted({band_label(r["rating"]) for r in rows}, key=lambda s: int(s.split("–")[0])):
        sub = [r for r in rows if band_label(r["rating"]) == label]
        print(f"  {label:>10}: n={len(sub):2d}  {errors(sub, cur_k, cur_w)[0]:+5.1f} → {errors(sub, *best)[0]:+5.1f}")

    # Game rating diagnostics: both anchored (using PGN headers) and unrated (headerless) estimates.
    rated_rows = [r for r in rows if r["est_elo"] is not None]
    anc_mae = statistics.mean(abs(r["est_elo"] - r["rating"]) for r in rated_rows)
    anc_bias = statistics.mean(r["est_elo"] - r["rating"] for r in rated_rows)
    unr_preds = [
        elo.estimate(
            r["ours"],
            None,
            opp_accuracy=r["opp_acc"],
            result=r["result"],
            best_rate=(r["badges"]["best"] + r["badges"]["great"] + r["badges"]["brilliant"]) / r["nonbook"] if r["nonbook"] > 0 else None,
            error_rate=(r["badges"]["blunder"] + r["badges"]["mistake"] + r["badges"]["miss"]) / r["nonbook"] if r["nonbook"] > 0 else None,
            nonbook_moves=r["nonbook"],
            time_control=r["time_control"],
        )
        for r in rated_rows
    ]
    unr_mae = statistics.mean(abs(p - r["rating"]) for p, r in zip(unr_preds, rated_rows))
    naive = statistics.mean(abs(statistics.mean(r["rating"] for r in rated_rows) - r["rating"]) for r in rated_rows)
    print(f"\ngame rating   anchored: bias {anc_bias:+.0f}  MAE {anc_mae:.0f}")
    print(f"              unrated : MAE {unr_mae:.0f}   (always guessing the mean: {naive:.0f})")
    for label in sorted({band_label(r["rating"]) for r in rated_rows}, key=lambda s: int(s.split("–")[0])):
        sub = [r for r in rated_rows if band_label(r["rating"]) == label]
        w_sub = [r["est_elo"] - r["rating"] for r in sub if r["result"] == 1.0]
        l_sub = [r["est_elo"] - r["rating"] for r in sub if r["result"] == 0.0]
        b_all = statistics.mean(r["est_elo"] - r["rating"] for r in sub)
        print(f"  {label:>10}: bias {b_all:+5.0f}  win {statistics.mean(w_sub) if w_sub else 0:+5.0f}  loss {statistics.mean(l_sub) if l_sub else 0:+5.0f}")

    print("\nbadges per player-game by band (brilliant / great / mistake / blunder / miss):")
    for label in sorted({band_label(r["rating"]) for r in rows}, key=lambda s: int(s.split("–")[0])):
        sub = [r for r in rows if band_label(r["rating"]) == label]
        tot = sum((r["badges"] for r in sub), Counter())
        per = {b: tot[b] / len(sub) for b in ("brilliant", "great", "mistake", "blunder", "miss")}
        print(f"  {label:>10}: " + "  ".join(f"{v:.2f}" for v in per.values()))

    print(json.dumps({"move_loss_scale": best[0], "harmonic_weight": best[1], "anchored_mae": round(anc_mae, 1), "unrated_mae": round(unr_mae, 1)}))


if __name__ == "__main__":
    main()

import json

from review.player import summarize


def move(ply, color, badge, tactics=()):
    return {"ply": ply, "color": color, "badge": badge, "tactics": list(tactics)}


def row(h, white, black, result, moves, created="2026-10-15 10:00:00"):
    report = {
        "headers": {"White": white, "Black": black, "Result": result},
        "moves": moves,
        "accuracy": {"white": 90.0, "black": 70.0},
        "elo": {"white": 1800, "black": 1200},
        "counts": {"white": {"best": 3}, "black": {"blunder": 2}},
    }
    return {"game_hash": h, "white_username": white, "black_username": black, "created_at": created, "report_json": json.dumps(report)}


def test_side_result_and_case_insensitive_match():
    out = summarize([row("h1", "Alice", "Bob", "1-0", []), row("h2", "Carol", "alice", "1-0", [])], "ALICE")
    assert [(g["hash"], g["side"], g["result"], g["opponent"], g["accuracy"]) for g in out["history"]] == [
        ("h1", "white", "won", "Bob", 90.0),
        ("h2", "black", "lost", "Carol", 70.0),
    ]


def test_themes_count_only_my_bad_moves_with_first_example():
    moves = [
        move(2, "black", "blunder", ["Nf6 leaves the queen on d4 hanging", "it allows Bxd4, winning the queen"]),
        move(4, "black", "mistake", ["it allows mate in 2, starting with Qh7#"]),
        move(6, "black", "best", ["Qd8 leaves the rook on a8 hanging"]),  # not a bad move: ignored
        move(5, "white", "blunder", ["Nc3 leaves the knight on c3 hanging"]),  # opponent's move: ignored
        move(8, "black", "miss", ["Qxf2 would have started mate in 1"]),
        move(10, "black", "miss", ["d5 was stronger"]),
    ]
    out = summarize([row("h1", "Alice", "Bob", "1-0", moves)], "bob")
    themes = {t["label"]: (t["count"], t["example"]) for t in out["themes"]}
    assert themes == {
        "Left a piece hanging": (1, {"hash": "h1", "ply": 2}),
        "Let a capture through": (1, {"hash": "h1", "ply": 2}),
        "Walked into mate": (1, {"hash": "h1", "ply": 4}),
        "Missed a mate": (1, {"hash": "h1", "ply": 8}),
        "Didn't punish a mistake": (1, {"hash": "h1", "ply": 10}),
    }


def test_no_reviews():
    assert summarize([], "nobody") == {"history": [], "themes": []}

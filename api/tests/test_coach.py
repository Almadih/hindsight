import asyncio
import json

from review.coach import MAX_MOVES, add_coach, key_moves, parse_comments


def move(ply, badge, tactics=None, san="Nf6"):
    return {
        "ply": ply, "color": "white" if ply % 2 else "black", "san": san, "badge": badge,
        "wBefore": 50.0, "wAfter": 20.0, "tactics": tactics or [],
        "alternatives": [{"uci": "a2a3", "san": "Qc7", "w": 50.0}],
    }


def report(moves):
    return {"headers": {"White": "A", "Black": "B"}, "opening": None, "moves": moves}


def test_key_moves_priority_cap_and_order():
    moves = [move(i, "great") for i in range(1, 20)] + [move(30, "blunder"), move(25, "best")]
    picked = key_moves(moves)
    assert len(picked) == MAX_MOVES
    assert picked[-1]["ply"] == 30  # the blunder always makes the cut
    assert [m["ply"] for m in picked] == sorted(m["ply"] for m in picked)
    assert all(m["badge"] != "best" for m in picked)


def test_parse_comments_accepts_object_or_string_and_drops_junk():
    plies = {18, 30}
    good = {"comments": [{"ply": 18, "comment": " Nice "}, {"ply": 99, "comment": "x"}, {"ply": 30, "comment": ""}]}
    assert parse_comments({"response": good}, plies) == {18: "Nice"}
    assert parse_comments({"response": json.dumps(good)}, plies) == {18: "Nice"}
    assert parse_comments({"response": "not json"}, plies) == {}
    assert parse_comments({"response": [1, "x", None]}, plies) == {}
    assert parse_comments({"response": {"comments": [{"ply": "30", "comment": "ok"}]}}, plies) == {30: "ok"}


def test_parse_comments_openai_shape_with_ids():
    raw = {"choices": [{"message": {"content": json.dumps({"comments": [{"id": 18, "comment": "Drops a pawn."}, {"id": 9, "comment": "x"}]})}}]}
    assert parse_comments(raw, {18}) == {18: "Drops a pawn."}


def test_add_coach_uses_ai_text():
    r = report([move(18, "mistake"), move(19, "best")])

    async def fake_ai(model, inputs):
        assert "[id 18]" in inputs["messages"][1]["content"]
        return {"response": {"comments": [{"ply": 18, "comment": "b5 drops a pawn."}]}}

    asyncio.run(add_coach(r, fake_ai))
    assert r["moves"][0]["coach"] == "b5 drops a pawn."
    assert "coach" not in r["moves"][1]


def test_add_coach_without_ai_uses_facts():
    r = report([move(18, "blunder", ["Nf6 leaves the queen on d4 hanging"])])
    asyncio.run(add_coach(r, None))
    assert r["moves"][0]["coach"] == "Nf6 leaves the queen on d4 hanging."


def test_add_coach_falls_back_to_facts_when_ai_fails():
    r = report([move(18, "blunder", ["Nf6 leaves the queen on d4 hanging"]), move(20, "mistake")])

    async def broken_ai(model, inputs):
        raise RuntimeError("AI unavailable")

    asyncio.run(add_coach(r, broken_ai))
    assert r["moves"][0]["coach"] == "Nf6 leaves the queen on d4 hanging."
    assert r["moves"][1]["coach"] == "Qc7 was stronger."

import 'dart:async';

import 'package:dartchess/dartchess.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hindsight/engine.dart';
import 'package:hindsight/game.dart';
import 'package:hindsight/models.dart';
import 'package:hindsight/native_engine.dart';

class _FakePool implements EnginePool {
  _FakePool({this.workerCount = 4, this.onSearch});

  @override
  final int workerCount;

  final Future<List<EngineLine>> Function(
    int workerId,
    String fen, {
    required int depth,
    int? nodes,
    required int movetimeMs,
    required int multiPv,
    List<String>? searchmoves,
  })? onSearch;

  int clears = 0;
  int stops = 0;
  final calls = <(int workerId, String fen, List<String>? searchmoves)>[];

  @override
  Future<T> runExclusive<T>(Future<T> Function() body) => body();

  @override
  Future<void> clearAll() async => clears++;

  @override
  Future<List<EngineLine>> search(
    int workerId,
    String fen, {
    required int depth,
    int? nodes,
    required int movetimeMs,
    required int multiPv,
    List<String>? searchmoves,
  }) async {
    calls.add((workerId, fen, searchmoves));
    if (onSearch != null) {
      return onSearch!(
        workerId,
        fen,
        depth: depth,
        nodes: nodes,
        movetimeMs: movetimeMs,
        multiPv: multiPv,
        searchmoves: searchmoves,
      );
    }
    final pos = Chess.fromSetup(Setup.parseFen(fen));
    final ucis = searchmoves ?? legalUcis(pos);
    final move = ucis.first;
    return [EngineLine(uci: move, cp: 25, pv: [move])];
  }

  @override
  void stopAll() => stops++;
}

void main() {
  test('parses cp with multipv', () {
    final i = parseInfo('info depth 16 seldepth 20 multipv 2 score cp -35 nodes 1 nps 2 pv e7e5 g1f3 b8c6')!;
    expect(i.multipv, 2);
    expect(i.depth, 16);
    expect(i.line.uci, 'e7e5');
    expect(i.line.cp, -35);
    expect(i.line.mate, isNull);
    expect(i.line.pv, ['e7e5', 'g1f3', 'b8c6']);
  });

  test('parses mate, defaults multipv to 1', () {
    final i = parseInfo('info depth 8 score mate -3 pv h7h8')!;
    expect(i.multipv, 1);
    expect(i.line.mate, -3);
    expect(i.line.cp, isNull);
  });

  test('skips bounds and non-info lines', () {
    expect(parseInfo('info depth 5 score cp 10 lowerbound pv e2e4'), isNull);
    expect(parseInfo('info depth 5 score cp 10 upperbound pv e2e4'), isNull);
    expect(parseInfo('info depth 5 currmove e2e4 currmovenumber 1'), isNull);
    expect(parseInfo('bestmove e2e4'), isNull);
  });

  test('legalUcis normalizes castling and expands promotions', () {
    // Castling position: white can castle both ways
    final castle = Chess.fromSetup(Setup.parseFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'));
    final castleMoves = legalUcis(castle);
    expect(castleMoves, containsAll(['e1g1', 'e1c1']));
    expect(castleMoves, isNot(contains('e1h1')));
    expect(castleMoves, isNot(contains('e1a1')));

    // Lone pawn promotion (king pinned/blocked): 4 promotion UCIs, never treated as 1 forced move
    final promo = Chess.fromSetup(Setup.parseFen('7k/P7/8/8/8/8/5q2/7K w - - 0 1'));
    final promoMoves = legalUcis(promo);
    expect(promoMoves, unorderedEquals(['a7a8q', 'a7a8r', 'a7a8b', 'a7a8n']));
  });

  test('fenDedupKey caches below 80 halfmoves and skips >= 80', () {
    expect(
      fenDedupKey('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'),
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3',
    );
    expect(fenDedupKey('8/8/8/8/8/5k2/8/5K2 w - - 79 60'), '8/8/8/8/8/5k2/8/5K2 w - -');
    expect(fenDedupKey('8/8/8/8/8/5k2/8/5K2 w - - 80 60'), isNull);
  });

  test('deriveForcedEval handles cp, checkmate, draw, mate off-by-one, and chaining', () {
    // Normal cp negation + PV prepend
    final cpEv = deriveForcedEval(
      'fen1',
      'h1g1',
      const PositionEval('fen2', [EngineLine(uci: 'e5e4', cp: -140, pv: ['e5e4', 'd2d4'])]),
      childCheckmate: false,
      childDraw: false,
    );
    expect(cpEv.lines.single.cp, 140);
    expect(cpEv.lines.single.mate, isNull);
    expect(cpEv.lines.single.pv, ['h1g1', 'e5e4', 'd2d4']);

    // Child is checkmate -> mate in 1
    final m1 = deriveForcedEval('fen1', 'f7f8', const PositionEval('fen2', []), childCheckmate: true, childDraw: false);
    expect(m1.lines.single.mate, 1);
    expect(m1.lines.single.cp, isNull);

    // Child is draw -> 0 cp
    final draw = deriveForcedEval('fen1', 'a1a2', const PositionEval('fen2', []), childCheckmate: false, childDraw: true);
    expect(draw.lines.single.cp, 0);

    // Child mate > 0 (opponent mates in 2) -> parent gets mated in 2 (-2)
    final oppMate = deriveForcedEval(
      'fen1',
      'h1g1',
      const PositionEval('fen2', [EngineLine(uci: 'd8d1', mate: 2, pv: ['d8d1'])]),
      childCheckmate: false,
      childDraw: false,
    );
    expect(oppMate.lines.single.mate, -2);

    // Child mate < 0 (opponent mated in 2) -> parent mates in 3 (+3, not +2!)
    final weMate = deriveForcedEval(
      'fen1',
      'h1g1',
      const PositionEval('fen2', [EngineLine(uci: 'h8g8', mate: -2, pv: ['h8g8'])]),
      childCheckmate: false,
      childDraw: false,
    );
    expect(weMate.lines.single.mate, 3);

    // Chained 3-ply forced sequence ending in checkmate: us(M2) -> opp(-M1) -> us(M1) -> checkmate
    final ply2 = deriveForcedEval('p2', 'c1c2', const PositionEval('p3', []), childCheckmate: true, childDraw: false);
    final ply1 = deriveForcedEval('p1', 'b1b2', ply2, childCheckmate: false, childDraw: false);
    final ply0 = deriveForcedEval('p0', 'a1a2', ply1, childCheckmate: false, childDraw: false);
    expect(ply2.lines.single.mate, 1);
    expect(ply1.lines.single.mate, -1);
    expect(ply0.lines.single.mate, 2);
    expect(ply0.lines.single.pv, ['a1a2', 'b1b2', 'c1c2']);
  });

  test('needsSecondLine matches great and Retry triggers', () {
    const eq = EngineLine(uci: 'e2e4', cp: 20, pv: ['e2e4']);
    const won = EngineLine(uci: 'e2e4', cp: 1200, pv: ['e2e4']); // w > 98%
    const losing = EngineLine(uci: 'e2e4', cp: -500, pv: ['e2e4']); // w < 20%

    // Great candidate: played best, not check, not recapture, wBefore < 98
    expect(
      needsSecondLine(
        bestBefore: eq,
        bestAfter: const EngineLine(uci: 'e7e5', cp: -20, pv: ['e7e5']),
        afterCheckmate: false,
        afterDraw: false,
        playedBest: true,
        wasInCheck: false,
        isRecapture: false,
      ),
      isTrue,
    );
    // Excluded from great: recapture, check, or already won (>= 98%)
    expect(
      needsSecondLine(
        bestBefore: eq,
        bestAfter: const EngineLine(uci: 'e7e5', cp: -20, pv: ['e7e5']),
        afterCheckmate: false,
        afterDraw: false,
        playedBest: true,
        wasInCheck: true,
        isRecapture: false,
      ),
      isFalse,
    );
    expect(
      needsSecondLine(
        bestBefore: eq,
        bestAfter: const EngineLine(uci: 'e7e5', cp: -20, pv: ['e7e5']),
        afterCheckmate: false,
        afterDraw: false,
        playedBest: true,
        wasInCheck: false,
        isRecapture: true,
      ),
      isFalse,
    );
    expect(
      needsSecondLine(
        bestBefore: won,
        bestAfter: const EngineLine(uci: 'e7e5', cp: -1200, pv: ['e7e5']),
        afterCheckmate: false,
        afterDraw: false,
        playedBest: true,
        wasInCheck: false,
        isRecapture: false,
      ),
      isFalse,
    );

    // Retry candidate: not best and dw >= 6%
    expect(
      needsSecondLine(
        bestBefore: eq,
        bestAfter: const EngineLine(uci: 'e7e5', cp: 150, pv: ['e7e5']),
        afterCheckmate: false,
        afterDraw: false,
        playedBest: false,
        wasInCheck: false,
        isRecapture: false,
      ),
      isTrue,
    );
    // Good non-best move (dw < 6%) skips Pass 2
    expect(
      needsSecondLine(
        bestBefore: eq,
        bestAfter: const EngineLine(uci: 'e7e5', cp: 0, pv: ['e7e5']),
        afterCheckmate: false,
        afterDraw: false,
        playedBest: false,
        wasInCheck: false,
        isRecapture: false,
      ),
      isFalse,
    );
    // Decided losing position (wBefore < 20%) with cpLoss >= 50 triggers Retry
    expect(
      needsSecondLine(
        bestBefore: losing,
        bestAfter: const EngineLine(uci: 'e7e5', cp: 580, pv: ['e7e5']),
        afterCheckmate: false,
        afterDraw: false,
        playedBest: false,
        wasInCheck: false,
        isRecapture: false,
      ),
      isTrue,
    );
    // Missed fast mate (M2 -> non-mate) triggers Retry even if still winning
    expect(
      needsSecondLine(
        bestBefore: const EngineLine(uci: 'd1h5', mate: 2, pv: ['d1h5']),
        bestAfter: const EngineLine(uci: 'e7e5', cp: -900, pv: ['e7e5']),
        afterCheckmate: false,
        afterDraw: false,
        playedBest: false,
        wasInCheck: false,
        isRecapture: false,
      ),
      isTrue,
    );
  });

  test('analyzePositions schedules tile4 in parallel, deduplicates, derives forced moves, and runs Pass 2', () async {
    // Includes repetition (1. Nf3 Nf6 2. Ng1 Ng8 returns to start pos) and a forced check evasion before mate (Fool's-like).
    final game = parsePgn('1. Nf3 Nf6 2. Ng1 Ng8 3. f3 e5 4. g4 Qh4# *');
    final fens = game.fens;
    final seenIndices = <int>{};
    final pool = _FakePool(
      workerCount: 4,
      onSearch: (w, fen, {required depth, nodes, required movetimeMs, required multiPv, searchmoves}) async {
        // Yield slightly differently per worker to exercise out-of-order completion.
        await Future<void>.delayed(Duration(milliseconds: (w + 1) * 2));
        final pos = Chess.fromSetup(Setup.parseFen(fen));
        final ucis = searchmoves ?? legalUcis(pos);
        // Make ply 4 (white's f3) look like a blunder (cp +200 before, +500 for black after) to trigger Pass 2 Retry.
        final cp = fen == fens[5] ? 500 : 25;
        return [EngineLine(uci: ucis.first, cp: cp, pv: [ucis.first])];
      },
    );

    final evals = await analyzePositions(
      fens,
      depth: 14,
      onPosition: (i, _) => seenIndices.add(i),
      pool: pool,
    );

    expect(pool.clears, 1);
    expect(evals.length, fens.length);
    expect(seenIndices.length, fens.length); // every ply reported exactly once
    expect(evals.last.lines, isEmpty); // final checkmate skipped

    // Pass 1 deduplicates fens[0] and fens[4] (same 4-field FEN after Nf3 Nf6 Ng1 Ng8).
    final pass1StartCalls = pool.calls.where((c) => c.$3 == null && fenDedupKey(c.$2) == fenDedupKey(fens[0])).length;
    expect(pass1StartCalls, 1);

    // Pass 2 runs with searchmoves excluding PV1 on candidates (e.g. fens[4] blunder to f3).
    final pass2ForBlunder = pool.calls.where((c) => c.$2 == fens[4] && c.$3 != null).toList();
    expect(pass2ForBlunder, hasLength(1));
    expect(pass2ForBlunder.single.$3, isNot(contains(evals[4].lines.first.uci)));
    expect(evals[4].lines.length, 2);
  });

  test('analyzePositions cancels mid-flight and invokes stopAll', () async {
    final game = parsePgn('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 *');
    final cancel = Completer<void>();
    final pool = _FakePool(
      workerCount: 2,
      onSearch: (w, fen, {required depth, nodes, required movetimeMs, required multiPv, searchmoves}) async {
        if (!cancel.isCompleted) cancel.complete();
        await Future<void>.delayed(const Duration(milliseconds: 5));
        final pos = Chess.fromSetup(Setup.parseFen(fen));
        final u = legalUcis(pos).first;
        return [EngineLine(uci: u, cp: 0, pv: [u])];
      },
    );

    await expectLater(
      analyzePositions(game.fens, depth: 14, cancel: cancel.future, pool: pool),
      throwsA(isA<StateError>()),
    );
    expect(pool.stops, greaterThanOrEqualTo(1));
  });
}

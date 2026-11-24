import 'dart:convert';
import 'dart:io';

import 'package:dartchess/dartchess.dart' as dc;
import 'package:flutter_test/flutter_test.dart';
import 'package:hindsight/models.dart';
import 'package:hindsight/review_logic.dart';

void main() {
  final report = Report.fromJson(jsonDecode(File('test/fixtures/report.json').readAsStringSync()));
  final fen = report.headers['FEN']!;

  test('keyMoments matches the web implementation on the fixture', () {
    expect(keyMoments(report.moves).map((m) => m.ply), [42, 46, 48, 49]);
  });

  test('formatEval and whiteWinPct', () {
    expect(formatEval(const WhiteEval(0.26, null)), '+0.3');
    expect(formatEval(const WhiteEval(-3, -3)), 'M3');
    expect(formatEval(const WhiteEval(1, 0)), '1-0');
    expect(whiteWinPct(const WhiteEval(0, null)), closeTo(50, 1e-9));
    expect(whiteWinPct(const WhiteEval(0, -2)), 0);
  });

  test('uciToSan and followUpLine use the custom start position', () {
    final m = report.moves.first;
    expect(uciToSan(fen, m.uci), m.san);
    expect(uciToSan(fen, 'e2e5'), isNull);
    final line = followUpLine(fen, m.bestPv);
    expect(line.sans.first, 'd4');
    expect(line.fens.length, line.sans.length + 1);
  });

  test('materialDiff and capturedPieces', () {
    expect(materialDiff(standardFen), 0);
    expect(capturedPieces(standardFen).white, isEmpty);
    expect(capturedPieces(standardFen).black, isEmpty);
    // White is missing a rook and a pawn; Black is missing a queen.
    const fen = 'rnb1kbnr/pppppppp/8/8/8/8/PPPPPPP1/RNBQKBN1 w kq - 0 1';
    expect(materialDiff(fen), 9 - 6);
    final c = capturedPieces(fen);
    expect(c.white, ['bQ']);
    expect(c.black, ['wR', 'wP']);
  });

  test('capturedPieces never goes negative after promotion', () {
    expect(capturedPieces('QQ6/8/8/8/8/8/8/k6K w - - 0 1').black, isNot(contains('bQ')));
    expect(capturedPieces('QQ6/8/8/8/8/8/8/k6K w - - 0 1').white, contains('bQ'));
  });

  test('isGoodRetry accepts the best line and lines within 2% of it', () {
    final m = report.moves.firstWhere(canRetry);
    final alts = m.alternatives;
    expect(isGoodRetry(m, alts.first.uci), isTrue);
    expect(isGoodRetry(m, 'a1a1'), isFalse);
    for (final a in alts) {
      expect(isGoodRetry(m, a.uci), alts.first.w - a.w < 2);
    }
  });

  test('gist keeps the first sentence and caps it at 110 chars', () {
    expect(gist(null), isNull);
    expect(gist('Nice move! It wins a pawn. Then more.'), 'Nice move!');
    final g = gist('${'x'.padRight(150, 'x')}. Next.')!;
    expect(g.length, 108);
    expect(g.endsWith('…'), isTrue);
  });

  test('personalize turns the player name into "your"', () {
    expect(personalize("Hikaru's Bxb3+ wins. Then Hikaru's rook falls.", 'Hikaru'), 'Your Bxb3+ wins. Then your rook falls.');
    expect(personalize("Brian's Nf5 forks.", 'an'), "Brian's Nf5 forks.");
    expect(personalize('Play on', null), 'Play on');
  });

  test('standardUci normalizes king-onto-own-rook castling to standard UCI', () {
    final pos = positionOf('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')!;
    final normShort = pos.normalizeMove(dc.NormalMove.fromUci('e1h1'));
    final normLong = pos.normalizeMove(dc.NormalMove.fromUci('e1a1'));
    expect(standardUci(pos, normShort), 'e1g1');
    expect(standardUci(pos, normLong), 'e1c1');
    final regular = pos.normalizeMove(dc.NormalMove.fromUci('e1e2'));
    expect(standardUci(pos, regular), 'e1e2');
  });

  test('mySide and decidingMoments', () {
    expect(mySide({'White': 'Alice', 'Black': 'Bob'}, ['bob']), Side.black);
    expect(mySide({'White': 'Alice', 'Black': 'Bob'}, ['carol']), isNull);
    expect(decidingMoments(report.moves, null).moments.map((m) => m.ply), [42, 46, 48, 49]);
    final mine = decidingMoments(report.moves, Side.white);
    expect(mine.mine, mine.moments.any((m) => m.color == Side.white));
  });

  test('isForced: one legal move, but not a lone promotion', () {
    expect(isForced('7k/8/8/8/8/8/6q1/7K w - - 0 1'), isTrue);
    expect(isForced('7k/P7/8/8/8/8/5q2/7K w - - 0 1'), isFalse);
    expect(isForced(fen), isFalse);
  });

  test('originalGameUrl allows verified Chess.com and Lichess game links only', () {
    expect(
      originalGameUrl({'Site': 'Chess.com', 'Link': 'https://www.chess.com/game/live/123456'}),
      (url: 'https://www.chess.com/game/live/123456', label: 'Chess.com'),
    );
    expect(
      originalGameUrl({'Site': 'https://lichess.org/AbCdEfGh'}),
      (url: 'https://lichess.org/AbCdEfGh', label: 'Lichess'),
    );
    expect(originalGameUrl({'Site': 'Paris FRA'}), isNull);
    expect(originalGameUrl({'Link': 'javascript:alert(1)'}), isNull);
    expect(originalGameUrl({'Link': 'http://www.chess.com/game/live/123'}), isNull);
    expect(originalGameUrl({'Link': 'https://evil.example/game/live/123'}), isNull);
    expect(originalGameUrl({'Site': 'https://www.chess.com/member/hikaru'}), isNull);
  });
}

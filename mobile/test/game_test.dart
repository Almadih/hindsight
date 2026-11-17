import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hindsight/game.dart';

void main() {
  test('normal game', () {
    final g = parsePgn('[White "a"]\n[Black "b"]\n\n1. e4 {hi} e5 (1... c5) 2. Nf3 Nc6 *');
    expect(g.sans, ['e4', 'e5', 'Nf3', 'Nc6']);
    expect(g.fens.length, 5);
    expect(g.fens[1], 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
    expect(g.headers['White'], 'a');
    expect(g.pgn, isNot(contains('{')));
    expect(parsePgn(g.pgn).sans, g.sans);
  });

  test('custom FEN game from fixture', () {
    final j = jsonDecode(File('test/fixtures/report.json').readAsStringSync());
    final headers = Map<String, String>.from(j['headers']);
    final moves = [for (final m in j['moves']) m['san'] as String];
    final text = StringBuffer();
    headers.forEach((k, v) => text.writeln('[$k "$v"]'));
    text.writeln();
    for (var i = 0; i < moves.length; i++) {
      text.write('${i.isEven ? '${i ~/ 2 + 1}. ' : ''}${moves[i]} ');
    }
    final g = parsePgn(text.toString());
    expect(g.sans, moves);
    expect(g.fens.length, moves.length + 1);
    expect(g.fens.first, headers['FEN']);
    expect([for (final m in j['moves']) m['fen'].split(' ').take(2).join(' ')], [for (final f in g.fens.skip(1)) f.split(' ').take(2).join(' ')]);
    expect(parsePgn(g.pgn).fens, g.fens);
  });

  test('invalid', () {
    expect(() => parsePgn('[White "a"]\n\n*'), throwsFormatException);
    expect(() => parsePgn('1. e4 e4 *'), throwsFormatException);
  });
}

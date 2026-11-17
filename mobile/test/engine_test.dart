import 'package:flutter_test/flutter_test.dart';
import 'package:hindsight/engine.dart';

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
}

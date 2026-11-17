import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

import 'package:hindsight/models.dart';
import 'package:hindsight/widgets/board.dart';
import 'package:hindsight/widgets/eval_bar.dart';

void main() {
  testWidgets('board squares are labelled', (t) async {
    final h = t.ensureSemantics();
    await t.pumpWidget(const MaterialApp(
      home: ChessBoard(fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', size: 320),
    ));
    expect(find.bySemanticsLabel(RegExp('e2, white pawn')), findsOneWidget);
    h.dispose();
  });

  testWidgets('eval bar exposes value', (t) async {
    final h = t.ensureSemantics();
    await t.pumpWidget(const MaterialApp(home: EvalBar(ev: WhiteEval(6.6, null), height: 200)));
    expect(t.getSemantics(find.bySemanticsLabel(RegExp('Evaluation'))).value, contains('White ahead by 6.6'));
    h.dispose();
  });
}

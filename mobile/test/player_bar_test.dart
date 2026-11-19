import 'package:flutter/rendering.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hindsight/models.dart';
import 'package:hindsight/widgets/player_bar.dart';
import 'package:material_ui/material_ui.dart';

Future<double> nameHeight(WidgetTester tester, List<String> captured, {double width = 360}) async {
  await tester.pumpWidget(MaterialApp(
    home: Scaffold(
      body: Center(
        child: SizedBox(
          width: width,
          child: PlayerBar(side: Side.white, name: 'Almadih_desu2', rating: '1252', material: 39, captured: captured),
        ),
      ),
    ),
  ));
  return tester.getRect(find.text('Almadih_desu2')).height;
}

void main() {
  testWidgets('the name keeps its size however much material was won', (tester) async {
    final plain = await nameHeight(tester, const []);
    final lots = await nameHeight(tester, const [
      'bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bN', 'bN', 'bB', 'bB', 'bR', 'bR', 'bQ',
    ]);
    expect(lots, plain);
    expect(tester.takeException(), isNull); // no overflow
    // With room for everything (the test font is wide), the name must not be cut either.
    await nameHeight(tester, const ['bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bN', 'bN', 'bB', 'bB', 'bR', 'bR', 'bQ'], width: 600);
    expect(tester.renderObject<RenderParagraph>(find.text('Almadih_desu2')).didExceedMaxLines, isFalse);
  });

  testWidgets('captured pieces sit under the name, and the bar keeps one height', (tester) async {
    await nameHeight(tester, const []);
    final empty = tester.getSize(find.byType(PlayerBar)).height;
    await nameHeight(tester, const ['bP', 'bN']);
    expect(tester.getSize(find.byType(PlayerBar)).height, empty); // the board must not jump on the first capture
    expect(empty, kPlayerBarHeight);
    final name = tester.getRect(find.text('Almadih_desu2'));
    expect(tester.getRect(find.byType(SvgPicture).first).top, greaterThanOrEqualTo(name.bottom));
    expect(tester.getRect(find.text('+39')).top, greaterThanOrEqualTo(name.bottom));
  });
}

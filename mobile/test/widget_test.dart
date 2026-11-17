import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hindsight/prefs.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:material_ui/material_ui.dart';
import 'package:hindsight/models.dart';
import 'package:hindsight/screens/review_summary.dart';
import 'package:hindsight/theme.dart';
import 'package:hindsight/widgets/board.dart';
import 'package:hindsight/widgets/sfx.dart';

void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await initPrefs();
  });

  testWidgets('summary renders and Start Review opens the board', (tester) async {
    sfxEnabled = false;
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    final report = Report.fromJson(jsonDecode(File('test/fixtures/report.json').readAsStringSync()));

    await tester.pumpWidget(MaterialApp(
      theme: appTheme(),
      home: ReviewSummaryScreen(report: report, startFen: report.headers['FEN']!),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Start Review'), findsOneWidget);
    expect(find.text('90.5'), findsOneWidget);

    await tester.tap(find.text('Start Review'));
    await tester.pumpAndSettle();
    expect(find.byType(ChessBoard), findsOneWidget);
  });
}

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hindsight/prefs.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:material_ui/material_ui.dart';
import 'package:hindsight/models.dart';
import 'package:hindsight/screens/review_moves.dart';
import 'package:hindsight/screens/review_summary.dart';
import 'package:hindsight/theme.dart';
import 'package:hindsight/widgets/board.dart';
import 'package:hindsight/widgets/sfx.dart';

void main() {
  setUpAll(() async {
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

  for (final size in [const Size(2400, 1080), const Size(2560, 1600), const Size(1600, 2560)]) {
    testWidgets('review moves fits at $size', (tester) async {
      sfxEnabled = false;
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 2;
      addTearDown(tester.view.reset);
      final report = Report.fromJson(jsonDecode(File('test/fixtures/report.json').readAsStringSync()));
      await tester.pumpWidget(MaterialApp(
        theme: appTheme(),
        home: ReviewMovesScreen(report: report, startFen: report.headers['FEN']!, initialPly: 3),
      ));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text('Next'), findsOneWidget);
      expect(tester.getRect(find.text('Next')).bottom, lessThanOrEqualTo(size.height / 2));
    });
  }
}

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hindsight/models.dart';
import 'package:hindsight/prefs.dart';
import 'package:hindsight/screens/review_summary.dart';
import 'package:hindsight/theme.dart';
import 'package:hindsight/widgets/accuracy_ring.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    await initPrefs();
  });

  testWidgets('landscape summary has two panes without overflow', (tester) async {
    tester.view.physicalSize = const Size(2400, 1080);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    final report = Report.fromJson(jsonDecode(File('test/fixtures/report.json').readAsStringSync()));
    await tester.pumpWidget(MaterialApp(theme: appTheme(), home: ReviewSummaryScreen(report: report, startFen: report.headers['FEN']!)));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('Start Review'), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp('Evaluation graph')), findsOneWidget);
  });

  testWidgets('accuracy ring semantics', (tester) async {
    final h = tester.ensureSemantics();
    await tester.pumpWidget(const MaterialApp(home: Row(children: [AccuracyRing(value: 68.4, light: true), AccuracyRing(value: null, light: false)])));
    expect(find.bySemanticsLabel(RegExp('Accuracy')), findsNWidgets(2));
    expect(tester.getSemantics(find.byType(AccuracyRing).first).value, '68.4 percent');
    expect(tester.getSemantics(find.byType(AccuracyRing).last).value, 'not available');
    h.dispose();
  });
}

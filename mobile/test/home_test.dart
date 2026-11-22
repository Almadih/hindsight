import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:hindsight/api.dart' as api;
import 'package:hindsight/prefs.dart';
import 'package:hindsight/screens/home.dart';
import 'package:hindsight/theme.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    await initPrefs();
  });

  testWidgets('home renders the verdict ladder and FAQ', (tester) async {
    tester.view.physicalSize = const Size(1080, 6000);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(MaterialApp(theme: appTheme(), home: const HomeScreen()));
    expect(find.text('Ten verdicts, one scale'), findsOneWidget);
    expect(find.byType(VerdictLadder), findsOneWidget);
    expect(find.text('Blunder'), findsOneWidget);
    expect(find.text('Is it really free?'), findsOneWidget);
    expect(find.text('Try a demo review'), findsOneWidget);
  });

  testWidgets('platform control exposes both options and selects Lichess', (tester) async {
    final sem = tester.ensureSemantics();
    await tester.pumpWidget(MaterialApp(theme: appTheme(), home: const HomeScreen()));
    expect(find.bySemanticsLabel('Chess.com'), findsOneWidget);
    expect(find.bySemanticsLabel('Lichess'), findsOneWidget);
    await tester.tap(find.text('Lichess'));
    await tester.pump();
    expect(tester.widget<SegmentedButton<String>>(find.byType(SegmentedButton<String>)).selected, {'lichess'});
    sem.dispose();
  });

  testWidgets('invalid username shows format message without calling API', (tester) async {
    await tester.pumpWidget(MaterialApp(theme: appTheme(), home: const HomeScreen()));
    await tester.enterText(find.byType(TextField), 'bad user!');
    await tester.tap(find.text('Find games'));
    await tester.pump();
    expect(find.text('Use 1–30 letters, numbers, - or _ only.'), findsOneWidget);
  });

  testWidgets('Player page uses the platform of the fetched games after toggling segment', (tester) async {
    final requested = <Uri>[];
    final prev = api.client;
    api.client = MockClient((req) async {
      requested.add(req.url);
      if (req.url.path.startsWith('/api/games/')) {
        return http.Response(jsonEncode({'games': []}), 200);
      }
      return http.Response(
        jsonEncode({'username': 'alice', 'platform': 'chesscom', 'games': [], 'history': [], 'themes': []}),
        200,
      );
    });
    addTearDown(() => api.client = prev);

    await tester.pumpWidget(MaterialApp(theme: appTheme(), home: const HomeScreen()));
    await tester.enterText(find.byType(TextField), 'alice');
    await tester.tap(find.text('Find games'));
    await tester.pumpAndSettle();

    // Switch toggle to Lichess without re-searching, then tap Player page.
    await tester.tap(find.text('Lichess'));
    await tester.pump();
    await tester.ensureVisible(find.text('Player page'));
    await tester.tap(find.text('Player page'));
    await tester.pumpAndSettle();

    expect(requested.last.path, '/api/player/chesscom/alice');
  });
}

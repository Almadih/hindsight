import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:hindsight/api.dart' as api;
import 'package:hindsight/prefs.dart';
import 'package:hindsight/screens/analyzing.dart';
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
    expect(find.text('Privacy'), findsOneWidget);
    expect(find.text('Terms'), findsOneWidget);
    expect(find.text('Licenses'), findsOneWidget);
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

  testWidgets('Game link tab uses dedicated input, hides username chips, and launches analysis', (tester) async {
    const samplePgn = '[White "Alice"]\n[Black "Bob"]\n\n1. e4 e5 2. Nf3 Nc6 *';
    await prefs.setStringList('hindsight:me', ['alice']);
    lastPlatform = 'chesscom';
    final requests = <http.Request>[];
    final prev = api.client;
    api.client = MockClient((req) async {
      requests.add(req);
      if (req.url.path == '/api/game-by-url') {
        return http.Response(
          jsonEncode({
            'pgn': samplePgn,
            'url': 'https://www.chess.com/game/live/123456',
            'platform': 'chesscom',
            'white': {'name': 'Alice', 'rating': 1500},
            'black': {'name': 'Bob', 'rating': 1480},
            'result': '*',
            'timeClass': 'blitz',
            'hash': 'abc123',
          }),
          200,
        );
      }
      return http.Response('{"detail":"stop"}', 500);
    });
    addTearDown(() => api.client = prev);

    final sem = tester.ensureSemantics();
    await tester.pumpWidget(MaterialApp(theme: appTheme(), home: const HomeScreen()));
    expect(find.bySemanticsLabel('Game link'), findsOneWidget);
    expect(find.widgetWithText(ActionChip, 'alice'), findsOneWidget);
    expect(tester.widget<TextField>(find.byType(TextField)).controller?.text, 'alice');

    await tester.tap(find.text('Game link'));
    await tester.pump();
    expect(find.widgetWithText(ActionChip, 'alice'), findsNothing);
    expect(find.text('Review game'), findsOneWidget);
    final linkField = tester.widget<TextField>(find.byType(TextField));
    expect(linkField.keyboardType, TextInputType.url);
    expect(linkField.decoration?.hintText, 'Paste Chess.com or Lichess game link');
    expect(linkField.controller?.text, isEmpty);

    // Switching back preserves the remembered username.
    await tester.tap(find.text('Chess.com'));
    await tester.pump();
    expect(tester.widget<TextField>(find.byType(TextField)).controller?.text, 'alice');
    expect(find.widgetWithText(ActionChip, 'alice'), findsOneWidget);

    await tester.tap(find.text('Game link'));
    await tester.pump();
    await tester.enterText(find.byType(TextField), 'https://www.chess.com/game/live/123456');
    await tester.tap(find.text('Review game'));
    await tester.pumpAndSettle();

    expect(requests.first.url.path, '/api/game-by-url');
    expect(jsonDecode(requests.first.body), {'url': 'https://www.chess.com/game/live/123456'});
    expect(find.byType(AnalyzingScreen), findsOneWidget);
    expect(tester.widget<AnalyzingScreen>(find.byType(AnalyzingScreen)).pgn, samplePgn);
    expect(lastPlatform, 'chesscom');
    expect(myUsernames, ['alice']);
    sem.dispose();
  });

  testWidgets('Game link tab shows error state and retries via ErrorRetry', (tester) async {
    const samplePgn = '1. d4 d5 *';
    var calls = 0;
    final prev = api.client;
    api.client = MockClient((req) async {
      if (req.url.path == '/api/game-by-url') {
        calls++;
        if (calls == 1) return http.Response('{"detail":"Game not found"}', 404);
        return http.Response(jsonEncode({'pgn': samplePgn}), 200);
      }
      return http.Response('{"detail":"stop"}', 500);
    });
    addTearDown(() => api.client = prev);

    await tester.pumpWidget(MaterialApp(theme: appTheme(), home: const HomeScreen()));
    await tester.tap(find.text('Game link'));
    await tester.pump();
    await tester.enterText(find.byType(TextField), 'https://lichess.org/notfound');
    await tester.tap(find.text('Review game'));
    await tester.pumpAndSettle();

    expect(find.text('Game not found.'), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);

    await tester.ensureVisible(find.text('Try again'));
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();

    expect(calls, 2);
    expect(find.byType(AnalyzingScreen), findsOneWidget);
    expect(tester.widget<AnalyzingScreen>(find.byType(AnalyzingScreen)).pgn, samplePgn);
  });

  testWidgets('pasting a Chess.com or Lichess URL in username mode fetches game by link', (tester) async {
    const samplePgn = '1. e4 c5 *';
    await prefs.setStringList('hindsight:me', ['alice']);
    lastPlatform = 'chesscom';
    final requests = <http.Request>[];
    final prev = api.client;
    api.client = MockClient((req) async {
      requests.add(req);
      if (req.url.path == '/api/game-by-url') {
        return http.Response(jsonEncode({'pgn': samplePgn}), 200);
      }
      return http.Response('{"detail":"stop"}', 500);
    });
    addTearDown(() => api.client = prev);

    await tester.pumpWidget(MaterialApp(theme: appTheme(), home: const HomeScreen()));
    await tester.enterText(find.byType(TextField), 'https://lichess.org/abcd1234/black');
    await tester.tap(find.text('Find games'));
    await tester.pumpAndSettle();

    expect(requests.first.url.path, '/api/game-by-url');
    expect(jsonDecode(requests.first.body), {'url': 'https://lichess.org/abcd1234/black'});
    expect(find.byType(AnalyzingScreen), findsOneWidget);
    expect(tester.widget<AnalyzingScreen>(find.byType(AnalyzingScreen)).pgn, samplePgn);
    expect(myUsernames, ['alice']);
    expect(lastPlatform, 'chesscom');
  });

  testWidgets('3-segment control fits narrow mobile screen without overflow', (tester) async {
    tester.view.physicalSize = const Size(720, 1600);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(MaterialApp(theme: appTheme(), home: const HomeScreen()));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('Chess.com'), findsOneWidget);
    expect(find.text('Lichess'), findsOneWidget);
    expect(find.text('Game link'), findsOneWidget);
  });
}

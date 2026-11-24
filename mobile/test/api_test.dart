import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hindsight/api.dart' as api;
import 'package:hindsight/models.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  final raw = File('test/fixtures/report.json').readAsStringSync();

  test('decodes the report fixture', () {
    final r = Report.fromJson(jsonDecode(raw));
    expect(r.moves.length, 83);
    expect(r.moves.first.badge, Badge.excellent);
    expect(r.accuracy[Side.white], 90.5);
    expect(r.counts[Side.white]!.values.reduce((a, b) => a + b), greaterThan(0));
  });

  test('getReview and analyze go through the client', () async {
    api.client = MockClient((req) async {
      if (req.url.path.startsWith('/api/review/')) return http.Response('{"detail":"nope"}', 404);
      expect(jsonDecode(req.body)['pgn'], 'x');
      return http.Response(raw, 200);
    });
    expect(await api.getReview('abc'), isNull);
    expect((await api.analyze('x')).moves.length, 83);
  });

  test('ApiError uses string detail, else a generic message', () async {
    api.client = MockClient((_) async => http.Response('{"detail":"Rate limited"}', 429));
    await expectLater(api.cachedReview('x'), throwsA(isA<api.ApiError>().having((e) => e.message, 'message', 'Rate limited').having((e) => e.status, 'status', 429)));
    api.client = MockClient((_) async => http.Response('{"detail":[{"msg":"bad"}]}', 422));
    await expectLater(api.analyze('x'), throwsA(isA<api.ApiError>().having((e) => e.message, 'message', 'Request failed (422)')));
    api.client = MockClient((_) async => http.Response('{"detail":"no review"}', 404));
    expect(await api.cachedReview('x'), isNull);
  });

  test('PlayerGame trims both space and T timestamps to date', () {
    final a = PlayerGame.fromJson({'hash': 'h', 'side': 'white', 'opponent': 'Bob', 'date': '2026-10-15 10:00:00', 'result': 'won'});
    final b = PlayerGame.fromJson({'hash': 'h', 'side': 'white', 'opponent': 'Bob', 'date': '2026-10-15T10:00:00Z', 'result': 'won'});
    expect(a.date, '2026-10-15');
    expect(b.date, '2026-10-15');
  });

  test('fetchGameByUrl posts url and returns pgn', () async {
    final prev = api.client;
    addTearDown(() => api.client = prev);
    api.client = MockClient((req) async {
      expect(req.method, 'POST');
      expect(req.url.path, '/api/game-by-url');
      expect(jsonDecode(req.body), {'url': 'https://lichess.org/abcd1234'});
      return http.Response(
        jsonEncode({
          'pgn': '1. e4 e5 2. Nf3 Nc6 *',
          'url': 'https://lichess.org/abcd1234',
          'platform': 'lichess',
          'white': {'name': 'Alice', 'rating': 1500},
          'black': {'name': 'Bob', 'rating': 1480},
          'result': '*',
          'timeClass': 'blitz',
          'hash': 'abc123',
        }),
        200,
      );
    });
    expect(await api.fetchGameByUrl('https://lichess.org/abcd1234'), '1. e4 e5 2. Nf3 Nc6 *');
  });

  test('fetchGameByUrl throws ApiError on 422, 404, and missing pgn', () async {
    final prev = api.client;
    addTearDown(() => api.client = prev);

    api.client = MockClient((_) async => http.Response('{"detail":"Paste a Chess.com or Lichess game link"}', 422));
    await expectLater(
      api.fetchGameByUrl('https://example.com/123'),
      throwsA(isA<api.ApiError>()
          .having((e) => e.status, 'status', 422)
          .having((e) => e.message, 'message', 'Paste a Chess.com or Lichess game link')),
    );

    api.client = MockClient((_) async => http.Response('{"detail":"Game not found"}', 404));
    await expectLater(
      api.fetchGameByUrl('https://lichess.org/notfound'),
      throwsA(isA<api.ApiError>().having((e) => e.status, 'status', 404).having((e) => e.message, 'message', 'Game not found')),
    );

    api.client = MockClient((_) async => http.Response('{}', 200));
    await expectLater(api.fetchGameByUrl('https://lichess.org/abcd1234'), throwsA(isA<api.ApiError>()));
  });
}

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
}

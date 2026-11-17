import 'dart:convert';

import 'package:http/http.dart' as http;

import 'models.dart';

const apiBase = 'https://hindsight.almadih.dev';

/// Top-level so tests can swap in a MockClient.
http.Client client = http.Client();

class ApiError implements Exception {
  ApiError(this.message, this.status);
  final String message;
  final int status;
  @override
  String toString() => message;
}

Future<dynamic> _request(String path, {Object? body}) async {
  final uri = Uri.parse('$apiBase$path');
  final res = body == null
      ? await client.get(uri)
      : await client.post(uri, headers: {'content-type': 'application/json'}, body: jsonEncode(body));
  dynamic json;
  try {
    json = jsonDecode(utf8.decode(res.bodyBytes));
  } catch (_) {}
  if (res.statusCode < 200 || res.statusCode >= 300) {
    // FastAPI sends a string for our own errors and a list for request validation errors.
    final detail = json is Map ? json['detail'] : null;
    throw ApiError(detail is String ? detail : 'Request failed (${res.statusCode})', res.statusCode);
  }
  return json;
}

Future<List<GameSummary>> fetchGames(String platform, String username) async {
  final j = await _request('/api/games/$platform/${Uri.encodeComponent(username)}');
  return [for (final g in j['games']) GameSummary.fromJson(g)];
}

Future<PlayerProfile> fetchPlayer(String platform, String username) async =>
    PlayerProfile.fromJson(await _request('/api/player/$platform/${Uri.encodeComponent(username)}'));

/// A stored review by its game hash, or null if there is none.
Future<Report?> getReview(String hash) async {
  try {
    return Report.fromJson(await _request('/api/review/${Uri.encodeComponent(hash)}'));
  } on ApiError catch (e) {
    if (e.status == 404 || e.status == 422) return null;
    rethrow;
  }
}

/// `fresh` re-analyzes privately: the shared cached review is neither used nor changed.
Future<Report> analyze(String pgn, {List<PositionEval>? evals, bool fresh = false}) async => Report.fromJson(await _request('/api/analyze', body: {
      'pgn': pgn,
      'evals': evals?.map((e) => e.toJson()).toList(),
      'fresh': fresh,
    }));

/// The shared cached review for this game, or null if nobody has analyzed it yet.
Future<Report?> cachedReview(String pgn) async {
  try {
    return await analyze(pgn);
  } on ApiError catch (e) {
    if (e.status == 404) return null;
    rethrow;
  }
}

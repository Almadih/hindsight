import 'dart:async';
import 'dart:convert';
import 'dart:io';

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

/// Long enough for /api/analyze (coach notes take a few seconds), short enough that a dead network surfaces.
const _timeout = Duration(seconds: 30);

Future<dynamic> _request(String path, {Object? body}) async {
  final uri = Uri.parse('$apiBase$path');
  final res = await (body == null
          ? client.get(uri)
          : client.post(uri, headers: {'content-type': 'application/json'}, body: jsonEncode(body)))
      .timeout(_timeout);
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

/// A sentence a person can act on, for any error the API layer or the network throws.
String friendlyError(Object e) {
  if (e is TimeoutException) return 'The server took too long to answer. Check your connection and try again.';
  if (e is SocketException || e is http.ClientException || e is HandshakeException) {
    return 'Can’t reach Hindsight. Check your internet connection and try again.';
  }
  if (e is ApiError) {
    return switch (e.status) {
      429 => 'Too many new reviews from this connection right now. Try again in a minute.',
      >= 500 => 'Hindsight’s server had a problem. Try again in a moment.',
      // Our own 4xx details are plain sentences ("player not found", "invalid PGN: …"): capitalize them.
      _ => e.message.isEmpty ? 'Something went wrong.' : '${e.message[0].toUpperCase()}${e.message.substring(1)}${e.message.endsWith('.') ? '' : '.'}',
    };
  }
  if (e is FormatException) return 'That doesn’t look like a valid PGN.';
  return 'Something went wrong. Try again.';
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

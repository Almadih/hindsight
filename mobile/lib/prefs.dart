import 'package:shared_preferences/shared_preferences.dart';

/// Persisted settings; mirrors the web's localStorage keys (lib/me.ts, Review.tsx).
late final SharedPreferences prefs;

Future<void> initPrefs() async => prefs = await SharedPreferences.getInstance();

/// Analysis depth by quality, same as web/lib/engine/pool.ts QUALITY_DEPTH.
const qualityDepth = {'quick': 14, 'standard': 16, 'deep': 18};

String get quality => prefs.getString('hindsight_quality') ?? 'quick'; // phones: depth 14 is ~2.6x faster than 16 (measured)
set quality(String v) => prefs.setString('hindsight_quality', v);

bool get soundOn => prefs.getBool('sound') ?? true;
set soundOn(bool v) => prefs.setBool('sound', v);

/// Usernames the user has looked up, most recent first, max 5 (web/lib/me.ts).
List<String> get myUsernames => prefs.getStringList('hindsight:me') ?? const [];
void rememberMe(String username) {
  final u = username.trim();
  if (u.isEmpty) return;
  prefs.setStringList('hindsight:me', [u, ...myUsernames.where((x) => x.toLowerCase() != u.toLowerCase())].take(5).toList());
}

String get lastPlatform => prefs.getString('platform') ?? 'chesscom';
set lastPlatform(String v) => prefs.setString('platform', v);

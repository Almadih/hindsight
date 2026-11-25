// Mirrors web/lib/types.ts (which mirrors api/src/review/analyze.py and fetchers.py).

enum Badge { book, brilliant, great, best, excellent, good, inaccuracy, mistake, miss, blunder }

enum Phase { opening, middlegame, endgame }

enum Side { white, black }

double? _d(Object? v) => (v as num?)?.toDouble();
int? _i(Object? v) => (v as num?)?.toInt();

class WhiteEval {
  const WhiteEval(this.evalWhite, this.mateWhite);
  factory WhiteEval.fromJson(Map<String, dynamic> j) => WhiteEval(_d(j['evalWhite'])!, _i(j['mateWhite']));
  final double evalWhite;
  final int? mateWhite;
}

class Alternative {
  const Alternative(this.uci, this.san, this.w);
  factory Alternative.fromJson(Map<String, dynamic> j) => Alternative(j['uci'], j['san'], _d(j['w'])!);
  final String uci, san;
  final double w; // mover's win%
}

class ReviewMove extends WhiteEval {
  ReviewMove.fromJson(Map<String, dynamic> j)
      : ply = j['ply'],
        color = Side.values.byName(j['color']),
        san = j['san'],
        uci = j['uci'],
        fen = j['fen'],
        badge = Badge.values.byName(j['badge']),
        phase = Phase.values.byName(j['phase']),
        wBefore = _d(j['wBefore'])!,
        wAfter = _d(j['wAfter'])!,
        accuracy = _d(j['accuracy'])!,
        bestUci = j['bestUci'],
        bestPv = List<String>.from(j['bestPv'] ?? const []),
        alternatives = [for (final a in j['alternatives'] ?? const []) Alternative.fromJson(a)],
        tactics = List<String>.from(j['tactics'] ?? const []),
        coach = j['coach'],
        super(_d(j['evalWhite'])!, _i(j['mateWhite']));
  final int ply;
  final Side color;
  final String san, uci, fen;
  final Badge badge;
  final Phase phase;
  final double wBefore, wAfter, accuracy;
  final String? bestUci;
  final List<String> bestPv;
  final List<Alternative> alternatives;
  final List<String> tactics;
  final String? coach;
}

class Report {
  Report.fromJson(Map<String, dynamic> j)
      : hash = j['hash'],
        headers = Map<String, String>.from(j['headers']),
        opening = j['opening'],
        start = WhiteEval.fromJson(j['start']),
        moves = [for (final m in j['moves']) ReviewMove.fromJson(m)],
        accuracy = {for (final s in Side.values) s: _d(j['accuracy'][s.name])},
        phaseAccuracy = {
          for (final s in Side.values)
            s: {for (final p in Phase.values) p: _d(j['accuracy']['phases']?[s.name]?[p.name])},
        },
        counts = {
          for (final s in Side.values)
            s: {
              for (final e in (j['counts'][s.name] as Map<String, dynamic>? ?? {}).entries)
                Badge.values.byName(e.key): (e.value as num).toInt(),
            },
        },
        elo = {for (final s in Side.values) s: _i(j['elo'][s.name])};
  final String hash;
  final Map<String, String> headers;
  final String? opening;
  final WhiteEval start;
  final List<ReviewMove> moves;
  final Map<Side, double?> accuracy;
  final Map<Side, Map<Phase, double?>> phaseAccuracy;
  final Map<Side, Map<Badge, int>> counts;
  final Map<Side, int?> elo;
}

class Player {
  Player.fromJson(Map<String, dynamic> j) : name = j['name'], rating = _i(j['rating']);
  final String name;
  final int? rating;
}

class GameSummary {
  GameSummary.fromJson(Map<String, dynamic> j)
      : id = j['id'].toString(),
        url = j['url'],
        pgn = j['pgn'],
        white = Player.fromJson(j['white']),
        black = Player.fromJson(j['black']),
        result = j['result'],
        timeClass = j['timeClass'],
        endTime = _i(j['endTime'])!,
        hash = j['hash'],
        reviewed = j['reviewed'] != null,
        reviewedAccuracy = j['reviewed'] == null ? null : _d(j['reviewed']['accuracy']);
  final String id, url, pgn, result;
  final Player white, black;
  final String? timeClass, hash;
  final int endTime;
  final bool reviewed;
  final double? reviewedAccuracy;
}

/// One engine line, scores from the side to move's perspective (as UCI reports them).
class EngineLine {
  const EngineLine({required this.uci, this.cp, this.mate, required this.pv});
  final String uci;
  final int? cp, mate;
  final List<String> pv;
  Map<String, dynamic> toJson() => {'uci': uci, if (cp != null) 'cp': cp, if (mate != null) 'mate': mate, 'pv': pv};
}

class PositionEval {
  const PositionEval(this.fen, this.lines);
  final String fen;
  final List<EngineLine> lines;
  Map<String, dynamic> toJson() => {'fen': fen, 'lines': [for (final l in lines) l.toJson()]};
}

class PlayerGame {
  PlayerGame.fromJson(Map<String, dynamic> j)
      : hash = j['hash'],
        side = j['side'],
        opponent = j['opponent'],
        date = '${j['date'] ?? ''}'.split(RegExp(r'[T ]')).first,
        result = j['result'],
        accuracy = _d(j['accuracy']),
        estElo = _i(j['estElo']);
  final String hash, side, opponent, result, date; // result: won | lost | draw | unknown
  final double? accuracy;
  final int? estElo;
}

class PlayerTheme {
  PlayerTheme.fromJson(Map<String, dynamic> j)
      : label = j['label'],
        count = j['count'],
        hash = j['example']['hash'],
        ply = j['example']['ply'];
  final String label, hash;
  final int count, ply;
}

class PlayerProfile {
  PlayerProfile.fromJson(Map<String, dynamic> j)
      : username = j['username'],
        platform = j['platform'],
        games = [for (final g in j['games']) GameSummary.fromJson(g)],
        history = [for (final g in j['history']) PlayerGame.fromJson(g)],
        themes = [for (final t in j['themes']) PlayerTheme.fromJson(t)];
  final String username, platform;
  final List<GameSummary> games;
  final List<PlayerGame> history; // newest first
  final List<PlayerTheme> themes;
}

class AppConfig {
  const AppConfig({
    required this.latestVersion,
    required this.minVersion,
    required this.title,
    required this.message,
    required this.storeUrl,
  });

  factory AppConfig.fromJson(Map<String, dynamic> j) => AppConfig(
        latestVersion: (j['latest_version'] ?? j['latestVersion']) as String? ?? '0.0.0',
        minVersion: (j['min_version'] ?? j['minVersion']) as String? ?? '0.0.0',
        title: j['title'] as String? ?? '',
        message: j['message'] as String? ?? '',
        storeUrl: (j['store_url'] ?? j['storeUrl']) as String? ?? '',
      );

  final String latestVersion, minVersion, title, message, storeUrl;
}

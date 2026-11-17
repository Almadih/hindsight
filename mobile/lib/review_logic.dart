import 'dart:math' as math;
import 'dart:ui' show Color;

import 'package:dartchess/dartchess.dart' as dc;

import 'models.dart';

const standardFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/// Display order, best to worst.
const badgeOrder = [
  Badge.brilliant, Badge.great, Badge.best, Badge.excellent, Badge.good,
  Badge.book, Badge.inaccuracy, Badge.mistake, Badge.miss, Badge.blunder,
];

class BadgeMeta {
  const BadgeMeta(this.label, this.phrase, this.color, this.rule);
  final String label, phrase, rule;
  final Color color;
}

const badgeMeta = {
  Badge.brilliant: BadgeMeta('Brilliant', 'is brilliant', Color(0xFF26C2A3), 'The best move, and it gives up material to get there.'),
  Badge.great: BadgeMeta('Great', 'is a great move', Color(0xFF749BBF), 'The only move that keeps your chances. Everything else loses ground.'),
  Badge.best: BadgeMeta('Best', 'is best', Color(0xFF81B64C), 'Exactly what the engine would play.'),
  Badge.excellent: BadgeMeta('Excellent', 'is excellent', Color(0xFF96BC4B), 'Almost as good as the best move.'),
  Badge.good: BadgeMeta('Good', 'is good', Color(0xFF97AF8B), 'A solid move that costs you a little.'),
  Badge.book: BadgeMeta('Book', 'is a book move', Color(0xFFB39572), 'Known opening theory.'),
  Badge.inaccuracy: BadgeMeta('Inaccuracy', 'is an inaccuracy', Color(0xFFF7C631), 'A small slip.'),
  Badge.mistake: BadgeMeta('Mistake', 'is a mistake', Color(0xFFFFA459), 'A real error your opponent can use.'),
  Badge.miss: BadgeMeta('Miss', 'is a miss', Color(0xFFFF7769), 'Your opponent slipped and you didn’t punish it.'),
  Badge.blunder: BadgeMeta('Blunder', 'is a blunder', Color(0xFFFA412D), 'Throws the game away, or walks into mate.'),
};

const _bad = {Badge.blunder, Badge.miss, Badge.mistake, Badge.inaccuracy};

/// Badges drawn as dots on the eval graph.
const graphBadges = {Badge.brilliant, Badge.great, Badge.miss, Badge.mistake, Badge.blunder};

/// Decisive moments: brilliant/great moves plus the costliest errors, at most [limit], in game order.
List<ReviewMove> keyMoments(List<ReviewMove> moves, {int limit = 4}) {
  const keyScore = {Badge.brilliant: 40, Badge.great: 18};
  final scored = [
    for (final m in moves)
      (m: m, s: (keyScore[m.badge] ?? 0) + (_bad.contains(m.badge) ? m.wBefore - m.wAfter : 0))
  ].where((x) => x.s >= 5).toList()
    ..sort((a, b) => b.s != a.s ? b.s.compareTo(a.s) : a.m.ply.compareTo(b.m.ply)); // stable like JS
  return [for (final x in scored.take(limit)) x.m]..sort((a, b) => a.ply.compareTo(b.ply));
}

bool canRetry(ReviewMove m) => _bad.contains(m.badge) && m.alternatives.isNotEmpty;

/// Retry verdict: the engine's best move, or another top line within 2% win of it.
bool isGoodRetry(ReviewMove m, String uci) {
  if (m.alternatives.isEmpty) return false;
  final alt = m.alternatives.where((a) => a.uci == uci).firstOrNull;
  return alt != null && m.alternatives.first.w - alt.w < 2;
}

/// White's win% for the eval bar and graph, same curve as the API.
double whiteWinPct(WhiteEval e) {
  final mate = e.mateWhite;
  if (mate != null) return mate > 0 || (mate == 0 && e.evalWhite > 0) ? 100 : 0;
  return 50 + 50 * (2 / (1 + math.exp(-0.00368208 * e.evalWhite * 100)) - 1);
}

String formatEval(WhiteEval e) {
  final mate = e.mateWhite;
  if (mate == 0) return e.evalWhite > 0 ? '1-0' : '0-1';
  if (mate != null) return 'M${mate.abs()}';
  if (e.evalWhite.abs() < 0.05) return '0.0';
  return '${e.evalWhite > 0 ? '+' : ''}${e.evalWhite.toStringAsFixed(1)}';
}

/// Phase accuracy mapped onto a badge for the summary's phase rows.
Badge phaseBadge(double a) => a >= 92
    ? Badge.best
    : a >= 85
        ? Badge.excellent
        : a >= 75
            ? Badge.good
            : a >= 65
                ? Badge.inaccuracy
                : a >= 50
                    ? Badge.mistake
                    : Badge.blunder;

/// Sound file (assets/sfx) for a move, mirroring web/lib/sfx.ts.
String sfxFile(String san) => san.contains('=')
    ? 'promote.mp3'
    : san.endsWith('+') || san.endsWith('#')
        ? 'move-check.mp3'
        : san.startsWith('O-O')
            ? 'castle.mp3'
            : san.contains('x')
                ? 'capture.mp3'
                : 'move-self.mp3';

dc.Position? positionOf(String fen) {
  try {
    return dc.Chess.fromSetup(dc.Setup.parseFen(fen));
  } catch (_) {
    return null;
  }
}

/// Plays a UCI move (standard castling notation) on [pos]; null when illegal.
(dc.Position, String)? playUci(dc.Position pos, String uci) {
  try {
    final m = dc.Move.parse(uci);
    if (m is! dc.NormalMove) return null;
    return pos.makeSan(pos.normalizeMove(m));
  } catch (_) {
    return null;
  }
}

/// Shown in place of the badge's wording when the mover had exactly one legal move.
const forcedPhrase = 'is the only legal move';
const forcedRule = 'Forced: there was no other move to play.';

bool isForced(String fenBefore) {
  final pos = positionOf(fenBefore);
  if (pos == null) return false;
  final moves = pos.legalMoves.entries.where((e) => e.value.isNotEmpty).toList();
  if (moves.length != 1 || moves.single.value.size != 1) return false;
  // A lone pawn move to the last rank still leaves a choice of promotion piece.
  final to = moves.single.value.first!;
  return !(pos.board.roleAt(moves.single.key) == dc.Role.pawn && dc.SquareSet.backranks.has(to));
}

String? uciToSan(String fen, String uci) {
  final pos = positionOf(fen);
  return pos == null ? null : playUci(pos, uci)?.$2;
}

const _value = {'p': 1, 'n': 3, 'b': 3, 'r': 5, 'q': 9};

/// White material minus Black material.
int materialDiff(String fen) {
  var d = 0;
  for (final ch in fen.split(' ')[0].split('')) {
    final v = _value[ch.toLowerCase()];
    if (v != null) d += ch == ch.toUpperCase() ? v : -v;
  }
  return d;
}

bool _occupied(String fen, String sq) => positionOf(fen)?.board.pieceAt(dc.Square.fromName(sq)) != null;

/// The short, high-impact part of an engine line: up to mate, a promotion or a settled material win,
/// otherwise the first 4 plies (extended to finish trades). Port of followUpLine in web/lib/review.ts.
({List<String> fens, List<String> sans}) followUpLine(String fen, List<String> pv) {
  const lineMax = 6, lineQuiet = 4, lineReach = 8;
  var pos = positionOf(fen);
  if (pos == null) return (fens: [fen], sans: <String>[]);
  final sign = pos.turn == dc.Side.white ? 1 : -1;
  final start = materialDiff(fen) * sign;
  final fens = [fen];
  final sans = <String>[];
  for (final uci in pv.take(lineReach)) {
    final r = playUci(pos!, uci);
    if (r == null) break;
    pos = r.$1;
    fens.add(pos.fen);
    sans.add(r.$2);
    final next = pv.length > sans.length ? pv[sans.length] : null;
    final exchangeOver = next == null || !_occupied(pos.fen, next.substring(2, 4));
    final decisive = pos.isCheckmate || uci.length > 4 || (materialDiff(pos.fen) * sign - start >= 2 && exchangeOver);
    if (decisive && sans.length <= lineMax) return (fens: fens, sans: sans);
  }
  bool behind(int i) => materialDiff(fens[i]) * sign < start;
  bool capturePending(int i) => _occupied(fens[i], pv[i].substring(2, 4));
  var n = sans.length < lineQuiet ? sans.length : lineQuiet;
  while (n < sans.length && (behind(n) || capturePending(n))) {
    n++;
  }
  while (n > 1 && behind(n)) {
    n--;
  }
  return (fens: fens.sublist(0, n + 1), sans: sans.sublist(0, n));
}

/// Which side "you" played, from the usernames remembered on this device (port of mySide in web/lib/me.ts).
Side? mySide(Map<String, String> headers, List<String> mine) {
  final names = {for (final n in mine) n.toLowerCase()};
  if (names.contains((headers['White'] ?? '').toLowerCase())) return Side.white;
  if (names.contains((headers['Black'] ?? '').toLowerCase())) return Side.black;
  return null;
}

/// 'chesscom' / 'lichess' from the Site header, or null for anything else (pasted PGNs).
String? platformOf(Map<String, String> headers) {
  final site = (headers['Site'] ?? '').toLowerCase();
  return site.contains('chess.com') ? 'chesscom' : site.contains('lichess') ? 'lichess' : null;
}

/// Your key moments (plus the opponent's single biggest swing if it outranks one of yours), else both sides'.
({List<ReviewMove> moments, bool mine}) decidingMoments(List<ReviewMove> moves, Side? me) {
  final own = me == null ? const <ReviewMove>[] : moves.where((m) => m.color == me).toList();
  final theirs = keyMoments(moves.where((m) => m.color != me).toList(), limit: 1);
  final picked = me == null ? const <ReviewMove>[] : keyMoments([...own, ...theirs]);
  final mine = picked.any((m) => m.color == me);
  return (moments: mine ? picked : keyMoments(moves), mine: mine);
}

/// The coach's first sentence, as a one-line gist.
String? gist(String? text) {
  if (text == null || text.isEmpty) return null;
  final first = text.split(RegExp(r'(?<=[.!?])\s')).first;
  return first.length > 110 ? '${first.substring(0, 107)}…' : first;
}

/// Coach notes name both players; when one is you, "Hikaru's Bxb3+" reads "Your Bxb3+".
String personalize(String text, String? you) {
  if (you == null) return text;
  return text
      .replaceAll(RegExp("${RegExp.escape(you)}['’]s\\b"), 'your')
      .replaceAllMapped(RegExp(r'(^|[.!?]\s+)your'), (m) => '${m[1]}Your');
}

const _startCount = {'q': 1, 'r': 2, 'b': 2, 'n': 2, 'p': 8};

/// Pieces each side has captured as asset codes ('bQ', 'wP'...), most valuable first.
({List<String> white, List<String> black}) capturedPieces(String fen) {
  final count = <String, int>{};
  for (final ch in fen.split(' ')[0].split('')) {
    count[ch] = (count[ch] ?? 0) + 1;
  }
  List<String> missing(String color) => [
        for (final e in _startCount.entries)
          for (var i = 0; i < math.max(0, e.value - (count[color == 'w' ? e.key.toUpperCase() : e.key] ?? 0)); i++)
            '$color${e.key.toUpperCase()}',
      ];
  return (white: missing('b'), black: missing('w'));
}

/// Nudge after a wrong retry: why it falls short, and which piece the best move uses (not the answer).
String retryHint(ReviewMove m, String fenBefore, String uci) {
  final alt = m.alternatives.where((a) => a.uci == uci).firstOrNull;
  final top = m.alternatives.firstOrNull;
  final why = uci == m.uci
      ? 'That’s the game move again. '
      : alt != null && top != null
          ? 'It keeps ${alt.w.round()}% winning chances; the best keeps ${top.w.round()}%. '
          : '';
  final from = m.bestUci?.substring(0, 2);
  final role = from == null ? null : positionOf(fenBefore)?.board.roleAt(dc.Square.fromName(from));
  return '$why${role != null ? 'Hint: move the ${role.name} on $from.' : 'Try another move.'}';
}

/// How the game ended and the single biggest swing, from your side when we know it (port of takeaway in Review.tsx).
String takeaway(Report report, Map<Side, String> names, Side? me) {
  final result = report.headers['Result'];
  final winner = result == '1-0' ? Side.white : result == '0-1' ? Side.black : null;
  final ended = result == '1/2-1/2'
      ? 'The game ended in a draw.'
      : winner == null
          ? ''
          : me != null
              ? (me == winner ? 'You won.' : 'You lost.')
              : '${names[winner]} won.';
  ReviewMove? swing;
  for (final m in report.moves) {
    if (swing == null || m.wBefore - m.wAfter > swing.wBefore - swing.wAfter) swing = m;
  }
  final lost = swing == null ? 0 : (swing.wBefore - swing.wAfter).round();
  if (swing == null || lost < 10) return '$ended No single move decided it; these were the turning points.'.trim();
  final who = swing.color == me ? 'you' : names[swing.color];
  final dots = swing.color == Side.black ? '..' : '';
  return '$ended The biggest swing was ${(swing.ply / 2).ceil()}.$dots ${swing.san}, where $who gave away $lost% winning chances.'.trim();
}

/// Engine score of one position from White's side (port of whiteEval in AnalysisLive.tsx).
WhiteEval whiteEvalOf(PositionEval ev) {
  final best = ev.lines.firstOrNull;
  if (best == null) return const WhiteEval(0, null);
  final sign = ev.fen.split(' ')[1] == 'w' ? 1 : -1;
  final mate = best.mate;
  if (mate != null) return WhiteEval(sign * (mate > 0 ? 100.0 : -100.0), sign * mate);
  return WhiteEval(sign * (best.cp ?? 0) / 100, null);
}

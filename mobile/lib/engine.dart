import 'dart:async';
import 'dart:math';

import 'package:dartchess/dartchess.dart';
import 'package:multistockfish/multistockfish.dart';

import 'models.dart';
import 'review_logic.dart' show standardUci;

const _pvMax = 20; // the API caps PVs at 40 moves
const _maxMs = 5000; // per-position backstop
const _pv2Depth = 12;
const _pv2Nodes = 40000;
const _mateCp = 10000;
const _humanMate = 3;
const _longMateCp = 1000;
const _promoRoles = [Role.queen, Role.rook, Role.bishop, Role.knight];

int? _pass1Nodes(int depth) => depth <= 14 ? 150000 : (depth <= 16 ? 400000 : null);

int _scoreToCp(int? cp, int? mate) {
  if (mate != null) {
    if (mate == 0) return -_mateCp;
    return mate > 0 ? _mateCp - 10 * mate : -(_mateCp - 10 * mate.abs());
  }
  return cp ?? 0;
}

int _perceivedCp(int? cp, int? mate) {
  if (mate != null && mate.abs() > _humanMate) {
    return mate > 0 ? _longMateCp : -_longMateCp;
  }
  return _scoreToCp(cp, mate);
}

double _winPct(num cp) => 50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1);

/// All legal moves in standard UCI notation (normalizing castling and expanding promotions).
List<String> legalUcis(Position pos) {
  final out = <String>[];
  for (final entry in pos.legalMoves.entries) {
    final from = entry.key;
    final isPawn = pos.board.roleAt(from) == Role.pawn;
    for (final to in entry.value.squares) {
      if (isPawn && SquareSet.backranks.has(to)) {
        for (final role in _promoRoles) {
          out.add(NormalMove(from: from, to: to, promotion: role).uci);
        }
      } else {
        out.add(standardUci(pos, NormalMove(from: from, to: to)));
      }
    }
  }
  return out;
}

/// 4-field FEN cache key when halfmove clock < 80 (safe from 50-move rule effects), else null.
String? fenDedupKey(String fen) {
  final parts = fen.split(' ');
  if (parts.length < 5) return null;
  final halfmoves = int.tryParse(parts[4]);
  if (halfmoves == null || halfmoves >= 80) return null;
  return '${parts[0]} ${parts[1]} ${parts[2]} ${parts[3]}';
}

/// Derives a forced position's eval from the child position reached by playing its only legal move.
PositionEval deriveForcedEval(
  String fen,
  String forcedUci,
  PositionEval childEval, {
  required bool childCheckmate,
  required bool childDraw,
}) {
  final child = childEval.lines.firstOrNull;
  final pv = [forcedUci, if (child != null) ...child.pv].take(_pvMax).toList();
  if (childCheckmate) {
    return PositionEval(fen, [EngineLine(uci: forcedUci, mate: 1, pv: pv)]);
  }
  if (childDraw || child == null) {
    return PositionEval(fen, [EngineLine(uci: forcedUci, cp: 0, pv: pv)]);
  }
  if (child.mate != null) {
    final m = child.mate!;
    // Child mate < 0 means opponent is mated in |m| after our move, so we mate in |m| + 1.
    return PositionEval(fen, [EngineLine(uci: forcedUci, mate: m > 0 ? -m : -m + 1, pv: pv)]);
  }
  return PositionEval(fen, [EngineLine(uci: forcedUci, cp: -(child.cp ?? 0), pv: pv)]);
}

/// True when the backend's classification or Retry flow needs a 2nd engine line at this ply.
bool needsSecondLine({
  required EngineLine bestBefore,
  required EngineLine? bestAfter,
  required bool afterCheckmate,
  required bool afterDraw,
  required bool playedBest,
  required bool wasInCheck,
  required bool isRecapture,
}) {
  final mateBefore = bestBefore.mate;
  final mateAfter = (afterCheckmate || afterDraw) ? null : bestAfter?.mate;
  final cpBefore = _scoreToCp(bestBefore.cp, mateBefore);
  final cpAfter = afterCheckmate ? -_mateCp : (afterDraw ? 0 : _scoreToCp(bestAfter?.cp, mateAfter));

  final feltBefore = _perceivedCp(cpBefore, mateBefore);
  final feltAfter = afterCheckmate ? -_mateCp : (afterDraw ? 0 : _perceivedCp(cpAfter, mateAfter));
  final wBefore = _winPct(feltBefore);
  final wAfter = 100 - _winPct(feltAfter);
  final dw = max(0.0, wBefore - wAfter);

  if (playedBest) {
    // Only the "great" badge uses PV2 when the player played PV1.
    return !wasInCheck && !isRecapture && wBefore < 98.0;
  }

  // Retry (alternatives[1]) is enabled for inaccuracy/mistake/miss/blunder.
  if (dw >= 6.0) return true;
  final afterIsMate = afterCheckmate || mateAfter != null;
  final cpLoss = (mateBefore != null && afterIsMate) ? max(0, cpBefore + cpAfter) : max(0, feltBefore + feltAfter);
  if (wBefore < 20.0 && cpLoss >= 50) return true;
  if (mateBefore != null && mateBefore > 0 && mateBefore <= 2) {
    final hasMate = afterCheckmate || (mateAfter != null && mateAfter < 0);
    final afterMate = afterCheckmate ? 0 : (mateAfter != null ? -mateAfter : null);
    final deliveredFastMate = hasMate && (afterMate == 0 || (afterMate != null && afterMate > 0 && afterMate <= 1));
    if (!deliveredFastMate) return true;
  }
  return false;
}

({String uci, Square to, bool isCapture})? _playedMove(Position before, Position after) {
  for (final entry in before.legalMoves.entries) {
    final from = entry.key;
    final isPawn = before.board.roleAt(from) == Role.pawn;
    for (final to in entry.value.squares) {
      final moves = isPawn && SquareSet.backranks.has(to)
          ? [for (final r in _promoRoles) NormalMove(from: from, to: to, promotion: r)]
          : [NormalMove(from: from, to: to)];
      for (final m in moves) {
        final next = before.play(m);
        if (next.board == after.board && next.turn == after.turn) {
          final isCapture = before.board.sideAt(to) == before.turn.opposite || (isPawn && from.file != to.file);
          return (uci: standardUci(before, m), to: to, isCapture: isCapture);
        }
      }
    }
  }
  return null;
}

/// Parse a UCI `info` line with a score and PV. Scores are from the side to move's perspective.
({int multipv, int depth, EngineLine line})? parseInfo(String line) {
  // Bound scores come from aspiration-window fail highs/lows and aren't final.
  if (!line.startsWith('info ') || line.contains(' lowerbound') || line.contains(' upperbound')) return null;
  final t = line.split(' ');
  final pvAt = t.indexOf('pv');
  final scoreAt = t.indexOf('score');
  if (pvAt < 0 || scoreAt < 0 || scoreAt + 2 >= t.length) return null;
  int? after(String key) {
    final i = t.indexOf(key);
    return i < 0 || i + 1 >= t.length ? null : int.tryParse(t[i + 1]);
  }

  final value = int.tryParse(t[scoreAt + 2]);
  if (value == null) return null;
  final pv = t.sublist(pvAt + 1);
  if (pv.isEmpty) return null;
  final isMate = t[scoreAt + 1] == 'mate';
  return (
    multipv: after('multipv') ?? 1,
    depth: after('depth') ?? 0,
    line: EngineLine(uci: pv[0], pv: pv, mate: isMate ? value : null, cp: isMate ? null : value),
  );
}

/// Evaluates every position one after another on a single native Stockfish.
/// Throws StateError if [cancelled] returns true or [cancel] completes.
Future<List<PositionEval>> analyzePositions(
  List<String> fens, {
  int depth = 16,
  int multiPv = 2, // line 2 feeds the "great" badge & Retry; computed conditionally in Pass 2
  void Function(int index, PositionEval ev)? onPosition,
  bool Function()? cancelled,
  Future<void>? cancel,
}) async {
  if (cancelled?.call() ?? false) throw StateError('analysis cancelled');
  if (fens.isEmpty) return const [];
  final twoPass = multiPv == 2 && fens.length > 1;
  final sf = await Stockfish.create(flavor: StockfishFlavor.light);
  var active = true;
  var isCancelled = false;
  try {
    final readyok = Completer<void>();
    var bestmove = Completer<void>();
    final byPv = <int, EngineLine>{};
    var stopped = false;
    final sub = sf.stdout.listen((line) {
      if (line == 'readyok') {
        if (!readyok.isCompleted) readyok.complete();
        return;
      }
      if (line.startsWith('bestmove')) {
        // Guard against multistockfish's sfio.cpp in.tie(&out) race duplicating a previous bestmove before info arrives.
        if (!bestmove.isCompleted && (byPv.isNotEmpty || stopped)) bestmove.complete();
        return;
      }
      final info = parseInfo(line);
      if (info == null) return;
      byPv[info.multipv] = EngineLine(
        uci: info.line.uci,
        cp: info.line.cp,
        mate: info.line.mate,
        pv: info.line.pv.take(_pvMax).toList(),
      );
      // Once PV1 is a mate the search has fully seen, more depth only burns time on extra plies/lines.
      final mate = info.line.mate;
      if (!stopped && info.multipv == 1 && mate != null && info.depth >= min(2 * mate.abs(), 10)) {
        stopped = true;
        sf.stdin = 'stop';
      }
    });
    cancel?.then((_) {
      isCancelled = true;
      if (!active) return;
      try {
        sf.stdin = 'stop';
      } catch (_) {}
      if (!readyok.isCompleted) readyok.completeError(StateError('analysis cancelled'));
      if (!bestmove.isCompleted) bestmove.completeError(StateError('analysis cancelled'));
    });

    Future<List<EngineLine>> runSearch(String fen, String goCmd) async {
      byPv.clear();
      stopped = false;
      bestmove = Completer<void>();
      sf.stdin = 'position fen $fen';
      sf.stdin = goCmd;
      await bestmove.future.timeout(const Duration(milliseconds: _maxMs * 3));
      return [for (final k in byPv.keys.toList()..sort()) byPv[k]!];
    }

    try {
      // Threads=1 is ~2.15x faster than Threads=3 on StockfishLight (Lazy SMP thrashes at d14-d16, 10x CPU/heat).
      sf.stdin = 'setoption name Threads value 1';
      sf.stdin = 'setoption name Hash value 64';
      sf.stdin = 'setoption name MultiPV value ${twoPass ? 1 : multiPv}';
      sf.stdin = 'isready';
      await readyok.future.timeout(const Duration(seconds: 10));

      final positions = [for (final fen in fens) Chess.fromSetup(Setup.parseFen(fen))];
      final allLegalUcis = [for (final pos in positions) legalUcis(pos)];
      final results = List<PositionEval?>.filled(fens.length, null);
      final dedupCache = <String, List<EngineLine>>{};
      final pendingForced = <int>[];
      final nodesCap = _pass1Nodes(depth);
      final pass1Go = nodesCap != null ? 'go depth $depth nodes $nodesCap movetime $_maxMs' : 'go depth $depth movetime $_maxMs';

      for (var i = 0; i < fens.length; i++) {
        if (isCancelled || (cancelled?.call() ?? false)) throw StateError('analysis cancelled');
        final pos = positions[i];
        if (pos.isCheckmate || pos.isStalemate) {
          // Game-over positions report no PV and the API scores them itself.
          results[i] = PositionEval(fens[i], const []);
        } else if (pos.isInsufficientMaterial) {
          // Include a legal 0 cp line so the API never 422s if python-chess disagrees on an exotic draw.
          final uci = allLegalUcis[i].first;
          results[i] = PositionEval(fens[i], [EngineLine(uci: uci, cp: 0, pv: [uci])]);
        } else if (i < fens.length - 1 && allLegalUcis[i].length == 1) {
          // Forced move: derive score right-to-left once the next non-forced position finishes.
          pendingForced.add(i);
          continue;
        } else {
          final key = fenDedupKey(fens[i]);
          final cached = key != null ? dedupCache[key] : null;
          if (cached != null) {
            results[i] = PositionEval(fens[i], cached);
          } else {
            final lines = await runSearch(fens[i], pass1Go);
            if (key != null && lines.isNotEmpty) dedupCache[key] = lines;
            results[i] = PositionEval(fens[i], lines);
          }
        }

        if (pendingForced.isNotEmpty) {
          for (var k = pendingForced.length - 1; k >= 0; k--) {
            final j = pendingForced[k];
            final childPos = positions[j + 1];
            results[j] = deriveForcedEval(
              fens[j],
              allLegalUcis[j].first,
              results[j + 1]!,
              childCheckmate: childPos.isCheckmate,
              childDraw: childPos.isStalemate || childPos.isInsufficientMaterial,
            );
          }
          for (final j in pendingForced) {
            onPosition?.call(j, results[j]!);
          }
          pendingForced.clear();
        }
        onPosition?.call(i, results[i]!);
      }

      if (twoPass) {
        Square? prevTo;
        for (var i = 0; i < fens.length - 1; i++) {
          if (isCancelled || (cancelled?.call() ?? false)) throw StateError('analysis cancelled');
          final played = _playedMove(positions[i], positions[i + 1]);
          final isRecapture = played != null && played.isCapture && prevTo != null && played.to == prevTo;
          prevTo = played?.to;
          if (played == null || allLegalUcis[i].length < 2) continue;
          final evBefore = results[i]!;
          if (evBefore.lines.length != 1) continue;
          final pv1 = evBefore.lines.first;
          final childPos = positions[i + 1];
          final childEv = results[i + 1]!;
          if (!needsSecondLine(
            bestBefore: pv1,
            bestAfter: childEv.lines.firstOrNull,
            afterCheckmate: childPos.isCheckmate,
            afterDraw: childPos.isStalemate || childPos.isInsufficientMaterial,
            playedBest: played.uci == pv1.uci,
            wasInCheck: positions[i].isCheck,
            isRecapture: isRecapture,
          )) {
            continue;
          }
          final others = [for (final u in allLegalUcis[i]) if (u != pv1.uci) u];
          if (others.isEmpty) continue;
          final lines2 = await runSearch(
            fens[i],
            'go depth $_pv2Depth nodes $_pv2Nodes movetime $_maxMs searchmoves ${others.join(' ')}',
          );
          if (lines2.isNotEmpty) {
            results[i] = PositionEval(fens[i], [pv1, lines2.first]);
          }
        }
      }

      return [for (final r in results) r!];
    } finally {
      active = false;
      await sub.cancel();
    }
  } finally {
    active = false;
    await sf.dispose();
  }
}

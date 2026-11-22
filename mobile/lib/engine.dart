import 'dart:async';
import 'dart:math';

import 'package:dartchess/dartchess.dart';
import 'package:flutter/foundation.dart' show visibleForTesting;

import 'models.dart';
import 'native_engine.dart';
import 'review_logic.dart' show standardUci;

const _pvMax = 20; // the API caps PVs at 40 moves
const _maxMs = 5000; // per-position backstop
const _pv2Depth = 12;
const _pv2Nodes = 40000;
const _tileSize = 4; // 4 contiguous plies/tile balances local TT reuse and load balance across workers
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

/// Evaluates every position using the warm native StockfishLight FFI worker pool (tile4 work-stealing).
/// Throws StateError if [cancelled] returns true or [cancel] completes.
Future<List<PositionEval>> analyzePositions(
  List<String> fens, {
  int depth = 16,
  int multiPv = 2, // line 2 feeds the "great" badge & Retry; computed conditionally in Pass 2
  void Function(int index, PositionEval ev)? onPosition,
  bool Function()? cancelled,
  Future<void>? cancel,
  @visibleForTesting EnginePool? pool,
}) async {
  if (cancelled?.call() ?? false) throw StateError('analysis cancelled');
  if (fens.isEmpty) return const [];

  final activePool = pool ?? NativeEnginePool.instance;
  final twoPass = multiPv == 2 && fens.length > 1;

  return activePool.runExclusive(() async {
    var isCancelled = cancelled?.call() ?? false;
    if (isCancelled) throw StateError('analysis cancelled');

    var active = true;
    cancel?.then((_) {
      isCancelled = true;
      if (active) activePool.stopAll();
    });

    bool checkCancelled() {
      if (!isCancelled && (cancelled?.call() ?? false)) {
        isCancelled = true;
        activePool.stopAll();
      }
      return isCancelled;
    }

    try {
      await activePool.clearAll();
      if (checkCancelled()) throw StateError('analysis cancelled');

      final positions = [for (final fen in fens) Chess.fromSetup(Setup.parseFen(fen))];
      final allLegalUcis = [for (final pos in positions) legalUcis(pos)];
      final results = List<PositionEval?>.filled(fens.length, null);

      // Pre-classify terminal, insufficient-material, forced, and duplicate positions before dispatching tiles.
      final forcedIndices = <int>[];
      final terminalIndices = <int>[];
      final firstByKey = <String, int>{};
      final followersByFirst = <int, List<int>>{};
      final toSearch = <int>[];

      for (var i = 0; i < fens.length; i++) {
        final pos = positions[i];
        if (pos.isCheckmate || pos.isStalemate) {
          results[i] = PositionEval(fens[i], const []);
          terminalIndices.add(i);
        } else if (pos.isInsufficientMaterial) {
          // Include a legal 0 cp line so the API never 422s if python-chess disagrees on an exotic draw.
          final uci = allLegalUcis[i].first;
          results[i] = PositionEval(fens[i], [EngineLine(uci: uci, cp: 0, pv: [uci])]);
          terminalIndices.add(i);
        } else if (i < fens.length - 1 && allLegalUcis[i].length == 1) {
          forcedIndices.add(i);
        } else {
          final key = fenDedupKey(fens[i]);
          final first = key != null ? firstByKey[key] : null;
          if (first != null) {
            (followersByFirst[first] ??= []).add(i);
          } else {
            if (key != null) firstByKey[key] = i;
            toSearch.add(i);
          }
        }
      }

      // Build contiguous tile4 batches of unique positions to preserve per-worker TT hits while balancing load.
      final tiles = <List<int>>[
        for (var start = 0; start < toSearch.length; start += _tileSize)
          toSearch.sublist(start, min(start + _tileSize, toSearch.length)),
      ];
      final nodesCap = _pass1Nodes(depth);
      final pass1MultiPv = twoPass ? 1 : multiPv;
      final nWorkers = min(activePool.workerCount, max(1, tiles.length));

      var nextTile = 0;
      await Future.wait([
        for (var w = 0; w < nWorkers; w++)
          () async {
            while (!checkCancelled()) {
              if (nextTile >= tiles.length) break;
              final tile = tiles[nextTile++];
              for (final idx in tile) {
                if (checkCancelled()) break;
                final lines = await activePool.search(
                  w,
                  fens[idx],
                  depth: depth,
                  nodes: nodesCap,
                  movetimeMs: _maxMs,
                  multiPv: pass1MultiPv,
                );
                if (checkCancelled()) break;
                final ev = PositionEval(fens[idx], lines);
                results[idx] = ev;
                onPosition?.call(idx, ev);
                final followers = followersByFirst[idx];
                if (followers != null) {
                  for (final dupIdx in followers) {
                    final dupEv = PositionEval(fens[dupIdx], lines);
                    results[dupIdx] = dupEv;
                    onPosition?.call(dupIdx, dupEv);
                  }
                }
              }
            }
          }(),
      ]);

      if (checkCancelled()) throw StateError('analysis cancelled');

      // Resolve forced moves right-to-left so consecutive forced sequences chain cleanly.
      for (var k = forcedIndices.length - 1; k >= 0; k--) {
        final j = forcedIndices[k];
        final childPos = positions[j + 1];
        results[j] = deriveForcedEval(
          fens[j],
          allLegalUcis[j].first,
          results[j + 1]!,
          childCheckmate: childPos.isCheckmate,
          childDraw: childPos.isStalemate || childPos.isInsufficientMaterial,
        );
      }
      for (final j in forcedIndices) {
        onPosition?.call(j, results[j]!);
      }
      for (final j in terminalIndices) {
        onPosition?.call(j, results[j]!);
      }

      if (twoPass) {
        final candidates = <(int idx, EngineLine pv1, List<String> others)>[];
        Square? prevTo;
        for (var i = 0; i < fens.length - 1; i++) {
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
          if (others.isNotEmpty) candidates.add((i, pv1, others));
        }

        if (candidates.isNotEmpty) {
          var nextCand = 0;
          final p2Workers = min(activePool.workerCount, candidates.length);
          await Future.wait([
            for (var w = 0; w < p2Workers; w++)
              () async {
                while (!checkCancelled()) {
                  if (nextCand >= candidates.length) break;
                  final (idx, pv1, others) = candidates[nextCand++];
                  final lines2 = await activePool.search(
                    w,
                    fens[idx],
                    depth: _pv2Depth,
                    nodes: _pv2Nodes,
                    movetimeMs: _maxMs,
                    multiPv: 1,
                    searchmoves: others,
                  );
                  if (checkCancelled()) break;
                  if (lines2.isNotEmpty) {
                    results[idx] = PositionEval(fens[idx], [pv1, lines2.first]);
                  }
                }
              }(),
          ]);
        }
      }

      if (checkCancelled()) throw StateError('analysis cancelled');
      return [for (final r in results) r!];
    } finally {
      active = false;
    }
  });
}

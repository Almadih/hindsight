import 'dart:async';
import 'dart:io';
import 'dart:math';

import 'package:dartchess/dartchess.dart';
import 'package:multistockfish/multistockfish.dart';

import 'models.dart';

const _pvMax = 20; // the API caps PVs at 40 moves
const _maxMs = 5000; // per-position backstop

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
  int multiPv = 2, // line 2 feeds the "great" badge; line 3 only a 5 cp tie check, ~1.4-2.5x slower (analysis-speed.md)
  void Function(int index, PositionEval ev)? onPosition,
  bool Function()? cancelled,
  Future<void>? cancel,
}) async {
  if (cancelled?.call() ?? false) throw StateError('analysis cancelled');
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
        if (!bestmove.isCompleted) bestmove.complete();
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
      // Once PV1 is a mate the search has fully seen, more depth only burns time on lines 2-3.
      final mate = info.line.mate;
      if (!stopped && info.multipv == 1 && mate != null && info.depth >= 2 * mate.abs()) {
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
    try {
      // 3 measured faster than 6 on a full game (328s vs 371s, 8-core phone): more threads only add heat.
      sf.stdin = 'setoption name Threads value ${max(1, min(3, Platform.numberOfProcessors - 1))}';
      sf.stdin = 'setoption name Hash value 64';
      sf.stdin = 'setoption name MultiPV value $multiPv';
      sf.stdin = 'isready';
      await readyok.future.timeout(const Duration(seconds: 10));
      final results = <PositionEval>[];
      for (var i = 0; i < fens.length; i++) {
        if (isCancelled || (cancelled?.call() ?? false)) throw StateError('analysis cancelled');
        // Game-over positions report no PV and the API scores them itself; skip the engine — on the phone the
        // bestmove for a final checkmate after an early-stopped mate search sometimes never arrives (15 s hang).
        final pos = Chess.fromSetup(Setup.parseFen(fens[i]));
        if (pos.isCheckmate || pos.isStalemate) {
          final ev = PositionEval(fens[i], const []);
          results.add(ev);
          onPosition?.call(i, ev);
          continue;
        }
        byPv.clear();
        stopped = false;
        bestmove = Completer<void>();
        sf.stdin = 'position fen ${fens[i]}';
        sf.stdin = 'go depth $depth movetime $_maxMs';
        await bestmove.future.timeout(const Duration(milliseconds: _maxMs * 3));
        // Game-over positions report no PV, so they come back with no lines; the API scores those itself.
        final ev = PositionEval(fens[i], [for (final k in byPv.keys.toList()..sort()) byPv[k]!]);
        results.add(ev);
        onPosition?.call(i, ev);
      }
      return results;
    } finally {
      active = false;
      await sub.cancel();
    }
  } finally {
    active = false;
    await sf.dispose();
  }
}

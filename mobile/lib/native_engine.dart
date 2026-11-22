import 'dart:async';
import 'dart:ffi';
import 'dart:io';
import 'dart:isolate';
import 'dart:math';

import 'package:ffi/ffi.dart';

import 'models.dart';

const _sfMaxLines = 3;
const _sfPvBuf = 256;
const _workerHashMb = 16;

final class _SfLine extends Struct {
  @Int32()
  external int valid;

  @Int32()
  external int isMate;

  @Int32()
  external int score;

  @Array(_sfPvBuf)
  external Array<Uint8> pv;
}

final class _SfResult extends Struct {
  @Int32()
  external int count;

  @Array(_sfMaxLines)
  external Array<_SfLine> lines;
}

typedef _SfHasDotprodNative = Int32 Function();
typedef _SfHasDotprodDart = int Function();

typedef _SfCreateNative = Pointer<Void> Function(Int32 hashMb);
typedef _SfCreateDart = Pointer<Void> Function(int hashMb);

typedef _SfVoidPtrNative = Void Function(Pointer<Void> handle);
typedef _SfVoidPtrDart = void Function(Pointer<Void> handle);

typedef _SfSearchNative = Int32 Function(
  Pointer<Void> handle,
  Pointer<Utf8> fen,
  Int32 depth,
  Int64 nodes,
  Int32 movetimeMs,
  Int32 multiPv,
  Pointer<Utf8> searchmoves,
  Pointer<_SfResult> out,
);
typedef _SfSearchDart = int Function(
  Pointer<Void> handle,
  Pointer<Utf8> fen,
  int depth,
  int nodes,
  int movetimeMs,
  int multiPv,
  Pointer<Utf8> searchmoves,
  Pointer<_SfResult> out,
);

/// Abstract pool interface so [analyzePositions] scheduling can be unit-tested without native `.so`s.
abstract interface class EnginePool {
  int get workerCount;

  /// Ensures only one game analysis uses the warm pool at a time.
  Future<T> runExclusive<T>(Future<T> Function() body);

  Future<void> clearAll();

  Future<List<EngineLine>> search(
    int workerId,
    String fen, {
    required int depth,
    int? nodes,
    required int movetimeMs,
    required int multiPv,
    List<String>? searchmoves,
  });

  /// Lock-free instant stop across all workers (safe to call while searches are running).
  void stopAll();
}

DynamicLibrary _openEngineLib() {
  final nnue = DynamicLibrary.open('libhindsight_nnue.so');
  final hasDotprod = nnue.lookupFunction<_SfHasDotprodNative, _SfHasDotprodDart>('sf_has_dotprod')() != 0;
  return DynamicLibrary.open(hasDotprod ? 'libhindsight_sf_dotprod.so' : 'libhindsight_sf.so');
}

String _readCString(Array<Uint8> arr, int maxLen) {
  final bytes = <int>[];
  for (var i = 0; i < maxLen; i++) {
    final b = arr[i];
    if (b == 0) break;
    bytes.add(b);
  }
  return String.fromCharCodes(bytes);
}

void _workerEntry((SendPort, int) init) {
  final (mainPort, hashMb) = init;
  final lib = _openEngineLib();
  final sfCreate = lib.lookupFunction<_SfCreateNative, _SfCreateDart>('sf_create');
  final sfClear = lib.lookupFunction<_SfVoidPtrNative, _SfVoidPtrDart>('sf_clear');
  final sfDestroy = lib.lookupFunction<_SfVoidPtrNative, _SfVoidPtrDart>('sf_destroy');
  final sfSearch = lib.lookupFunction<_SfSearchNative, _SfSearchDart>('sf_search');

  final handle = sfCreate(hashMb);
  final outPtr = calloc<_SfResult>();
  final cmdPort = ReceivePort();
  mainPort.send((cmdPort.sendPort, handle.address));

  cmdPort.listen((msg) {
    if (msg is (String, SendPort)) {
      final (op, reply) = msg;
      if (op == 'clear') {
        sfClear(handle);
        reply.send(null);
      } else if (op == 'destroy') {
        sfDestroy(handle);
        calloc.free(outPtr);
        cmdPort.close();
        reply.send(null);
      }
      return;
    }

    if (msg is (SendPort, String, int, int, int, int, String)) {
      final (reply, fen, depth, nodes, movetimeMs, multiPv, searchmoves) = msg;
      final fenPtr = fen.toNativeUtf8();
      final smPtr = searchmoves.toNativeUtf8();
      try {
        final count = sfSearch(handle, fenPtr, depth, nodes, movetimeMs, multiPv, smPtr, outPtr);
        final lines = <EngineLine>[];
        if (count > 0) {
          final res = outPtr.ref;
          final n = min(count, _sfMaxLines);
          for (var i = 0; i < n; i++) {
            final line = res.lines[i];
            if (line.valid == 0) continue;
            final pvStr = _readCString(line.pv, _sfPvBuf);
            if (pvStr.isEmpty) continue;
            final pv = pvStr.split(' ');
            lines.add(EngineLine(
              uci: pv[0],
              cp: line.isMate != 0 ? null : line.score,
              mate: line.isMate != 0 ? line.score : null,
              pv: pv,
            ));
          }
        }
        reply.send(lines);
      } finally {
        calloc.free(fenPtr);
        calloc.free(smPtr);
      }
    }
  });
}

class _WorkerProxy {
  _WorkerProxy(this.cmdPort, this.handleAddress);
  final SendPort cmdPort;
  final int handleAddress;
}

/// Persistent pool of `StockfishLight` FFI worker isolates (Threads=1, Hash=16 MB each).
class NativeEnginePool implements EnginePool {
  NativeEnginePool._();

  static final NativeEnginePool instance = NativeEnginePool._();

  @override
  final int workerCount = max(1, min(4, Platform.numberOfProcessors ~/ 2));

  List<_WorkerProxy>? _workers;
  Future<List<_WorkerProxy>>? _initFuture;
  _SfVoidPtrDart? _stopFn;
  Future<void>? _activeRun;

  Future<List<_WorkerProxy>> _ensureWorkers() {
    if (_workers != null) return Future.value(_workers!);
    return _initFuture ??= _spawnWorkers();
  }

  Future<List<_WorkerProxy>> _spawnWorkers() async {
    _stopFn ??= _openEngineLib().lookupFunction<_SfVoidPtrNative, _SfVoidPtrDart>('sf_stop');
    final spawned = await Future.wait([
      for (var i = 0; i < workerCount; i++) _spawnOne(),
    ]);
    _workers = spawned;
    return spawned;
  }

  Future<_WorkerProxy> _spawnOne() async {
    final ready = ReceivePort();
    await Isolate.spawn(_workerEntry, (ready.sendPort, _workerHashMb));
    final (SendPort cmdPort, int handleAddr) = await ready.first as (SendPort, int);
    ready.close();
    return _WorkerProxy(cmdPort, handleAddr);
  }

  @override
  Future<T> runExclusive<T>(Future<T> Function() body) async {
    final prev = _activeRun;
    final done = Completer<void>();
    _activeRun = done.future;
    if (prev != null) {
      await prev.catchError((_) {});
    }
    try {
      await _ensureWorkers();
      return await body();
    } finally {
      done.complete();
    }
  }

  @override
  Future<void> clearAll() async {
    final workers = await _ensureWorkers();
    await Future.wait([
      for (final w in workers)
        () async {
          final rp = ReceivePort();
          w.cmdPort.send(('clear', rp.sendPort));
          await rp.first;
          rp.close();
        }(),
    ]);
  }

  @override
  Future<List<EngineLine>> search(
    int workerId,
    String fen, {
    required int depth,
    int? nodes,
    required int movetimeMs,
    required int multiPv,
    List<String>? searchmoves,
  }) async {
    final workers = await _ensureWorkers();
    final rp = ReceivePort();
    workers[workerId].cmdPort.send((
      rp.sendPort,
      fen,
      depth,
      nodes ?? 0,
      movetimeMs,
      multiPv,
      searchmoves == null || searchmoves.isEmpty ? '' : searchmoves.join(' '),
    ));
    final res = await rp.first as List<EngineLine>;
    rp.close();
    return res;
  }

  @override
  void stopAll() {
    final stop = _stopFn;
    final workers = _workers;
    if (stop == null || workers == null) return;
    for (final w in workers) {
      stop(Pointer<Void>.fromAddress(w.handleAddress));
    }
  }
}

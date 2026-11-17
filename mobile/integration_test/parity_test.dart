import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/foundation.dart';
import 'package:hindsight/api.dart';
import 'package:hindsight/engine.dart';
import 'package:hindsight/game.dart';
import 'package:hindsight/models.dart';
import 'package:integration_test/integration_test.dart';

const _hash = 'b8f4cff18fe69bc12c8b9f40f224678747156826d87af843cf3fea572b7ae4a8';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('device analysis matches the cached review', (tester) async {
    await tester.runAsync(() async {
      final cached = (await getReview(_hash))!;
      final game = parsePgn(reportPgn(cached.headers, [for (final m in cached.moves) m.san]));
      final sw = Stopwatch()..start();
      final evals = await analyzePositions(game.fens);
      sw.stop();
      final device = await analyze(game.pgn, evals: evals, fresh: true);

      debugPrint('engine time: ${sw.elapsed.inSeconds}s for ${game.fens.length} positions');
      var same = 0;
      for (var i = 0; i < cached.moves.length && i < device.moves.length; i++) {
        final a = cached.moves[i], b = device.moves[i];
        if (a.badge == b.badge) same++;
        debugPrint('${(i + 1).toString().padLeft(3)} ${a.san.padRight(8)} ${a.badge.name.padRight(11)} ${b.badge.name.padRight(11)} ${a.badge == b.badge ? '' : '<--'}');
      }
      for (final s in Side.values) {
        debugPrint('accuracy ${s.name}: cached ${cached.accuracy[s]} device ${device.accuracy[s]}');
      }
      debugPrint('identical badges: $same / ${cached.moves.length}');

      expect(device.moves.length, cached.moves.length);
      expect(device.hash, cached.hash);
      for (final s in Side.values) {
        expect((device.accuracy[s]! - cached.accuracy[s]!).abs(), lessThanOrEqualTo(3));
      }
      // Baseline (2026-11-17, this game): two runs of the web's own WASM engine agree on 82% of
      // badges and match the cached review on 67-69%, so badge noise near thresholds is inherent.
      expect(same / cached.moves.length, greaterThanOrEqualTo(0.6));
    });
  }, timeout: const Timeout(Duration(minutes: 20)));
}

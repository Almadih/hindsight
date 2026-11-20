import 'package:material_ui/material_ui.dart';
import 'package:hindsight/engine.dart';
import 'package:hindsight/game.dart';

// Times a full-game analysis at depth 14 with MultiPV 2 vs 3 on the device's native engine.
// A plain app, not a flutter test: phones that hide app logs from logcat (e.g. Huawei) never hand the
// flutter tool its VM service URL, so tests hang there. Results are drawn on screen instead.
// Run: flutter build apk --profile -t integration_test/multipv_bench.dart
//      adb install -r build/app/outputs/flutter-apk/app-profile.apk, launch, read the screen at DONE.
// Same 150-position game as web/scripts/bench_multipv.ts (chess.com/game/live/185338359716).
const _pgn = r'''[Event "Live Chess"]
[Site "Chess.com"]
[Date "2026.10.14"]
[Round "-"]
[White "NovicaZ"]
[Black "3omar_3abdallah"]
[Result "1-0"]
[WhiteElo "1532"]
[BlackElo "1537"]
[ECO "C48"]
[UTCTime "21:16:04"]
[UTCDate "2026.10.14"]
[TimeControl "180+2"]
[Termination "NovicaZ won by checkmate"]
[CurrentPosition "7k/5Q2/4KB2/8/8/5P2/8/8 b - - 6 75"]
[Timezone "UTC"]
[ECOUrl "https://www.chess.com/openings/Four-Knights-Game-Spanish-Variation-4...d6"]
[StartTime "21:16:04"]
[EndDate "2026.10.14"]
[EndTime "21:26:23"]
[Link "https://www.chess.com/game/live/185338359716"]

1. e4 {[%clk 0:03:00.9]} e5 {[%clk 0:02:59.3]} 2. Nf3 {[%clk 0:03:01.4]} Nc6 {[%clk 0:03:00.3]} 3. Nc3 {[%clk 0:03:00.6]} Nf6 {[%clk 0:02:57.2]} 4. Bb5 {[%clk 0:03:00.5]} d6 {[%clk 0:02:57.1]} 5. Nd5 {[%clk 0:02:55.4]} Nxe4 {[%clk 0:02:56]} 6. d3 {[%clk 0:02:52.4]} Nf6 {[%clk 0:02:50.5]} 7. Bg5 {[%clk 0:02:50.7]} Be7 {[%clk 0:02:47.6]} 8. Nxe7 {[%clk 0:02:50.7]} Qxe7 {[%clk 0:02:44.3]} 9. Bxc6+ {[%clk 0:02:50]} bxc6 {[%clk 0:02:46.2]} 10. Qd2 {[%clk 0:02:45.8]} h6 {[%clk 0:02:42.6]} 11. Bh4 {[%clk 0:02:45.6]} O-O {[%clk 0:02:36.8]} 12. O-O-O {[%clk 0:02:45.4]} Rb8 {[%clk 0:02:36.3]} 13. h3 {[%clk 0:02:36.3]} Be6 {[%clk 0:02:35.5]} 14. g4 {[%clk 0:02:23.6]} Bxa2 {[%clk 0:02:31.7]} 15. b3 {[%clk 0:02:24.1]} g5 {[%clk 0:02:22.2]} 16. Nxg5 {[%clk 0:02:13.9]} hxg5 {[%clk 0:02:21.2]} 17. Qxg5+ {[%clk 0:02:14.9]} Kh8 {[%clk 0:02:18.9]} 18. Qxf6+ {[%clk 0:02:13.9]} Qxf6 {[%clk 0:02:18.6]} 19. Bxf6+ {[%clk 0:02:15]} Kh7 {[%clk 0:02:19.6]} 20. Kb2 {[%clk 0:02:14.5]} Bxb3 {[%clk 0:02:12.7]} 21. cxb3 {[%clk 0:02:14.5]} a5 {[%clk 0:02:13]} 22. Ra1 {[%clk 0:02:11.7]} Rb5 {[%clk 0:02:09.9]} 23. Bg5 {[%clk 0:02:01.4]} Rfb8 {[%clk 0:02:08.7]} 24. Ra3 {[%clk 0:02:00.6]} a4 {[%clk 0:02:09.3]} 25. Be3 {[%clk 0:01:46.7]} axb3 {[%clk 0:02:06.7]} 26. Rb1 {[%clk 0:01:46.2]} d5 {[%clk 0:02:03.4]} 27. d4 {[%clk 0:01:39.2]} e4 {[%clk 0:01:51.8]} 28. Kc3 {[%clk 0:01:39.1]} b2 {[%clk 0:01:45.7]} 29. Ra2 {[%clk 0:01:34.9]} Rb3+ {[%clk 0:01:43.8]} 30. Kc2 {[%clk 0:01:35.4]} Rd3 {[%clk 0:01:20]} 31. Raxb2 {[%clk 0:01:33.6]} Ra8 {[%clk 0:00:54.6]} 32. Rb7 {[%clk 0:01:19.3]} Ra2+ {[%clk 0:00:51.5]} 33. R1b2 {[%clk 0:01:18]} Ra4 {[%clk 0:00:51.2]} 34. Rxc7 {[%clk 0:01:13.2]} Rc4+ {[%clk 0:00:51.3]} 35. Kb1 {[%clk 0:01:13.1]} Rd1+ {[%clk 0:00:51]} 36. Ka2 {[%clk 0:01:11.8]} Rh1 {[%clk 0:00:51.1]} 37. g5 {[%clk 0:01:04.4]} Kg6 {[%clk 0:00:46.7]} 38. Kb3 {[%clk 0:01:01.8]} Rxh3 {[%clk 0:00:44.9]} 39. Ka2 {[%clk 0:00:55.7]} Rh1 {[%clk 0:00:18.7]} 40. Rcb7 {[%clk 0:00:49.3]} Rh8 {[%clk 0:00:17]} 41. R7b4 {[%clk 0:00:45.4]} Rc3 {[%clk 0:00:16.6]} 42. R2b3 {[%clk 0:00:43.4]} Ra8+ {[%clk 0:00:16]} 43. Kb2 {[%clk 0:00:43.4]} Rxb3+ {[%clk 0:00:04]} 44. Kxb3 {[%clk 0:00:43.1]} Ra1 {[%clk 0:00:04.4]} 45. Kb2 {[%clk 0:00:42.5]} Ra6 {[%clk 0:00:04]} 46. Rb3 {[%clk 0:00:40.1]} Ra7 {[%clk 0:00:03]} 47. Rb6 {[%clk 0:00:40.2]} Rc7 {[%clk 0:00:03.1]} 48. Kb3 {[%clk 0:00:39.9]} f6 {[%clk 0:00:02.4]} 49. gxf6 {[%clk 0:00:38.8]} Kxf6 {[%clk 0:00:04.3]} 50. Kb4 {[%clk 0:00:39.9]} Ke6 {[%clk 0:00:04.7]} 51. Kc5 {[%clk 0:00:41.2]} Rc8 {[%clk 0:00:04.9]} 52. Rxc6+ {[%clk 0:00:40.9]} Rxc6+ {[%clk 0:00:04.9]} 53. Kxc6 {[%clk 0:00:42.3]} Ke7 {[%clk 0:00:03.9]} 54. Kc7 {[%clk 0:00:34.6]} Ke6 {[%clk 0:00:04.6]} 55. Kd8 {[%clk 0:00:34.8]} Kd6 {[%clk 0:00:05.1]} 56. Ke8 {[%clk 0:00:34.5]} Ke6 {[%clk 0:00:06.1]} 57. Kd8 {[%clk 0:00:35.5]} Kd6 {[%clk 0:00:07.1]} 58. Bf4+ {[%clk 0:00:36.3]} Ke6 {[%clk 0:00:08]} 59. Kc7 {[%clk 0:00:36.2]} Kf5 {[%clk 0:00:07]} 60. Be3 {[%clk 0:00:31.2]} Ke6 {[%clk 0:00:06.9]} 61. Kc6 {[%clk 0:00:32]} Ke7 {[%clk 0:00:04.2]} 62. Kxd5 {[%clk 0:00:32.7]} Kd7 {[%clk 0:00:05.1]} 63. Kxe4 {[%clk 0:00:33.2]} Ke6 {[%clk 0:00:06.1]} 64. d5+ {[%clk 0:00:33.8]} Kd6 {[%clk 0:00:07.1]} 65. Bf4+ {[%clk 0:00:34.5]} Kd7 {[%clk 0:00:08.3]} 66. d6 {[%clk 0:00:35.2]} Kd8 {[%clk 0:00:08.8]} 67. Ke5 {[%clk 0:00:35.9]} Ke8 {[%clk 0:00:09.7]} 68. f3 {[%clk 0:00:36.5]} Kf8 {[%clk 0:00:10.3]} 69. Ke6 {[%clk 0:00:37.4]} Ke8 {[%clk 0:00:11.3]} 70. Bg5 {[%clk 0:00:38.1]} Kf8 {[%clk 0:00:11.6]} 71. d7 {[%clk 0:00:39.1]} Kg7 {[%clk 0:00:12.2]} 72. d8=Q {[%clk 0:00:38.7]} Kh7 {[%clk 0:00:13.4]} 73. Qe7+ {[%clk 0:00:39.4]} Kg8 {[%clk 0:00:13.7]} 74. Qf7+ {[%clk 0:00:39.7]} Kh8 {[%clk 0:00:14.5]} 75. Bf6# {[%clk 0:00:41]} 1-0''';

void main() => runApp(const MaterialApp(home: _Bench()));

class _Bench extends StatefulWidget {
  const _Bench();
  @override
  State<_Bench> createState() => _BenchState();
}

class _BenchState extends State<_Bench> {
  final _lines = <String>['running...'];

  @override
  void initState() {
    super.initState();
    _run();
  }

  void _log(String s) => setState(() => _lines.add(s));

  Future<void> _run() async {
    final fens = parsePgn(_pgn).fens;
    var at = -1;
    // Probe the last positions alone first (the game ends in checkmate) so a hang there shows in seconds.
    for (var i = fens.length - 3; i < fens.length; i++) {
      try {
        final ev = await analyzePositions([fens[i]], depth: 14, multiPv: 2);
        _log('probe ${i + 1}: ok, ${ev.first.lines.length} lines');
      } catch (e) {
        _log('probe ${i + 1}: $e');
      }
      await Future<void>.delayed(const Duration(seconds: 6));
    }
    try {
      for (var round = 1; round <= 2; round++) {
        // Alternate order each round so warm-up/thermal effects don't favour one setting.
        for (final pv in round.isOdd ? [2, 3] : [3, 2]) {
          final times = <int>[];
          at = -1;
          var last = Stopwatch()..start();
          final sw = Stopwatch()..start();
          await analyzePositions(fens, depth: 14, multiPv: pv, onPosition: (i, _) {
            at = i;
            times.add(last.elapsedMilliseconds);
            last = Stopwatch()..start();
            if (i % 10 == 0) setState(() => _lines[0] = 'running multipv=$pv round=$round position $i/${fens.length}');
          });
          sw.stop();
          times.sort();
          _log('multipv=$pv round=$round total=${(sw.elapsedMilliseconds / 1000).toStringAsFixed(1)}s '
              'median=${times[times.length ~/ 2]}ms max=${times.last}ms');
          // Let the previous engine finish quitting before the next one claims the slot.
          await Future<void>.delayed(const Duration(seconds: 6));
        }
      }
      setState(() => _lines[0] = 'DONE (${parsePgn(_pgn).fens.length} positions, depth 14)');
    } catch (e) {
      _log('ERROR at position ${at + 1}: $e\n${at + 1 < fens.length ? fens[at + 1] : ''}');
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Text(_lines.join('\n\n'), style: const TextStyle(fontSize: 18, fontFamily: 'monospace')),
          ),
        ),
      );
}

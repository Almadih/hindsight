import 'package:material_ui/material_ui.dart';

import '../prefs.dart';
import 'home.dart';

/// Port of web/app/how-it-works/page.tsx.
class HowItWorksScreen extends StatelessWidget {
  const HowItWorksScreen({super.key});

  Widget _h(String t) => Padding(
        padding: const EdgeInsets.only(top: 32, bottom: 8),
        child: Text(t, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800)),
      );

  Widget _p(String t) => Padding(
        padding: const EdgeInsets.only(top: 8),
        child: Text(t, style: const TextStyle(fontSize: 16, color: Colors.white70)),
      );

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('How it works')),
        body: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('How Hindsight Chess reviews a game', style: TextStyle(fontSize: 32, fontWeight: FontWeight.w800, height: 1)),
              const SizedBox(height: 12),
              const Text('Updated November 2026.', style: TextStyle(fontSize: 13, color: Colors.white60)),
              _h('Engine'),
              _p('Stockfish 19 runs on your device, so nothing is queued and there is no cap. Quick, standard and deep reviews search to depth '
                  '${qualityDepth['quick']}, ${qualityDepth['standard']} and ${qualityDepth['deep']}.'),
              _h('Winning chances'),
              _p('The engine scores each position in centipawns (cp). Hindsight turns that into a chance of winning:'),
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text('win% = 50 + 50 · (2 / (1 + e^(−0.00368208 · cp)) − 1)', style: TextStyle(fontFamily: 'monospace')),
              ),
              _p('A move is judged by how much of your winning chances it kept.'),
              _h('Verdicts'),
              _p('Ten verdicts, by winning chances lost.'),
              const SizedBox(height: 12),
              const VerdictLadder(),
              _h('Accuracy'),
              _p('Each move’s accuracy falls as it loses winning chances. Game accuracy is 90% the plain mean of those and 10% the harmonic mean, so one blunder still counts.'),
              _p('The curve is fitted against Chess.com’s own accuracies on 30 rated games across five rating bands. The mean error is 3.7 points.'),
              _h('Limits'),
              _p('Phone engines search shallower than a desktop Stockfish. There is no volatility weighting. The coach comments are written by AI, so read them as a second opinion, not a verdict.'),
            ]),
          ),
        ),
      );
}

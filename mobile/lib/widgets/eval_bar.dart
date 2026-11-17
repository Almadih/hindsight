import 'package:material_ui/material_ui.dart';

import '../models.dart';
import '../review_logic.dart';

/// Board layouts subtract this from the width, so keep them in step through this constant.
const kEvalBarWidth = 24.0;

/// Vertical win-probability bar with the eval printed at the leading side's end (port of web/components/EvalBar.tsx).
class EvalBar extends StatelessWidget {
  const EvalBar({super.key, required this.ev, required this.height, this.flipped = false});
  final WhiteEval ev;
  final double height;
  final bool flipped;

  @override
  Widget build(BuildContext context) {
    final white = whiteWinPct(ev);
    final whiteAhead = white >= 50;
    final labelAtBottom = whiteAhead != flipped;
    return Container(
      width: kEvalBarWidth,
      height: height,
      color: const Color(0xFF403D39),
      child: Stack(children: [
        Align(
          alignment: flipped ? Alignment.topCenter : Alignment.bottomCenter,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 250),
            height: height * white / 100,
            color: const Color(0xFFF1F1F1),
          ),
        ),
        Align(
          alignment: labelAtBottom ? Alignment.bottomCenter : Alignment.topCenter,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: FittedBox(
              child: Text(
                formatEval(ev).replaceFirst('+', ''),
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  color: whiteAhead ? const Color(0xFF2B2926) : const Color(0xFFF1EFEA),
                ),
              ),
            ),
          ),
        ),
      ]),
    );
  }
}

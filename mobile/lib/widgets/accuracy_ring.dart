import 'dart:math' as math;

import 'package:material_ui/material_ui.dart';

import '../theme.dart';

/// Accuracy as a ring with the value in the middle (port of AccuracyRing in SummaryCard.tsx).
class AccuracyRing extends StatelessWidget {
  const AccuracyRing({super.key, required this.value, required this.light, this.size = 64});
  final double? value;
  final bool light;
  final double size;

  @override
  Widget build(BuildContext context) => Semantics(
        label: 'Accuracy',
        value: value == null ? 'not available' : '${value!.toStringAsFixed(1)} percent',
        child: ExcludeSemantics(
          child: SizedBox.square(
            dimension: size,
            child: CustomPaint(
              painter: _RingPainter((value ?? 0) / 100, light ? kLight : kMuted),
              child: Center(
                child: Text(
                  value?.toStringAsFixed(1) ?? '-',
                  style: TextStyle(fontSize: size * 0.26, fontWeight: FontWeight.w800, fontFeatures: const [FontFeature.tabularFigures()]),
                ),
              ),
            ),
          ),
        ),
      );
}

class _RingPainter extends CustomPainter {
  _RingPainter(this.frac, this.color);
  final double frac;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    const stroke = 5.0;
    // Always a circle: square on the shorter side, even if the parent hands us a non-square box.
    final r = Rect.fromCircle(center: size.center(Offset.zero), radius: size.shortestSide / 2 - stroke / 2);
    final p = Paint()..style = PaintingStyle.stroke..strokeWidth = stroke..strokeCap = StrokeCap.round;
    canvas.drawArc(r, 0, 2 * math.pi, false, p..color = kRaisedDark);
    canvas.drawArc(r, -math.pi / 2, 2 * math.pi * frac, false, p..color = color);
  }

  @override
  bool shouldRepaint(_RingPainter o) => o.frac != frac || o.color != color;
}

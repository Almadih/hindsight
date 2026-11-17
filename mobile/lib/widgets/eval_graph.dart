import 'package:material_ui/material_ui.dart' hide Badge;

import '../models.dart';
import '../review_logic.dart';

/// [pcts]: white win% for plies 0..n; [badges]: badge of ply 1..n.
class EvalGraph extends StatelessWidget {
  const EvalGraph({super.key, required this.pcts, required this.badges, this.onTap, this.height = 84});
  final List<double> pcts;
  final List<Badge> badges;
  final ValueChanged<int>? onTap;
  final double height;

  @override
  Widget build(BuildContext context) => ClipRRect(
        borderRadius: BorderRadius.circular(10),
        child: LayoutBuilder(
          builder: (_, c) => GestureDetector(
            onTapDown: (d) => onTap?.call((d.localPosition.dx / c.maxWidth * (pcts.length - 1)).round().clamp(0, pcts.length - 1)),
            child: CustomPaint(size: Size(c.maxWidth, height), painter: _Painter(pcts, badges)),
          ),
        ),
      );
}

class _Painter extends CustomPainter {
  _Painter(this.pcts, this.badges);
  final List<double> pcts;
  final List<Badge> badges;

  @override
  void paint(Canvas canvas, Size s) {
    canvas.drawRect(Offset.zero & s, Paint()..color = const Color(0xFF454340));
    final n = pcts.length - 1;
    Offset pt(int i) => Offset(n == 0 ? 0 : i / n * s.width, s.height * (1 - pcts[i] / 100));
    final area = Path()..moveTo(0, s.height);
    for (var i = 0; i <= n; i++) {
      final p = pt(i);
      area.lineTo(p.dx, p.dy);
    }
    area..lineTo(s.width, s.height)..close();
    canvas.drawPath(area, Paint()..color = const Color(0xFFF1F1F1));
    canvas.drawLine(Offset(0, s.height / 2), Offset(s.width, s.height / 2), Paint()..color = const Color(0xFF9A9894)..strokeWidth = 1);
    for (var i = 1; i <= n; i++) {
      final b = badges[i - 1];
      if (graphBadges.contains(b)) canvas.drawCircle(pt(i), 5, Paint()..color = badgeMeta[b]!.color);
    }
  }

  @override
  bool shouldRepaint(_Painter o) => o.pcts != pcts || o.badges != badges;
}

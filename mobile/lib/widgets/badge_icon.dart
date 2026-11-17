import 'dart:math' as math;

import 'package:flutter/widgets.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../models.dart';
import '../review_logic.dart';

// Port of web/components/BadgeIcon.tsx: flat disc, bold white glyph, 20x20 viewBox.
const _notation = <Badge, List<(bool, double, double)>>{ // (isBang, dx, scale)
  Badge.brilliant: [(true, -2.4, .95), (true, 2.4, .95)],
  Badge.great: [(true, 0, 1.05)],
  Badge.inaccuracy: [(false, -2.3, .85), (true, 3.3, .85)],
  Badge.mistake: [(false, 0, 1.05)],
  Badge.blunder: [(false, -3, .8), (false, 3, .8)],
};

const _stroke = 'fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"';

String _hex(Badge b) => '#${(badgeMeta[b]!.color.toARGB32() & 0xFFFFFF).toRadixString(16).padLeft(6, '0')}';

String _mark((bool, double, double) m) {
  final (bang, dx, s) = m;
  final shape = bang
      ? '<rect x="8.75" y="4" width="2.5" height="8" rx="1.25" fill="#fff"/>'
      : '<path d="M7.2 7.5a2.85 2.85 0 1 1 4.35 2.4c-1 .62-1.55 1.2-1.55 2.3v.5" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
  return '<g transform="translate($dx 0) translate(10 10) scale($s) translate(-10 -10)">$shape<circle cx="10" cy="${bang ? 15 : 15.3}" r="1.55" fill="#fff"/></g>';
}

String _glyph(Badge b) {
  final marks = _notation[b];
  if (marks != null) return marks.map(_mark).join();
  switch (b) {
    case Badge.best:
      final pts = [
        for (var i = 0; i < 10; i++)
          '${(10 + (i.isOdd ? 2.9 : 6.4) * math.cos(math.pi / 5 * i - math.pi / 2)).toStringAsFixed(2)},'
              '${(10.5 + (i.isOdd ? 2.9 : 6.4) * math.sin(math.pi / 5 * i - math.pi / 2)).toStringAsFixed(2)}'
      ].join(' ');
      return '<polygon points="$pts" fill="#fff"/>';
    case Badge.excellent:
      return '<path d="M5 9.4h2.3v6.3H5zM8.4 9.4l2.3-4.6c1.1 0 1.8.8 1.6 1.9L12 9.4h2.9c.9 0 1.5.9 1.3 1.7l-1 3.7c-.2.6-.8 1-1.4 1H8.4z" fill="#fff"/>';
    case Badge.good:
      return '<polyline points="5.8,10.4 8.8,13.4 14.3,7.2" $_stroke/>';
    case Badge.book:
      return '<path d="M4.6 6.2c1.9-.7 3.7-.5 5.4.7 1.7-1.2 3.5-1.4 5.4-.7v8c-1.9-.6-3.7-.4-5.4.7-1.7-1.1-3.5-1.3-5.4-.7zM10 7.4v6.9" fill="#fff" stroke="${_hex(Badge.book)}" stroke-width="0.9"/>';
    case Badge.miss:
      return '<path d="M6.8 6.8l6.4 6.4M13.2 6.8l-6.4 6.4" $_stroke/>';
    default:
      return '';
  }
}

class BadgeIcon extends StatelessWidget {
  const BadgeIcon(this.badge, {super.key, this.size = 24});
  final Badge badge;
  final double size;

  @override
  Widget build(BuildContext context) => SvgPicture.string(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><circle cx="10" cy="10" r="10" fill="${_hex(badge)}"/>${_glyph(badge)}</svg>',
        width: size,
        height: size,
        semanticsLabel: badgeMeta[badge]!.label,
      );
}

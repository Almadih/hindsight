import 'package:material_ui/material_ui.dart' hide Badge;
import 'package:flutter_svg/flutter_svg.dart';

import '../models.dart';
import '../review_logic.dart';
import '../theme.dart';
import 'badge_icon.dart';

const _names = {'P': 'pawn', 'N': 'knight', 'B': 'bishop', 'R': 'rook', 'Q': 'queen', 'K': 'king'};

int _sq(String name) => (name.codeUnitAt(1) - 49) * 8 + name.codeUnitAt(0) - 97;

/// square index (a1 = 0) -> 'wK' style piece code
Map<int, String> _parse(String fen) {
  final m = <int, String>{};
  var r = 7;
  for (final row in fen.split(' ')[0].split('/')) {
    var f = 0;
    for (final ch in row.split('')) {
      final n = int.tryParse(ch);
      if (n != null) {
        f += n;
      } else {
        m[r * 8 + f++] = (ch == ch.toUpperCase() ? 'w' : 'b') + ch.toUpperCase();
      }
    }
    r--;
  }
  return m;
}

/// 8x8 board. Squares are algebraic names ('e4'); [lastMove] and [arrows] are UCI.
class ChessBoard extends StatefulWidget {
  const ChessBoard({
    super.key,
    required this.fen,
    required this.size,
    this.lastMove,
    this.badge,
    this.arrows = const [],
    this.flipped = false,
    this.selected,
    this.onTap,
    this.onMove,
  });
  final String fen;
  final double size;
  final String? lastMove, selected;
  final Badge? badge;
  final List<String> arrows;
  final bool flipped;
  final ValueChanged<String>? onTap;
  /// Called with (from, to) when a piece is dragged and dropped.
  final void Function(String from, String to)? onMove;

  @override
  State<ChessBoard> createState() => _ChessBoardState();
}

class _ChessBoardState extends State<ChessBoard> {
  late Map<int, String> _pieces = _parse(widget.fen);
  late Map<int, int> _ids = {for (final s in _pieces.keys) s: s};
  int _next = 64;
  int? _dragFrom;
  Offset? _dragAt;

  @override
  void didUpdateWidget(ChessBoard old) {
    super.didUpdateWidget(old);
    if (old.fen == widget.fen) return;
    final nw = _parse(widget.fen);
    final lm = widget.lastMove;
    final from = lm == null ? -1 : _sq(lm.substring(0, 2)), to = lm == null ? -1 : _sq(lm.substring(2, 4));
    final ids = <int, int>{};
    nw.forEach((sq, p) {
      if (sq == to && _ids.containsKey(from) && !nw.containsKey(from)) {
        ids[sq] = _ids[from]!; // the moved piece keeps its identity so it slides
      } else if (_pieces[sq] == p) {
        ids[sq] = _ids[sq]!;
      } else {
        ids[sq] = _next++;
      }
    });
    _pieces = nw;
    _ids = ids;
  }

  Offset _pos(int sq, double s) {
    final f = sq % 8, r = sq ~/ 8;
    return Offset((widget.flipped ? 7 - f : f) * s, (widget.flipped ? r : 7 - r) * s);
  }

  Widget _semSquare(int sq, double s, String? lm) {
    final name = String.fromCharCodes([97 + sq % 8, 49 + sq ~/ 8]);
    final p = _pieces[sq];
    final hints = [
      if (widget.selected == name) 'selected',
      if (lm != null && (name == lm.substring(0, 2) || name == lm.substring(2, 4))) 'last move',
    ];
    final o = _pos(sq, s);
    return Positioned(
      left: o.dx,
      top: o.dy,
      width: s,
      height: s,
      child: Semantics(
        container: true, // one TalkBack stop per square, not one merged label
        label: '$name, ${p == null ? 'empty' : '${p[0] == 'w' ? 'white' : 'black'} ${_names[p[1]]}'}',
        hint: hints.isEmpty ? null : hints.join(', '),
        button: widget.onTap != null,
        onTap: widget.onTap == null ? null : () => widget.onTap!(name),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.size / 8;
    final lm = widget.lastMove;
    final to = lm == null ? null : _sq(lm.substring(2, 4));
    final badgeSize = s * 0.5;
    Widget? badge;
    if (widget.badge != null && to != null) {
      final p = _pos(to, s);
      badge = Positioned(
        left: (p.dx + s - badgeSize * 0.65).clamp(0, widget.size - badgeSize),
        top: (p.dy - badgeSize * 0.35).clamp(0, widget.size),
        child: BadgeIcon(widget.badge!, size: badgeSize),
      );
    }
    String nameAt(Offset o) {
      final x = (o.dx / s).floor().clamp(0, 7), y = (o.dy / s).floor().clamp(0, 7);
      return String.fromCharCodes([97 + (widget.flipped ? 7 - x : x), 49 + (widget.flipped ? y : 7 - y)]);
    }

    final noAnim = MediaQuery.disableAnimationsOf(context);
    final dragging = _dragFrom;
    final fxColor = widget.badge != null && const {Badge.brilliant, Badge.great, Badge.blunder, Badge.miss}.contains(widget.badge)
        ? badgeMeta[widget.badge]!.color
        : null;
    return GestureDetector(
      onTapUp: widget.onTap == null ? null : (d) => widget.onTap!(nameAt(d.localPosition)),
      onPanStart: widget.onMove == null
          ? null
          : (d) {
              final sq = _sq(nameAt(d.localPosition));
              if (_pieces.containsKey(sq)) {
                setState(() {
                  _dragFrom = sq;
                  _dragAt = d.localPosition;
                });
              }
            },
      onPanUpdate: widget.onMove == null || dragging == null ? null : (d) => setState(() => _dragAt = d.localPosition),
      onPanEnd: widget.onMove == null || dragging == null
          ? null
          : (d) {
              final from = String.fromCharCodes([97 + dragging % 8, 49 + dragging ~/ 8]);
              final to = nameAt(_dragAt!);
              setState(() => _dragFrom = _dragAt = null);
              if (from != to) widget.onMove!(from, to);
            },
      onPanCancel: () => setState(() => _dragFrom = _dragAt = null),
      child: SizedBox(
        width: widget.size,
        height: widget.size,
        child: Semantics(
          container: true,
          explicitChildNodes: true,
          label: widget.arrows.isEmpty ? null : widget.arrows.map((a) => 'Best move arrow from ${a.substring(0, 2)} to ${a.substring(2, 4)}').join('. '),
          child: Stack(clipBehavior: Clip.none, children: [
          ExcludeSemantics(child: Stack(clipBehavior: Clip.none, children: [
          CustomPaint(
            size: Size.square(widget.size),
            painter: _SquaresPainter(widget.flipped, lm, widget.selected),
          ),
          for (final e in _ids.entries)
            AnimatedPositioned(
              key: ValueKey(e.value),
              duration: noAnim ? Duration.zero : const Duration(milliseconds: 150),
              left: _pos(e.key, s).dx,
              top: _pos(e.key, s).dy,
              width: s,
              height: s,
              child: Opacity(opacity: e.key == dragging ? 0.3 : 1, child: SvgPicture.asset('assets/pieces/${_pieces[e.key]}.svg')),
            ),
          if (fxColor != null && to != null && !noAnim)
            Positioned(
              left: _pos(to, s).dx,
              top: _pos(to, s).dy,
              width: s,
              height: s,
              child: IgnorePointer(
                // Keyed per move so the pulse replays on every step.
                child: TweenAnimationBuilder<double>(
                  key: ValueKey('${widget.fen}$lm'),
                  tween: Tween(begin: 0, end: 1),
                  duration: const Duration(milliseconds: 700),
                  builder: (_, t, _) => Transform.scale(
                    scale: 1 + 0.6 * t,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(color: fxColor.withValues(alpha: 0.8 * (1 - t)), width: s * 0.08),
                        color: fxColor.withValues(alpha: 0.35 * (1 - t)),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          IgnorePointer(child: CustomPaint(size: Size.square(widget.size), painter: _ArrowPainter(widget.arrows, widget.flipped))),
          if (dragging != null && _dragAt != null)
            Positioned(
              left: _dragAt!.dx - s,
              top: _dragAt!.dy - s * 1.4, // lifted above the finger
              width: s * 2,
              height: s * 2,
              child: IgnorePointer(child: SvgPicture.asset('assets/pieces/${_pieces[dragging]}.svg')),
            ),
          ?badge,
          ])),
          for (var sq = 0; sq < 64; sq++) _semSquare(sq, s, lm),
        ]),
        ),
      ),
    );
  }
}

class _SquaresPainter extends CustomPainter {
  _SquaresPainter(this.flipped, this.lastMove, this.selected);
  final bool flipped;
  final String? lastMove, selected;

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 8;
    final hl = {
      if (lastMove != null) ...[_sq(lastMove!.substring(0, 2)), _sq(lastMove!.substring(2, 4))],
    };
    final sel = selected == null ? -1 : _sq(selected!);
    for (var y = 0; y < 8; y++) {
      for (var x = 0; x < 8; x++) {
        final f = flipped ? 7 - x : x, r = flipped ? y : 7 - y;
        final lightSq = (f + r) % 2 == 1;
        final sq = r * 8 + f;
        canvas.drawRect(
          Rect.fromLTWH(x * s, y * s, s, s),
          Paint()..color = sq == sel ? kSelect : hl.contains(sq) ? kLastMove : lightSq ? kBoardLight : kBoardDark,
        );
        final ink = lightSq ? kBoardDark : kBoardLight;
        if (x == 0) _text(canvas, '${r + 1}', Offset(x * s + 3, y * s + 2), s * 0.22, ink);
        if (y == 7) {
          final tp = _text(canvas, String.fromCharCode(97 + f), Offset.zero, s * 0.22, ink, paint: false);
          tp.paint(canvas, Offset((x + 1) * s - tp.width - 3, (y + 1) * s - tp.height - 1));
        }
      }
    }
  }

  TextPainter _text(Canvas c, String t, Offset o, double fs, Color col, {bool paint = true}) {
    final tp = TextPainter(
      text: TextSpan(text: t, style: TextStyle(color: col, fontSize: fs, fontWeight: FontWeight.w700)),
      textDirection: TextDirection.ltr,
    )..layout();
    if (paint) tp.paint(c, o);
    return tp;
  }

  @override
  bool shouldRepaint(_SquaresPainter o) => o.flipped != flipped || o.lastMove != lastMove || o.selected != selected;
}

class _ArrowPainter extends CustomPainter {
  _ArrowPainter(this.arrows, this.flipped);
  final List<String> arrows;
  final bool flipped;

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 8;
    Offset c(String name) {
      final q = _sq(name), f = q % 8, r = q ~/ 8;
      return Offset(((flipped ? 7 - f : f) + .5) * s, ((flipped ? r : 7 - r) + .5) * s);
    }

    for (final uci in arrows) {
      final a = c(uci.substring(0, 2)), b = c(uci.substring(2, 4));
      final dir = (b - a) / (b - a).distance;
      final head = s * 0.4, tip = b - dir * s * 0.1, base = tip - dir * head;
      final perp = Offset(-dir.dy, dir.dx) * s * 0.22;
      final col = badgeMeta[Badge.best]!.color.withValues(alpha: 0.9);
      canvas.drawLine(a, base, Paint()..color = col..strokeWidth = s * 0.16..strokeCap = StrokeCap.butt);
      canvas.drawPath(Path()..moveTo(tip.dx, tip.dy)..lineTo(base.dx + perp.dx, base.dy + perp.dy)..lineTo(base.dx - perp.dx, base.dy - perp.dy)..close(), Paint()..color = col);
    }
  }

  @override
  bool shouldRepaint(_ArrowPainter o) => o.arrows != arrows || o.flipped != flipped;
}

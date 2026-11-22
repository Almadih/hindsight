import 'package:material_ui/material_ui.dart' hide Badge;

import '../models.dart';
import '../review_logic.dart';
import '../theme.dart';

/// Move numbers for a line starting at [fen]: "19... Rxg2+ 20. Kxg2 Ne5".
List<String> _numbered(String fen, List<String> sans) {
  final parts = fen.split(' ');
  var n = int.tryParse(parts.elementAtOrNull(5) ?? '') ?? 1;
  var white = parts[1] == 'w';
  final out = <String>[];
  for (var i = 0; i < sans.length; i++) {
    out.add(
      white
          ? '$n. ${sans[i]}'
          : i == 0
          ? '$n... ${sans[i]}'
          : sans[i],
    );
    if (!white) n++;
    white = !white;
  }
  return out;
}

/// Horizontal move strip for stepping through the game.
class GameMoveStrip extends StatelessWidget {
  const GameMoveStrip({
    super.key,
    required this.startFen,
    required this.moves,
    required this.ply,
    required this.currentKey,
    required this.onSelect,
  });

  final String startFen;
  final List<ReviewMove> moves;
  final int ply;
  final GlobalKey currentKey;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    var n = int.tryParse(startFen.split(' ').elementAtOrNull(5) ?? '') ?? 1;
    final items = <Widget>[];
    for (var i = 0; i < moves.length; i++) {
      final m = moves[i];
      if (m.color == Side.white || i == 0) {
        items.add(
          Padding(
            padding: const EdgeInsets.only(left: 14, right: 6),
            child: Text(
              m.color == Side.white ? '$n.' : '$n...',
              style: const TextStyle(fontSize: 20, color: kMuted),
            ),
          ),
        );
      }
      final num = m.color == Side.white ? '$n.' : '$n…';
      if (m.color == Side.black) n++;
      final cur = i + 1 == ply;
      items.add(
        Semantics(
          button: true,
          selected: cur,
          label: '$num ${m.san}, ${badgeMeta[m.badge]!.label}',
          excludeSemantics: true,
          child: InkWell(
            key: cur ? currentKey : null,
            onTap: () => onSelect(i + 1),
            child: Container(
              constraints: const BoxConstraints(minWidth: 40, minHeight: 48),
              alignment: Alignment.center,
              margin: const EdgeInsets.symmetric(horizontal: 4),
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: cur
                  ? const BoxDecoration(
                      border: Border(
                        bottom: BorderSide(color: kMuted, width: 3),
                      ),
                    )
                  : null,
              child: Text(
                m.san,
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: cur ? Colors.white : kMuted,
                ),
              ),
            ),
          ),
        ),
      );
    }
    return Row(
      children: [
        IconButton(
          iconSize: 36,
          tooltip: 'Previous move',
          onPressed: ply > 0 ? () => onSelect(ply - 1) : null,
          icon: const Icon(Icons.chevron_left),
        ),
        Expanded(
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(children: items),
          ),
        ),
        IconButton(
          iconSize: 36,
          tooltip: 'Next move',
          onPressed: ply < moves.length ? () => onSelect(ply + 1) : null,
          icon: const Icon(Icons.chevron_right),
        ),
      ],
    );
  }
}

/// Horizontal move strip for stepping through an engine follow-up line.
class LineMoveStrip extends StatelessWidget {
  const LineMoveStrip({
    super.key,
    required this.startFen,
    required this.sans,
    required this.index,
    required this.onStep,
  });

  final String startFen;
  final List<String> sans;
  final int index;
  final ValueChanged<int> onStep;

  @override
  Widget build(BuildContext context) {
    final labels = _numbered(startFen, sans);
    return Row(
      children: [
        IconButton(
          iconSize: 32,
          tooltip: 'Previous move',
          onPressed: index > 0 ? () => onStep(index - 1) : null,
          icon: const Icon(Icons.chevron_left),
        ),
        Expanded(
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (var i = 0; i < labels.length; i++)
                  Semantics(
                    button: true,
                    selected: i + 1 == index,
                    label: labels[i],
                    excludeSemantics: true,
                    child: InkWell(
                      onTap: () => onStep(i + 1),
                      child: Container(
                        constraints: const BoxConstraints(minWidth: 40, minHeight: 48),
                        alignment: Alignment.center,
                        margin: const EdgeInsets.symmetric(horizontal: 4),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: i + 1 == index ? kMoveCurrent : null,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          labels[i],
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w700,
                            color: i < index ? Colors.white : kMuted,
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
        IconButton(
          iconSize: 32,
          tooltip: 'Next move',
          onPressed: index < sans.length ? () => onStep(index + 1) : null,
          icon: const Icon(Icons.chevron_right),
        ),
      ],
    );
  }
}

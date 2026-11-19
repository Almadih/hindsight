import 'package:material_ui/material_ui.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../models.dart';
import '../theme.dart';

/// Height of [PlayerBar]; board layouts subtract two of them.
const double kPlayerBarHeight = 44;

/// Name and rating, with the captured pieces and material lead underneath.
class PlayerBar extends StatelessWidget {
  const PlayerBar({super.key, required this.side, required this.name, this.rating, this.you = false, required this.material, required this.captured});
  final Side side;
  final String name;
  final String? rating;
  final bool you;
  final int material; // white minus black
  final List<String> captured;

  @override
  Widget build(BuildContext context) {
    final lead = side == Side.white ? material : -material;
    return SizedBox(
      height: kPlayerBarHeight,
      child: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            width: 16,
            height: 16,
            decoration: BoxDecoration(
              color: side == Side.white ? kEvalWhite : kTrack,
              borderRadius: BorderRadius.circular(3),
              border: side == Side.black ? Border.all(color: kDisabled) : null,
            ),
          ),
          const SizedBox(width: 8),
          // Full size, cut only when the bar is too narrow for the whole name.
          Flexible(child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, softWrap: false, style: const TextStyle(fontWeight: FontWeight.w700))),
          if (you) const Text(' (you)', style: TextStyle(color: kMuted)),
          if (rating != null) Text(' ($rating)', style: const TextStyle(color: kMuted)),
        ]),
        const SizedBox(height: 2),
        // Captures go under the name; the row is there even when empty so the bar never changes height.
        Padding(
          padding: const EdgeInsets.only(left: 24),
          child: SizedBox(
            height: 16,
            child: Row(children: [
              for (var i = 0; i < captured.length; i++)
                Padding(
                  // Same-type pieces overlap like a stack.
                  padding: EdgeInsets.only(left: i > 0 && captured[i - 1] == captured[i] ? 0 : i > 0 ? 4 : 0),
                  child: Align(
                    widthFactor: i > 0 && captured[i - 1] == captured[i] ? 0.5 : 1,
                    child: SvgPicture.asset('assets/pieces/${captured[i]}.svg', width: 16, height: 16),
                  ),
                ),
              if (lead > 0)
                Padding(padding: const EdgeInsets.only(left: 6), child: Text('+$lead', style: const TextStyle(color: kMuted, fontSize: 13, height: 1))),
            ]),
          ),
        ),
      ]),
    );
  }
}

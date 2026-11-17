import 'package:material_ui/material_ui.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../models.dart';
import '../theme.dart';

/// Name, rating and captured pieces with the material lead (port of PlayerBar.tsx).
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
      height: 32,
      child: Row(children: [
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
        Flexible(child: FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerLeft, child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)))),
        if (you) const Text(' (you)', style: TextStyle(color: kMuted)),
        if (rating != null) Text(' ($rating)', style: const TextStyle(color: kMuted)),
        const Spacer(),
        for (var i = 0; i < captured.length; i++)
          Padding(
            // Same-type pieces overlap like a stack.
            padding: EdgeInsets.only(left: i > 0 && captured[i - 1] == captured[i] ? 0 : i > 0 ? 4 : 0),
            child: Align(
              widthFactor: i > 0 && captured[i - 1] == captured[i] ? 0.5 : 1,
              child: SvgPicture.asset('assets/pieces/${captured[i]}.svg', width: 16, height: 16),
            ),
          ),
        if (lead > 0) Padding(padding: const EdgeInsets.only(left: 6), child: Text('+$lead', style: const TextStyle(color: kMuted))),
      ]),
    );
  }
}

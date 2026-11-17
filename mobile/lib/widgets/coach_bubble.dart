import 'package:material_ui/material_ui.dart' hide Badge;

import '../models.dart';
import '../review_logic.dart';
import '../theme.dart';
import 'badge_icon.dart';

/// Coach avatar + white speech bubble; with [badge] the bubble opens with a header row (icon, [title], eval chip).
/// With [fill], the bubble takes all the height its parent gives it (fixed size; long text scrolls inside),
/// so neither the avatar nor anything below moves as the text changes.
class CoachBubble extends StatelessWidget {
  const CoachBubble({super.key, required this.text, this.badge, this.title, this.eval, this.fill = false});
  final String text;
  final Badge? badge;
  final String? title;
  final String? eval;
  final bool fill;

  @override
  Widget build(BuildContext context) {
    const ink = kInk;
    final body = Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: fill ? MainAxisSize.max : MainAxisSize.min, children: [
      if (badge != null)
        Padding(
          padding: const EdgeInsets.only(bottom: 6),
          child: Row(children: [
            BadgeIcon(badge!, size: 26),
            const SizedBox(width: 8),
            Expanded(child: Text(title ?? badgeMeta[badge]!.label, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: ink, fontSize: 15.5, fontWeight: FontWeight.w800))),
            if (eval != null)
              Container(
                margin: const EdgeInsets.only(left: 6),
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(color: kChip, borderRadius: BorderRadius.circular(6)),
                child: Text(eval!, style: const TextStyle(color: ink, fontSize: 13.5, fontWeight: FontWeight.w800)),
              ),
          ]),
        ),
      // Flexible + scroll: in a height-bounded parent, long notes scroll instead of overflowing.
      Flexible(child: SingleChildScrollView(child: Text(text, style: const TextStyle(color: ink, fontSize: 14.5, height: 1.35)))),
    ]);
    return Row(crossAxisAlignment: fill ? CrossAxisAlignment.stretch : CrossAxisAlignment.start, children: [
      // Pinned top-left at a fixed size, whatever the text length.
      const Align(
        alignment: Alignment.topCenter,
        child: CircleAvatar(radius: 24, backgroundColor: kCoach, child: Icon(Icons.face, size: 30, color: Colors.white)),
      ),
      const SizedBox(width: 12),
      Expanded(
        child: Stack(clipBehavior: Clip.none, children: [
          // Tail points at the avatar, so it sits at the avatar's height (top), not the bubble's bottom.
          Positioned(left: -5, top: 18, child: Transform.rotate(angle: 0.785398, child: Container(width: 12, height: 12, color: Colors.white))),
          Container(
            constraints: fill ? const BoxConstraints.expand() : null,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14)),
            child: body,
          ),
        ]),
      ),
    ]);
  }
}

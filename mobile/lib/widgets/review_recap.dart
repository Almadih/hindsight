import 'package:material_ui/material_ui.dart' hide Badge;

import '../models.dart';
import '../review_logic.dart';
import '../theme.dart';
import 'badge_icon.dart';

/// End-of-review recap list shown after the last move or key moment.
class ReviewRecap extends StatelessWidget {
  const ReviewRecap({
    super.key,
    required this.report,
    required this.me,
    required this.moments,
    required this.onJump,
    required this.onSummary,
    required this.onStep,
  });

  final Report report;
  final Side? me;
  final List<ReviewMove> moments;
  final ValueChanged<int> onJump;
  final VoidCallback onSummary;
  final VoidCallback onStep;

  @override
  Widget build(BuildContext context) {
    final h = report.headers;
    final names = {
      Side.white: h['White'] ?? 'White',
      Side.black: h['Black'] ?? 'Black',
    };
    final you = me == null ? null : names[me];
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text(
          'That’s what decided it',
          style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 6),
        Text(
          takeaway(report, names, me),
          style: const TextStyle(color: kMuted, fontSize: 16),
        ),
        const SizedBox(height: 12),
        for (final m in moments)
          Card(
            color: kCard,
            child: ListTile(
              onTap: () => onJump(m.ply),
              leading: BadgeIcon(m.badge, size: 28),
              title: Text(
                '${(m.ply / 2).ceil()}.${m.color == Side.black ? '..' : ''} ${m.san} ${badgeMeta[m.badge]!.phrase}',
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  color: badgeMeta[m.badge]!.color,
                ),
              ),
              subtitle: m.coach == null
                  ? null
                  : Text(gist(personalize(m.coach!, you)) ?? ''),
              trailing: const Icon(Icons.chevron_right),
            ),
          ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: kGreen,
                  foregroundColor: Colors.white,
                ),
                onPressed: onSummary,
                child: const Text('Back to summary', textAlign: TextAlign.center),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: FilledButton.tonal(
                style: FilledButton.styleFrom(
                  backgroundColor: kCard,
                  foregroundColor: Colors.white,
                ),
                onPressed: onStep,
                child: const Text(
                  'Keep stepping through the game',
                  textAlign: TextAlign.center,
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

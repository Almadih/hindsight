import 'package:material_ui/material_ui.dart' hide Badge;
import 'package:url_launcher/url_launcher.dart';

import '../models.dart';
import '../prefs.dart' as prefs;
import '../review_logic.dart';
import '../theme.dart';
import '../widgets/accuracy_ring.dart';
import '../widgets/badge_icon.dart';
import '../widgets/coach_bubble.dart';
import '../widgets/eval_graph.dart';
import '../widgets/green_button.dart';
import '../widgets/review_menu.dart';
import 'player.dart';
import 'review_moves.dart';

class ReviewSummaryScreen extends StatelessWidget {
  /// [shared]: the review came from the shared store, not this phone's engine. [linkable]: stored, so a link opens it.
  const ReviewSummaryScreen({
    super.key,
    required this.report,
    required this.startFen,
    this.shared = true,
    this.linkable = true,
  });
  final Report report;
  final String startFen;
  final bool shared, linkable;

  static const _tab = [FontFeature.tabularFigures()];
  static const _label = TextStyle(
    fontSize: 15,
    fontWeight: FontWeight.w600,
    color: Colors.white,
  );
  static const _heading = TextStyle(fontSize: 17, fontWeight: FontWeight.w800);
  static const _line = Color(0xFF3D3A35);
  // Fixed columns so rings stay round, names get room, and every row lines up.
  static const _col = 104.0, _mid = 40.0;

  void _open(BuildContext context, int ply) => Navigator.of(context).push(
    MaterialPageRoute(
      builder: (_) => ReviewMovesScreen(
        report: report,
        startFen: startFen,
        initialPly: ply,
        linkable: linkable,
      ),
    ),
  );

  Widget _row(
    String label,
    Widget w,
    Widget mid,
    Widget b, {
    double pad = 6,
    bool top = false,
  }) => Padding(
    padding: EdgeInsets.symmetric(vertical: pad),
    child: Row(
      crossAxisAlignment: top
          ? CrossAxisAlignment.start
          : CrossAxisAlignment.center,
      children: [
        Expanded(child: Text(label, style: _label)),
        SizedBox(
          width: _col,
          child: Center(child: w),
        ),
        SizedBox(
          width: _mid,
          child: Center(child: mid),
        ),
        SizedBox(
          width: _col,
          child: Center(child: b),
        ),
      ],
    ),
  );

  static const _divider = Divider(height: 28, thickness: 1, color: _line);

  Widget _box(String text, bool light) => Container(
    width: 88,
    height: 44,
    alignment: Alignment.center,
    decoration: BoxDecoration(
      color: light ? kLight : kRaisedDark,
      borderRadius: BorderRadius.circular(6),
    ),
    child: FittedBox(
      fit: BoxFit.scaleDown,
      child: Text(
        text,
        maxLines: 1,
        style: TextStyle(
          fontSize: 21,
          fontWeight: FontWeight.w800,
          fontFeatures: _tab,
          color: light ? kBg : Colors.white,
        ),
      ),
    ),
  );

  Widget _avatar(bool light, bool winner) => Container(
    width: 56,
    height: 56,
    decoration: BoxDecoration(
      color: light ? kLight : kRaisedDark,
      borderRadius: BorderRadius.circular(8),
      border: winner ? Border.all(color: kGreen, width: 3) : null,
    ),
    child: Icon(
      Icons.person,
      size: 34,
      color: light ? const Color(0xFF8C8A87) : Colors.white70,
    ),
  );

  @override
  Widget build(BuildContext context) {
    final h = report.headers;
    final white = h['White'] ?? 'White', black = h['Black'] ?? 'Black';
    final names = {Side.white: white, Side.black: black};
    final result = h['Result'];
    final me = mySide(h, prefs.myUsernames);
    final platform = platformOf(h);
    final origin = originalGameUrl(h);
    final (:moments, :mine) = decidingMoments(report.moves, me);
    String acc(Side s) => report.accuracy[s]?.toStringAsFixed(1) ?? '-';
    final bubble = [
      if (report.opening != null) '${report.opening}.',
      takeaway(report, names, me),
      'Accuracy ${acc(Side.white)} vs ${acc(Side.black)}.',
    ].join(' ');
    Widget name(Side s) => Semantics(
      button: platform != null,
      label: platform == null ? null : "Open ${names[s]}'s player page",
      excludeSemantics: platform != null,
      child: InkWell(
        // Player pages need a known platform; pasted PGNs from elsewhere have none.
        onTap: platform == null
            ? null
            : () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) =>
                      PlayerScreen(platform: platform, username: names[s]!),
                ),
              ),
        // Usernames have no spaces to wrap at: shrink a long one to fit rather than cut it.
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(
                names[s]!,
                maxLines: 1,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  decoration: platform == null
                      ? null
                      : TextDecoration.underline,
                  decorationColor: Colors.white30,
                ),
              ),
            ),
            if (me == s)
              const Text('you', style: TextStyle(fontSize: 12, color: kMuted)),
          ],
        ),
      ),
    );
    Widget phase(String label, Phase p) {
      Widget icon(Side s) {
        final a = report.phaseAccuracy[s]?[p];
        return a == null
            ? const Text('–', style: TextStyle(fontSize: 15, color: kMuted))
            : BadgeIcon(phaseBadge(a), size: 26);
      }

      return _row(label, icon(Side.white), const SizedBox(), icon(Side.black));
    }

    final pcts = [
      whiteWinPct(report.start),
      for (final m in report.moves) whiteWinPct(m),
    ];
    return Scaffold(
      appBar: AppBar(
        title: const Text('Game Review'),
        actions: [ReviewMenu(report: report, linkable: linkable)],
      ),
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, c) {
            final wide = c.maxWidth > c.maxHeight || c.maxWidth > 720;
            const pad = EdgeInsets.fromLTRB(16, 8, 16, 16);
            final left = <Widget>[
              CoachBubble(text: bubble),
              const SizedBox(height: 8),
              Wrap(
                alignment: WrapAlignment.center,
                crossAxisAlignment: WrapCrossAlignment.center,
                spacing: 6,
                runSpacing: 4,
                children: [
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.circle, size: 8, color: shared ? kMuted : kGreen),
                      const SizedBox(width: 6),
                      Text(
                        shared ? 'Shared review' : 'Analyzed on this phone',
                        style: const TextStyle(fontSize: 13, color: kMuted),
                      ),
                    ],
                  ),
                  if (origin != null) ...[
                    const Text('·', style: TextStyle(fontSize: 13, color: kMuted)),
                    InkWell(
                      borderRadius: BorderRadius.circular(4),
                      onTap: () async {
                        var ok = false;
                        try {
                          ok = await launchUrl(Uri.parse(origin.url), mode: LaunchMode.externalApplication);
                        } catch (_) {}
                        if (!ok && context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Couldn’t open ${origin.url}')));
                        }
                      },
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 2),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              'View on ${origin.label}',
                              style: const TextStyle(fontSize: 13, color: kGreen, fontWeight: FontWeight.w600),
                            ),
                            const SizedBox(width: 4),
                            const Icon(Icons.open_in_new, size: 13, color: kGreen),
                          ],
                        ),
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 8),
              EvalGraph(
                pcts: pcts,
                badges: [for (final m in report.moves) m.badge],
                onTap: (p) => _open(context, p),
              ),
              const SizedBox(height: 20),
              if (moments.isNotEmpty) ...[
                Text(
                  mine ? 'Your key moments' : 'Key moments',
                  style: _heading,
                ),
                const SizedBox(height: 10),
                for (final m in moments)
                  _moment(context, m, me == null ? null : names[me]),
                const SizedBox(height: 16),
              ],
            ];
            final right = <Widget>[
              // Top-aligned: the "you" line under one name must not push the other name down.
              _row(
                '',
                name(Side.white),
                const SizedBox(),
                name(Side.black),
                pad: 2,
                top: true,
              ),
              _row(
                'Players',
                _avatar(true, result == '1-0'),
                const SizedBox(),
                _avatar(false, result == '0-1'),
              ),
              _row(
                'Accuracy',
                AccuracyRing(value: report.accuracy[Side.white], light: true),
                const SizedBox(),
                AccuracyRing(value: report.accuracy[Side.black], light: false),
              ),
              _divider,
              for (final b in badgeOrder)
                _row(
                  badgeMeta[b]!.label,
                  _count(report.counts[Side.white]?[b], b),
                  BadgeIcon(b, size: 26),
                  _count(report.counts[Side.black]?[b], b),
                  pad: 5,
                ),
              _divider,
              _row(
                'Game Rating',
                _box(report.elo[Side.white]?.toString() ?? '-', true),
                const SizedBox(),
                _box(report.elo[Side.black]?.toString() ?? '-', false),
              ),
              phase('Opening', Phase.opening),
              phase('Middlegame', Phase.middlegame),
              phase('Endgame', Phase.endgame),
            ];
            return Column(
              children: [
                Expanded(
                  child: wide
                      ? Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                              child: ListView(padding: pad, children: left),
                            ),
                            Expanded(
                              child: ListView(padding: pad, children: right),
                            ),
                          ],
                        )
                      : ListView(padding: pad, children: [...left, ...right]),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                  // Like Chess.com, the review starts from the first move; the key-moment rows above jump straight to a moment.
                  child: GreenButton(
                    'Start Review',
                    onPressed: () => _open(context, 0),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _count(int? n, Badge b) => Text(
    '${n ?? 0}',
    style: TextStyle(
      fontSize: 20,
      fontWeight: FontWeight.w800,
      fontFeatures: _tab,
      color: badgeMeta[b]!.color,
    ),
  );

  /// A key moment row: flat Raised surface (only the board casts shadows), badge, verdict line, short note.
  Widget _moment(BuildContext context, ReviewMove m, String? you) {
    final meta = badgeMeta[m.badge]!;
    // The coach note on an error names the answer; the moves screen shows it, the list keeps the plain rule.
    final note =
        (canRetry(m)
            ? null
            : gist(m.coach == null ? null : personalize(m.coach!, you))) ??
        meta.rule;
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Material(
        color: kCard,
        borderRadius: BorderRadius.circular(8),
        child: InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: () => _open(context, m.ply),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
            child: Row(
              children: [
                BadgeIcon(m.badge, size: 26),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text.rich(
                        TextSpan(
                          children: [
                            TextSpan(
                              text:
                                  '${(m.ply / 2).ceil()}.${m.color == Side.black ? '..' : ''} ${m.san} ',
                            ),
                            TextSpan(
                              text: meta.phrase,
                              style: TextStyle(color: meta.color),
                            ),
                          ],
                        ),
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          fontFeatures: _tab,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        note,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 13.5,
                          height: 1.35,
                          color: kMuted,
                        ),
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right, size: 20, color: kMuted),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

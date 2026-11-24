import 'package:material_ui/material_ui.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../game.dart';
import '../models.dart';
import '../prefs.dart' as prefs;
import '../review_logic.dart';
import '../screens/analyzing.dart';

const _qualities = {'quick': 'Quick (depth 14)', 'standard': 'Standard (depth 16)', 'deep': 'Deep (depth 18)'};

/// Overflow menu shared by the review screens: share link, private re-analysis, analysis quality.
class ReviewMenu extends StatelessWidget {
  const ReviewMenu({super.key, required this.report, required this.linkable, this.ply = 0});
  final Report report;
  final bool linkable;
  final int ply;

  Future<void> _reanalyze(BuildContext context) async {
    final nav = Navigator.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        content: const Text('Run your own analysis? It takes about a minute and counts toward today’s limit.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('Yes, re-analyze')),
        ],
      ),
    );
    if (ok != true) return;
    final pgn = reportPgn(report.headers, [for (final m in report.moves) m.san]);
    nav.pushReplacement(MaterialPageRoute(builder: (_) => AnalyzingScreen(pgn: pgn, fresh: true)));
  }

  Future<void> _quality(BuildContext context) => showDialog<void>(
        context: context,
        builder: (c) => SimpleDialog(
          title: const Text('Engine depth'),
          children: [
            for (final e in _qualities.entries)
              SimpleDialogOption(
                onPressed: () {
                  prefs.quality = e.key;
                  Navigator.pop(c);
                },
                child: Text(e.value, style: TextStyle(fontWeight: prefs.quality == e.key ? FontWeight.w800 : FontWeight.w400)),
              ),
          ],
        ),
      );

  Future<void> _openOriginal(BuildContext context, String url) async {
    var ok = false;
    try {
      ok = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    } catch (_) {}
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Couldn’t open $url')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final origin = originalGameUrl(report.headers);
    return PopupMenuButton<String>(
      onSelected: (v) {
        switch (v) {
          case 'open_game':
            if (origin != null) _openOriginal(context, origin.url);
          case 'share':
            SharePlus.instance.share(ShareParams(text: 'https://hindsight.almadih.dev/review?g=${report.hash}&ply=$ply'));
          case 'sound':
            prefs.soundOn = !prefs.soundOn;
          case 'reanalyze':
            _reanalyze(context);
          case 'quality':
            _quality(context);
        }
      },
      itemBuilder: (_) => [
        if (origin != null) PopupMenuItem(value: 'open_game', child: Text('View on ${origin.label}')),
        if (linkable) const PopupMenuItem(value: 'share', child: Text('Share link')),
        CheckedPopupMenuItem(value: 'sound', checked: prefs.soundOn, child: const Text('Sound')),
        const PopupMenuItem(value: 'reanalyze', child: Text('Re-analyze privately')),
        const PopupMenuItem(value: 'quality', child: Text('Analysis quality')),
      ],
    );
  }
}

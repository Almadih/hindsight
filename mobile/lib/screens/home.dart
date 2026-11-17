import 'package:material_ui/material_ui.dart' hide Badge;
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../demo.dart';
import '../models.dart';
import '../prefs.dart';
import '../review_logic.dart';
import '../theme.dart';
import '../widgets/badge_icon.dart';
import '../widgets/error_retry.dart';
import '../widgets/green_button.dart';
import 'analyzing.dart';
import 'how_it_works.dart';
import 'player.dart';

const _faq = [
  ['Is it really free?', 'Yes. Unlimited reviews, no account, no daily cap.'],
  ['How do I review a Chess.com game?', 'Pick Chess.com, type your username and choose a game.'],
  ['Does it work with Lichess?', 'Yes, same flow. Lichess users also get verdicts in plain words, not just engine lines.'],
  ['Which engine does it use?', 'Stockfish 19, at depth 16 by default (quick 14, deep 18).'],
];

const _scale = [
  (Badge.brilliant, '0%'), (Badge.great, '0%'), (Badge.best, 'under 1%'), (Badge.excellent, '1–3%'), (Badge.good, '3–5%'),
  (Badge.inaccuracy, '5–10%'), (Badge.mistake, '10–20%'), (Badge.miss, '10%+'), (Badge.blunder, '20%+'),
];

/// Every verdict from keeping all your chances to throwing them away; Book sits off the scale (port of VerdictLadder.tsx).
class VerdictLadder extends StatelessWidget {
  const VerdictLadder({super.key});

  Widget _row(Badge b, String? lost) {
    final m = badgeMeta[b]!;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(children: [
        BadgeIcon(b, size: 36),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(m.label, style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: m.color)),
            Text(m.rule, style: const TextStyle(color: Colors.white60)),
          ]),
        ),
        if (lost != null) Text(lost, style: const TextStyle(fontWeight: FontWeight.w800)),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Align(alignment: Alignment.centerRight, child: Text('Winning chances lost', style: TextStyle(color: Colors.white60, fontSize: 13))),
        for (final (b, lost) in _scale) _row(b, lost),
        const Divider(),
        _row(Badge.book, null),
        const Text('Book sits off the scale: known opening theory, not judged.', style: TextStyle(color: Colors.white60)),
      ]);
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late String _platform = lastPlatform;
  late final _name = TextEditingController(text: myUsernames.firstOrNull ?? '');
  List<GameSummary>? _games;
  Object? _error;
  bool _loading = false;
  String _shownFor = '';

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _find() async {
    final u = _name.text.trim();
    if (u.isEmpty) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _loading = true;
      _error = null;
      _games = null;
    });
    try {
      final games = await fetchGames(_platform, u);
      if (!mounted) return;
      rememberMe(u);
      lastPlatform = _platform;
      setState(() {
        _games = games;
        _shownFor = u;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _analyze(String pgn) =>
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => AnalyzingScreen(pgn: pgn)));

  void _push(Widget w) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => w));

  Future<void> _openUrl(String url) async {
    // External browser, so the web version and the site open with the user's own session and back stack.
    var ok = false;
    try {
      ok = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    } catch (_) {}
    if (!ok && mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Couldn’t open $url')));
  }

  Future<void> _paste() async {
    final c = TextEditingController();
    final pgn = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: kCard,
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.of(ctx).viewInsets.bottom),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          TextField(
            controller: c,
            autofocus: true,
            minLines: 6,
            maxLines: 10,
            keyboardType: TextInputType.multiline,
            enableSuggestions: false,
            autocorrect: false,
            decoration: const InputDecoration(labelText: 'PGN', hintText: 'Paste a PGN', border: OutlineInputBorder()),
          ),
          const SizedBox(height: 12),
          GreenButton('Analyze', onPressed: () => Navigator.pop(ctx, c.text.trim())),
        ]),
      ),
    );
    c.dispose();
    if (pgn != null && pgn.isNotEmpty && mounted) _analyze(pgn);
  }

  Widget _h2(String t) => Padding(
        padding: const EdgeInsets.only(top: 32, bottom: 12),
        child: Text(t, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
      );

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Hindsight')),
        body: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              const Text('Every move, judged.', style: TextStyle(fontSize: 34, fontWeight: FontWeight.w800, height: 1)),
              const SizedBox(height: 12),
              const Text('See where your game turned: every move rated, mistakes explained, the better move on the board.',
                  style: TextStyle(fontSize: 16, color: Colors.white70)),
              const SizedBox(height: 4),
              const Text('Free chess game review for Chess.com & Lichess. Unlimited, powered by Stockfish.',
                  style: TextStyle(fontSize: 13, color: Colors.white60)),
              const SizedBox(height: 16),
              // Above the finder so a loaded game list never pushes it out of view.
              Card(
                color: kCard,
                child: ListTile(
                  leading: const Icon(Icons.play_circle_outline, color: kGreen),
                  title: const Text('Try a demo review'),
                  subtitle: const Text('Morphy\'s Opera Game, Paris 1858'),
                  onTap: () => openDemo(context),
                ),
              ),
              const SizedBox(height: 20),
              SegmentedButton<String>(
                showSelectedIcon: false,
                segments: const [
                  ButtonSegment(value: 'chesscom', label: Text('Chess.com')),
                  ButtonSegment(value: 'lichess', label: Text('Lichess')),
                ],
                selected: {_platform},
                onSelectionChanged: (s) => setState(() => _platform = s.first),
                style: ButtonStyle(
                  minimumSize: const WidgetStatePropertyAll(Size.fromHeight(48)),
                  backgroundColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? kGreen : kCard),
                  foregroundColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? kInk : Colors.white),
                  textStyle: const WidgetStatePropertyAll(TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _name,
                autocorrect: false,
                enableSuggestions: false,
                textInputAction: TextInputAction.search,
                onSubmitted: (_) => _find(),
                decoration: const InputDecoration(
                  hintText: 'Username',
                  filled: true,
                  fillColor: kCard,
                  border: OutlineInputBorder(borderSide: BorderSide.none),
                ),
              ),
              if (myUsernames.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Wrap(spacing: 8, children: [
                    for (final u in myUsernames) ActionChip(label: Text(u), onPressed: () => setState(() => _name.text = u)),
                  ]),
                ),
              const SizedBox(height: 16),
              GreenButton('Find games', onPressed: _loading ? null : _find),
              Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                TextButton(onPressed: _paste, child: const Text('Paste PGN')),
                if (_games != null)
                  TextButton(
                    onPressed: () => _push(PlayerScreen(platform: _platform, username: _shownFor)),
                    child: const Text('Player page'),
                  ),
              ]),
              _results(),
              _h2('Ten verdicts, one scale'),
              const Text('Every move gets one, measured by how much of your winning chances it kept or gave away.',
                  style: TextStyle(color: Colors.white70)),
              const SizedBox(height: 12),
              const VerdictLadder(),
              _h2('Questions'),
              for (final f in _faq) ...[
                Text(f[0], style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                Padding(padding: const EdgeInsets.only(top: 4, bottom: 16), child: Text(f[1], style: const TextStyle(color: Colors.white70))),
              ],
              const Text('How is accuracy calculated?', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              const Padding(
                padding: EdgeInsets.only(top: 4),
                child: Text('From the winning chances each move loses, checked against Chess.com’s own numbers.', style: TextStyle(color: Colors.white70)),
              ),
              const SizedBox(height: 24),
              Wrap(spacing: 4, children: [
                TextButton(onPressed: () => _push(const HowItWorksScreen()), child: const Text('How it works')),
                TextButton(onPressed: () => _openUrl('https://hindsight.almadih.dev'), child: const Text('Web version')),
                TextButton(onPressed: () => _openUrl('https://almadih.dev'), child: const Text('almadih.dev')),
              ]),
              const Text(
                'Built by Almadih. Hindsight is an independent project, not affiliated with or endorsed by Chess.com or Lichess. '
                'Reviews are shared: once a game has been reviewed, anyone can open it. Sounds from Pixabay. '
                'Chess pieces: Staunty by sadsnake1, CC BY-NC-SA 4.0.',
                style: TextStyle(fontSize: 12, color: Colors.white54),
              ),
              const SizedBox(height: 16),
            ]),
          ),
        ),
      );

  Widget _results() {
    if (_loading) return const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()));
    if (_error != null) return ErrorRetry(error: _error!, onRetry: _find, compact: true);
    final games = _games;
    if (games == null) return const SizedBox.shrink();
    if (games.isEmpty) return const Padding(padding: EdgeInsets.all(16), child: Text('No recent games found.'));
    return Column(children: [for (final g in games) ...[_tile(g), const Divider(height: 1)]]);
  }

  Widget _tile(GameSummary g) {
    final lower = _shownFor.toLowerCase();
    final asWhite = g.white.name.toLowerCase() == lower;
    final asBlack = g.black.name.toLowerCase() == lower;
    final String label;
    Color tone = Colors.white60;
    if (g.result == '1/2-1/2') {
      label = 'Draw';
    } else if (!asWhite && !asBlack) {
      label = g.result;
    } else {
      final won = (asWhite && g.result == '1-0') || (asBlack && g.result == '0-1');
      label = won ? 'Won' : 'Lost';
      tone = won ? kGreen : Colors.redAccent;
    }
    final d = DateTime.fromMillisecondsSinceEpoch(g.endTime);
    final date = '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
    String p(Player x) => '${x.name}${x.rating == null ? '' : ' (${x.rating})'}';
    final acc = g.reviewedAccuracy;
    return ListTile(
      onTap: () => _analyze(g.pgn),
      title: Text('${p(g.white)} vs ${p(g.black)}', maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: Text('${g.timeClass ?? ''} · $date'),
      trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
        Text(label, style: TextStyle(color: tone, fontWeight: FontWeight.w800)),
        if (g.reviewed) Text(acc == null ? 'Reviewed' : 'Reviewed · $acc%', style: const TextStyle(fontSize: 12, color: Colors.white60)),
      ]),
    );
  }
}

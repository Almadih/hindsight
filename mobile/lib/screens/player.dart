import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../models.dart';
import '../nav.dart';
import '../theme.dart';
import '../widgets/error_retry.dart';
import 'analyzing.dart';

const _tone = {'won': kGreen, 'lost': kDanger};
const _tab = [FontFeature.tabularFigures()];

/// Port of web/app/player/page.tsx.
class PlayerScreen extends StatefulWidget {
  const PlayerScreen({super.key, required this.platform, required this.username});
  final String platform, username;

  @override
  State<PlayerScreen> createState() => _PlayerScreenState();
}

class _PlayerScreenState extends State<PlayerScreen> {
  PlayerProfile? _p;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (_error != null) setState(() => _error = null);
    try {
      if (widget.platform != 'chesscom' && widget.platform != 'lichess') throw ApiError('This link is missing a platform or username.', 0);
      final p = await fetchPlayer(widget.platform, widget.username);
      if (mounted) setState(() => _p = p);
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Widget _card(String title, Widget child) => Container(
        margin: const EdgeInsets.only(bottom: 16),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: kCard, borderRadius: BorderRadius.circular(12)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          const SizedBox(height: 8),
          child,
        ]),
      );

  @override
  Widget build(BuildContext context) {
    final p = _p;
    return Scaffold(
      appBar: AppBar(title: Text(widget.username, overflow: TextOverflow.ellipsis)),
      body: SafeArea(
        child: _error != null
            ? ErrorRetry(error: _error!, onRetry: _load)
            : p == null
                ? const Center(child: CircularProgressIndicator())
                : _body(p),
      ),
    );
  }

  Widget _body(PlayerProfile p) {
    final accs = [for (final g in p.history) if (g.accuracy != null) g.accuracy!];
    final avg = accs.isEmpty ? '–' : (accs.reduce((a, b) => a + b) / accs.length).toStringAsFixed(1);
    Widget stat(String label, String v) => Expanded(
          child: Column(children: [
            Text(v, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800)),
            Text(label, style: const TextStyle(color: kMuted)),
          ]),
        );
    return Center(
        child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 640),
            child: ListView(padding: const EdgeInsets.all(16), children: [
      Text(p.platform == 'chesscom' ? 'Chess.com' : 'Lichess', style: const TextStyle(color: kMuted)),
      const SizedBox(height: 12),
      Row(children: [stat('Reviewed games', '${p.history.length}'), stat('Average accuracy', avg)]),
      const SizedBox(height: 16),
      if (p.history.isEmpty)
        _card('No reviewed games yet', const Text('Pick one of the recent games below; once it’s reviewed, its accuracy and mistakes show up here.', style: TextStyle(color: kMuted)))
      else ...[
        _card(
          'Accuracy, game by game',
          _trend(p.history),
        ),
        _card(
          'Your common mistakes',
          p.themes.isEmpty
              ? const Text('No pattern yet: no recurring tactical slips in the reviewed games.', style: TextStyle(color: kMuted))
              : Column(children: [
                  for (final t in p.themes)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: Text('${t.count}', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                      title: Text(t.label, style: const TextStyle(fontWeight: FontWeight.w700)),
                      trailing: const Text('See one →', style: TextStyle(color: kGreen, fontWeight: FontWeight.w700)),
                      onTap: () => openReviewByHash(context, t.hash, ply: t.ply),
                    ),
                ]),
        ),
        _card(
          'Reviewed games',
          Column(children: [
            for (final g in p.history)
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text('vs ${g.opponent}', maxLines: 1, overflow: TextOverflow.ellipsis),
                subtitle: Text.rich(TextSpan(children: [
                  if (_word[g.result] != null) TextSpan(text: _word[g.result], style: TextStyle(color: _tone[g.result])),
                  if (_word[g.result] != null && g.date.isNotEmpty) const TextSpan(text: ' · '),
                  TextSpan(text: g.date),
                ])),
                trailing: _acc(g.accuracy),
                onTap: () => openReviewByHash(context, g.hash),
              ),
          ]),
        ),
      ],
      _card(
        'Recent games',
        Column(children: [
          for (final g in p.games) _recent(g, p.username),
        ]),
      ),
      const Text(
        'Only games reviewed on Hindsight count here. Reviews are shared, so anyone can see this page. Hindsight is not affiliated with Chess.com or Lichess.',
        style: TextStyle(fontSize: 12, color: kMuted),
      ),
    ])));
  }

  static const _word = {'won': 'Won', 'lost': 'Lost', 'draw': 'Draw'};

  Widget _acc(double? a) => Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
        Text(a == null ? '–' : '${a.toStringAsFixed(1)}%', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, fontFeatures: _tab)),
        const Text('accuracy', style: TextStyle(fontSize: 12, color: kMuted)),
      ]);

  Widget _trend(List<PlayerGame> history) {
    final vals = [for (final g in history.reversed) g.accuracy];
    final scored = [for (final v in vals) if (v != null) v];
    final label = scored.isEmpty
        ? 'Accuracy over ${vals.length} reviewed games, none scored'
        : 'Accuracy over ${vals.length} reviewed games, from ${scored.first.toStringAsFixed(1)} (oldest) to ${scored.last.toStringAsFixed(1)} (latest), average ${(scored.reduce((a, b) => a + b) / scored.length).toStringAsFixed(1)}';
    return Semantics(label: label, child: SizedBox(height: 160, child: CustomPaint(painter: _TrendPainter(vals))));
  }

  Widget _recent(GameSummary g, String me) {
    final user = me.toLowerCase();
    final asWhite = g.white.name.toLowerCase() == user, asBlack = g.black.name.toLowerCase() == user;
    String? word;
    if (g.result == '1/2-1/2') {
      word = 'Draw';
    } else if ((asWhite && g.result == '1-0') || (asBlack && g.result == '0-1')) {
      word = 'Won';
    } else if ((asWhite && g.result == '0-1') || (asBlack && g.result == '1-0')) {
      word = 'Lost';
    }
    final t = DateTime.fromMillisecondsSinceEpoch(g.endTime);
    final date = '${t.year}-${t.month.toString().padLeft(2, '0')}-${t.day.toString().padLeft(2, '0')}';
    final opp = asWhite ? g.black.name : asBlack ? g.white.name : null;
    return ListTile(
      contentPadding: EdgeInsets.zero,
      title: Text(opp != null ? 'vs $opp' : '${g.white.name} vs ${g.black.name}', maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: Text.rich(TextSpan(children: [
        if (word != null) TextSpan(text: word, style: TextStyle(color: word == 'Won' ? kGreen : word == 'Lost' ? kDanger : null)),
        if (word != null) const TextSpan(text: ' · '),
        TextSpan(text: '${g.timeClass != null ? '${g.timeClass} · ' : ''}$date'),
      ])),
      trailing: g.reviewed ? _acc(g.reviewedAccuracy) : null, // every game has a hash; only reviewed ones have a score
      onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => AnalyzingScreen(pgn: g.pgn))),
    );
  }
}

/// Accuracy 0-100 per game, oldest first; null (unscored) games leave a gap.
class _TrendPainter extends CustomPainter {
  _TrendPainter(this.values);
  final List<double?> values;

  @override
  void paint(Canvas canvas, Size size) {
    final grid = Paint()..color = const Color(0x1FFFFFFF);
    for (final v in [0, 25, 50, 75, 100]) {
      final y = size.height * (1 - v / 100);
      canvas.drawLine(Offset(0, y), Offset(size.width, y), grid);
    }
    final dx = values.length < 2 ? 0.0 : size.width / (values.length - 1);
    final line = Paint()..color = kGreen..strokeWidth = 2..style = PaintingStyle.stroke;
    final path = Path();
    var pen = false;
    for (var i = 0; i < values.length; i++) {
      final v = values[i];
      if (v == null) {
        pen = false;
        continue;
      }
      final o = Offset(values.length < 2 ? size.width / 2 : i * dx, size.height * (1 - v / 100));
      pen ? path.lineTo(o.dx, o.dy) : path.moveTo(o.dx, o.dy);
      pen = true;
      canvas.drawCircle(o, 3.5, Paint()..color = kGreen);
    }
    canvas.drawPath(path, line);
  }

  @override
  bool shouldRepaint(_TrendPainter old) => old.values != values;
}

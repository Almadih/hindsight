import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../models.dart';
import '../nav.dart';
import '../theme.dart';
import 'analyzing.dart';

const _tone = {'won': kGreen, 'lost': Colors.redAccent};

/// Port of web/app/player/page.tsx.
class PlayerScreen extends StatefulWidget {
  const PlayerScreen({super.key, required this.platform, required this.username});
  final String platform, username;

  @override
  State<PlayerScreen> createState() => _PlayerScreenState();
}

class _PlayerScreenState extends State<PlayerScreen> {
  PlayerProfile? _p;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      if (widget.platform != 'chesscom' && widget.platform != 'lichess') throw ApiError('This link is missing a platform or username.', 0);
      final p = await fetchPlayer(widget.platform, widget.username);
      if (mounted) setState(() => _p = p);
    } catch (e) {
      final msg = e is ApiError ? (e.message == 'player not found' ? 'No player with that name.' : e.message) : 'Could not load this player. Check your connection.';
      if (mounted) setState(() => _error = msg);
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
            ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(_error!, style: const TextStyle(color: Colors.redAccent))))
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
            Text(label, style: const TextStyle(color: Colors.white60)),
          ]),
        );
    return ListView(padding: const EdgeInsets.all(16), children: [
      Text(p.platform == 'chesscom' ? 'Chess.com' : 'Lichess', style: const TextStyle(color: Colors.white60)),
      const SizedBox(height: 12),
      Row(children: [stat('Reviewed games', '${p.history.length}'), stat('Average accuracy', avg)]),
      const SizedBox(height: 16),
      if (p.history.isEmpty)
        _card('No reviewed games yet', const Text('Pick one of the recent games below; once it’s reviewed, its accuracy and mistakes show up here.', style: TextStyle(color: Colors.white70)))
      else ...[
        _card(
          'Accuracy, game by game',
          SizedBox(height: 160, child: CustomPaint(painter: _TrendPainter([for (final g in p.history.reversed) g.accuracy]))),
        ),
        _card(
          'Your common mistakes',
          p.themes.isEmpty
              ? const Text('No pattern yet: no recurring tactical slips in the reviewed games.', style: TextStyle(color: Colors.white70))
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
                title: Text('vs ${g.opponent} as ${g.side}', maxLines: 1, overflow: TextOverflow.ellipsis),
                subtitle: Text('accuracy ${g.accuracy ?? '–'}${g.estElo != null ? ' · game rating ${g.estElo}' : ''}'),
                trailing: Text(g.result == 'unknown' ? '–' : g.result, style: TextStyle(color: _tone[g.result] ?? Colors.white60, fontWeight: FontWeight.w800)),
                onTap: () => openReviewByHash(context, g.hash),
              ),
          ]),
        ),
      ],
      _card(
        'Recent games',
        Column(children: [
          for (final g in p.games)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text('${g.white.name} vs ${g.black.name}', maxLines: 1, overflow: TextOverflow.ellipsis),
              subtitle: Text(g.timeClass ?? ''),
              trailing: g.hash != null ? const Text('Reviewed', style: TextStyle(color: Colors.white60, fontSize: 12)) : null,
              onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => AnalyzingScreen(pgn: g.pgn))),
            ),
        ]),
      ),
      const Text(
        'Only games reviewed on Hindsight count here. Reviews are shared, so anyone can see this page. Hindsight is not affiliated with Chess.com or Lichess.',
        style: TextStyle(fontSize: 12, color: Colors.white54),
      ),
    ]);
  }
}

/// Accuracy 0-100 per game, oldest first; null (unscored) games leave a gap.
class _TrendPainter extends CustomPainter {
  _TrendPainter(this.values);
  final List<double?> values;

  @override
  void paint(Canvas canvas, Size size) {
    final grid = Paint()..color = Colors.white12;
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

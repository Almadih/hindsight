import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../engine.dart';
import '../game.dart';
import '../models.dart';
import '../prefs.dart' as prefs;
import '../review_logic.dart';
import '../theme.dart';
import '../widgets/board.dart';
import '../widgets/error_retry.dart';
import '../widgets/eval_bar.dart';
import '../widgets/green_button.dart';
import '../widgets/player_bar.dart';
import 'review_summary.dart';

class AnalyzingScreen extends StatefulWidget {
  /// [fresh] re-analyzes privately: the shared cached review is skipped and the result isn't linkable.
  const AnalyzingScreen({super.key, required this.pgn, this.fresh = false});
  final String pgn;
  final bool fresh;

  @override
  State<AnalyzingScreen> createState() => _AnalyzingScreenState();
}

class _AnalyzingScreenState extends State<AnalyzingScreen> {
  List<String> _fens = const [], _sans = const [];
  Map<String, String> _headers = const {};
  int _done = 0;
  PositionEval? _ev; // the last evaluated position
  bool _classifying = false, _flipped = false;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _run();
  }

  Future<void> _run() async {
    try {
      final game = parsePgn(widget.pgn);
      final fens = game.fens;
      final cached = widget.fresh ? null : await cachedReview(game.pgn);
      if (!mounted) return;
      if (cached != null) return _open(cached, fens[0], shared: true, linkable: true);
      setState(() {
        _fens = fens;
        _sans = game.sans;
        _headers = game.headers;
        _flipped = mySide(game.headers, prefs.myUsernames) == Side.black;
      });
      final evals = await analyzePositions(
        fens,
        depth: prefs.qualityDepth[prefs.quality] ?? 16,
        onPosition: (i, ev) {
          if (mounted) {
            setState(() {
              _done = i + 1;
              _ev = ev;
            });
          }
        },
        cancelled: () => !mounted,
      );
      if (!mounted) return;
      setState(() => _classifying = true);
      final report = await analyze(game.pgn, evals: evals, fresh: widget.fresh);
      if (mounted) _open(report, fens[0], shared: false, linkable: !widget.fresh);
    } on StateError {
      // cancelled: the screen is gone
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  void _retry() {
    setState(() {
      _error = null;
      _fens = const [];
      _done = 0;
      _ev = null;
      _classifying = false;
    });
    _run();
  }

  void _open(Report report, String startFen, {required bool shared, required bool linkable}) => Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => ReviewSummaryScreen(report: report, startFen: startFen, shared: shared, linkable: linkable)));

  /// "After 12. Nf3 the engine wants Bc4 (+0.3)" (port of the readout in AnalysisLive.tsx).
  String _readout() {
    final ev = _ev;
    final best = ev?.lines.firstOrNull?.uci;
    final san = best == null ? null : uciToSan(ev!.fen, best);
    if (san == null) return 'Warming up the engine…';
    final shown = _done - 1;
    final move = shown == 0 ? 'the start' : '${(shown / 2).ceil()}.${shown.isOdd ? '' : '..'} ${_sans[shown - 1]}';
    return 'After $move the engine wants $san (${formatEval(whiteEvalOf(ev!))})';
  }

  @override
  Widget build(BuildContext context) {
    final String text;
    if (_error != null) {
      text = '';
    } else if (_classifying) {
      text = 'Judging every move and writing coach notes…';
    } else if (_fens.isEmpty) {
      text = widget.fresh ? 'Preparing…' : 'Checking for an existing review…';
    } else {
      text = 'Analyzing move ${(_done / 2).ceil()} of ${((_fens.length - 1) / 2).ceil()}';
    }
    final fen = _ev?.fen ?? (_fens.isEmpty ? null : _fens[0]);
    final best = _ev?.lines.firstOrNull?.uci;
    final captured = fen == null ? null : capturedPieces(fen);
    Widget bar(Side s) => PlayerBar(
          side: s,
          name: _headers[s == Side.white ? 'White' : 'Black'] ?? (s == Side.white ? 'White' : 'Black'),
          rating: _headers[s == Side.white ? 'WhiteElo' : 'BlackElo'],
          material: materialDiff(fen!),
          captured: s == Side.white ? captured!.white : captured!.black,
        );
    final (top, bottom) = _flipped ? (Side.white, Side.black) : (Side.black, Side.white);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Analyzing'),
        actions: [IconButton(tooltip: 'Flip board', onPressed: () => setState(() => _flipped = !_flipped), icon: const Icon(Icons.swap_vert))],
      ),
      body: SafeArea(
        child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (fen != null && _error == null)
            Expanded(
              child: LayoutBuilder(builder: (_, c) {
                final size = ((c.maxWidth < c.maxHeight - 2 * kPlayerBarHeight ? c.maxWidth : c.maxHeight - 2 * kPlayerBarHeight) - kEvalBarWidth).clamp(80.0, 2000.0);
                return Center(
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    SizedBox(width: size + kEvalBarWidth, child: bar(top)),
                    Row(mainAxisSize: MainAxisSize.min, children: [
                      EvalBar(ev: _ev == null ? const WhiteEval(0, null) : whiteEvalOf(_ev!), height: size, flipped: _flipped),
                      ChessBoard(fen: fen, size: size, flipped: _flipped, arrows: [?best]),
                    ]),
                    SizedBox(width: size + kEvalBarWidth, child: bar(bottom)),
                  ]),
                );
              }),
            )
          else
            const Spacer(),
          const SizedBox(height: 16),
          if (_error != null)
            ErrorRetry(error: _error!, onRetry: _error is FormatException ? null : _retry, compact: true)
          else
            Text(text, textAlign: TextAlign.center, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          if (_error != null)
            GreenButton('Choose another game', onPressed: () => Navigator.of(context).pop())
          else
            LinearProgressIndicator(
              semanticsLabel: 'Analysis progress',
              semanticsValue: '$_done of ${_fens.length} positions',
              value: _fens.isEmpty || _classifying ? null : _done / _fens.length,
              color: kGreen,
              backgroundColor: kCard,
            ),
          if (_error == null && _fens.isNotEmpty && !_classifying)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(_readout(), textAlign: TextAlign.center, style: const TextStyle(color: Colors.white70)),
            ),
          if (_error != null || _fens.isEmpty) const Spacer(),
        ]),
      ),
      ),
    );
  }
}

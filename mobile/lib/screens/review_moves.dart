import 'dart:async';
import 'dart:math' as math;

import 'package:dartchess/dartchess.dart' as dc;
import 'package:material_ui/material_ui.dart' hide Badge;

import '../models.dart';
import '../prefs.dart' as prefs;
import '../review_logic.dart';
import '../theme.dart';
import '../widgets/badge_icon.dart';
import '../widgets/board.dart';
import '../widgets/coach_bubble.dart';
import '../widgets/eval_bar.dart';
import '../widgets/green_button.dart';
import '../widgets/player_bar.dart';
import '../widgets/review_menu.dart';
import '../widgets/sfx.dart';

const _lineStepMs = 700;

enum _Mode { game, line, retry, end }

class ReviewMovesScreen extends StatefulWidget {
  const ReviewMovesScreen({
    super.key,
    required this.report,
    required this.startFen,
    this.initialPly = 0,
    this.linkable = true,
  });
  final Report report;
  final String startFen;
  final int initialPly;
  final bool linkable;

  @override
  State<ReviewMovesScreen> createState() => _ReviewMovesScreenState();
}

class _ReviewMovesScreenState extends State<ReviewMovesScreen> {
  late int _ply = widget.initialPly.clamp(0, widget.report.moves.length);
  late final Side? _me = mySide(widget.report.headers, prefs.myUsernames);
  late bool _flipped = _me == Side.black;
  late final _moments = decidingMoments(widget.report.moves, _me);
  _Mode _mode = _Mode.game;
  final _solved = <int>{};
  // Engine line (mode line).
  var _lineFens = const <String>[],
      _lineSans = const <String>[],
      _lineUcis = const <String>[];
  int _lineIdx = 0;
  bool _playing = false;
  // Retry (mode retry): the verdict on the last attempt, and the tapped piece.
  ({bool ok, String san, String uci})? _fb;
  String? _selected;
  Timer? _timer;
  final _curKey = GlobalKey();
  bool? _wasWide;

  List<ReviewMove> get _moves => widget.report.moves;
  List<int> get _momentPlies => [for (final m in _moments.moments) m.ply];
  ReviewMove? get _m => _ply > 0 ? _moves[_ply - 1] : null;
  String get _prevFen => _ply > 1 ? _moves[_ply - 2].fen : widget.startFen;
  WhiteEval get _prevEval => _ply > 1 ? _moves[_ply - 2] : widget.report.start;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToCurrent());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _scrollToCurrent() {
    final c = _curKey.currentContext;
    if (c != null)
      Scrollable.ensureVisible(
        c,
        duration: const Duration(milliseconds: 200),
        alignment: 0.5,
      );
  }

  void _toGame() {
    _timer?.cancel();
    _mode = _Mode.game;
    _fb = _selected = null;
    _playing = false;
  }

  // Any navigation leaves a line, retry or the recap and returns to the game.
  void _go(int p) {
    if (p < 0 || p > _moves.length) return;
    final forward = p > _ply;
    setState(() {
      _toGame();
      _ply = p;
    });
    if (forward) playMoveSound(_moves[p - 1].san);
    WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToCurrent());
  }

  int? get _nextMoment => _mode == _Mode.end
      ? null
      : _momentPlies.where((p) => p > _ply).firstOrNull;
  int? get _prevMoment => _mode == _Mode.end
      ? _momentPlies.lastOrNull
      : _momentPlies.where((p) => p < _ply).lastOrNull;
  void _finish() => setState(() {
    _toGame();
    _mode = _Mode.end;
  });

  void _followUp() {
    final m = _m;
    if (m == null) return;
    // After a best move show what comes next from it; otherwise replay the better move from before it.
    final playedBest = m.bestUci == m.uci;
    final pv = playedBest ? m.bestPv.skip(1).toList() : m.bestPv;
    final still = MediaQuery.disableAnimationsOf(context);
    final line = followUpLine(playedBest ? m.fen : _prevFen, pv);
    setState(() {
      _toGame();
      _mode = _Mode.line;
      _lineFens = line.fens;
      _lineSans = line.sans;
      _lineUcis = pv.take(line.sans.length).toList();
      _lineIdx = 0;
      _playing = !still;
    });
    if (still) return;
    _timer = Timer.periodic(const Duration(milliseconds: _lineStepMs), (t) {
      if (!mounted || !_playing || _lineIdx >= _lineSans.length)
        return t.cancel();
      setState(() => _lineIdx++);
      playMoveSound(_lineSans[_lineIdx - 1]);
    });
  }

  void _lineStep(int i) {
    final n = i.clamp(0, _lineSans.length), forward = n > _lineIdx;
    _timer?.cancel();
    setState(() {
      _lineIdx = n;
      _playing = false;
    });
    if (forward) playMoveSound(_lineSans[n - 1]);
  }

  void _retry() => setState(() {
    _toGame();
    _mode = _Mode.retry;
  });

  // Returns after judging a drag or a tap-move; illegal moves just snap back.
  void _tryMove(String from, String to) {
    final m = _m;
    final fen = _retryFen;
    if (m == null || _mode != _Mode.retry || (_fb?.ok ?? false)) return;
    final pos = positionOf(fen);
    if (pos == null) return;
    final f = dc.Square.fromName(from), t = dc.Square.fromName(to);
    final best = m.bestUci;
    final promo =
        pos.board.roleAt(f) == dc.Role.pawn &&
        (to.endsWith('8') || to.endsWith('1'));
    final role = promo
        ? (best != null && best.startsWith('$from$to') && best.length == 5
              ? dc.Role.fromChar(best[4])
              : dc.Role.queen)
        : null;
    final mv = dc.NormalMove(from: f, to: t, promotion: role);
    final norm = pos.normalizeMove(
      mv,
    ); // standard castling notation -> king takes rook
    if (!pos.isLegal(norm)) return;
    final (_, san) = pos.makeSan(norm);
    final ok = isGoodRetry(m, mv.uci);
    setState(() {
      _selected = null;
      if (ok) _solved.add(_ply);
      _fb = (ok: ok, san: san, uci: mv.uci);
    });
    playMoveSound(san);
  }

  // The retry board: the position before the move, or the solved position after the good move.
  String get _retryFen {
    final fb = _fb;
    if (fb == null || !fb.ok) return _prevFen;
    final pos = positionOf(_prevFen)!;
    return pos.play(pos.normalizeMove(dc.NormalMove.fromUci(fb.uci))).fen;
  }

  // Tap-to-move: tap your piece, then its destination.
  void _tapSquare(String sq) {
    final pos = _mode == _Mode.retry && !(_fb?.ok ?? false)
        ? positionOf(_prevFen)
        : null;
    if (pos == null) return;
    final mine = pos.board.sideAt(dc.Square.fromName(sq)) == pos.turn;
    final from = _selected;
    if (from != null && !mine) {
      setState(() => _selected = null);
      _tryMove(from, sq);
    } else {
      setState(() => _selected = mine ? sq : null);
    }
  }

  Widget _tb(String label, IconData icon, VoidCallback? onTap) {
    final c = onTap == null ? Colors.white24 : Colors.white54;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 26, color: c),
            Text(label, style: TextStyle(fontSize: 11, color: c)),
          ],
        ),
      ),
    );
  }

  Widget _btn(
    String label,
    VoidCallback? onTap, {
    bool primary = false,
    IconData? icon,
    bool trailing = false,
  }) {
    final text = Text(label, textAlign: TextAlign.center);
    final child = icon == null
        ? text
        : Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (!trailing) Icon(icon, size: 20),
              Flexible(child: text),
              if (trailing) Icon(icon, size: 20),
            ],
          );
    return primary
        ? FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: kGreen,
              foregroundColor: Colors.white,
            ),
            onPressed: onTap,
            child: child,
          )
        : FilledButton.tonal(
            style: FilledButton.styleFrom(
              backgroundColor: kCard,
              foregroundColor: Colors.white,
            ),
            onPressed: onTap,
            child: child,
          );
  }

  /// Move numbers for a line starting at [fen]: "19... Rxg2+ 20. Kxg2 Ne5".
  List<String> _numbered(String fen, List<String> sans) {
    final parts = fen.split(' ');
    var n = int.tryParse(parts.elementAtOrNull(5) ?? '') ?? 1;
    var white = parts[1] == 'w';
    final out = <String>[];
    for (var i = 0; i < sans.length; i++) {
      out.add(
        white
            ? '$n. ${sans[i]}'
            : i == 0
            ? '$n... ${sans[i]}'
            : sans[i],
      );
      if (!white) n++;
      white = !white;
    }
    return out;
  }

  Widget _strip() {
    var n =
        int.tryParse(widget.startFen.split(' ').elementAtOrNull(5) ?? '') ?? 1;
    final items = <Widget>[];
    for (var i = 0; i < _moves.length; i++) {
      final m = _moves[i];
      if (m.color == Side.white || i == 0) {
        items.add(
          Padding(
            padding: const EdgeInsets.only(left: 14, right: 6),
            child: Text(
              m.color == Side.white ? '$n.' : '$n...',
              style: const TextStyle(fontSize: 20, color: Colors.white60),
            ),
          ),
        );
      }
      final num = m.color == Side.white ? '$n.' : '$n…';
      if (m.color == Side.black) n++;
      final cur = i + 1 == _ply;
      items.add(
        Semantics(
          button: true,
          selected: cur,
          label: '$num ${m.san}, ${badgeMeta[m.badge]!.label}',
          excludeSemantics: true,
          child: InkWell(
          key: cur ? _curKey : null,
          onTap: () => _go(i + 1),
          child: Container(
            constraints: const BoxConstraints(minWidth: 40, minHeight: 48),
            alignment: Alignment.center,
            margin: const EdgeInsets.symmetric(horizontal: 4),
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: cur
                ? const BoxDecoration(
                    border: Border(
                      bottom: BorderSide(color: Colors.white54, width: 3),
                    ),
                  )
                : null,
            child: Text(
              m.san,
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w800,
                color: cur ? Colors.white : Colors.white70,
              ),
            ),
          ),
        ),
        ),
      );
    }
    return Row(
      children: [
        IconButton(
          iconSize: 36,
          tooltip: 'Previous move',
          onPressed: _ply > 0 ? () => _go(_ply - 1) : null,
          icon: const Icon(Icons.chevron_left),
        ),
        Expanded(
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(children: items),
          ),
        ),
        IconButton(
          iconSize: 36,
          tooltip: 'Next move',
          onPressed: _ply < _moves.length ? () => _go(_ply + 1) : null,
          icon: const Icon(Icons.chevron_right),
        ),
      ],
    );
  }

  Widget _lineStrip() {
    final labels = _numbered(_lineFens[0], _lineSans);
    return Row(
      children: [
        IconButton(
          iconSize: 32,
          tooltip: 'Previous move',
          onPressed: _lineIdx > 0 ? () => _lineStep(_lineIdx - 1) : null,
          icon: const Icon(Icons.chevron_left),
        ),
        Expanded(
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (var i = 0; i < labels.length; i++)
                  Semantics(
                    button: true,
                    selected: i + 1 == _lineIdx,
                    label: labels[i],
                    excludeSemantics: true,
                    child: InkWell(
                    onTap: () => _lineStep(i + 1),
                    child: Container(
                      constraints: const BoxConstraints(minWidth: 40, minHeight: 48),
                      alignment: Alignment.center,
                      margin: const EdgeInsets.symmetric(horizontal: 4),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 6,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: i + 1 == _lineIdx
                            ? kMoveCurrent
                            : null,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        labels[i],
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w700,
                          color: i < _lineIdx ? Colors.white : Colors.white54,
                        ),
                      ),
                    ),
                  ),
                  ),
              ],
            ),
          ),
        ),
        IconButton(
          iconSize: 32,
          tooltip: 'Next move',
          onPressed: _lineIdx < _lineSans.length
              ? () => _lineStep(_lineIdx + 1)
              : null,
          icon: const Icon(Icons.chevron_right),
        ),
      ],
    );
  }

  /// The coach text for the current state, plus the buttons under it.
  (Widget, List<Widget>, (String, VoidCallback)?) _card() {
    final keys = [
      _tb(
        'Prev key',
        Icons.skip_previous,
        _prevMoment == null ? null : () => _go(_prevMoment!),
      ),
      _tb(
        'Next key',
        Icons.skip_next,
        _nextMoment == null ? null : () => _go(_nextMoment!),
      ),
    ];
    final m = _m;
    if (m == null)
      return (
        const CoachBubble(fill: true, text: 'Let’s go through the game move by move.'),
        keys,
        null,
      );
    final meta = badgeMeta[m.badge]!;
    final side = m.color == Side.white ? 'White' : 'Black';
    final solved = _solved.contains(_ply);

    if (_mode == _Mode.retry) {
      final fb = _fb;
      final head = fb == null
          ? 'Find a better move for $side'
          : fb.ok
          ? 'Nice! ${fb.san} works.'
          : '${fb.san} isn’t it. Try again.';
      final sub = fb?.ok ?? false
          ? 'That’s the move the engine wanted.'
          : fb != null
          ? retryHint(m, _prevFen, fb.uci)
          : 'Drag a piece, or tap it and then tap where it should go.';
      return (
        CoachBubble(fill: true, 
          text: fb?.ok ?? false ? sub : '$head\n$sub',
          badge: fb?.ok ?? false ? Badge.best : null,
          title: head,
        ),
        [
          _tb(
            'Back',
            Icons.undo,
            () => setState(() {
              _toGame();
            }),
          ),
          _tb(
            fb?.ok ?? false ? 'Best' : 'Answer',
            Icons.lightbulb_outline,
            _followUp,
          ),
        ],
        fb?.ok ?? false
            ? (
                'Back to game',
                () => setState(() {
                  _toGame();
                }),
              )
            : null,
      );
    }

    if (_mode == _Mode.line) {
      return (
        const CoachBubble(fill: true, text: 'The engine’s line'),
        [
          _tb('Replay', Icons.replay, _followUp),
          _tb('Back', Icons.undo, () => setState(_toGame)),
        ],
        null,
      );
    }

    final bestSan =
        m.bestUci != null &&
            m.bestUci != m.uci &&
            m.badge != Badge.book &&
            m.badge != Badge.best
        ? uciToSan(_prevFen, m.bestUci!)
        : null;
    final bad = canRetry(m);
    final playedBest = m.bestUci == m.uci;
    final hasLine = m.mateWhite != 0 && m.bestPv.length > (playedBest ? 1 : 0);
    // Like Chess.com, errors show the answer (arrow, best move, coach note) at once; Retry is still offered.
    final sub = bestSan != null
        ? 'Best was $bestSan'
        : m.badge == Badge.book && widget.report.opening != null
        ? widget.report.opening!
        : meta.rule;
    final i = _momentPlies.indexOf(_ply);
    final you = _me == null
        ? null
        : widget.report.headers[_me == Side.white ? 'White' : 'Black'];
    final text = [
      if (i >= 0) 'Key moment ${i + 1} of ${_momentPlies.length} · ',
      if (solved) 'Solved · ',
      sub,
      if (m.coach != null) '\n${personalize(m.coach!, you)}',
    ].join();
    return (
      CoachBubble(fill: true, 
        text: text,
        badge: m.badge,
        title: '${m.san} ${meta.phrase}',
        eval: formatEval(m),
      ),
      [
        if (m.badge != Badge.book && bad) _tb('Retry', Icons.refresh, _retry),
        if (m.badge != Badge.book && hasLine)
          _tb('Best', Icons.lightbulb_outline, _followUp),
        ...keys,
      ],
      null,
    );
  }

  Widget _recap() {
    final h = widget.report.headers;
    final names = {
      Side.white: h['White'] ?? 'White',
      Side.black: h['Black'] ?? 'Black',
    };
    final you = _me == null ? null : names[_me];
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text(
          'That’s what decided it',
          style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 6),
        Text(
          takeaway(widget.report, names, _me),
          style: const TextStyle(color: Colors.white70, fontSize: 16),
        ),
        const SizedBox(height: 12),
        for (final m in _moments.moments)
          Card(
            color: kCard,
            child: ListTile(
              onTap: () => _go(m.ply),
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
              child: _btn(
                'Back to summary',
                () => Navigator.of(context).pop(),
                primary: true,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _btn(
                'Keep stepping through the game',
                () => _go(_ply + 1),
              ),
            ),
          ],
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final m = _m;
    final h = widget.report.headers;
    final onGame = _mode == _Mode.game || _mode == _Mode.end;
    final retrying = _mode == _Mode.retry;
    final fen = _mode == _Mode.line
        ? _lineFens[_lineIdx]
        : retrying
        ? _retryFen
        : (m?.fen ?? widget.startFen);
    final solvedNow = retrying && (_fb?.ok ?? false);
    final showBest =
        onGame &&
        m != null &&
        m.bestUci != null &&
        m.bestUci != m.uci &&
        m.badge != Badge.book &&
        m.badge != Badge.best;
    final hintBest = onGame && m == null
        ? widget.report.moves.firstOrNull?.bestUci
        : null;
    final (card, left, main) = _mode == _Mode.end
        ? (const SizedBox(), const <Widget>[], null)
        : _card();
    final last = _ply >= _moves.length;
    final top = _flipped ? Side.white : Side.black,
        bottom = _flipped ? Side.black : Side.white;
    final names = {
      Side.white: h['White'] ?? 'White',
      Side.black: h['Black'] ?? 'Black',
    };
    final ratings = {Side.white: h['WhiteElo'], Side.black: h['BlackElo']};
    final material = materialDiff(fen);
    final captured = capturedPieces(fen);
    Widget bar(Side s) => PlayerBar(
      side: s,
      name: names[s]!,
      you: _me == s,
      rating: ratings[s],
      material: material,
      captured: s == Side.white ? captured.white : captured.black,
    );
    final eval = onGame ? (m ?? widget.report.start) : _prevEval;
    return PopScope(
      canPop: _mode != _Mode.retry && _mode != _Mode.line,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) setState(_toGame);
      },
      child: Scaffold(
      appBar: AppBar(
        title: const Text('Review'),
        actions: [
          IconButton(
            tooltip: 'Flip board',
            onPressed: () => setState(() => _flipped = !_flipped),
            icon: const Icon(Icons.swap_vert),
          ),
          IconButton(
            tooltip: 'Summary',
            onPressed: () => Navigator.of(context).pop(),
            icon: const Icon(Icons.leaderboard_outlined),
          ),
          ReviewMenu(
            report: widget.report,
            linkable: widget.linkable,
            ply: _ply,
          ),
        ],
      ),
      body: _mode == _Mode.end
          ? _recap()
          : LayoutBuilder(
              builder: (_, c) {
                final wide = c.maxWidth > c.maxHeight;
                // The strip's scroll position resets when the layout flips; bring the current move back.
                if (wide != _wasWide) {
                  _wasWide = wide;
                  WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToCurrent());
                }
                // Wide: board fills the height minus the two 32dp player bars (+8 slack); tall tablets: cap so coach, strip and bar still fit.
                final size = wide
                    ? math.max(100.0, math.min(c.maxHeight - 72, c.maxWidth * 0.55 - kEvalBarWidth))
                    : math.min(c.maxWidth - kEvalBarWidth - 16, c.maxHeight * 0.55);
                final coach = Semantics(liveRegion: true, child: card);
                final board = RepaintBoundary(
                  child: GestureDetector(
                    // Swipe the board to step through moves.
                    onHorizontalDragEnd: retrying
                        ? null
                        : (d) => (d.primaryVelocity ?? 0).abs() > 300
                              ? _go(_ply + (d.primaryVelocity! < 0 ? 1 : -1))
                              : null,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        SizedBox(width: size + kEvalBarWidth, child: bar(top)),
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            EvalBar(ev: eval, height: size, flipped: _flipped),
                            ChessBoard(
                              fen: fen,
                              size: size,
                              flipped: _flipped,
                              lastMove: _mode == _Mode.line
                                  ? (_lineIdx > 0 ? _lineUcis[_lineIdx - 1] : null)
                                  : retrying
                                  ? (solvedNow
                                        ? _fb!.uci
                                        : (_ply > 1 ? _moves[_ply - 2].uci : null))
                                  : m?.uci,
                              badge: onGame
                                  ? m?.badge
                                  : solvedNow
                                  ? Badge.best
                                  : null,
                              arrows: showBest ? [m.bestUci!] : [?hintBest],
                              selected: _selected,
                              onTap: retrying && !solvedNow ? _tapSquare : null,
                              onMove: retrying && !solvedNow ? _tryMove : null,
                            ),
                          ],
                        ),
                        SizedBox(width: size + kEvalBarWidth, child: bar(bottom)),
                      ],
                    ),
                  ),
                );
                final controls = SafeArea(
                  top: false,
                  child: Column(
                    children: [
                      _mode == _Mode.line ? _lineStrip() : _strip(),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(8, 4, 12, 8),
                        child: Row(
                          children: [
                            ...left,
                            const SizedBox(width: 8),
                            Expanded(
                              child: GreenButton(
                                main?.$1 ?? (last ? 'Finish' : 'Next'),
                                onPressed:
                                    main?.$2 ??
                                    (last ? _finish : () => _go(_ply + 1)),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                );
                final pad = const EdgeInsets.fromLTRB(16, 8, 16, 10);
                if (wide) {
                  return Row(
                    children: [
                      SizedBox(
                        width: size + kEvalBarWidth,
                        child: Center(child: board),
                      ),
                      Expanded(
                        child: Column(
                          children: [
                            Expanded(child: Padding(padding: pad, child: coach)),
                            controls,
                          ],
                        ),
                      ),
                    ],
                  );
                }
                return Column(
                  children: [
                    // Fixed-height coach area (scrolls inside; shrinks on short screens) so the board never resizes.
                    Flexible(
                      child: SizedBox(
                        height: 170,
                        child: Padding(padding: pad, child: coach),
                      ),
                    ),
                    Center(child: board),
                    controls,
                  ],
                );
              },
            ),
    ),
    );
  }
}

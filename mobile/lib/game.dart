import 'package:dartchess/dartchess.dart';

/// Rebuild a PGN from a stored review's headers and moves (port of reportPgn in web/lib/pgn.ts).
String reportPgn(Map<String, String> headers, List<String> sans) {
  final root = PgnNode<PgnNodeData>();
  var tail = root;
  for (final san in sans) {
    final child = PgnChildNode(PgnNodeData(san: san));
    tail.children.add(child);
    tail = child;
  }
  return PgnGame(headers: headers, moves: root, comments: const <String>[]).makePgn();
}

/// Parse a PGN into the FEN of every position (start, then one per ply) plus a clean re-exported PGN.
/// Throws FormatException on invalid PGN or no moves.
({String pgn, List<String> fens, List<String> sans, Map<String, String> headers}) parsePgn(String input) {
  final game = PgnGame.parsePgn(input, initHeaders: PgnGame.emptyHeaders);
  try {
    var pos = PgnGame.startingPosition(game.headers);
    final fens = [pos.fen];
    final sans = <String>[];
    for (final node in game.moves.mainline()) {
      final move = pos.parseSan(node.san);
      if (move == null) throw FormatException('Illegal move ${node.san}');
      final (next, san) = pos.makeSan(move);
      pos = next;
      sans.add(san);
      fens.add(pos.fen);
    }
    if (sans.isEmpty) throw const FormatException('PGN has no moves');
    // Rebuild without comments/variations so python-chess replays exactly this line.
    final root = PgnNode<PgnNodeData>();
    var tail = root;
    for (final san in sans) {
      final child = PgnChildNode(PgnNodeData(san: san));
      tail.children.add(child);
      tail = child;
    }
    final clean = PgnGame(headers: game.headers, moves: root, comments: const <String>[]);
    return (pgn: clean.makePgn(), fens: fens, sans: sans, headers: game.headers);
  } on PositionSetupException catch (e) {
    throw FormatException('Invalid position: $e');
  }
}

import 'package:material_ui/material_ui.dart';

import 'api.dart';
import 'review_logic.dart';
import 'screens/review_moves.dart';
import 'screens/review_summary.dart';

/// Opens a stored review by game hash; with [ply] lands directly on that move (summary stays underneath).
Future<void> openReviewByHash(BuildContext context, String hash, {int? ply}) async {
  final nav = Navigator.of(context);
  final messenger = ScaffoldMessenger.maybeOf(context);
  try {
    final report = await getReview(hash);
    if (report == null) {
      messenger?.showSnackBar(const SnackBar(content: Text('That review was not found.')));
      return;
    }
    final fen = report.headers['FEN'] ?? standardFen;
    nav.push(MaterialPageRoute(builder: (_) => ReviewSummaryScreen(report: report, startFen: fen)));
    if (ply != null) nav.push(MaterialPageRoute(builder: (_) => ReviewMovesScreen(report: report, startFen: fen, initialPly: ply)));
  } catch (e) {
    messenger?.showSnackBar(SnackBar(content: Text(e is ApiError ? e.message : 'Could not load the review.')));
  }
}

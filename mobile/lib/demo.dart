import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

import 'models.dart';
import 'screens/review_summary.dart';

/// The demo (Morphy's Opera Game, Paris 1858) ships pre-analyzed, so it opens instantly and offline.
/// The bundled report is also stored in the shared cache (hash 489b29f2…), so its share link works.
/// Regenerate after an API ANALYSIS_VERSION bump: analyze the game once and save `/api/review/{hash}` here.
const demoReportAsset = 'assets/demo/report.json';
const _startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

Future<Report> loadDemoReport() async => Report.fromJson(jsonDecode(await rootBundle.loadString(demoReportAsset)));

Future<void> openDemo(BuildContext context) async {
  final report = await loadDemoReport();
  if (!context.mounted) return;
  await Navigator.of(context).push(MaterialPageRoute(builder: (_) => ReviewSummaryScreen(report: report, startFen: _startFen)));
}

import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';
import 'package:url_launcher/url_launcher.dart';

import 'nav.dart';
import 'prefs.dart';
import 'push.dart';
import 'screens/analyzing.dart';
import 'screens/home.dart';
import 'screens/player.dart';
import 'theme.dart';
import 'update_check.dart';

final navKey = GlobalKey<NavigatorState>();
const _share = MethodChannel('hindsight/share');

void _registerLicenses() {
  LicenseRegistry.addLicense(() async* {
    final gpl = await rootBundle.loadString('android/app/src/main/cpp/stockfish/COPYING');
    yield LicenseEntryWithLineBreaks(
      const ['Stockfish'],
      'Stockfish chess engine — GNU General Public License v3.0.\n'
      'Complete corresponding source code: https://github.com/Almadih/hindsight\n\n$gpl',
    );
    final pieces = await rootBundle.loadString('assets/pieces/LICENSE.md');
    yield LicenseEntryWithLineBreaks(const ['Staunty Chess Pieces'], pieces);
    yield const LicenseEntryWithLineBreaks(
      ['Chess Sound Effects'],
      'Sound effects sourced from Pixabay under the Pixabay Content License.',
    );
  });
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  _registerLicenses();
  await initPrefs();
  runApp(const HindsightApp());
}

class HindsightApp extends StatefulWidget {
  const HindsightApp({super.key});

  @override
  State<HindsightApp> createState() => _HindsightAppState();
}

class _HindsightAppState extends State<HindsightApp> with WidgetsBindingObserver {
  StreamSubscription<Uri>? _sub;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Text shared into the app (MainActivity): at launch via initialText, while running via "shared".
    _share.setMethodCallHandler((call) async {
      if (call.method == 'shared') _openPgn(call.arguments as String);
    });
    // Wait for the first frame so navKey.currentContext is mounted before cold-start links or shares arrive.
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;
      _sub = AppLinks().uriLinkStream.listen(_open);
      final text = await _share.invokeMethod<String>('initialText');
      if (!mounted) return;
      if (text != null) _openPgn(text);
      unawaited(initPush(onOpenUrl: _openNotificationUrl, navKey: navKey));
      final ctx = navKey.currentContext;
      if (ctx != null && ctx.mounted) unawaited(checkForUpdate(ctx));
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      final ctx = navKey.currentContext;
      if (ctx != null) unawaited(checkForUpdate(ctx));
    }
  }

  void _openPgn(String pgn) =>
      navKey.currentState?.push(MaterialPageRoute(builder: (_) => AnalyzingScreen(pgn: pgn.trim())));

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _sub?.cancel();
    super.dispose();
  }

  void _openNotificationUrl(Uri uri) {
    if (uri.host == 'hindsight.almadih.dev' &&
        (uri.path.startsWith('/review') || uri.path.startsWith('/player'))) {
      _open(uri);
    } else {
      unawaited(launchUrl(uri, mode: LaunchMode.externalApplication));
    }
  }

  void _open(Uri uri) {
    final ctx = navKey.currentContext;
    if (ctx == null) return;
    final q = uri.queryParameters;
    if (uri.path.startsWith('/review') && q['g'] != null) {
      openReviewByHash(ctx, q['g']!, ply: int.tryParse(q['ply'] ?? ''));
    } else if (uri.path.startsWith('/player') && q['p'] != null && q['u'] != null) {
      navKey.currentState!.push(MaterialPageRoute(builder: (_) => PlayerScreen(platform: q['p']!, username: q['u']!)));
    }
  }

  @override
  Widget build(BuildContext context) =>
      MaterialApp(navigatorKey: navKey, title: 'Hindsight', theme: appTheme(), home: const HomeScreen());
}

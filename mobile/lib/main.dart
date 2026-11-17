import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:material_ui/material_ui.dart';

import 'nav.dart';
import 'prefs.dart';
import 'screens/home.dart';
import 'screens/player.dart';
import 'theme.dart';

final navKey = GlobalKey<NavigatorState>();

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initPrefs();
  runApp(const HindsightApp());
}

class HindsightApp extends StatefulWidget {
  const HindsightApp({super.key});

  @override
  State<HindsightApp> createState() => _HindsightAppState();
}

class _HindsightAppState extends State<HindsightApp> {
  StreamSubscription<Uri>? _sub;

  @override
  void initState() {
    super.initState();
    // The stream also delivers the link that launched the app.
    _sub = AppLinks().uriLinkStream.listen(_open);
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
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

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:material_ui/material_ui.dart';

const broadcastTopic = 'all';

Uri? parseNotificationUrl(Map<String, dynamic> data) {
  final raw = data['url'];
  if (raw is! String || raw.trim().isEmpty) return null;
  final uri = Uri.tryParse(raw.trim());
  if (uri == null || uri.scheme != 'https' || uri.host.isEmpty) return null;
  return uri;
}

Future<void> initPush({
  required void Function(Uri) onOpenUrl,
  required GlobalKey<NavigatorState> navKey,
}) async {
  try {
    await Firebase.initializeApp();
    final messaging = FirebaseMessaging.instance;
    await messaging.requestPermission();
    await messaging.subscribeToTopic(broadcastTopic);

    FirebaseMessaging.onMessage.listen((msg) {
      final ctx = navKey.currentContext;
      if (ctx == null || !ctx.mounted) return;
      final title = msg.notification?.title ?? '';
      final body = msg.notification?.body ?? '';
      final text = [title, body].where((s) => s.isNotEmpty).join(' — ');
      if (text.isEmpty) return;

      final url = parseNotificationUrl(msg.data);
      ScaffoldMessenger.maybeOf(ctx)?.showSnackBar(
        SnackBar(
          content: Text(text),
          action: url == null ? null : SnackBarAction(label: 'Open', onPressed: () => onOpenUrl(url)),
        ),
      );
    });

    final initial = await messaging.getInitialMessage();
    if (initial != null) {
      final url = parseNotificationUrl(initial.data);
      if (url != null) onOpenUrl(url);
    }

    FirebaseMessaging.onMessageOpenedApp.listen((msg) {
      final url = parseNotificationUrl(msg.data);
      if (url != null) onOpenUrl(url);
    });
  } catch (_) {}
}

import 'package:material_ui/material_ui.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import 'api.dart';
import 'models.dart';
import 'prefs.dart';
import 'theme.dart';

const _cooldown = Duration(minutes: 15);
DateTime? _lastCheck;
bool _dialogOpen = false;

class UpdatePrompt {
  const UpdatePrompt({
    required this.required,
    required this.version,
    required this.title,
    required this.message,
    required this.storeUrl,
  });

  final bool required;
  final String version, title, message, storeUrl;
}

List<int> _parseSegments(String v) {
  final core = v.split('+').first.split('-').first.trim();
  if (core.isEmpty) return const [0, 0, 0];
  final parts = core.split('.');
  return List<int>.generate(3, (i) => i < parts.length ? (int.tryParse(parts[i].trim()) ?? 0) : 0);
}

int compareVersions(String a, String b) {
  final sa = _parseSegments(a);
  final sb = _parseSegments(b);
  for (var i = 0; i < 3; i++) {
    if (sa[i] != sb[i]) return sa[i].compareTo(sb[i]);
  }
  return 0;
}

UpdatePrompt? evaluateUpdate(String currentVersion, AppConfig config, {String? dismissedVersion}) {
  if (compareVersions(currentVersion, config.minVersion) < 0) {
    return UpdatePrompt(
      required: true,
      version: config.latestVersion,
      title: config.title,
      message: config.message,
      storeUrl: config.storeUrl,
    );
  }
  if (compareVersions(currentVersion, config.latestVersion) < 0) {
    if (dismissedVersion != null && compareVersions(dismissedVersion, config.latestVersion) >= 0) {
      return null;
    }
    return UpdatePrompt(
      required: false,
      version: config.latestVersion,
      title: config.title,
      message: config.message,
      storeUrl: config.storeUrl,
    );
  }
  return null;
}

bool isAllowedStoreUri(Uri uri) => (uri.scheme == 'https' && uri.host.isNotEmpty) || uri.scheme == 'market';

Future<void> _launchStore(String rawUrl) async {
  final uri = Uri.tryParse(rawUrl);
  if (uri == null || !isAllowedStoreUri(uri)) return;
  await launchUrl(uri, mode: LaunchMode.externalApplication);
}

Future<void> showUpdateDialog(BuildContext context, UpdatePrompt prompt) async {
  if (_dialogOpen || !context.mounted) return;
  _dialogOpen = true;
  try {
    await showDialog<void>(
      context: context,
      barrierDismissible: !prompt.required,
      builder: (ctx) {
        final dialog = AlertDialog(
          backgroundColor: kCard,
          title: Text(prompt.title.isEmpty ? 'Update available' : prompt.title),
          content: prompt.message.isEmpty ? null : Text(prompt.message),
          actions: [
            if (!prompt.required)
              TextButton(
                onPressed: () {
                  dismissedUpdateVersion = prompt.version;
                  Navigator.of(ctx).pop();
                },
                child: const Text('Later'),
              ),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: kGreen, foregroundColor: Colors.white),
              onPressed: () => _launchStore(prompt.storeUrl),
              child: Text(prompt.required ? 'Update now' : 'Update'),
            ),
          ],
        );
        return prompt.required ? PopScope(canPop: false, child: dialog) : dialog;
      },
    );
  } finally {
    _dialogOpen = false;
  }
}

Future<void> checkForUpdate(BuildContext context, {bool force = false}) async {
  if (_dialogOpen) return;
  final now = DateTime.now();
  if (!force && _lastCheck != null && now.difference(_lastCheck!) < _cooldown) return;
  _lastCheck = now;

  try {
    final info = await PackageInfo.fromPlatform();
    final config = await fetchAppConfig();
    final prompt = evaluateUpdate(info.version, config, dismissedVersion: dismissedUpdateVersion);
    if (prompt == null || !context.mounted) return;
    await showUpdateDialog(context, prompt);
  } catch (_) {}
}

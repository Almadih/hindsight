import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../theme.dart';

/// The one error state for the app: what went wrong in plain words, and a way to try again.
class ErrorRetry extends StatelessWidget {
  const ErrorRetry({super.key, required this.error, this.onRetry, this.retryLabel = 'Try again', this.compact = false});
  final Object error;
  final VoidCallback? onRetry;
  final String retryLabel;
  /// Inline (under a form) instead of centered on an empty screen.
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final body = Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: compact ? CrossAxisAlignment.start : CrossAxisAlignment.center,
      children: [
        Semantics(
          liveRegion: true,
          child: Text(
            friendlyError(error),
            textAlign: compact ? TextAlign.start : TextAlign.center,
            style: const TextStyle(color: Color(0xFFFF7769), fontSize: 15, height: 1.4),
          ),
        ),
        if (onRetry != null) ...[
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh, size: 18),
            label: Text(retryLabel),
            style: OutlinedButton.styleFrom(foregroundColor: Colors.white, side: const BorderSide(color: kMuted), minimumSize: const Size(48, 48)),
          ),
        ],
      ],
    );
    return compact ? Padding(padding: const EdgeInsets.symmetric(vertical: 12), child: body) : Center(child: Padding(padding: const EdgeInsets.all(24), child: body));
  }
}

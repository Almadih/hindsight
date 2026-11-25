import 'package:flutter_test/flutter_test.dart';
import 'package:hindsight/push.dart';

void main() {
  group('parseNotificationUrl', () {
    test('accepts valid https URLs', () {
      final uri = parseNotificationUrl({'url': 'https://example.com/announcement'});
      expect(uri, isNotNull);
      expect(uri.toString(), 'https://example.com/announcement');
    });

    test('accepts Hindsight deep links', () {
      final uri = parseNotificationUrl({'url': 'https://hindsight.almadih.dev/review?g=abc123&ply=12'});
      expect(uri, isNotNull);
      expect(uri!.host, 'hindsight.almadih.dev');
      expect(uri.path, '/review');
      expect(uri.queryParameters['g'], 'abc123');
    });

    test('returns null for missing or empty url', () {
      expect(parseNotificationUrl({}), isNull);
      expect(parseNotificationUrl({'url': null}), isNull);
      expect(parseNotificationUrl({'url': ''}), isNull);
      expect(parseNotificationUrl({'url': '   '}), isNull);
    });

    test('rejects non-https and invalid schemes', () {
      expect(parseNotificationUrl({'url': 'http://hindsight.almadih.dev/review?g=abc'}), isNull);
      expect(parseNotificationUrl({'url': 'javascript:alert(1)'}), isNull);
      expect(parseNotificationUrl({'url': 'file:///etc/passwd'}), isNull);
      expect(parseNotificationUrl({'url': 'https://'}), isNull);
    });
  });
}

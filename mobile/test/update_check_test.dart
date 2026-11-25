import 'package:flutter_test/flutter_test.dart';
import 'package:hindsight/models.dart';
import 'package:hindsight/prefs.dart';
import 'package:hindsight/theme.dart';
import 'package:hindsight/update_check.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    await initPrefs();
  });

  setUp(() async {
    await prefs.clear();
  });

  group('compareVersions', () {
    test('compares numeric segments properly', () {
      expect(compareVersions('1.0.10', '1.0.9'), greaterThan(0));
      expect(compareVersions('1.0.9', '1.0.10'), lessThan(0));
      expect(compareVersions('1.2.0', '1.1.99'), greaterThan(0));
      expect(compareVersions('2.0', '1.9.9'), greaterThan(0));
    });

    test('strips +build and -pre suffixes', () {
      expect(compareVersions('1.0.9+10', '1.0.9+99'), 0);
      expect(compareVersions('1.1.0-beta.1', '1.0.9'), greaterThan(0));
      expect(compareVersions('1.0.10-rc1+42', '1.0.9+10'), greaterThan(0));
    });

    test('handles malformed input gracefully', () {
      expect(compareVersions('', '0.0.0'), 0);
      expect(compareVersions('abc', '0.0.1'), lessThan(0));
      expect(compareVersions('1.2.x', '1.2.0'), 0);
    });
  });

  group('evaluateUpdate', () {
    const config = AppConfig(
      latestVersion: '1.0.10',
      minVersion: '1.0.5',
      title: 'Update available',
      message: 'New features!',
      storeUrl: 'https://github.com/Almadih/hindsight/releases/latest/download/hindsight.apk',
    );

    test('returns null when up-to-date', () {
      expect(evaluateUpdate('1.0.10', config), isNull);
      expect(evaluateUpdate('1.0.11', config), isNull);
    });

    test('returns casual prompt when behind latestVersion', () {
      final prompt = evaluateUpdate('1.0.9', config);
      expect(prompt, isNotNull);
      expect(prompt!.required, isFalse);
      expect(prompt.version, '1.0.10');
    });

    test('returns null when casual update was dismissed', () {
      expect(evaluateUpdate('1.0.9', config, dismissedVersion: '1.0.10'), isNull);
    });

    test('re-prompts when a newer version is released after dismissal', () {
      const newer = AppConfig(
        latestVersion: '1.0.11',
        minVersion: '1.0.5',
        title: 'Update available',
        message: 'Even newer!',
        storeUrl: 'https://github.com/Almadih/hindsight/releases/latest/download/hindsight.apk',
      );
      final prompt = evaluateUpdate('1.0.9', newer, dismissedVersion: '1.0.10');
      expect(prompt, isNotNull);
      expect(prompt!.required, isFalse);
      expect(prompt.version, '1.0.11');
    });

    test('required update overrides dismissed version', () {
      final prompt = evaluateUpdate('1.0.4', config, dismissedVersion: '1.0.10');
      expect(prompt, isNotNull);
      expect(prompt!.required, isTrue);
    });
  });

  group('isAllowedStoreUri', () {
    test('allows https and market schemes', () {
      expect(isAllowedStoreUri(Uri.parse('https://github.com/Almadih/hindsight/releases/latest/download/hindsight.apk')), isTrue);
      expect(isAllowedStoreUri(Uri.parse('market://details?id=dev.almadih.hindsight')), isTrue);
    });

    test('rejects insecure or non-store schemes', () {
      expect(isAllowedStoreUri(Uri.parse('http://example.com')), isFalse);
      expect(isAllowedStoreUri(Uri.parse('javascript:alert(1)')), isFalse);
      expect(isAllowedStoreUri(Uri.parse('https://')), isFalse);
    });
  });

  testWidgets('casual update dialog persists dismissal on Later', (tester) async {
    const prompt = UpdatePrompt(
      required: false,
      version: '1.0.10',
      title: 'Update available',
      message: 'Please update.',
      storeUrl: 'https://github.com/Almadih/hindsight/releases/latest/download/hindsight.apk',
    );

    await tester.pumpWidget(
      MaterialApp(
        theme: appTheme(),
        home: Builder(
          builder: (ctx) => Scaffold(
            body: ElevatedButton(
              onPressed: () => showUpdateDialog(ctx, prompt),
              child: const Text('Trigger'),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Trigger'));
    await tester.pumpAndSettle();

    expect(find.text('Update available'), findsOneWidget);
    expect(find.text('Later'), findsOneWidget);
    expect(find.text('Update'), findsOneWidget);

    await tester.tap(find.text('Later'));
    await tester.pumpAndSettle();

    expect(find.text('Update available'), findsNothing);
    expect(dismissedUpdateVersion, '1.0.10');
  });

  testWidgets('required update dialog is non-dismissible and blocks back pop', (tester) async {
    const prompt = UpdatePrompt(
      required: true,
      version: '2.0.0',
      title: 'Update required',
      message: 'Critical update.',
      storeUrl: 'https://github.com/Almadih/hindsight/releases/latest/download/hindsight.apk',
    );

    await tester.pumpWidget(
      MaterialApp(
        theme: appTheme(),
        home: Builder(
          builder: (ctx) => Scaffold(
            body: ElevatedButton(
              onPressed: () => showUpdateDialog(ctx, prompt),
              child: const Text('Trigger'),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Trigger'));
    await tester.pumpAndSettle();

    expect(find.text('Update required'), findsOneWidget);
    expect(find.text('Update now'), findsOneWidget);
    expect(find.text('Later'), findsNothing);

    final popScope = tester.widget<PopScope>(find.byType(PopScope));
    expect(popScope.canPop, isFalse);

    // Tapping outside barrier must not dismiss the required dialog.
    await tester.tapAt(const Offset(10, 10));
    await tester.pumpAndSettle();
    expect(find.text('Update required'), findsOneWidget);
  });
}

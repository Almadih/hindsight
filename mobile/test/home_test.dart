import 'package:flutter_test/flutter_test.dart';
import 'package:hindsight/prefs.dart';
import 'package:hindsight/screens/home.dart';
import 'package:hindsight/theme.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  testWidgets('home renders the verdict ladder and FAQ', (tester) async {
    SharedPreferences.setMockInitialValues({});
    await initPrefs();
    tester.view.physicalSize = const Size(1080, 6000);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(MaterialApp(theme: appTheme(), home: const HomeScreen()));
    expect(find.text('Ten verdicts, one scale'), findsOneWidget);
    expect(find.byType(VerdictLadder), findsOneWidget);
    expect(find.text('Blunder'), findsOneWidget);
    expect(find.text('Is it really free?'), findsOneWidget);
    expect(find.text('Try a demo review'), findsOneWidget);
  });
}

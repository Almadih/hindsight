import 'package:flutter_test/flutter_test.dart';
import 'package:hindsight/demo.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('bundled demo report is a complete review of the Opera Game', () async {
    final r = await loadDemoReport();
    expect(r.moves.length, 33);
    expect(r.moves.last.san, 'Rd8#');
    expect(r.headers['White'], 'Paul Morphy');
    expect(r.accuracy.values.every((a) => a != null), isTrue);
  });
}

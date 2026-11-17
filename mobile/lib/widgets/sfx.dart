import 'package:audioplayers/audioplayers.dart';

import '../prefs.dart';
import '../review_logic.dart';

/// Tests switch this off (no audio plugin there).
bool sfxEnabled = true;
AudioPlayer? _player;

Future<void> playMoveSound(String san) async {
  if (!sfxEnabled || !soundOn) return;
  try {
    await (_player ??= AudioPlayer()).play(AssetSource('sfx/${sfxFile(san)}'), volume: 0.6);
  } catch (_) {}
}

import 'package:material_ui/material_ui.dart';

const kBg = Color(0xFF312E2B);
const kCard = Color(0xFF3C3A37);
const kGreen = Color(0xFF81B64C);
const kGreenShadow = Color(0xFF537133);
const kLight = Color(0xFFF1F1F1);
const kMoveCurrent = Color(0xFF4B4844);
const kMuted = Color(0xFFA8A39B);
const kTrack = Color(0xFF403D39);
const kEvalWhite = Color(0xFFF1EFEA);
const kInk = Color(0xFF2B2927);
const kBoardLight = Color(0xFFEBECD0);
const kBoardDark = Color(0xFF739552);
const kSelect = Color(0xFFF6F669);
const kLastMove = Color(0xFFE3C9A5);
const kRaisedDark = Color(0xFF454340);
const kDisabled = Color(0x3DFFFFFF);
const kCoach = Color(0xFF8C5A3C);
const kChip = Color(0xFFEEEEEE);
const kDanger = Color(0xFFFF7769);

ThemeData appTheme() => ThemeData(
      brightness: Brightness.dark,
      scaffoldBackgroundColor: kBg,
      colorScheme: const ColorScheme.dark(primary: kGreen, surface: kBg),
      appBarTheme: const AppBarTheme(
        backgroundColor: kBg,
        centerTitle: true,
        elevation: 0,
        titleTextStyle: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Colors.white),
      ),
      dividerColor: Colors.white12,
    );

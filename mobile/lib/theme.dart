import 'package:material_ui/material_ui.dart';

const kBg = Color(0xFF312E2B);
const kCard = Color(0xFF3C3A37);
const kGreen = Color(0xFF81B64C);
const kGreenShadow = Color(0xFF537133);
const kLight = Color(0xFFF1F1F1);

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

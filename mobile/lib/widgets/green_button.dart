import 'package:material_ui/material_ui.dart';

import '../theme.dart';

class GreenButton extends StatelessWidget {
  const GreenButton(this.label, {super.key, this.onPressed});
  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final on = onPressed != null;
    return Opacity(
      opacity: on ? 1 : 0.45,
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          boxShadow: const [BoxShadow(color: kGreenShadow, offset: Offset(0, 4))],
        ),
        child: Material(
          color: kGreen,
          borderRadius: BorderRadius.circular(14),
          child: InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: onPressed,
            child: Container(
              height: 56,
              alignment: Alignment.center,
              child: Text(label, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: Colors.white)),
            ),
          ),
        ),
      ),
    );
  }
}

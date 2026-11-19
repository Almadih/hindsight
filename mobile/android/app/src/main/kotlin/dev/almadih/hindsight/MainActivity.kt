package dev.almadih.hindsight

import android.content.Intent
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private var share: MethodChannel? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        share = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "hindsight/share").apply {
            setMethodCallHandler { call, result ->
                if (call.method != "initialText") return@setMethodCallHandler result.notImplemented()
                result.success(sharedText(intent))
                // Consumed once, so a recreated activity doesn't open the same review again.
                intent.removeExtra(Intent.EXTRA_TEXT)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        sharedText(intent)?.let { share?.invokeMethod("shared", it) }
    }

    private fun sharedText(i: Intent?): String? =
        if (i?.action == Intent.ACTION_SEND) i.getStringExtra(Intent.EXTRA_TEXT)?.takeIf { it.isNotBlank() } else null
}

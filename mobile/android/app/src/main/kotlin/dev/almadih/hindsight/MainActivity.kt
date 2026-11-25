package dev.almadih.hindsight

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Intent
import android.os.Build
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private var share: MethodChannel? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                "hindsight_announcements",
                "Announcements",
                NotificationManager.IMPORTANCE_DEFAULT,
            )
            getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
        }
    }

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

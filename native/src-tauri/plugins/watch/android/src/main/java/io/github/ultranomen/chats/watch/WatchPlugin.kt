package io.github.ultranomen.chats.watch

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

@InvokeArg
class StartArgs {
    var base: String = ""
    var token: String = ""
    var title: String = "CHATS"
    var one: String = "1 new message"
    var many: String = "{n} new messages"
    var status: String = "checking for new messages"
}

@InvokeArg
class ForegroundArgs {
    var on: Boolean = true
}

/** The web app calls these when it goes to the background (start), comes back (foreground) or signs out (stop). */
@TauriPlugin
class WatchPlugin(private val activity: Activity) : Plugin(activity) {
    @Command
    fun start(invoke: Invoke) {
        val a = invoke.parseArgs(StartArgs::class.java)
        if (a.base.isBlank() || a.token.isBlank()) {
            invoke.reject("missing server or session")
            return
        }
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 7301)
        }
        WatchService.configure(activity, a.base, a.token, a.title, a.one, a.many, a.status)
        WatchService.start(activity)
        invoke.resolve()
    }

    @Command
    fun stop(invoke: Invoke) {
        WatchService.stop(activity)
        invoke.resolve()
    }

    @Command
    fun foreground(invoke: Invoke) {
        WatchService.setForeground(activity, invoke.parseArgs(ForegroundArgs::class.java).on)
        invoke.resolve()
    }
}

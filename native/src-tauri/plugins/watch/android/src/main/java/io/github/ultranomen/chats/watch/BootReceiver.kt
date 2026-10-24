package io.github.ultranomen.chats.watch

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Resumes the background check after a reboot, if the user was signed in when the phone turned off. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED || !WatchService.configured(context)) return
        try {
            WatchService.start(context)
        } catch (e: Exception) {
            // Some Android versions refuse to start services at boot; the app restarts it when opened.
        }
    }
}

package io.github.ultranomen.chats.watch

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Asks the user's own CHATS server once a minute how many new messages arrived (GET <api>?r=notify/poll&since=<id>)
 * and shows "N new messages". It never sees contents or keys, and needs no Google services, so it keeps working
 * when only the domestic internet does. Android requires a foreground service for this to survive in the background,
 * which is why a quiet "checking for new messages" notification stays visible while it runs.
 */
class WatchService : Service() {
    companion object {
        private const val PREFS = "chats-watch"
        private const val CH_STATUS = "chats-status"
        private const val CH_MESSAGES = "chats-messages"
        private const val ID_STATUS = 7301
        private const val ID_MESSAGES = 7302
        private const val INTERVAL_MS = 60_000L

        private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

        fun configure(ctx: Context, base: String, token: String, title: String, one: String, many: String, status: String) {
            prefs(ctx).edit()
                .putString("base", base).putString("token", token)
                .putString("title", title).putString("one", one).putString("many", many).putString("status", status)
                .putLong("since", 0).putInt("pending", 0).putBoolean("fg", false)
                .apply()
        }

        fun configured(ctx: Context) = !prefs(ctx).getString("token", null).isNullOrEmpty()

        fun start(ctx: Context) {
            ContextCompat.startForegroundService(ctx, Intent(ctx, WatchService::class.java))
        }

        fun stop(ctx: Context) {
            prefs(ctx).edit().clear().apply()
            ctx.stopService(Intent(ctx, WatchService::class.java))
            NotificationManagerCompat.from(ctx).cancel(ID_MESSAGES)
        }

        fun setForeground(ctx: Context, on: Boolean) {
            prefs(ctx).edit().putBoolean("fg", on).putInt("pending", 0).apply()
            if (on) NotificationManagerCompat.from(ctx).cancel(ID_MESSAGES)
        }
    }

    private val handler = Handler(Looper.getMainLooper())
    private val worker = Executors.newSingleThreadExecutor()
    private val tick = object : Runnable {
        override fun run() {
            worker.execute { poll() }
            handler.postDelayed(this, INTERVAL_MS)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!configured(this)) {
            stopSelf()
            return START_NOT_STICKY
        }
        channels()
        val type = if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING else 0
        ServiceCompat.startForeground(this, ID_STATUS, statusNotification(), type)
        handler.removeCallbacks(tick)
        handler.post(tick)
        return START_STICKY
    }

    override fun onDestroy() {
        handler.removeCallbacks(tick)
        worker.shutdownNow()
        super.onDestroy()
    }

    private fun poll() {
        val p = prefs(this)
        val base = p.getString("base", null) ?: return
        val token = p.getString("token", null) ?: return
        val since = p.getLong("since", 0)
        val conn = try {
            URL(base + "?r=notify/poll&since=" + since).openConnection() as HttpURLConnection
        } catch (e: Exception) {
            return
        }
        try {
            conn.connectTimeout = 15_000
            conn.readTimeout = 15_000
            conn.setRequestProperty("Authorization", "Bearer $token")
            conn.setRequestProperty("Accept", "application/json")
            val code = conn.responseCode
            // Signed out, session ended or account disabled: stop until the app starts the service again.
            if (code == 401 || code == 403) {
                handler.post { stop(this) }
                return
            }
            if (code != 200) return
            val json = JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
            val latest = json.optLong("latest", since)
            val count = json.optInt("count", 0)
            val pending = p.getInt("pending", 0) + count
            p.edit().putLong("since", maxOf(since, latest)).putInt("pending", pending).apply()
            if (count > 0 && !p.getBoolean("fg", false)) notifyMessages(pending)
        } catch (e: Exception) {
            // Offline or server unreachable: try again on the next tick.
        } finally {
            conn.disconnect()
        }
    }

    private fun channels() {
        if (Build.VERSION.SDK_INT < 26) return
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CH_STATUS, "Connection", NotificationManager.IMPORTANCE_MIN))
        nm.createNotificationChannel(NotificationChannel(CH_MESSAGES, "Messages", NotificationManager.IMPORTANCE_HIGH))
    }

    private fun openApp(): PendingIntent? {
        val launch = packageManager.getLaunchIntentForPackage(packageName) ?: return null
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        return PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    private fun statusNotification() = NotificationCompat.Builder(this, CH_STATUS)
        .setSmallIcon(R.drawable.chats_notify)
        .setContentTitle(prefs(this).getString("title", "CHATS"))
        .setContentText(prefs(this).getString("status", "checking for new messages"))
        .setContentIntent(openApp())
        .setOngoing(true)
        .setPriority(NotificationCompat.PRIORITY_MIN)
        .build()

    @SuppressLint("MissingPermission")
    private fun notifyMessages(total: Int) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        val p = prefs(this)
        val text = if (total == 1) p.getString("one", "1 new message")!!
        else p.getString("many", "{n} new messages")!!.replace("{n}", total.toString())
        val n = NotificationCompat.Builder(this, CH_MESSAGES)
            .setSmallIcon(R.drawable.chats_notify)
            .setContentTitle(p.getString("title", "CHATS"))
            .setContentText(text)
            .setNumber(total)
            .setContentIntent(openApp())
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()
        NotificationManagerCompat.from(this).notify(ID_MESSAGES, n)
    }
}

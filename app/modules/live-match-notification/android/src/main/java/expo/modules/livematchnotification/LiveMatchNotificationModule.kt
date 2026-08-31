package expo.modules.livematchnotification

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Ongoing live-match notifications for Android.
 *
 * The server sends FCM *data* messages rather than notification messages, so
 * rendering happens here. That is what makes an in-place update possible: one
 * notification per match, mutated as the score changes, instead of a new
 * notification for every goal.
 */
class LiveMatchNotificationModule : Module() {

  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("LiveMatchNotification")

    Constants(
      // Live Updates — the promoted status-bar chip — arrived in API 36.
      // Below that we still post a rich ongoing notification, just without
      // promotion, and JS may want to tune wording accordingly.
      "supportsLiveUpdates" to (Build.VERSION.SDK_INT >= 36),
      "androidApiLevel" to Build.VERSION.SDK_INT,
    )

    AsyncFunction("ensureChannel") {
      MatchNotificationRenderer.ensureChannel(context)
    }

    Function("canPostNotifications") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
        NotificationManagerCompat.from(context).areNotificationsEnabled()
      } else {
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
          PackageManager.PERMISSION_GRANTED
      }
    }

    /**
     * Post or update the notification for one match.
     *
     * Runs off the JS thread by virtue of being an AsyncFunction, which
     * matters: crest bitmaps are fetched synchronously inside the renderer.
     */
    AsyncFunction("show") { payload: MatchPayload ->
      if (payload.matchId.isBlank()) {
        throw IllegalArgumentException("matchId is required")
      }
      MatchNotificationRenderer.ensureChannel(context)

      val manager = NotificationManagerCompat.from(context)
      if (!manager.areNotificationsEnabled()) return@AsyncFunction false

      return@AsyncFunction try {
        val notification = MatchNotificationRenderer.build(context, payload)
        manager.notify(MatchNotificationRenderer.notificationId(payload.matchId), notification)
        true
      } catch (e: SecurityException) {
        // POST_NOTIFICATIONS revoked between the check and the notify.
        false
      }
    }

    AsyncFunction("dismiss") { matchId: String ->
      MatchNotificationRenderer.cancel(context, matchId)
    }

    AsyncFunction("dismissAll") {
      NotificationManagerCompat.from(context).cancelAll()
      CrestCache.trim()
    }
  }
}

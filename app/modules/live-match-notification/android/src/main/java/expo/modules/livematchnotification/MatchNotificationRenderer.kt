package expo.modules.livematchnotification

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * Renders one live match as a single, mutating notification.
 *
 * Two paths:
 *
 *  - **API 36+** uses the platform `Notification.ProgressStyle`, which is what
 *    Android calls a Live Update. The match clock drives the progress bar, the
 *    two halves are segments, goals are points along the bar, and the score is
 *    the short critical text that shows in the status-bar chip. This is the
 *    version that behaves like an iOS Live Activity.
 *
 *  - **API 24-35** uses custom RemoteViews: crests, names, score, minute.
 *
 * Both share the important behaviour: a stable notification id per match, so
 * a goal *updates* the existing notification rather than stacking a new one,
 * and `setOnlyAlertOnce` so a 4-3 thriller buzzes on goals but not on every
 * minute tick.
 */
internal object MatchNotificationRenderer {

  const val CHANNEL_ID = "live-match"
  private const val CHANNEL_NAME = "Live match updates"

  /** Full time plus stoppage. Progress is clamped to this. */
  private const val FULL_MATCH_MINUTES = 90
  private const val HALF_MINUTES = 45

  private val ACCENT = Color.parseColor("#C94038")
  private val GOAL_MARKER = Color.parseColor("#2FBF31")
  private val TRACK_PLAYED = Color.parseColor("#8E8D94")
  private val TRACK_REMAINING = Color.parseColor("#3A383F")

  fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return

    val channel = NotificationChannel(
      CHANNEL_ID,
      CHANNEL_NAME,
      // HIGH so a goal can surface; individual updates still post silently by
      // setting onlyAlertOnce and omitting sound.
      NotificationManager.IMPORTANCE_HIGH,
    ).apply {
      description = "Scores and goals for matches you follow"
      enableVibration(true)
      vibrationPattern = longArrayOf(0, 200)
      setShowBadge(false)
    }
    manager.createNotificationChannel(channel)
  }

  /** Stable per match so updates replace rather than accumulate. */
  fun notificationId(matchId: String): Int = matchId.hashCode()

  fun build(context: Context, p: MatchPayload): Notification {
    return if (Build.VERSION.SDK_INT >= 36) buildLiveUpdate(context, p)
    else buildCustomView(context, p)
  }

  /* ------------------------------------------------------- API 36+ path */

  private fun buildLiveUpdate(context: Context, p: MatchPayload): Notification {
    val minute = (p.minute ?: 0).coerceIn(0, FULL_MATCH_MINUTES)

    val style = Notification.ProgressStyle()
      .setProgress(minute)
      // Two segments so the half-time split is visible on the bar.
      .setProgressSegments(
        listOf(
          Notification.ProgressStyle.Segment(HALF_MINUTES).setColor(TRACK_PLAYED),
          Notification.ProgressStyle.Segment(HALF_MINUTES).setColor(TRACK_REMAINING),
        )
      )
      .setStyledByProgress(true)

    // A marker on the bar at each goal — the timeline of the match at a glance.
    p.goalMinutes
      .filter { it in 0..FULL_MATCH_MINUTES }
      .forEach { m ->
        style.addProgressPoint(
          Notification.ProgressStyle.Point(m).setColor(GOAL_MARKER)
        )
      }

    val score = "${p.homeScore}-${p.awayScore}"

    val builder = Notification.Builder(context, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_live_match)
      .setContentTitle("${p.homeShort} $score ${p.awayShort}")
      .setContentText(matchSubtitle(p))
      .setStyle(style)
      .setColor(ACCENT)
      .setColorized(true)
      .setOngoing(p.ongoing)
      .setOnlyAlertOnce(!p.alert)
      .setWhen(System.currentTimeMillis())
      .setShowWhen(false)
      // What appears in the status-bar chip. Keep it to the score: there is
      // room for very little, and the score is the only thing that matters.
      .setShortCriticalText(score)
      .setContentIntent(openIntent(context, p))

    if (!p.alert) {
      // The platform builder has no `setSilent`. On API 26+ the channel owns
      // sound and vibration and `setOnlyAlertOnce` above is what stops an
      // update re-alerting; clearing both here covers the older path and is
      // harmless on newer ones.
      builder.setSound(null)
      builder.setVibrate(null)
    }

    return builder.build()
  }

  /* ---------------------------------------------------- API 24-35 path */

  private fun buildCustomView(context: Context, p: MatchPayload): Notification {
    val collapsed = remoteViews(context, p, R.layout.live_match_collapsed)
    val expanded = remoteViews(context, p, R.layout.live_match_expanded)

    return NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_live_match)
      .setStyle(NotificationCompat.DecoratedCustomViewStyle())
      .setCustomContentView(collapsed)
      .setCustomBigContentView(expanded)
      .setColor(ACCENT)
      .setOngoing(p.ongoing)
      .setOnlyAlertOnce(!p.alert)
      .setSilent(!p.alert)
      .setPriority(
        if (p.alert) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_LOW
      )
      .setCategory(NotificationCompat.CATEGORY_EVENT)
      .setShowWhen(false)
      .setContentIntent(openIntent(context, p))
      // Content is a live score, so it is safe on a locked screen and useful
      // there — that is most of the point.
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .build()
  }

  private fun remoteViews(context: Context, p: MatchPayload, layout: Int): RemoteViews {
    val views = RemoteViews(context.packageName, layout)

    // `league` exists only in the expanded layout; setting a missing id on a
    // RemoteViews is a no-op, so both layouts can share this one path.
    views.setTextViewText(R.id.league, p.leagueName)
    views.setTextViewText(R.id.status, matchSubtitle(p))
    views.setTextViewText(R.id.home_name, p.homeName)
    views.setTextViewText(R.id.away_name, p.awayName)
    views.setTextViewText(R.id.home_score, p.homeScore.toString())
    views.setTextViewText(R.id.away_score, p.awayScore.toString())

    // Already off the main thread — see LiveMatchNotificationModule.
    val size = context.resources.getDimensionPixelSize(R.dimen.crest_size)
    CrestCache.get(p.homeCrest, size)?.let { views.setImageViewBitmap(R.id.home_crest, it) }
    CrestCache.get(p.awayCrest, size)?.let { views.setImageViewBitmap(R.id.away_crest, it) }

    return views
  }

  /* ------------------------------------------------------------ shared */

  private fun matchSubtitle(p: MatchPayload): String = when (p.state) {
    "live" -> p.minute?.let { "$it'  ·  ${p.leagueName}" } ?: "LIVE  ·  ${p.leagueName}"
    "halftime" -> "Half time  ·  ${p.leagueName}"
    "finished" -> "Full time  ·  ${p.leagueName}"
    else -> if (p.statusLabel.isNotBlank()) "${p.statusLabel}  ·  ${p.leagueName}" else p.leagueName
  }

  private fun openIntent(context: Context, p: MatchPayload): PendingIntent? {
    val link = p.deepLink ?: "livescorex://match/${Uri.encode(p.matchId)}"
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(link)).apply {
      setPackage(context.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    // Fall back to a plain launch if nothing handles the deep link, so tapping
    // is never a no-op.
    val resolved =
      if (intent.resolveActivity(context.packageManager) != null) intent
      else context.packageManager.getLaunchIntentForPackage(context.packageName)
        ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        ?: return null

    return PendingIntent.getActivity(
      context,
      notificationId(p.matchId),
      resolved,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  fun cancel(context: Context, matchId: String) {
    NotificationManagerCompat.from(context).cancel(notificationId(matchId))
  }
}

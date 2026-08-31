package expo.modules.livematchnotification

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.LruCache
import java.net.HttpURLConnection
import java.net.URL

/**
 * Tiny bitmap cache for team crests.
 *
 * Notifications are rebuilt on every score change and every minute tick, so
 * re-downloading two PNGs each time would be both slow and rude to the CDN.
 * Crests are small and few, so a modest in-memory LRU covers a whole matchday.
 *
 * A miss is not an error: many smaller leagues publish no crest at all, and
 * the notification layout falls back to the team's short name.
 */
internal object CrestCache {
  private const val MAX_ENTRIES = 64
  private const val TIMEOUT_MS = 4_000

  private val cache = object : LruCache<String, Bitmap>(MAX_ENTRIES) {}
  private val failed = mutableSetOf<String>()

  /** Blocking. Callers must already be off the main thread. */
  fun get(url: String?, sizePx: Int): Bitmap? {
    if (url.isNullOrBlank()) return null
    val key = "$url@$sizePx"
    cache.get(key)?.let { return it }
    synchronized(failed) { if (failed.contains(key)) return null }

    return try {
      val conn = (URL(url).openConnection() as HttpURLConnection).apply {
        connectTimeout = TIMEOUT_MS
        readTimeout = TIMEOUT_MS
        // ESPN's edge rejects User-Agents containing a parenthetical, so this
        // stays a bare product token — see the server's http util.
        setRequestProperty("User-Agent", "LivescoreX/0.1")
        instanceFollowRedirects = true
      }
      conn.inputStream.use { stream ->
        val raw = BitmapFactory.decodeStream(stream)
        if (raw == null) {
          synchronized(failed) { failed.add(key) }
          null
        } else {
          val scaled = Bitmap.createScaledBitmap(raw, sizePx, sizePx, true)
          if (scaled !== raw) raw.recycle()
          cache.put(key, scaled)
          scaled
        }
      }
    } catch (e: Exception) {
      synchronized(failed) { failed.add(key) }
      null
    }
  }

  /** Called when a match ends — its crests are unlikely to be needed again. */
  fun trim() {
    cache.evictAll()
    synchronized(failed) { failed.clear() }
  }
}

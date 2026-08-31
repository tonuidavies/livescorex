package expo.modules.livematchnotification

import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/**
 * One live match, as the JS layer describes it. Mirrors the `data` block the
 * server puts on the FCM message.
 */
class MatchPayload : Record {
  @Field var matchId: String = ""
  @Field var leagueName: String = ""

  @Field var homeName: String = ""
  @Field var awayName: String = ""
  @Field var homeShort: String = ""
  @Field var awayShort: String = ""
  @Field var homeCrest: String? = null
  @Field var awayCrest: String? = null

  @Field var homeScore: Int = 0
  @Field var awayScore: Int = 0

  /** Null before kickoff and at half time. */
  @Field var minute: Int? = null
  @Field var statusLabel: String = ""
  @Field var state: String = "scheduled"

  /** Minutes at which goals were scored — drawn as markers on the API 36+
   *  progress bar. Empty is fine. */
  @Field var goalMinutes: List<Int> = emptyList()

  /** Keep it pinned and undismissable while the match is in play. */
  @Field var ongoing: Boolean = true

  /** True only for goals and period changes. Everything else updates silently. */
  @Field var alert: Boolean = false

  /** Deep link opened when the notification is tapped. */
  @Field var deepLink: String? = null
}

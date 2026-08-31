export interface MatchNotificationPayload {
  matchId: string;
  leagueName: string;

  homeName: string;
  awayName: string;
  homeShort: string;
  awayShort: string;
  homeCrest?: string | null;
  awayCrest?: string | null;

  homeScore: number;
  awayScore: number;

  /** Null before kickoff and at half time. */
  minute?: number | null;
  statusLabel: string;
  state: 'scheduled' | 'live' | 'halftime' | 'finished' | 'postponed' | 'cancelled' | 'unknown';

  /** Minutes at which goals were scored; drawn as markers on the API 36+
   *  progress bar. Safe to omit. */
  goalMinutes?: number[];

  /** Pin it to the shade while the match is in play. */
  ongoing: boolean;

  /** True only for goals and period changes — everything else updates silently. */
  alert: boolean;

  deepLink?: string | null;
}

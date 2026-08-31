import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { usePrefs } from '../store/prefs';
import { API_URL } from '../api/client';

/**
 * Notification setup.
 *
 * Scope of what is here: permission, the Android channel, and registering the
 * device token with the server. The server sends **FCM data messages**, not
 * notification messages, so the app renders the notification itself — that is
 * what allows a score to update a notification in place rather than stacking a
 * new one on every goal.
 *
 * Two things deliberately not here, both requiring native code:
 *
 *   1. Android ongoing "Live Update" notification — a custom RemoteViews layout
 *      with crests and the score, `setOngoing(true)` and `setOnlyAlertOnce(true)`
 *      so stat changes update silently. On API 36+ this becomes
 *      `Notification.ProgressStyle` and gets promoted to the status-bar chip.
 *      Needs a small native module; this is the highest-value notification work
 *      for an Android-first market.
 *
 *   2. iOS Live Activity / Dynamic Island — a SwiftUI Widget Extension, added
 *      through `expo-apple-targets`, updated by APNs pushes with
 *      `apns-push-type: liveactivity`.
 *
 * See README "Notification roadmap".
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,   // a goal alert that buzzes every minute gets muted
    shouldSetBadge: false,
  }),
});

export function useNotifications() {
  const { prefs } = usePrefs();
  const registered = useRef<string | null>(null);

  useEffect(() => {
    if (!prefs.notifications) return;
    let cancelled = false;

    (async () => {
      try {
        if (Platform.OS === 'android') {
          // A dedicated channel so users can silence match alerts without
          // silencing the app entirely.
          await Notifications.setNotificationChannelAsync('match-updates', {
            name: 'Match updates',
            importance: Notifications.AndroidImportance.HIGH,
            lightColor: '#C94038',
            vibrationPattern: [0, 200],
            showBadge: false,
          });
        }

        const existing = await Notifications.getPermissionsAsync();
        let status = existing.status;
        if (status !== 'granted') {
          status = (await Notifications.requestPermissionsAsync()).status;
        }
        if (status !== 'granted' || cancelled) return;

        const token = (await Notifications.getDevicePushTokenAsync()).data;
        if (cancelled || registered.current === token) return;
        registered.current = token;

        // Registration is best-effort: alerts are a bonus, and a failure here
        // must never surface as an error in a scores app.
        await fetch(`${API_URL}/v1/devices`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token,
            platform: Platform.OS,
            teams: prefs.teams,
            leagues: prefs.leagues,
          }),
        }).catch(() => {});
      } catch {
        // Simulators and permission-less environments land here. Ignore.
      }
    })();

    return () => { cancelled = true; };
  }, [prefs.notifications, prefs.teams, prefs.leagues]);
}

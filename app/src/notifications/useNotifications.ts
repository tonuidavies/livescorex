import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as LiveMatch from '../../modules/live-match-notification';
import { usePrefs } from '../store/prefs';
import { API_URL } from '../api/client';
import { handleMessage } from './matchNotifications';
import { registerBackgroundTask, unregisterBackgroundTask } from './backgroundTask';

/**
 * Notification lifecycle.
 *
 * The server sends FCM **data** messages, not notification messages, so
 * nothing is rendered until this code renders it. That is deliberate: it is
 * the only way to update one notification in place as a match unfolds rather
 * than stacking a new one on every goal.
 *
 * The native rendering lives in `modules/live-match-notification`.
 * iOS still needs a Live Activity Widget Extension — see README.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    // Our own ongoing notification is the presentation. Letting the default
    // handler also draw a banner would show the same goal twice.
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export function useNotifications() {
  const { prefs } = usePrefs();
  const registeredToken = useRef<string | null>(null);

  /* ---------------------------------------------- permission + token ---- */
  useEffect(() => {
    if (!prefs.notifications) {
      void unregisterBackgroundTask();
      void LiveMatch.dismissAll().catch(() => {});
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        await LiveMatch.ensureChannel();

        const existing = await Notifications.getPermissionsAsync();
        let status = existing.status;
        if (status !== 'granted') {
          status = (await Notifications.requestPermissionsAsync()).status;
        }
        if (status !== 'granted' || cancelled) return;

        await registerBackgroundTask();

        const token = (await Notifications.getDevicePushTokenAsync()).data;
        if (cancelled || typeof token !== 'string') return;

        // Re-register whenever the subscription set changes, not just on a new
        // token — the server fans out by team and league, so a stale list means
        // alerts for teams the user just unfollowed.
        const signature = `${token}|${prefs.teams.join(',')}|${prefs.leagues.join(',')}`;
        if (registeredToken.current === signature) return;
        registeredToken.current = signature;

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
        // Simulators, Expo Go, and permission-less environments land here.
      }
    })();

    return () => { cancelled = true; };
  }, [prefs.notifications, prefs.teams, prefs.leagues]);

  /* ------------------------------------------------- foreground messages */
  useEffect(() => {
    if (!prefs.notifications) return;

    // Foreground data messages do not go through the background task, so the
    // same handler is wired to the received listener as well.
    const sub = Notifications.addNotificationReceivedListener(notification => {
      void handleMessage(notification.request.content.data).catch(() => {});
    });

    return () => sub.remove();
  }, [prefs.notifications]);
}

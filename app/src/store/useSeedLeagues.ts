import { useEffect } from 'react';
import { api } from '../api/client';
import { usePrefs } from './prefs';

/**
 * Apply the starter set of leagues once, on first run.
 *
 * This used to live in the onboarding screen, which meant any route that
 * bypassed onboarding — a notification deep link, or a restored session —
 * left the app with zero followed leagues and a permanently empty Matches
 * tab. Seeding belongs at the root, where every entry path passes through.
 *
 * `seeded` is tracked separately from `onboarded` so that deliberately
 * unfollowing everything is respected rather than silently undone.
 */
export function useSeedLeagues(): void {
  const { prefs, ready, set } = usePrefs();

  useEffect(() => {
    if (!ready || prefs.seeded || prefs.leagues.length > 0) return;
    let cancelled = false;

    api.leagues()
      .then(r => {
        if (cancelled) return;
        set({ leagues: r.defaults, seeded: true });
      })
      .catch(() => {
        // Offline first run: leave it unseeded so the next launch retries,
        // rather than marking it done with nothing applied.
      });

    return () => { cancelled = true; };
  }, [ready, prefs.seeded, prefs.leagues.length, set]);
}

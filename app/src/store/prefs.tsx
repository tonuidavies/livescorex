import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setApiUrl } from '../api/client';

export type ThemePref = 'system' | 'light' | 'dark';

export interface Prefs {
  onboarded: boolean;
  theme: ThemePref;
  notifications: boolean;
  /** League slugs the user follows. Drives both the Matches list and the
   *  WebSocket subscription, so it is the single most important preference. */
  leagues: string[];
  /** Canonical team ids. */
  teams: string[];
  /** Match ids starred individually. */
  matches: string[];
  /** Present only once the user opts into cross-device sync. Favourites work
   *  fully without it — see README on why auth is not a gate. */
  account: { id: string; name: string; email: string } | null;

  /** Overrides the build-time API origin. Lets an installed APK follow a dev
   *  machine to a new LAN address without a rebuild. */
  apiUrl: string | null;

  /** Whether the starter set of leagues has ever been applied. Separate from
   *  `onboarded` so that clearing your leagues on purpose is respected. */
  seeded: boolean;

  /**
   * Which sport the Matches and Live tabs are showing.
   *
   * Not a filter within one list — a scope. Football and basketball fixtures
   * interleaved in one column is nobody's idea of a scores app, so the drawer
   * switches between them.
   */
  sport: string;
}

const DEFAULTS: Prefs = {
  onboarded: false,
  theme: 'dark',
  notifications: true,
  leagues: [],
  teams: [],
  matches: [],
  account: null,
  apiUrl: null,
  seeded: false,
  sport: 'soccer',
};

const KEY = 'livescorex.prefs.v1';

interface Ctx {
  prefs: Prefs;
  ready: boolean;
  set: (patch: Partial<Prefs>) => void;
  toggleLeague: (slug: string) => void;
  toggleTeam: (id: string) => void;
  toggleMatch: (id: string) => void;
  isLeague: (slug: string) => boolean;
  isTeam: (id: string) => boolean;
  isMatch: (id: string) => boolean;
  reset: () => void;
}

const PrefsCtx = createContext<Ctx | null>(null);

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (!cancelled && raw) {
          const loaded = { ...DEFAULTS, ...(JSON.parse(raw) as Prefs) };
          // Apply before the first render so no request goes to the default.
          setApiUrl(loaded.apiUrl);
          setPrefs(loaded);
        }
      } catch {
        // Corrupt or unreadable prefs must not block the app — defaults are fine.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const persist = useCallback((next: Prefs) => {
    setPrefs(next);
    void AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const set = useCallback((patch: Partial<Prefs>) => {
    if ('apiUrl' in patch) setApiUrl(patch.apiUrl ?? null);
    setPrefs(prev => {
      const next = { ...prev, ...patch };
      void AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const toggleIn = useCallback((field: 'leagues' | 'teams' | 'matches', value: string) => {
    setPrefs(prev => {
      const list = prev[field];
      const next = {
        ...prev,
        [field]: list.includes(value) ? list.filter(v => v !== value) : [...list, value],
      };
      void AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo<Ctx>(() => ({
    prefs,
    ready,
    set,
    toggleLeague: (s: string) => toggleIn('leagues', s),
    toggleTeam: (id: string) => toggleIn('teams', id),
    toggleMatch: (id: string) => toggleIn('matches', id),
    isLeague: (s: string) => prefs.leagues.includes(s),
    isTeam: (id: string) => prefs.teams.includes(id),
    isMatch: (id: string) => prefs.matches.includes(id),
    reset: () => persist(DEFAULTS),
  }), [prefs, ready, set, toggleIn, persist]);

  return <PrefsCtx.Provider value={value}>{children}</PrefsCtx.Provider>;
}

export function usePrefs(): Ctx {
  const ctx = useContext(PrefsCtx);
  if (!ctx) throw new Error('usePrefs must be used inside PrefsProvider');
  return ctx;
}

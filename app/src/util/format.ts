import type { Match } from '../api/types';
import { displayMinute } from './useMatchClock';

export const pad2 = (n: number) => String(n).padStart(2, '0');

/** Kickoff time in the device's own timezone. */
export function kickoffTime(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function dayKeyLocal(d: Date): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

/** The server keys days in UTC; the strip is built in local time. Close enough
 *  everywhere, and exactly right for East Africa where UTC+3 never crosses a
 *  date boundary during normal kickoff hours. */
export function dayKeyUTC(d: Date): string {
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`;
}

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function stripLabel(d: Date, today: Date) {
  const isToday = d.toDateString() === today.toDateString();
  return {
    top: WEEKDAYS[d.getDay()] ?? '',
    bottom: isToday ? 'TODAY' : `${MONTHS[d.getMonth()]} ${d.getDate()}`,
    isToday,
  };
}

export function longDate(ms: number): string {
  const d = new Date(ms);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return `${days[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} at ${kickoffTime(ms)}`;
}

export const isLive = (m: Match) => m.state === 'live' || m.state === 'halftime';
export const isPlayed = (m: Match) => m.state === 'finished';

/** What goes in the left-hand cell of a match row. `now` drives the
 *  interpolated clock; pass Date.now() when you have no ticker. */
export function statusCell(
  m: Match,
  now: number = Date.now(),
): { text: string; tone: 'live' | 'muted' | 'normal' } {
  if (m.state === 'live') {
    const mm = displayMinute(m, now);
    return { text: mm !== null ? `${mm}'` : 'LIVE', tone: 'live' };
  }
  if (m.state === 'halftime') return { text: 'HT', tone: 'live' };
  if (m.state === 'finished') return { text: 'FT', tone: 'muted' };
  if (m.state === 'postponed') return { text: 'PP', tone: 'muted' };
  if (m.state === 'cancelled') return { text: 'CAN', tone: 'muted' };
  return { text: kickoffTime(m.kickoff), tone: 'normal' };
}

/** "updated 2m ago" for the staleness affordance. Never show a spinner over
 *  data you already have — that is what makes an app feel broken. */
export function agoLabel(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('');
}

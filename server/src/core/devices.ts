import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from '../config.js';

export interface Device {
  token: string;
  platform: 'ios' | 'android' | string;
  teams: string[];
  leagues: string[];
  updatedAt: number;
}

const PATH = join(process.env.SNAPSHOT_DIR ?? join(DATA_DIR, '..'), 'devices.json');

/**
 * Push registration.
 *
 * Keyed by device token, not by user — an account is not required to receive
 * alerts, which is what lets onboarding skip the sign-in gate entirely. When
 * accounts land, add an optional accountId here for cross-device fan-out.
 */
class DeviceRegistry {
  private byToken = new Map<string, Device>();

  constructor() {
    try {
      const raw = JSON.parse(readFileSync(PATH, 'utf8')) as Device[];
      for (const d of raw) this.byToken.set(d.token, d);
      console.log(`[devices] restored ${this.byToken.size} registrations`);
    } catch { /* first run */ }
  }

  upsert(d: Omit<Device, 'updatedAt'>): void {
    this.byToken.set(d.token, { ...d, updatedAt: Date.now() });
    this.save();
  }

  remove(token: string): void {
    if (this.byToken.delete(token)) this.save();
  }

  /** Everyone who asked to hear about this team or league. */
  subscribersFor(teamIds: string[], leagueSlug: string): Device[] {
    const teams = new Set(teamIds);
    const out: Device[] = [];
    for (const d of this.byToken.values()) {
      if (d.teams.some(t => teams.has(t)) || d.leagues.includes(leagueSlug)) out.push(d);
    }
    return out;
  }

  count(): number { return this.byToken.size; }

  private save(): void {
    try {
      const tmp = `${PATH}.tmp`;
      writeFileSync(tmp, JSON.stringify([...this.byToken.values()]));
      renameSync(tmp, PATH);
    } catch (e) {
      console.warn('[devices] save failed', e);
    }
  }
}

export const devices = new DeviceRegistry();

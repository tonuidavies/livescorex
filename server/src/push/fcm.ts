import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * Minimal FCM HTTP v1 client.
 *
 * Deliberately not using firebase-admin: it pulls ~40 transitive dependencies
 * to do what is, at bottom, a signed JWT exchanged for an access token and one
 * POST per device. This is the whole protocol.
 *
 * Credentials come from a service-account JSON — set GOOGLE_APPLICATION_CREDENTIALS
 * to its path. Without it the sender degrades to logging, so the rest of the
 * system runs unchanged in development.
 */

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

export interface FcmDataMessage {
  token: string;
  /** FCM data payloads are string-to-string; everything is serialised. */
  data: Record<string, string>;
  /** 'high' wakes the device for a data message. Goals need it; a minute tick
   *  does not, and sending everything high drains batteries and gets the app
   *  throttled by Android's own heuristics. */
  priority: 'high' | 'normal';
  /** Collapse key: a newer update for the same match supersedes an
   *  undelivered older one instead of queueing behind it. */
  collapseKey?: string;
  /** Seconds FCM should keep trying. A score update is worthless in an hour. */
  ttlSeconds?: number;
}

export class FcmClient {
  private account: ServiceAccount | null = null;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    if (!credentialsPath) {
      console.warn('[fcm] no GOOGLE_APPLICATION_CREDENTIALS — push disabled, will log instead');
      return;
    }
    try {
      this.account = JSON.parse(readFileSync(credentialsPath, 'utf8')) as ServiceAccount;
      console.log(`[fcm] credentials loaded for project ${this.account.project_id}`);
    } catch (e) {
      console.error('[fcm] could not read service account, push disabled:', e);
    }
  }

  get enabled(): boolean {
    return this.account !== null;
  }

  private async accessToken(): Promise<string | null> {
    if (!this.account) return null;
    // Refresh a minute early rather than racing the expiry.
    if (this.token && Date.now() < this.token.expiresAt - 60_000) return this.token.value;

    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const claims = {
      iss: this.account.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    };

    const b64 = (o: unknown) =>
      Buffer.from(JSON.stringify(o)).toString('base64url');
    const unsigned = `${b64(header)}.${b64(claims)}`;

    const signer = createSign('RSA-SHA256');
    signer.update(unsigned);
    const signature = signer.sign(this.account.private_key, 'base64url');
    const jwt = `${unsigned}.${signature}`;

    try {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: jwt,
        }),
      });
      if (!res.ok) {
        console.error('[fcm] token exchange failed', res.status, await res.text());
        return null;
      }
      const body = (await res.json()) as { access_token: string; expires_in: number };
      this.token = {
        value: body.access_token,
        expiresAt: Date.now() + body.expires_in * 1000,
      };
      return this.token.value;
    } catch (e) {
      console.error('[fcm] token exchange threw', e);
      return null;
    }
  }

  /**
   * Send one data message.
   *
   * Returns 'gone' when FCM reports the token is dead, so the caller can prune
   * the registry — stale tokens otherwise accumulate forever and every send
   * pays for them.
   */
  async send(msg: FcmDataMessage): Promise<'ok' | 'gone' | 'failed'> {
    if (!this.account) {
      console.log(`[fcm:dry] ${msg.priority} -> ${msg.token.slice(0, 12)}…`, msg.data);
      return 'ok';
    }

    const token = await this.accessToken();
    if (!token) return 'failed';

    const body = {
      message: {
        token: msg.token,
        // Data-only: no `notification` block, so the app renders it and can
        // update an existing notification in place instead of stacking a new
        // one for every goal.
        data: msg.data,
        android: {
          priority: msg.priority === 'high' ? 'HIGH' : 'NORMAL',
          ttl: `${msg.ttlSeconds ?? 900}s`,
          ...(msg.collapseKey ? { collapse_key: msg.collapseKey } : {}),
        },
        apns: {
          headers: {
            'apns-push-type': 'background',
            'apns-priority': msg.priority === 'high' ? '10' : '5',
          },
          payload: { aps: { 'content-available': 1 } },
        },
      },
    };

    try {
      const res = await fetch(
        `https://fcm.googleapis.com/v1/projects/${this.account.project_id}/messages:send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      );
      if (res.ok) return 'ok';

      const text = await res.text();
      // UNREGISTERED / INVALID_ARGUMENT on the token means it will never work.
      if (res.status === 404 || (res.status === 400 && text.includes('UNREGISTERED'))) {
        return 'gone';
      }
      console.warn('[fcm] send failed', res.status, text.slice(0, 200));
      return 'failed';
    } catch (e) {
      console.warn('[fcm] send threw', e);
      return 'failed';
    }
  }
}

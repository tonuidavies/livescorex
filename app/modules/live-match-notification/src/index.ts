import { requireNativeModule } from 'expo';
import { Platform } from 'react-native';
import type { MatchNotificationPayload } from './LiveMatchNotification.types';

export type { MatchNotificationPayload };

interface NativeModule {
  readonly supportsLiveUpdates: boolean;
  readonly androidApiLevel: number;
  ensureChannel(): Promise<void>;
  canPostNotifications(): boolean;
  show(payload: MatchNotificationPayload): Promise<boolean>;
  dismiss(matchId: string): Promise<void>;
  dismissAll(): Promise<void>;
}

/**
 * Android-only. iOS gets the same job done by a Live Activity, which is a
 * separate Widget Extension target rather than a notification — so rather than
 * pretend, this is a documented no-op off Android and callers check
 * `isAvailable`.
 */
const native: NativeModule | null =
  Platform.OS === 'android'
    ? (() => {
        try {
          return requireNativeModule<NativeModule>('LiveMatchNotification');
        } catch {
          // Expo Go, or a dev client built before this module existed.
          return null;
        }
      })()
    : null;

export const isAvailable = native !== null;

/** True on API 36+, where the notification is promoted to the status-bar chip. */
export const supportsLiveUpdates = native?.supportsLiveUpdates ?? false;

export const androidApiLevel = native?.androidApiLevel ?? 0;

export async function ensureChannel(): Promise<void> {
  await native?.ensureChannel();
}

export function canPostNotifications(): boolean {
  return native?.canPostNotifications() ?? false;
}

/** Post or update the notification for one match. Resolves false if blocked. */
export async function show(payload: MatchNotificationPayload): Promise<boolean> {
  if (!native) return false;
  return native.show(payload);
}

export async function dismiss(matchId: string): Promise<void> {
  await native?.dismiss(matchId);
}

export async function dismissAll(): Promise<void> {
  await native?.dismissAll();
}

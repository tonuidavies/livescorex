import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { handleMessage } from './matchNotifications';

export const BACKGROUND_TASK = 'LSX_MATCH_UPDATE';

/**
 * Receives FCM data messages while the app is backgrounded or killed.
 *
 * This must be defined at module scope, not inside a component — the task is
 * registered with the native runtime and can fire into a fresh JS context with
 * no React tree at all.
 */
TaskManager.defineTask<unknown>(BACKGROUND_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('[lsx] background notification task error', error);
    return;
  }
  try {
    await handleMessage(data);
  } catch (e) {
    // Throwing here can get the task deprioritised by the OS. Swallow it.
    console.warn('[lsx] background notification handler failed', e);
  }
});

export async function registerBackgroundTask(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK)) return;
    await Notifications.registerTaskAsync(BACKGROUND_TASK);
  } catch (e) {
    // Expo Go has no FCM registration; alerts are a bonus and must never
    // surface as an error in a scores app.
    console.warn('[lsx] could not register background notification task', e);
  }
}

export async function unregisterBackgroundTask(): Promise<void> {
  try {
    if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK)) {
      await Notifications.unregisterTaskAsync(BACKGROUND_TASK);
    }
  } catch { /* nothing to undo */ }
}

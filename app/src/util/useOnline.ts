import { useEffect, useState } from 'react';
import * as Network from 'expo-network';
import { AppState } from 'react-native';

/**
 * Device connectivity.
 *
 * Distinct from the WebSocket state: the socket can be down while the network
 * is fine (server restart), and the network can be down while a stale socket
 * has not yet noticed. The banner wording differs for each, so both are
 * tracked and the UI says which is actually true.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const state = await Network.getNetworkStateAsync();
        if (!cancelled) {
          setOnline(Boolean(state.isConnected) && state.isInternetReachable !== false);
        }
      } catch {
        // Platforms without the API report as online rather than falsely
        // claiming an outage.
        if (!cancelled) setOnline(true);
      }
    };

    void check();
    const timer = setInterval(check, 8_000);
    const sub = AppState.addEventListener('change', s => { if (s === 'active') void check(); });

    return () => { cancelled = true; clearInterval(timer); sub.remove(); };
  }, []);

  return online;
}

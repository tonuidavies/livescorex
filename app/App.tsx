import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SystemUI from 'expo-system-ui';
import { useFonts } from 'expo-font';
import {
  Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
} from '@expo-google-fonts/inter';
import { PrefsProvider } from './src/store/prefs';
import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';
import { Navigation } from './src/navigation';
import { useNotifications } from './src/notifications/useNotifications';

function Shell() {
  const { colors, name } = useTheme();

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});
  }, [colors.bg]);

  useNotifications();

  return (
    <>
      <StatusBar style={name === 'dark' ? 'light' : 'dark'} />
      <Navigation />
    </>
  );
}

export default function App() {
  const [loaded] = useFonts({
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
  });

  // Render nothing rather than flashing system fonts — the layout metrics
  // shift noticeably between the fallback and Inter.
  if (!loaded) return null;

  return (
    <SafeAreaProvider>
      <PrefsProvider>
        <ThemeProvider>
          <Shell />
        </ThemeProvider>
      </PrefsProvider>
    </SafeAreaProvider>
  );
}

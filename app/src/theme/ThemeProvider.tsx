import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { palettes, type Palette, type ThemeName } from './index';
import { usePrefs } from '../store/prefs';

interface Ctx { colors: Palette; name: ThemeName }
const ThemeCtx = createContext<Ctx>({ colors: palettes.dark, name: 'dark' });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { prefs } = usePrefs();
  const system = useColorScheme();

  const name: ThemeName = useMemo(() => {
    if (prefs.theme === 'system') return system === 'light' ? 'light' : 'dark';
    return prefs.theme;
  }, [prefs.theme, system]);

  const value = useMemo(() => ({ colors: palettes[name], name }), [name]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);

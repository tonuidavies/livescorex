import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, type as t } from '../theme';
import { usePrefs } from '../store/prefs';
import { api } from '../api/client';

/**
 * Names the sport currently in scope, and offers the way back.
 *
 * Only shown when it is not football. Switching sport from a drawer is easy to
 * do and easy to forget having done — without this, an empty Tuesday of NCAA
 * water polo looks like a broken football app rather than a different sport.
 */
export function SportBanner({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { colors } = useTheme();
  const { prefs, set } = usePrefs();
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (prefs.sport === 'soccer') { setLabel(null); return; }
    let cancelled = false;
    api.sports()
      .then(r => {
        if (cancelled) return;
        setLabel(r.sports.find(s => s.sport === prefs.sport)?.name ?? prefs.sport);
      })
      .catch(() => { if (!cancelled) setLabel(prefs.sport); });
    return () => { cancelled = true; };
  }, [prefs.sport]);

  if (prefs.sport === 'soccer' || !label) return null;

  return (
    <View style={[styles.bar, { backgroundColor: colors.accent }]}>
      <Pressable
        onPress={onOpenMenu}
        style={styles.left}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Showing ${label}. Open the menu to change sport.`}
      >
        <Ionicons name="swap-horizontal" size={15} color={colors.onAccent} />
        <Text style={[t.label, { color: colors.onAccent }]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => set({ sport: 'soccer' })}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Back to football"
      >
        <Text style={[t.caption, { color: colors.onAccent }]}>Back to Football</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: space.md, marginTop: space.sm,
    paddingHorizontal: space.md, paddingVertical: space.sm,
    borderRadius: radius.md, gap: space.md,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
});

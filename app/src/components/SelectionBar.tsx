import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { space, type as t, font } from '../theme';

/**
 * Shown while the list is in multi-select.
 *
 * Long-pressing any row enters this mode; after that a single tap anywhere on
 * a row toggles its star, so following a full matchday is a run of taps rather
 * than hunting for a small target on each row.
 */
export function SelectionBar({ count, onDone }: { count: number; onDone: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.bar, { backgroundColor: colors.accent }]}>
      <Ionicons name="star" size={16} color={colors.onAccent} />
      <Text style={[t.bodyMed, { color: colors.onAccent, flex: 1 }]}>
        {count === 0
          ? 'Tap matches to follow them'
          : `${count} match${count === 1 ? '' : 'es'} followed`}
      </Text>
      <Pressable onPress={onDone} hitSlop={12} accessibilityRole="button">
        <Text style={{ color: colors.onAccent, fontFamily: font.semibold, fontSize: 14 }}>
          Done
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    paddingHorizontal: space.lg, paddingVertical: space.md,
  },
});

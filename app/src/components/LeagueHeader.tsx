import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { space, type as t } from '../theme';
import type { League } from '../api/types';
import { LeagueCrest } from './Crest';

/** Country + competition band above each group, tappable through to the table. */
export function LeagueHeader({ league, onPress }: { league: League; onPress?: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={styles.wrap}
      accessibilityRole={onPress ? 'button' : 'header'}
      accessibilityLabel={`${league.countryName}, ${league.name}`}
    >
      <LeagueCrest league={league} size={24} />
      <Text style={[t.h3, { color: colors.text }]} numberOfLines={1}>
        {league.countryName}
      </Text>
      <Text style={[t.bodyMed, { color: colors.textMuted, flex: 1 }]} numberOfLines={1}>
        {league.name}
      </Text>
      {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.textDim} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingTop: space.xl,
    paddingBottom: space.md,
  },
});

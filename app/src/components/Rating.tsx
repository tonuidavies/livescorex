import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { font } from '../theme';

/**
 * Match rating badge.
 *
 * Colour-graded because a wall of numbers between 5.8 and 7.4 is unreadable at
 * a glance — the band matters far more than the decimal. Thresholds follow the
 * convention every football audience already knows: 8+ outstanding, 7+ good,
 * 6+ adequate, below 6 poor.
 */
export function Rating({
  value, size = 'md', style,
}: { value: number; size?: 'sm' | 'md'; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();

  const bg =
    value >= 8 ? '#1B8A4B'
    : value >= 7 ? '#3E8E41'
    : value >= 6 ? '#6E7A2E'
    : '#A2452F';

  const dims = size === 'sm'
    ? { w: 30, h: 18, fs: 10.5, r: 5 }
    : { w: 38, h: 22, fs: 12.5, r: 6 };

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: bg, width: dims.w, height: dims.h, borderRadius: dims.r },
        style,
      ]}
      accessible
      accessibilityLabel={`Rating ${value.toFixed(1)} out of 10`}
    >
      <Text style={{ color: '#FFF', fontFamily: font.bold, fontSize: dims.fs }}>
        {value.toFixed(1)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center' },
});

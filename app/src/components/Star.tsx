import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeProvider';

export function Star({
  on, onToggle, size = 18, hitSlop = 10,
}: { on: boolean; onToggle: () => void; size?: number; hitSlop?: number }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onToggle();
      }}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={on ? 'Remove from favourites' : 'Add to favourites'}
      accessibilityState={{ selected: on }}
    >
      <View
        style={[
          styles.wrap,
          {
            width: size * 1.9,
            height: size * 1.9,
            borderRadius: size,
            backgroundColor: on ? 'rgba(47,191,49,0.14)' : 'rgba(255,255,255,0.06)',
          },
        ]}
      >
        <Ionicons
          name={on ? 'star' : 'star-outline'}
          size={size}
          color={on ? colors.markerPromotion : colors.textMuted}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
});

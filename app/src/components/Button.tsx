import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, font } from '../theme';

export function Button({
  label, onPress, variant = 'primary', loading, disabled, style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const off = disabled || loading;

  const bg =
    variant === 'primary' ? colors.accent
    : variant === 'outline' ? 'transparent'
    : 'transparent';
  const fg = variant === 'primary' ? colors.onAccent : colors.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: loading }}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: pressed && variant === 'primary' ? colors.accentPressed : bg,
          borderColor: variant === 'outline' ? colors.accent : 'transparent',
          borderWidth: variant === 'outline' ? 1 : 0,
          opacity: off ? 0.55 : 1,
        },
        style,
      ]}
    >
      {loading
        ? <ActivityIndicator color={fg} />
        : <Text style={{ color: fg, fontFamily: font.semibold, fontSize: 16 }}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 54, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg,
  },
});

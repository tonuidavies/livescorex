import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, font } from '../theme';

/** Used for System / Light / Dark in Settings — one control, three states,
 *  instead of the two independent toggles in the wireframe that can both be
 *  off or both on. */
export function Segmented<T extends string>({
  options, value, onChange,
}: { options: Array<{ value: T; label: string }>; value: T; onChange: (v: T) => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: colors.cardAlt }]}>
      {options.map(o => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.seg, on && { backgroundColor: colors.accent }]}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
          >
            <Text
              style={{
                color: on ? colors.onAccent : colors.textMuted,
                fontFamily: on ? font.semibold : font.medium,
                fontSize: 13.5,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', borderRadius: radius.md, padding: 3, gap: 3 },
  seg: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: space.sm, borderRadius: radius.sm,
  },
});

import React, { useEffect, useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { space, type as t, font } from '../theme';
import { dayKeyUTC, stripLabel } from '../util/format';

const DAY = 86_400_000;
const BACK = 7;
const FORWARD = 14;
const ITEM_W = 74;

/** Horizontal date selector. Auto-scrolls today into view on mount. */
export function DateStrip({
  selected, onSelect,
}: { selected: string; onSelect: (dayKey: string) => void }) {
  const { colors } = useTheme();
  const ref = useRef<ScrollView>(null);
  const today = useMemo(() => new Date(), []);

  const days = useMemo(() => {
    const out: Array<{ key: string; top: string; bottom: string; isToday: boolean }> = [];
    for (let i = -BACK; i <= FORWARD; i++) {
      const d = new Date(today.getTime() + i * DAY);
      out.push({ key: dayKeyUTC(d), ...stripLabel(d, today) });
    }
    return out;
  }, [today]);

  useEffect(() => {
    const idx = days.findIndex(d => d.isToday);
    if (idx >= 0) {
      // Land today just left of centre rather than flush left — it reads as
      // "you are here" instead of "this is the start".
      requestAnimationFrame(() =>
        ref.current?.scrollTo({ x: Math.max(0, (idx - 1) * ITEM_W), animated: false }),
      );
    }
  }, [days]);

  return (
    <View style={{ backgroundColor: colors.chrome }}>
      <ScrollView
        ref={ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {days.map(d => {
          const active = d.key === selected;
          return (
            <Pressable
              key={d.key}
              onPress={() => onSelect(d.key)}
              style={styles.item}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${d.top} ${d.bottom}`}
            >
              <Text
                style={[
                  t.label,
                  {
                    color: active ? colors.accent : colors.text,
                    fontFamily: active ? font.bold : font.medium,
                  },
                ]}
              >
                {d.top}
              </Text>
              <Text
                style={[
                  t.caption,
                  { color: active ? colors.accent : colors.textMuted, marginTop: 2 },
                ]}
              >
                {d.bottom}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.xs },
  item: { width: ITEM_W, alignItems: 'center', paddingVertical: space.md },
});

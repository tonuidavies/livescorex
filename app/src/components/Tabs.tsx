import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { space, font } from '../theme';

export interface TabDef { key: string; label: string; enabled?: boolean }

/**
 * Underlined tab bar for the match-detail screen.
 *
 * Tabs a league cannot populate are dropped rather than shown disabled: an
 * empty Statistics tab for a Kenyan Premier League fixture reads as a broken
 * app, whereas its absence reads as a match without stats.
 */
export function Tabs({
  tabs, active, onChange,
}: { tabs: TabDef[]; active: string; onChange: (key: string) => void }) {
  const { colors } = useTheme();
  const visible = tabs.filter(t => t.enabled !== false);

  return (
    <View style={{ backgroundColor: colors.bg }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {visible.map(tab => {
          const on = tab.key === active;
          return (
            <Pressable
              key={tab.key}
              onPress={() => onChange(tab.key)}
              style={styles.tab}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
            >
              <Text
                style={{
                  color: on ? colors.accent : colors.textMuted,
                  fontFamily: on ? font.semibold : font.medium,
                  fontSize: 15,
                }}
              >
                {tab.label}
              </Text>
              <View
                style={[
                  styles.underline,
                  { backgroundColor: on ? colors.accent : 'transparent' },
                ]}
              />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: space.sm },
  tab: { paddingHorizontal: space.lg, paddingTop: space.lg, alignItems: 'center' },
  underline: { height: 3, borderRadius: 2, alignSelf: 'stretch', marginTop: space.md },
});

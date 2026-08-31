import React from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, type as t } from '../theme';
import { usePrefs, type ThemePref } from '../store/prefs';
import { Segmented } from '../components/Segmented';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export function SettingsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { prefs, set } = usePrefs();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={[t.h3, { color: colors.text, flex: 1, textAlign: 'center' }]}>Settings</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: insets.bottom + space.xxl }}>
        <Text style={[t.label, styles.sectionLabel, { color: colors.textMuted }]}>NOTIFICATIONS</Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[t.bodyMed, { color: colors.text }]}>Match alerts</Text>
              <Text style={[t.caption, { color: colors.textMuted, marginTop: 2 }]}>
                Goals and full-time for teams you follow
              </Text>
            </View>
            <Switch
              value={prefs.notifications}
              onValueChange={v => set({ notifications: v })}
              trackColor={{ true: colors.accent, false: colors.cardAlt }}
              thumbColor="#FFF"
            />
          </View>
        </View>

        <Text style={[t.label, styles.sectionLabel, { color: colors.textMuted }]}>THEME</Text>
        <View style={[styles.card, { backgroundColor: colors.card, padding: space.md }]}>
          {/* One control with three states. The wireframe's two independent
              toggles could both be on or both off, which has no meaning. */}
          <Segmented<ThemePref>
            value={prefs.theme}
            onChange={v => set({ theme: v })}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </View>

        <Text style={[t.label, styles.sectionLabel, { color: colors.textMuted }]}>CONTENT</Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Pressable style={styles.row} onPress={() => navigation.navigate('Leagues')}>
            <Text style={[t.bodyMed, { color: colors.text, flex: 1 }]}>Leagues you follow</Text>
            <Text style={[t.body, { color: colors.textMuted }]}>{prefs.leagues.length}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
          </Pressable>
        </View>

        <Text style={[t.caption, styles.footer, { color: colors.textDim }]}>
          LivescoreX v1.0.0
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingVertical: space.md },
  sectionLabel: { marginTop: space.xl, marginBottom: space.sm, marginLeft: space.xs },
  card: { borderRadius: radius.md, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, minHeight: 58 },
  footer: { textAlign: 'center', marginTop: space.xxxl },
});

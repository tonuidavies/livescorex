import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, type as t, font } from '../theme';
import { usePrefs } from '../store/prefs';
import { Button } from '../components/Button';
import { initials } from '../util/format';
import type { TabScreenProps } from '../navigation/types';

type Props = TabScreenProps<'Profile'>;

export function ProfileScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { prefs, set } = usePrefs();
  const account = prefs.account;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={styles.header}>
        <Text style={[t.h3, { color: colors.text }]}>Profile</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: insets.bottom + 90 }}>
        <View style={[styles.identity, { backgroundColor: colors.card }]}>
          <View style={[styles.avatar, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
            {account ? (
              <Text style={{ color: colors.textMuted, fontFamily: font.semibold, fontSize: 22 }}>
                {initials(account.name)}
              </Text>
            ) : (
              <Ionicons name="person" size={26} color={colors.textMuted} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[t.h3, { color: colors.text }]}>{account?.name ?? 'Guest'}</Text>
            <Text style={[t.caption, { color: colors.textMuted, marginTop: 2 }]}>
              {account?.email ?? 'Everything works without an account'}
            </Text>
          </View>
        </View>

        <View style={styles.stats}>
          <Stat label="Leagues" value={prefs.leagues.length} />
          <Stat label="Teams" value={prefs.teams.length} />
          <Stat label="Starred" value={prefs.matches.length} />
        </View>

        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Row icon="football-outline" label="Browse leagues" onPress={() => navigation.navigate('Leagues')} />
          <Row icon="settings-outline" label="Settings" onPress={() => navigation.navigate('Settings')} />
        </View>

        {account ? (
          <Button
            label="Log Out"
            variant="outline"
            onPress={() => set({ account: null })}
            style={{ marginTop: space.xxl }}
          />
        ) : (
          <>
            {/* Auth is opt-in, not a gate. Push works off a device token and
                favourites live on-device, so an account only buys cross-device
                sync — and asking for it up front costs installs. */}
            <Text style={[t.caption, { color: colors.textDim, textAlign: 'center', marginTop: space.xxl }]}>
              Sign in only if you want your favourites on more than one device.
            </Text>
            <Button
              label="Sign In"
              variant="outline"
              onPress={() => navigation.navigate('Auth')}
              style={{ marginTop: space.md }}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: colors.card }]}>
      <Text style={{ color: colors.text, fontFamily: font.bold, fontSize: 20 }}>{value}</Text>
      <Text style={[t.caption, { color: colors.textMuted, marginTop: 2 }]}>{label}</Text>
    </View>
  );
}

function Row({
  icon, label, onPress,
}: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable style={styles.row} onPress={onPress} accessibilityRole="button">
      <Ionicons name={icon} size={20} color={colors.textMuted} />
      <Text style={[t.bodyMed, { color: colors.text, flex: 1 }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.lg, paddingVertical: space.md, alignItems: 'center' },
  identity: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    padding: space.md, borderRadius: radius.md,
  },
  avatar: {
    width: 60, height: 60, borderRadius: 30, alignItems: 'center',
    justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth,
  },
  stats: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  stat: { flex: 1, alignItems: 'center', paddingVertical: space.lg, borderRadius: radius.md },
  card: { borderRadius: radius.md, marginTop: space.md, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, minHeight: 54 },
});

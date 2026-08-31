import React, { useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text,
  TextInput, View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, type as t } from '../theme';
import { usePrefs, type ThemePref } from '../store/prefs';
import { Segmented } from '../components/Segmented';
import { DEFAULT_API_URL, normaliseApiUrl, pingServer } from '../api/client';
import * as LiveMatch from '../../modules/live-match-notification';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export function SettingsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { prefs, set } = usePrefs();

  const [server, setServer] = useState(prefs.apiUrl ?? DEFAULT_API_URL);
  const [checking, setChecking] = useState(false);
  const [reachable, setReachable] = useState<boolean | null>(null);

  const applyServer = async () => {
    setChecking(true);
    const ok = await pingServer(server);
    setReachable(ok);
    setChecking(false);
    // Save either way: the server may simply be down right now, and refusing
    // to save a correct address because of that would be worse.
    set({ apiUrl: normaliseApiUrl(server) === DEFAULT_API_URL ? null : normaliseApiUrl(server) });
  };

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

        {/* Why alerts are or are not working. A scores app that silently fails
            to notify is indistinguishable from one that has nothing to say, so
            the state is stated plainly rather than left to be inferred. */}
        <View style={[styles.card, { backgroundColor: colors.card, marginTop: space.sm }]}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[t.bodyMed, { color: colors.text }]}>Live match notifications</Text>
              <Text style={[t.caption, { color: colors.textMuted, marginTop: 2 }]}>
                {!LiveMatch.isAvailable
                  ? 'Unavailable in this build'
                  : LiveMatch.supportsLiveUpdates
                    ? `Live Updates supported (Android API ${LiveMatch.androidApiLevel})`
                    : `Ongoing notification (Android API ${LiveMatch.androidApiLevel})`}
              </Text>
            </View>
            <Pressable
              onPress={() => { void LiveMatch.ensureChannel(); }}
              hitSlop={8}
              accessibilityRole="button"
            >
              <Text style={[t.caption, { color: colors.accent }]}>Set up</Text>
            </Pressable>
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

        <Text style={[t.label, styles.sectionLabel, { color: colors.textMuted }]}>SERVER</Text>
        <View style={[styles.card, { backgroundColor: colors.card, padding: space.md }]}>
          <TextInput
            value={server}
            onChangeText={txt => { setServer(txt); setReachable(null); }}
            placeholder="http://192.168.1.20:8787"
            placeholderTextColor={colors.textDim}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={[
              t.body,
              styles.input,
              { color: colors.text, backgroundColor: colors.cardAlt, borderColor: colors.border },
            ]}
          />
          <View style={styles.serverRow}>
            <Text style={[t.caption, { color: colors.textMuted, flex: 1 }]}>
              {reachable === null
                ? 'Where this app fetches scores from'
                : reachable
                  ? 'Connected'
                  : 'Could not reach that address'}
            </Text>
            <Pressable
              onPress={applyServer}
              disabled={checking}
              hitSlop={8}
              accessibilityRole="button"
            >
              {checking
                ? <ActivityIndicator size="small" color={colors.accent} />
                : (
                  <Text style={[t.bodyMed, { color: colors.accent }]}>
                    Test &amp; save
                  </Text>
                )}
            </Pressable>
          </View>
          {reachable !== null ? (
            <View
              style={[
                styles.pill,
                { backgroundColor: reachable ? 'rgba(47,191,49,0.14)' : 'rgba(214,59,51,0.14)' },
              ]}
            >
              <Text
                style={[
                  t.caption,
                  { color: reachable ? colors.markerPromotion : colors.redCard },
                ]}
              >
                {reachable
                  ? 'Saved — pull to refresh on Matches'
                  : 'Saved anyway. Check the server is running and the phone is on the same Wi-Fi.'}
              </Text>
            </View>
          ) : null}
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
  input: {
    height: 46, borderRadius: radius.sm, paddingHorizontal: space.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  serverRow: {
    flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.md,
  },
  pill: { marginTop: space.md, padding: space.sm, borderRadius: radius.sm },
});

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View,
  useWindowDimensions,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { space, type as t, font } from '../theme';
import { usePrefs } from '../store/prefs';
import { initials } from '../util/format';
import { api } from '../api/client';
import type { Sport } from '../api/types';

type Dest = 'matches' | 'settings' | 'profile' | 'leagues';

/** Icon per sport. Anything unmapped falls back to a generic ball. */
const SPORT_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  soccer: 'football-outline',
  basketball: 'basketball-outline',
  baseball: 'baseball-outline',
  football: 'american-football-outline',
  hockey: 'snow-outline',
  'australian-football': 'ellipse-outline',
  rugby: 'american-football-outline',
  'rugby-league': 'american-football-outline',
  volleyball: 'tennisball-outline',
  lacrosse: 'ellipse-outline',
  'field-hockey': 'ellipse-outline',
  'water-polo': 'water-outline',
};

/**
 * Drawer from the wireframe, as a modal rather than a gesture drawer — it is
 * opened by the hamburger and dismissed with an explicit X, so a swipe
 * navigator would add a dependency and a gesture nobody asked for.
 *
 * Note it deliberately no longer duplicates the whole tab bar: Matches and
 * Profile are one tap away at the bottom of every screen. What lives here is
 * what the tabs cannot reach — the league browser, settings, and sign-out.
 */
export function SideBar({
  visible, onClose, onNavigate, onSignOut,
}: {
  visible: boolean;
  onClose: () => void;
  onNavigate: (d: Dest) => void;
  onSignOut: () => void;
}) {
  const { colors } = useTheme();
  const { prefs, set } = usePrefs();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const account = prefs.account;

  const [sports, setSports] = useState<Sport[] | null>(null);

  // Loaded when the drawer first opens rather than at app start: it is a
  // browsing aid, not something the first screen depends on.
  useEffect(() => {
    if (!visible || sports) return;
    api.sports().then(r => setSports(r.sports)).catch(() => setSports([]));
  }, [visible, sports]);

  const go = (d: Dest) => { onClose(); setTimeout(() => onNavigate(d), 120); };

  const pickSport = (sport: string) => {
    set({ sport });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close menu">
        <Pressable
          style={[
            styles.panel,
            {
              backgroundColor: colors.chrome,
              width: Math.min(320, width * 0.84),
              paddingTop: insets.top + space.lg,
              paddingBottom: insets.bottom + space.lg,
            },
          ]}
          onPress={e => e.stopPropagation()}
        >
          <Pressable onPress={onClose} style={styles.close} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close menu">
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>

          <View style={styles.identity}>
            <View style={[styles.avatar, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
              <Text style={{ color: colors.textMuted, fontFamily: font.semibold, fontSize: 18 }}>
                {account ? initials(account.name) : <Ionicons name="person" size={22} color={colors.textMuted} />}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[t.h3, { color: colors.text }]} numberOfLines={1}>
                {account?.name ?? 'Guest'}
              </Text>
              <Text style={[t.caption, { color: colors.textMuted }]} numberOfLines={1}>
                {account?.email ?? 'Sign in to sync favourites'}
              </Text>
            </View>
          </View>

          <View style={[styles.rule, { backgroundColor: colors.divider }]} />

          <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
            <Text style={[t.label, styles.section, { color: colors.textMuted }]}>SPORTS</Text>

            {sports === null ? (
              <ActivityIndicator color={colors.accent} style={{ marginVertical: space.lg }} />
            ) : sports.length === 0 ? (
              <Text style={[t.caption, { color: colors.textDim, paddingHorizontal: space.sm }]}>
                Couldn’t load sports
              </Text>
            ) : (
              sports.map(s => {
                const active = s.sport === prefs.sport;
                return (
                  <Pressable
                    key={s.sport}
                    onPress={() => pickSport(s.sport)}
                    style={({ pressed }) => [
                      styles.item,
                      active && { backgroundColor: colors.cardAlt },
                      pressed && { backgroundColor: colors.card },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Ionicons
                      name={SPORT_ICON[s.sport] ?? 'ellipse-outline'}
                      size={20}
                      color={active ? colors.accent : colors.textMuted}
                    />
                    <Text
                      style={[
                        t.bodyMed,
                        { color: active ? colors.accent : colors.text, flex: 1 },
                      ]}
                      numberOfLines={1}
                    >
                      {s.name}
                    </Text>
                    <Text style={[t.caption, { color: colors.textDim }]}>{s.leagues}</Text>
                  </Pressable>
                );
              })
            )}

            <View style={[styles.rule, { backgroundColor: colors.divider }]} />

            <Item icon="list-outline" label="Browse all leagues" onPress={() => go('leagues')} />
            <Item icon="settings-outline" label="Settings" onPress={() => go('settings')} />
            <Item icon="person-circle-outline" label="Profile" onPress={() => go('profile')} />
          </ScrollView>

          <Item
            icon={account ? 'log-out-outline' : 'log-in-outline'}
            label={account ? 'Log Out' : 'Sign In'}
            onPress={() => { onClose(); setTimeout(onSignOut, 120); }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Item({
  icon, label, onPress,
}: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.cardAlt }]}
      accessibilityRole="button"
    >
      <Ionicons name={icon} size={21} color={colors.textMuted} />
      <Text style={[t.bodyMed, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  panel: { flex: 1, paddingHorizontal: space.lg },
  close: { alignSelf: 'flex-end' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.lg },
  avatar: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth,
  },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: space.lg },
  section: { paddingHorizontal: space.sm, paddingBottom: space.sm },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: space.lg,
    paddingVertical: space.md, paddingHorizontal: space.sm, borderRadius: 8,
  },
});

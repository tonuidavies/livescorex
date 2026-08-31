import React from 'react';
import {
  Modal, Pressable, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { space, type as t, font } from '../theme';
import { usePrefs } from '../store/prefs';
import { initials } from '../util/format';

type Dest = 'matches' | 'settings' | 'profile' | 'leagues';

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
  const { prefs } = usePrefs();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const account = prefs.account;

  const go = (d: Dest) => { onClose(); setTimeout(() => onNavigate(d), 120); };

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

          <Item icon="football-outline" label="Browse leagues" onPress={() => go('leagues')} />
          <Item icon="settings-outline" label="Settings" onPress={() => go('settings')} />
          <Item icon="person-circle-outline" label="Profile" onPress={() => go('profile')} />

          <View style={{ flex: 1 }} />

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
  rule: { height: StyleSheet.hairlineWidth, marginVertical: space.xl },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: space.lg,
    paddingVertical: space.md, paddingHorizontal: space.sm, borderRadius: 8,
  },
});

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, font } from '../theme';
import { ConnDot } from './StateViews';

/** Top chrome shared by Matches and Live, per the wireframe. */
export function TopBar({
  onMenu, onSearch, onSort, onSettings, onProfile, liveActive, onToggleLive, connState,
}: {
  onMenu: () => void;
  onSearch: () => void;
  onSort: () => void;
  onSettings: () => void;
  onProfile: () => void;
  liveActive: boolean;
  onToggleLive: () => void;
  connState: 'open' | 'connecting' | 'offline';
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { backgroundColor: colors.chrome, paddingTop: insets.top + space.sm }]}>
      <IconBtn icon="menu" onPress={onMenu} label="Open menu" />
      <IconBtn icon="search" onPress={onSearch} label="Search teams and leagues" />
      <Pressable onPress={onSort} hitSlop={8} accessibilityRole="button" accessibilityLabel="Browse leagues A to Z">
        <MaterialCommunityIcons name="sort-alphabetical-variant" size={23} color={colors.textMuted} />
      </Pressable>

      <View style={styles.spacer} />

      <Pressable
        onPress={onToggleLive}
        style={[
          styles.livePill,
          {
            backgroundColor: liveActive ? colors.livePill : 'transparent',
            borderColor: liveActive ? colors.livePill : colors.border,
          },
        ]}
        accessibilityRole="button"
        accessibilityState={{ selected: liveActive }}
        accessibilityLabel={liveActive ? 'Showing live matches only' : 'Show live matches only'}
      >
        <ConnDot state={connState} />
        <Text style={{ color: liveActive ? '#FFF' : colors.textMuted, fontFamily: font.bold, fontSize: 12.5 }}>
          LIVE
        </Text>
      </Pressable>

      <View style={styles.spacer} />

      <IconBtn icon="settings-outline" onPress={onSettings} label="Settings" />
      <IconBtn icon="person-circle-outline" onPress={onProfile} label="Profile" size={26} />
    </View>
  );
}

function IconBtn({
  icon, onPress, label, size = 23,
}: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void; label: string; size?: number }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={size} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  spacer: { flex: 1 },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});

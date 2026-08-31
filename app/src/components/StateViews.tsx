import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, type as t } from '../theme';
import { agoLabel } from '../util/format';

/**
 * The states the wireframes did not cover.
 *
 * Rule enforced here: never render a spinner or an empty state over data we
 * already have. Blocked upstream should degrade to "stale", never to "blank" —
 * so `StaleBanner` sits above real content rather than replacing it.
 */

export function EmptyState({
  icon = 'calendar-outline', title, subtitle,
}: { icon?: keyof typeof Ionicons.glyphMap; title: string; subtitle?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.center}>
      <Ionicons name={icon} size={44} color={colors.textDim} />
      <Text style={[t.h3, { color: colors.text, marginTop: space.lg }]}>{title}</Text>
      {subtitle ? (
        <Text style={[t.body, styles.sub, { color: colors.textMuted }]}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

export function ErrorState({
  message, onRetry,
}: { message: string; onRetry?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.center}>
      <Ionicons name="cloud-offline-outline" size={44} color={colors.textDim} />
      <Text style={[t.h3, { color: colors.text, marginTop: space.lg }]}>Can’t reach LivescoreX</Text>
      <Text style={[t.body, styles.sub, { color: colors.textMuted }]}>{message}</Text>
      {onRetry ? (
        <Text
          onPress={onRetry}
          style={[t.bodyMed, { color: colors.accent, marginTop: space.lg }]}
          accessibilityRole="button"
        >
          Try again
        </Text>
      ) : null}
    </View>
  );
}

/** Sits above content that is real but no longer confirmed. */
export function StaleBanner({ fetchedAt, offline }: { fetchedAt: number; offline?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.banner, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
      <View style={[styles.dot, { backgroundColor: colors.stale }]} />
      <Text style={[t.caption, { color: colors.textMuted }]}>
        {offline ? 'Offline — showing saved scores' : 'Reconnecting'} · updated {agoLabel(fetchedAt)}
      </Text>
    </View>
  );
}

/** Connection pip for the top bar: green pulse live, amber stale, grey offline. */
export function ConnDot({ state }: { state: 'open' | 'connecting' | 'offline' }) {
  const { colors } = useTheme();
  const color =
    state === 'open' ? colors.markerPromotion
    : state === 'connecting' ? colors.stale
    : colors.textDim;
  return <View style={[styles.pip, { backgroundColor: color }]} />;
}

export function RowSkeleton({ count = 5 }: { count?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ paddingHorizontal: space.md }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={[styles.skeleton, { backgroundColor: colors.skeleton }]} />
      ))}
    </View>
  );
}

export function Loading() {
  const { colors } = useTheme();
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl },
  sub: { textAlign: 'center', marginTop: space.xs, maxWidth: 280 },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    marginHorizontal: space.md, marginTop: space.sm,
    paddingVertical: space.sm, paddingHorizontal: space.md,
    borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  pip: { width: 7, height: 7, borderRadius: 4 },
  skeleton: { height: 62, borderRadius: radius.md, marginBottom: space.sm },
});

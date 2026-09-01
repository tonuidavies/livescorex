import React, { memo, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, interpolateColor, useAnimatedStyle, useSharedValue, withDelay,
  withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, tabular, type as t, font } from '../theme';
import type { Match } from '../api/types';
import { statusCell } from '../util/format';
import { Crest } from './Crest';
import { Star } from './Star';

/**
 * One fixture row. The design uses the same row on Matches and Live with
 * different right-hand content — time + odds when scheduled, score when not —
 * so this is one component with a variant rather than two that drift apart.
 */
export const MatchRow = memo(function MatchRow({
  match, starred, onToggleStar, onPress, showOdds, now, selecting, onLongPress, goalAt,
}: {
  match: Match;
  starred: boolean;
  onToggleStar: () => void;
  onPress: () => void;
  showOdds: boolean;
  /** Drives the interpolated clock. Pass a ticking value for live lists. */
  now?: number;
  /** In selection mode the whole row toggles the star instead of opening. */
  selecting?: boolean;
  onLongPress?: () => void;
  /** When a goal last landed for this match, epoch ms. */
  goalAt?: number;
}) {
  const { colors } = useTheme();
  const status = statusCell(match, now ?? Date.now());
  const live = status.tone === 'live';
  const played = match.score.home !== null && match.score.away !== null;

  const statusColor =
    live ? colors.liveBright
    : status.tone === 'muted' ? colors.textMuted
    : colors.text;

  const oddsVisible = showOdds && match.odds !== null && !played;

  /*
   * Goal flash.
   *
   * A score ticking over in a list of forty rows is genuinely easy to miss, so
   * the whole row lights up rather than just the digit. It holds briefly and
   * then fades, because a highlight that never clears stops meaning anything.
   */
  const flash = useSharedValue(0);
  const lastGoal = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!goalAt || goalAt === lastGoal.current) return;
    lastGoal.current = goalAt;
    // Ignore anything already stale — a remount must not replay old goals.
    if (Date.now() - goalAt > 30_000) return;

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    flash.value = withSequence(
      withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) }),
      withDelay(6000, withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.quad) })),
    );
  }, [goalAt, flash]);

  const flashStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      flash.value,
      [0, 1],
      ['rgba(47,191,49,0)', 'rgba(47,191,49,0.22)'],
    ),
  }));

  const recentGoal = Boolean(goalAt && Date.now() - goalAt < 20_000);

  return (
    <Pressable
      onPress={selecting ? onToggleStar : onPress}
      onLongPress={onLongPress}
      delayLongPress={280}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? colors.cardAlt : colors.card,
          borderColor:
            recentGoal ? colors.markerPromotion
            : selecting && starred ? colors.accent
            : 'transparent',
          borderWidth: recentGoal || selecting ? 1 : 0,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={
        `${match.home.name} versus ${match.away.name}, ` +
        (played ? `${match.score.home} ${match.score.away}, ` : '') +
        status.text
      }
    >
      <Animated.View style={[StyleSheet.absoluteFill, flashStyle]} pointerEvents="none" />

      {recentGoal ? (
        <View style={[styles.goalTag, { backgroundColor: colors.markerPromotion }]}>
          <Text style={styles.goalTagText}>GOAL</Text>
        </View>
      ) : null}

      <View style={[styles.statusCell, { borderRightColor: colors.divider }]}>
        {/* Only while the clock is actually running — a pulsing dot beside
            "HT" claims motion that is not happening. */}
        {match.state === 'live' ? <LivePulse color={colors.liveBright} /> : null}
        <Text
          style={[
            t.label,
            tabular,
            { color: statusColor },
          ]}
          numberOfLines={1}
        >
          {status.text}
        </Text>
      </View>

      <View style={styles.teams}>
        <TeamLine
          name={match.home.name}
          crest={match.home.crest}
          dim={played && (match.score.home ?? 0) < (match.score.away ?? 0)}
        />
        <TeamLine
          name={match.away.name}
          crest={match.away.crest}
          dim={played && (match.score.away ?? 0) < (match.score.home ?? 0)}
        />
      </View>

      {oddsVisible ? (
        <View style={styles.odds}>
          <Text style={[t.caption, tabular, { color: colors.textMuted }]}>
            {match.odds!.home.toFixed(2)}
          </Text>
          <Text style={[t.caption, tabular, { color: colors.textMuted }]}>
            {match.odds!.draw !== null ? match.odds!.draw.toFixed(2) : '—'}
          </Text>
          <Text style={[t.caption, tabular, { color: colors.textMuted }]}>
            {match.odds!.away.toFixed(2)}
          </Text>
        </View>
      ) : null}

      {played ? (
        <View style={styles.scores}>
          <ScoreDigit value={match.score.home ?? 0} live={live} />
          <ScoreDigit value={match.score.away ?? 0} live={live} />
        </View>
      ) : null}

      {/* Every match is starrable. Previously the score occupied this slot, so
          a live or finished match could not be favourited at all — which is
          exactly the moment people want to follow one. */}
      <View style={styles.starWrap}>
        <Star on={starred} onToggle={onToggleStar} size={17} hitSlop={14} />
      </View>
    </Pressable>
  );
});

/**
 * Slow breathing dot beside a live minute.
 *
 * A static row gives no sign that the number is going to change on its own;
 * this is the cheapest possible signal that the row is alive, and it is slow
 * enough not to become the thing you look at.
 */
function LivePulse({ color }: { color: string }) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.25, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [opacity]);
  const anim = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.pulse, { backgroundColor: color }, anim]} />;
}

function TeamLine({ name, crest, dim }: { name: string; crest: string | null; dim: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.teamLine}>
      <Crest uri={crest} name={name} size={20} />
      <Text
        style={[t.team, { color: dim ? colors.textMuted : colors.text, flex: 1 }]}
        numberOfLines={1}
      >
        {name}
      </Text>
    </View>
  );
}

/**
 * Flashes when the number changes. This is the only animation on the list and
 * it earns its place: a goal arriving over the socket must be noticeable
 * without the user having to diff two numbers in their head.
 */
function ScoreDigit({ value, live }: { value: number; live: boolean }) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);
  const prev = useRef(value);

  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      scale.value = withSequence(
        withTiming(1.35, { duration: 130 }),
        withTiming(1, { duration: 220 }),
      );
    }
  }, [value, scale]);

  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.Text
      style={[
        anim,
        tabular,
        { color: live ? colors.live : colors.text, fontFamily: font.bold, fontSize: 16.5, lineHeight: 22 },
      ]}
    >
      {value}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginHorizontal: space.md,
    marginBottom: space.sm,
    borderRadius: radius.md,
    overflow: 'hidden',
    minHeight: 62,
  },
  statusCell: {
    width: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.xs,
    gap: 4,
  },
  pulse: { width: 5, height: 5, borderRadius: 3 },
  goalTag: {
    position: 'absolute', top: 0, right: 0,
    paddingHorizontal: 6, paddingVertical: 1.5,
    borderBottomLeftRadius: radius.sm, borderTopRightRadius: radius.md,
  },
  goalTagText: { color: '#FFF', fontFamily: font.bold, fontSize: 9, letterSpacing: 0.6 },
  teams: { flex: 1, justifyContent: 'center', paddingVertical: space.sm, paddingLeft: space.md, gap: 6 },
  teamLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  scores: { width: 34, justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: space.sm },
  odds: { justifyContent: 'center', alignItems: 'flex-end', gap: 2, paddingRight: space.sm },
  starWrap: { justifyContent: 'center', paddingRight: space.sm, paddingLeft: 2 },
});

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { space, type as t, font } from '../theme';
import type { Match } from '../api/types';
import { kickoffTime, longDate, statusCell } from '../util/format';
import { Crest, LeagueCrest } from './Crest';
import { Star } from './Star';

/** The purple band at the top of the match-detail screen. */
export function MatchHeader({
  match, onBack, starred, onToggleStar, onShare, homeStarred, awayStarred,
  onToggleHome, onToggleAway, now,
}: {
  match: Match;
  /** Drives the interpolated clock; pass a ticking value for live matches. */
  now?: number;
  onBack: () => void;
  starred: boolean;
  onToggleStar: () => void;
  onShare?: () => void;
  homeStarred: boolean;
  awayStarred: boolean;
  onToggleHome: () => void;
  onToggleAway: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const status = statusCell(match, now ?? Date.now());
  const played = match.score.home !== null && match.score.away !== null;
  const live = match.state === 'live' || match.state === 'halftime';

  return (
    <View style={[styles.wrap, { backgroundColor: colors.header, paddingTop: insets.top + space.sm }]}>
      <View style={styles.topRow}>
        <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color="#FFF" />
        </Pressable>

        <View style={styles.titleCol}>
          <View style={styles.leagueRow}>
            {match.league.logo || match.league.logoDark ? (
              <LeagueCrest league={match.league} size={18} />
            ) : null}
            <Text style={[t.h3, { color: '#FFF' }]} numberOfLines={1}>{match.league.name}</Text>
          </View>
          <Text style={[t.caption, { color: 'rgba(255,255,255,0.6)' }]} numberOfLines={1}>
            {longDate(match.kickoff)}
          </Text>
        </View>

        {live ? (
          <Text style={{ color: colors.liveBright, fontFamily: font.bold, fontSize: 15 }}>
            {status.text}
          </Text>
        ) : (
          <View style={styles.headerActions}>
            <Star on={starred} onToggle={onToggleStar} size={16} />
            {onShare ? (
              <Pressable onPress={onShare} hitSlop={10} accessibilityRole="button" accessibilityLabel="Share match">
                <Ionicons name="share-social-outline" size={20} color="rgba(255,255,255,0.85)" />
              </Pressable>
            ) : null}
          </View>
        )}
      </View>

      <View style={styles.scoreRow}>
        <TeamBlock
          name={match.home.name}
          crest={match.home.crest}
          starred={homeStarred}
          onToggle={onToggleHome}
        />

        <View style={styles.centre}>
          {played ? (
            <Text style={[styles.bigScore, { color: '#FFF' }]}>
              {match.score.home} – {match.score.away}
            </Text>
          ) : (
            <Text style={[styles.bigScore, { color: '#FFF' }]}>{kickoffTime(match.kickoff)}</Text>
          )}
          <Text style={[t.body, { color: 'rgba(255,255,255,0.6)', marginTop: 2 }]}>
            {subtitle(match, live, played)}
          </Text>
        </View>

        <TeamBlock
          name={match.away.name}
          crest={match.away.crest}
          starred={awayStarred}
          onToggle={onToggleAway}
        />
      </View>
    </View>
  );
}

/**
 * The line under the big score.
 *
 * It must never show a minute: the interpolated clock already occupies the
 * top-right, and the raw status label lags it by design, so rendering both put
 * "70'" and "69'" on screen at once.
 */
function subtitle(match: Match, live: boolean, played: boolean): string {
  if (match.halftimeScore) {
    return `HT ${match.halftimeScore.home}:${match.halftimeScore.away}`;
  }
  if (live) return match.state === 'halftime' ? 'Half time' : 'Live';
  if (played) return match.statusLabel;
  return 'Today';
}

function TeamBlock({
  name, crest, starred, onToggle,
}: { name: string; crest: string | null; starred: boolean; onToggle: () => void }) {
  return (
    <View style={styles.teamBlock}>
      <View style={styles.crestRow}>
        <Crest uri={crest} name={name} size={54} />
      </View>
      <Text style={[t.h3, { color: '#FFF', textAlign: 'center' }]} numberOfLines={2}>{name}</Text>
      <View style={{ marginTop: 4 }}>
        <Star on={starred} onToggle={onToggle} size={14} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.md, paddingBottom: space.xl },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  titleCol: { flex: 1, alignItems: 'center' },
  leagueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  scoreRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: space.lg },
  teamBlock: { flex: 1, alignItems: 'center', gap: space.sm },
  crestRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  centre: { width: 110, alignItems: 'center', paddingTop: space.md },
  bigScore: { fontFamily: font.bold, fontSize: 26, lineHeight: 32 },
});

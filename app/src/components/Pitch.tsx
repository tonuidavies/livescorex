import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Rect } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, type as t, font } from '../theme';
import type { LineupPlayer, TeamLineup } from '../api/types';

const NODE = 30;

/**
 * Vertical pitch with both XIs.
 *
 * The schema gives each player coordinates in their own attacking frame
 * (y = 0 at their own goal, 1 at the opposition's). Here the home side is
 * folded into the bottom half and the away side into the mirrored top half,
 * which is what produces the two-ended view in the design.
 *
 * When the source has no formation grid — common outside the major European
 * leagues — this falls back to a plain XI list rather than inventing
 * positions. A wrong pitch is worse than no pitch.
 */
export function Pitch({
  home, away, homeColor, awayColor,
}: { home: TeamLineup; away: TeamLineup; homeColor: string; awayColor: string }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const w = width - space.md * 2;
  const h = w * 1.45;

  const usable = home.hasPitchPositions || away.hasPitchPositions;
  if (!usable) return <LineupList home={home} away={away} />;

  const starters = (l: TeamLineup) => l.players.filter(p => p.starter && p.x !== null && p.y !== null);

  return (
    <View style={{ paddingHorizontal: space.md }}>
      <View style={[styles.pitch, { width: w, height: h, backgroundColor: colors.pitch }]}>
        <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
          <Rect x={1} y={1} width={w - 2} height={h - 2} stroke={colors.pitchLine} strokeWidth={1.5} fill="none" rx={4} />
          <Line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke={colors.pitchLine} strokeWidth={1.5} />
          <Circle cx={w / 2} cy={h / 2} r={w * 0.14} stroke={colors.pitchLine} strokeWidth={1.5} fill="none" />
          {/* penalty areas */}
          <Rect x={w * 0.19} y={1} width={w * 0.62} height={h * 0.14} stroke={colors.pitchLine} strokeWidth={1.5} fill="none" />
          <Rect x={w * 0.19} y={h - h * 0.14 - 1} width={w * 0.62} height={h * 0.14} stroke={colors.pitchLine} strokeWidth={1.5} fill="none" />
          <Rect x={w * 0.34} y={1} width={w * 0.32} height={h * 0.055} stroke={colors.pitchLine} strokeWidth={1.5} fill="none" />
          <Rect x={w * 0.34} y={h - h * 0.055 - 1} width={w * 0.32} height={h * 0.055} stroke={colors.pitchLine} strokeWidth={1.5} fill="none" />
        </Svg>

        {starters(away).map(p => (
          <PlayerNode
            key={p.id}
            player={p}
            color={awayColor}
            left={(1 - (p.x ?? 0.5)) * w - NODE / 2}
            top={(p.y ?? 0.5) * 0.5 * h - NODE / 2}
            tag="below"
          />
        ))}
        {starters(home).map(p => (
          <PlayerNode
            key={p.id}
            player={p}
            color={homeColor}
            left={(p.x ?? 0.5) * w - NODE / 2}
            top={(1 - (p.y ?? 0.5) * 0.5) * h - NODE / 2}
            /* Home names sit above the circle so the keeper's tag, which is
               hard against the goal line, stays inside the pitch. */
            tag="above"
          />
        ))}
      </View>

      <View style={styles.formations}>
        <Text style={[t.caption, { color: colors.textMuted }]}>
          {away.formation ? `Away · ${away.formation}` : 'Away'}
        </Text>
        <Text style={[t.caption, { color: colors.textMuted }]}>
          {home.formation ? `Home · ${home.formation}` : 'Home'}
        </Text>
      </View>

      <Bench home={home} away={away} />
    </View>
  );
}

function PlayerNode({
  player, color, left, top, tag,
}: {
  player: LineupPlayer;
  color: string;
  left: number;
  top: number;
  tag: 'above' | 'below';
}) {
  const { colors } = useTheme();

  const nameTag = (
    <View
      key="tag"
      style={[
        styles.nameTag,
        { backgroundColor: 'rgba(0,0,0,0.65)' },
        tag === 'above' ? { marginBottom: 3 } : { marginTop: 3 },
      ]}
    >
      <Text style={styles.nameText} numberOfLines={1}>
        {player.shortName}
      </Text>
    </View>
  );

  const circle = (
    <View key="circle" style={[styles.circle, { backgroundColor: color }]}>
      <Text style={styles.number}>{player.number ?? ''}</Text>
      {player.yellow || player.red ? (
        <View
          style={[
            styles.card,
            { backgroundColor: player.red ? colors.redCard : colors.yellowCard },
          ]}
        />
      ) : null}
    </View>
  );

  return (
    <View
      style={[styles.node, { left, top: tag === 'above' ? top - 18 : top }]}
      pointerEvents="none"
    >
      {tag === 'above' ? [nameTag, circle] : [circle, nameTag]}
    </View>
  );
}

function Bench({ home, away }: { home: TeamLineup; away: TeamLineup }) {
  const { colors } = useTheme();
  const subs = (l: TeamLineup) => l.players.filter(p => !p.starter);
  if (!subs(home).length && !subs(away).length) return null;

  return (
    <View style={{ marginTop: space.xl }}>
      <Text style={[t.label, { color: colors.textMuted, marginBottom: space.sm }]}>SUBSTITUTES</Text>
      <View style={{ flexDirection: 'row', gap: space.lg }}>
        {[home, away].map((l, i) => (
          <View key={i} style={{ flex: 1, gap: 6 }}>
            {subs(l).map(p => (
              <Text key={p.id} style={[t.caption, { color: colors.textMuted }]} numberOfLines={1}>
                {p.number ?? '–'}  {p.shortName}
              </Text>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

/** Degraded view for leagues without a formation grid. */
function LineupList({ home, away }: { home: TeamLineup; away: TeamLineup }) {
  const { colors } = useTheme();
  const col = (l: TeamLineup, label: string) => (
    <View style={{ flex: 1, gap: 8 }}>
      <Text style={[t.label, { color: colors.textMuted }]}>
        {label}{l.formation ? ` · ${l.formation}` : ''}
      </Text>
      {l.players.filter(p => p.starter).map(p => (
        <View key={p.id} style={styles.listRow}>
          <Text style={[t.caption, { color: colors.textDim, width: 22 }]}>{p.number ?? '–'}</Text>
          <Text style={[t.body, { color: colors.text, flex: 1 }]} numberOfLines={1}>{p.shortName}</Text>
          {p.yellow ? <View style={[styles.miniCard, { backgroundColor: colors.yellowCard }]} /> : null}
          {p.red ? <View style={[styles.miniCard, { backgroundColor: colors.redCard }]} /> : null}
        </View>
      ))}
    </View>
  );

  return (
    <View style={{ flexDirection: 'row', gap: space.lg, padding: space.md }}>
      {col(home, 'HOME')}
      {col(away, 'AWAY')}
    </View>
  );
}

const styles = StyleSheet.create({
  pitch: { borderRadius: radius.md, overflow: 'hidden', alignSelf: 'center' },
  formations: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.sm },
  node: { position: 'absolute', width: NODE, alignItems: 'center' },
  circle: {
    width: NODE, height: NODE, borderRadius: NODE / 2,
    alignItems: 'center', justifyContent: 'center',
  },
  number: { color: '#FFF', fontFamily: font.bold, fontSize: 12 },
  card: { position: 'absolute', right: -3, top: -2, width: 7, height: 10, borderRadius: 1.5 },
  nameTag: { paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 3, maxWidth: 90 },
  nameText: { color: '#FFF', fontFamily: font.medium, fontSize: 9.5 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  miniCard: { width: 6, height: 9, borderRadius: 1 },
});

import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Rect } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, type as t, font } from '../theme';
import type { LineupPlayer, TeamLineup } from '../api/types';
import { Rating } from './Rating';

const NODE = 28;
/** Inset at the top of the pitch so the far keeper is not flush to the line. */
const PAD_TOP = 10;
/** Room at the foot for the near keeper's name tag, which hangs below him. */
const PAD_BOTTOM = 28;

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
  home, away, homeColor, awayColor, homeName, awayName,
}: {
  home: TeamLineup; away: TeamLineup;
  homeColor: string; awayColor: string;
  homeName?: string; awayName?: string;
}) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const w = width - space.md * 2;
  const h = w * 1.62;

  // Every name tag hangs below its own circle. Alternating the side by team
  // put the near side's tags between two rows, where it was genuinely unclear
  // which player each one belonged to; the pitch is inset instead so the
  // bottom keeper's tag still fits.
  const usableH = h - PAD_TOP - PAD_BOTTOM;

  const usable = home.hasPitchPositions || away.hasPitchPositions;
  if (!usable) return <LineupList home={home} away={away} homeName={homeName} awayName={awayName} />;

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
            top={PAD_TOP + (p.y ?? 0.5) * 0.5 * usableH - NODE / 2}
          />
        ))}
        {starters(home).map(p => (
          <PlayerNode
            key={p.id}
            player={p}
            color={homeColor}
            left={(p.x ?? 0.5) * w - NODE / 2}
            top={PAD_TOP + (1 - (p.y ?? 0.5) * 0.5) * usableH - NODE / 2}
          />
        ))}
      </View>

      <View style={styles.formations}>
        <TeamMeta lineup={away} name={awayName ?? 'Away'} color={awayColor} align="left" />
        <TeamMeta lineup={home} name={homeName ?? 'Home'} color={homeColor} align="right" />
      </View>

      <Bench home={home} away={away} homeName={homeName} awayName={awayName} />
    </View>
  );
}

/** Formation, coach and team rating under the pitch. */
function TeamMeta({
  lineup, name, color, align,
}: { lineup: TeamLineup; name: string; color: string; align: 'left' | 'right' }) {
  const { colors } = useTheme();
  const right = align === 'right';
  return (
    <View style={{ flex: 1, alignItems: right ? 'flex-end' : 'flex-start' }}>
      <View style={[styles.metaRow, right && { flexDirection: 'row-reverse' }]}>
        <View style={[styles.swatch, { backgroundColor: color }]} />
        <Text style={[t.label, { color: colors.text }]} numberOfLines={1}>
          {name}
        </Text>
        {lineup.rating ? <Rating value={lineup.rating} size="sm" /> : null}
      </View>
      <Text
        style={[t.caption, { color: colors.textMuted, textAlign: right ? 'right' : 'left' }]}
        numberOfLines={1}
      >
        {[lineup.formation, lineup.coach].filter(Boolean).join('  ·  ') || '—'}
      </Text>
    </View>
  );
}

/**
 * One player on the pitch.
 *
 * The circle is anchored exactly on its coordinate and everything else hangs
 * off it absolutely. An earlier version stacked the name tag in normal flow
 * and shifted the whole node up to compensate, which moved the circle off its
 * position and left the bottom half's tags overlapping the row above.
 *
 * The name tag is wider than the circle, so it is centred by pinning both
 * edges outside the node and letting it size itself, and it always hangs
 * directly below its own circle so ownership is never ambiguous.
 */
function PlayerNode({
  player, color, left, top,
}: {
  player: LineupPlayer;
  color: string;
  left: number;
  top: number;
}) {
  const { colors } = useTheme();

  return (
    <View style={[styles.node, { left, top }]} pointerEvents="none">
      <View
        style={[
          styles.circle,
          { backgroundColor: color },
          player.motm && styles.motm,
        ]}
      >
        <Text style={styles.number}>{player.number ?? ''}</Text>
      </View>

      {player.yellow || player.red ? (
        <View
          style={[
            styles.card,
            { backgroundColor: player.red ? colors.redCard : colors.yellowCard },
          ]}
        />
      ) : null}

      {player.goals > 0 ? (
        <View style={styles.goalPip}>
          <Text style={styles.goalPipText}>
            {player.goals > 1 ? `${player.goals}` : ''}⚽
          </Text>
        </View>
      ) : null}

      {player.rating !== null ? (
        <Rating value={player.rating} size="sm" style={styles.ratingChip} />
      ) : null}

      <View style={[styles.tagSlot, { top: NODE + 3 }]}>
        <View style={[styles.nameTag, { backgroundColor: 'rgba(0,0,0,0.78)' }]}>
          <Text style={styles.nameText} numberOfLines={1}>
            {player.shortName}
          </Text>
        </View>
      </View>
    </View>
  );
}

function Bench({
  home, away, homeName, awayName,
}: { home: TeamLineup; away: TeamLineup; homeName?: string; awayName?: string }) {
  const { colors } = useTheme();
  const subs = (l: TeamLineup) => l.players.filter(p => !p.starter);
  if (!subs(home).length && !subs(away).length) return null;

  return (
    <View style={{ marginTop: space.xl }}>
      <Text style={[t.label, { color: colors.textMuted, marginBottom: space.md }]}>
        SUBSTITUTES
      </Text>
      <View style={{ flexDirection: 'row', gap: space.lg }}>
        {[
          { l: home, n: homeName ?? 'Home' },
          { l: away, n: awayName ?? 'Away' },
        ].map((side, i) => (
          <View key={i} style={{ flex: 1, gap: 7 }}>
            <Text style={[t.caption, { color: colors.textDim }]} numberOfLines={1}>
              {side.n}
            </Text>
            {subs(side.l).map(p => (
              <View key={p.id} style={styles.listRow}>
                <Text style={[t.caption, { color: colors.textDim, width: 20 }]}>
                  {p.number ?? '–'}
                </Text>
                <Text style={[t.caption, { color: colors.textMuted, flex: 1 }]} numberOfLines={1}>
                  {p.name}
                </Text>
                {p.rating !== null ? <Rating value={p.rating} size="sm" /> : null}
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Degraded view for competitions without a formation grid.
 *
 * Full names here rather than the pitch's abbreviations: the constraint that
 * forces "V. Lindelöf" onto a 30px circle does not apply to a list, and the
 * full name is what people actually want to read.
 */
function LineupList({
  home, away, homeName, awayName,
}: { home: TeamLineup; away: TeamLineup; homeName?: string; awayName?: string }) {
  const { colors } = useTheme();

  const col = (l: TeamLineup, label: string) => (
    <View style={{ flex: 1, gap: 10 }}>
      <Text style={[t.label, { color: colors.text }]} numberOfLines={1}>{label}</Text>
      <Text style={[t.caption, { color: colors.textMuted, marginTop: -6 }]} numberOfLines={1}>
        {[l.formation, l.coach].filter(Boolean).join('  ·  ') || '—'}
      </Text>
      {l.players.filter(p => p.starter).map(p => (
        <View key={p.id} style={styles.listRow}>
          <Text style={[t.caption, { color: colors.textDim, width: 22 }]}>{p.number ?? '–'}</Text>
          <Text style={[t.body, { color: colors.text, flex: 1 }]} numberOfLines={1}>{p.name}</Text>
          {p.goals > 0 ? <Text style={{ fontSize: 11 }}>⚽</Text> : null}
          {p.yellow ? <View style={[styles.miniCard, { backgroundColor: colors.yellowCard }]} /> : null}
          {p.red ? <View style={[styles.miniCard, { backgroundColor: colors.redCard }]} /> : null}
          {p.rating !== null ? <Rating value={p.rating} size="sm" /> : null}
        </View>
      ))}
    </View>
  );

  return (
    <View style={{ flexDirection: 'row', gap: space.lg, padding: space.md }}>
      {col(home, homeName ?? 'Home')}
      {col(away, awayName ?? 'Away')}
    </View>
  );
}

const styles = StyleSheet.create({
  pitch: { borderRadius: radius.md, overflow: 'hidden', alignSelf: 'center' },
  formations: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.sm },
  node: { position: 'absolute', width: NODE, height: NODE },
  motm: { borderWidth: 2, borderColor: '#F2C230' },
  ratingChip: { position: 'absolute', bottom: -7, right: -13 },
  goalPip: { position: 'absolute', left: -9, top: -5 },
  goalPipText: { fontSize: 9, color: '#FFF' },
  /** Pinned wider than the node so a long name stays centred on the circle. */
  tagSlot: { position: 'absolute', left: -34, right: -34, alignItems: 'center' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  swatch: { width: 8, height: 8, borderRadius: 2 },
  circle: {
    width: NODE, height: NODE, borderRadius: NODE / 2,
    alignItems: 'center', justifyContent: 'center',
  },
  number: { color: '#FFF', fontFamily: font.bold, fontSize: 12 },
  card: { position: 'absolute', right: -3, top: -2, width: 7, height: 10, borderRadius: 1.5 },
  nameTag: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3, maxWidth: 92 },
  nameText: { color: '#FFF', fontFamily: font.medium, fontSize: 9.5 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  miniCard: { width: 6, height: 9, borderRadius: 1 },
});

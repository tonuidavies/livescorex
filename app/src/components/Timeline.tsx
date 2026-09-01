import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, tabular, type as t, font } from '../theme';
import type { MatchEvent } from '../api/types';

/**
 * Match summary. Home events sit left of the minute, away events right,
 * matching the wireframe. Period markers (Kick Off, Half Time) span the row.
 */
export function Timeline({ events }: { events: MatchEvent[] }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.card, { borderColor: colors.border }]}>
      {events.map((e, i) => {
        const isGoal = e.type === 'goal' || e.type === 'own-goal' || e.type === 'penalty';
        return (
        <View
          key={e.id}
          style={[
            styles.row,
            {
              borderBottomColor: colors.divider,
              borderBottomWidth: i === events.length - 1 ? 0 : StyleSheet.hairlineWidth,
            },
            // Goals are what people scan for; everything else is context.
            isGoal && { backgroundColor: colors.cardAlt },
          ]}
        >
          {isGoal ? <View style={[styles.goalEdge, { backgroundColor: colors.accent }]} /> : null}
          {e.type === 'period' ? (
            <View style={styles.period}>
              <Text style={[t.bodyMed, { color: colors.text }]}>{periodLabel(e)}</Text>
              {e.score ? (
                <Text style={[t.body, { color: colors.textMuted, marginTop: 2 }]}>
                  {e.score.home} - {e.score.away}
                </Text>
              ) : null}
            </View>
          ) : (
            <>
              <View style={styles.side}>
                {e.side === 'home' ? <EventCell event={e} align="right" /> : null}
              </View>

              <View style={styles.minute}>
                <Text style={[t.bodyMed, tabular, { color: colors.text }]}>
                  {e.minute !== null ? `${e.minute}${e.plus ? `+${e.plus}` : ''}'` : ''}
                </Text>
                {e.score ? (
                  <Text
                    style={[
                      t.caption, tabular,
                      { color: isGoal ? colors.text : colors.textMuted, marginTop: 2,
                        fontFamily: isGoal ? font.semibold : font.regular },
                    ]}
                  >
                    {e.score.home} - {e.score.away}
                  </Text>
                ) : null}
              </View>

              <View style={styles.side}>
                {e.side === 'away' ? <EventCell event={e} align="left" /> : null}
              </View>
            </>
          )}
        </View>
        );
      })}
    </View>
  );
}

function periodLabel(e: MatchEvent): string {
  const txt = (e.text ?? '').toLowerCase();
  if (txt.includes('first half begins') || txt.includes('kick off')) return 'Kick Off';
  if (txt.includes('first half ends') || txt.includes('half time')) return 'Half Time';
  if (txt.includes('second half begins')) return 'Second Half';
  if (txt.includes('match ends') || txt.includes('full time')) return 'Full Time';
  return e.text ?? '';
}

function EventCell({ event, align }: { event: MatchEvent; align: 'left' | 'right' }) {
  const { colors } = useTheme();
  const reverse = align === 'right';

  return (
    <View style={[styles.cell, reverse && { flexDirection: 'row-reverse' }]}>
      <EventIcon event={event} />
      <View style={{ flexShrink: 1 }}>
        <Text
          style={[t.body, { color: colors.text, textAlign: align === 'right' ? 'right' : 'left' }]}
          numberOfLines={2}
        >
          {event.playerName ?? ''}
        </Text>
        {event.type === 'substitution' && event.playerOutName ? (
          <Text
            style={[t.caption, { color: colors.textMuted, textAlign: align === 'right' ? 'right' : 'left' }]}
            numberOfLines={1}
          >
            {event.playerOutName}
          </Text>
        ) : null}
        {event.type === 'penalty' ? (
          <Text style={[t.caption, { color: colors.textMuted, textAlign: align === 'right' ? 'right' : 'left' }]}>
            Penalty
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function EventIcon({ event }: { event: MatchEvent }) {
  const { colors } = useTheme();
  switch (event.type) {
    case 'goal':
    case 'penalty':
      return <MaterialCommunityIcons name="soccer" size={17} color={colors.text} />;
    case 'own-goal':
      return <MaterialCommunityIcons name="soccer" size={17} color={colors.redCard} />;
    case 'penalty-missed':
      return <MaterialCommunityIcons name="close-circle-outline" size={17} color={colors.textMuted} />;
    case 'yellow':
      return <View style={[styles.card2, { backgroundColor: colors.yellowCard }]} />;
    case 'red':
      return <View style={[styles.card2, { backgroundColor: colors.redCard }]} />;
    case 'second-yellow':
      return (
        <View style={{ width: 16, height: 16 }}>
          <View style={[styles.card2, styles.stackBack, { backgroundColor: colors.yellowCard }]} />
          <View style={[styles.card2, styles.stackFront, { backgroundColor: colors.redCard }]} />
        </View>
      );
    case 'substitution':
      return <Ionicons name="swap-vertical" size={17} color={colors.text} />;
    case 'var':
      return <MaterialCommunityIcons name="television" size={17} color={colors.textMuted} />;
    default:
      return <View style={{ width: 17 }} />;
  }
}

const styles = StyleSheet.create({
  card: {
    margin: space.md, borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingVertical: space.sm },
  goalEdge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  side: { flex: 1, paddingHorizontal: space.md },
  cell: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  minute: { width: 78, alignItems: 'center' },
  period: { flex: 1, alignItems: 'center', paddingVertical: space.xs },
  card2: { width: 12, height: 16, borderRadius: 2 },
  stackBack: { position: 'absolute', left: 0, top: 0 },
  stackFront: { position: 'absolute', left: 4, top: 2 },
});

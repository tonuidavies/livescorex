import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeProvider';
import { space, type as t } from '../theme';
import { api } from '../api/client';
import { usePrefs } from '../store/prefs';
import { Crest } from '../components/Crest';
import { Star } from '../components/Star';
import { StandingsTable } from '../components/StandingsTable';
import { EmptyState, ErrorState, Loading } from '../components/StateViews';
import type { Standings, League } from '../api/types';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Table'>;

export function TableScreen({ route, navigation }: Props) {
  const { leagueSlug } = route.params;
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { isLeague, toggleLeague } = usePrefs();

  const [standings, setStandings] = useState<Standings | null>(null);
  const [league, setLeague] = useState<League | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    try {
      const [s, cat] = await Promise.all([
        api.standings(leagueSlug).catch(() => null),
        api.leagues().catch(() => null),
      ]);
      setStandings(s);
      setLeague(cat?.leagues.find(l => l.slug === leagueSlug) ?? null);
      setError(s ? null : 'No table published for this competition');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the table');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [leagueSlug]);

  useEffect(() => { void load(); }, [load]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <Star on={isLeague(leagueSlug)} onToggle={() => toggleLeague(leagueSlug)} />
      </View>

      {loading ? (
        <Loading />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.accent} />
          }
        >
          <View style={styles.crest}>
            <Crest uri={league?.logo ?? null} name={league?.name ?? leagueSlug} size={92} />
            <Text style={[t.h3, { color: colors.text, marginTop: space.md }]}>
              {league?.name ?? leagueSlug}
            </Text>
            {league ? (
              <Text style={[t.caption, { color: colors.textMuted, marginTop: 2 }]}>
                {league.countryName}
              </Text>
            ) : null}
          </View>

          {standings ? (
            <StandingsTable rows={standings.rows} />
          ) : error ? (
            <EmptyState icon="list-outline" title="No table available" subtitle={error} />
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingVertical: space.sm },
  crest: { alignItems: 'center', paddingVertical: space.lg },
});

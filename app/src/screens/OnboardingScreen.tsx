import React, { useEffect, useMemo, useState } from 'react';
import {
  Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, type as t, font } from '../theme';
import { api } from '../api/client';
import { usePrefs } from '../store/prefs';
import { Button } from '../components/Button';
import { LeagueCrest } from '../components/Crest';
import { Star } from '../components/Star';
import type { League } from '../api/types';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

/**
 * Two pages, and no account required to get past them.
 *
 * The wireframe put Sign In / Create account before any content. Push targeting
 * works off a device token and favourites persist locally, so an account only
 * buys cross-device sync — and a gate before value is measurable drop-off on a
 * market where most installs are on low-end Android over metered data.
 */
export function OnboardingScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { set, isLeague, toggleLeague, prefs } = usePrefs();

  const [page, setPage] = useState(0);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [defaults, setDefaults] = useState<string[]>([]);

  useEffect(() => {
    api.leagues()
      .then(r => {
        setLeagues(r.leagues);
        setDefaults(r.defaults);
        // Seeding happens at the app root (useSeedLeagues) so that routes
        // which skip onboarding still get a starter set.
      })
      .catch(() => { /* offline first run: the picker just starts empty */ });
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const finish = () => {
    set({ onboarded: true });
    navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
  };

  const featured = useMemo(() => {
    const priority = new Set(defaults);
    return [
      ...leagues.filter(l => priority.has(l.slug)),
      ...leagues.filter(l => !priority.has(l.slug) && l.tier === 1),
    ];
  }, [leagues, defaults]);

  if (page === 0) {
    return (
      <View style={[styles.page, { backgroundColor: colors.bg, paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xl }]}>
        <Text style={[t.caption, { color: colors.textMuted }]}>1 of 2</Text>

        <View style={styles.centre}>
          <Text style={[t.h1, { color: colors.text, textAlign: 'center' }]}>
            Welcome to{'\n'}LivescoreX
          </Text>
          <Text style={[t.body, { color: colors.textMuted, textAlign: 'center', marginTop: space.lg, maxWidth: width * 0.8 }]}>
            Second-by-second scores from close to 700 competitions — the
            Kenyan Premier League and the Champions League alike.
          </Text>
        </View>

        <Button label="Get Started" onPress={() => setPage(1)} />
        <Pressable onPress={finish} style={styles.skip} accessibilityRole="button">
          <Text style={[t.bodyMed, { color: colors.textMuted }]}>Skip</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.page, { backgroundColor: colors.bg, paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xl }]}>
      <View style={styles.topRow}>
        <Pressable onPress={() => setPage(0)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={[t.caption, { color: colors.textMuted }]}>‹ 2 of 2</Text>
        </Pressable>
        <Pressable onPress={finish} hitSlop={12} accessibilityRole="button">
          <Text style={[t.bodyMed, { color: colors.textMuted }]}>Skip</Text>
        </Pressable>
      </View>

      <Text style={[t.h2, { color: colors.text, textAlign: 'center', marginTop: space.lg }]}>
        Pick your competitions
      </Text>
      <Text style={[t.body, { color: colors.textMuted, textAlign: 'center', marginTop: space.sm }]}>
        You can change these any time. Everything else stays one search away.
      </Text>

      <ScrollView
        style={{ marginTop: space.xl }}
        contentContainerStyle={{ paddingBottom: space.xl }}
        showsVerticalScrollIndicator={false}
      >
        {featured.map(l => (
          <Pressable
            key={l.slug}
            onPress={() => toggleLeague(l.slug)}
            style={[styles.row, { backgroundColor: colors.card }]}
          >
            <LeagueCrest league={l} size={30} />
            <View style={{ flex: 1 }}>
              <Text style={[t.bodyMed, { color: colors.text }]} numberOfLines={1}>{l.name}</Text>
              <Text style={[t.caption, { color: colors.textMuted }]}>{l.countryName}</Text>
            </View>
            <Star on={isLeague(l.slug)} onToggle={() => toggleLeague(l.slug)} />
          </Pressable>
        ))}
      </ScrollView>

      <Button
        label={prefs.leagues.length ? `Next  ·  ${prefs.leagues.length} selected` : 'Next'}
        onPress={finish}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: space.xl },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  skip: { alignSelf: 'center', paddingVertical: space.lg },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    padding: space.md, borderRadius: radius.md, marginBottom: space.sm,
  },
});

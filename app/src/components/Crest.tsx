import React, { useState } from 'react';
import {
  Image, StyleSheet, Text, View,
  type ImageStyle, type StyleProp, type ViewStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { font } from '../theme';
import { initials } from '../util/format';

/**
 * Team crest with an initials fallback.
 *
 * Smaller leagues frequently return an empty logo URL — Kenyan Premier League
 * clubs have none at all — so the fallback is the common path, not an edge
 * case, and has to look deliberate.
 */
export function Crest({
  uri, name, size = 22, style,
}: { uri: string | null; name: string; size?: number; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const show = uri && !failed;

  if (show) {
    return (
      <Image
        source={{ uri }}
        style={[
          { width: size, height: size, borderRadius: size / 8 },
          style as StyleProp<ImageStyle>,
        ]}
        resizeMode="contain"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        {
          width: size, height: size, borderRadius: size / 2,
          backgroundColor: colors.cardAlt, borderColor: colors.border,
        },
        style,
      ]}
    >
      <Text
        style={{
          color: colors.textMuted,
          fontFamily: font.semibold,
          fontSize: size * 0.4,
        }}
        numberOfLines={1}
      >
        {initials(name)}
      </Text>
    </View>
  );
}

/**
 * Competition crest that respects the theme.
 *
 * Many league marks are near-black artwork on transparency — the Premier
 * League lion is the obvious one — and disappear against a dark background,
 * so the dark variant is preferred whenever the theme is dark and one exists.
 */
export function LeagueCrest({
  league, size = 24, style,
}: {
  league: { logo: string | null; logoDark: string | null; countryName: string };
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { name } = useTheme();
  const uri = name === 'dark' ? (league.logoDark ?? league.logo) : (league.logo ?? league.logoDark);
  return <Crest uri={uri} name={league.countryName} size={size} style={style} />;
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
});

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, type as t, font } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Auth'>;

/**
 * Optional sign-in, reached from Profile or the drawer — never on the way in.
 * Framed around what an account actually buys, so the ask is honest.
 */
export function AuthScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.page, { backgroundColor: colors.bg, paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xl }]}>
      <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
        <Ionicons name="close" size={24} color={colors.textMuted} />
      </Pressable>

      <View style={styles.centre}>
        <Text style={[t.h2, { color: colors.text, textAlign: 'center' }]}>
          Sync across your devices
        </Text>
        <Text style={[t.body, { color: colors.textMuted, textAlign: 'center', marginTop: space.md, maxWidth: 300 }]}>
          Your favourites already work on this phone. An account keeps them in
          step everywhere you sign in.
        </Text>
      </View>

      <Provider
        icon="logo-google"
        label="Continue with Google"
        onPress={() => navigation.navigate('SignIn', { provider: 'google' })}
      />
      <Provider
        icon="mail"
        label="Continue with Email"
        onPress={() => navigation.navigate('SignIn', { provider: 'email' })}
      />

      <Text style={[t.caption, { color: colors.textMuted, textAlign: 'center', marginTop: space.lg }]}>
        By creating an account you agree to our{' '}
        <Text style={{ color: '#5B9BE8' }}>Terms and Conditions</Text>
      </Text>
    </View>
  );
}

function Provider({
  icon, label, onPress,
}: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.provider, { backgroundColor: pressed ? '#EEE' : '#FFF' }]}
      accessibilityRole="button"
    >
      <Ionicons name={icon} size={21} color="#131316" />
      <Text style={{ color: colors.accent, fontFamily: font.semibold, fontSize: 16 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: space.xl },
  close: { alignSelf: 'flex-end' },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  provider: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: space.md, height: 56, borderRadius: radius.md, marginBottom: space.md,
  },
});

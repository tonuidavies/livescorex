import React, { useState } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text,
  TextInput, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, type as t } from '../theme';
import { usePrefs } from '../store/prefs';
import { Button } from '../components/Button';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'SignIn'>;

/**
 * Sign in / create account.
 *
 * This is a local stub: it validates input and stores a profile on-device.
 * There is no auth backend yet, and deliberately so — nothing in MVP needs
 * one. Wire this to your identity provider when cross-device sync ships;
 * until then it should never block anything.
 */
export function SignInScreen({ route, navigation }: Props) {
  const mode = route.params?.mode ?? 'signin';
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { set } = usePrefs();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignUp = mode === 'signup';
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const valid = emailOk && password.length >= 8 && (!isSignUp || name.trim().length > 1);

  const submit = () => {
    if (!valid) {
      setError(
        !emailOk ? 'Enter a valid email address'
        : password.length < 8 ? 'Password must be at least 8 characters'
        : 'Enter your name',
      );
      return;
    }
    setBusy(true);
    setError(null);
    // Stand-in for a real auth call.
    setTimeout(() => {
      set({
        account: {
          id: `local:${email.trim().toLowerCase()}`,
          name: isSignUp ? name.trim() : email.trim().split('@')[0] ?? 'You',
          email: email.trim(),
        },
      });
      setBusy(false);
      navigation.getParent()?.goBack();
      navigation.goBack();
    }, 500);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      <ScrollView
        contentContainerStyle={{ padding: space.xl, paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>

        <Text style={[t.h2, { color: colors.text, marginTop: space.xl }]}>
          {isSignUp ? 'Create account' : 'Sign in'}
        </Text>
        <Text style={[t.body, { color: colors.textMuted, marginTop: space.sm }]}>
          {isSignUp
            ? 'Keeps your favourites in step across devices.'
            : 'Welcome back.'}
        </Text>

        {isSignUp ? (
          <Field
            label="Name"
            value={name}
            onValue={setName}
            placeholder="Your name"
            autoCapitalize="words"
          />
        ) : null}

        <Field
          label="Email"
          value={email}
          onValue={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Field
          label="Password"
          value={password}
          onValue={setPassword}
          placeholder="At least 8 characters"
          secureTextEntry
          autoCapitalize="none"
        />

        {error ? (
          <Text style={[t.caption, { color: colors.redCard, marginTop: space.sm }]}>{error}</Text>
        ) : null}

        <Button
          label={isSignUp ? 'Create account' : 'Sign in'}
          onPress={submit}
          loading={busy}
          style={{ marginTop: space.xl }}
        />

        <Pressable
          onPress={() => navigation.setParams({ mode: isSignUp ? 'signin' : 'signup' })}
          style={{ marginTop: space.lg, alignSelf: 'center' }}
          accessibilityRole="button"
        >
          <Text style={[t.body, { color: colors.textMuted }]}>
            {isSignUp ? 'Already have an account? ' : 'New here? '}
            <Text style={{ color: colors.accent }}>{isSignUp ? 'Sign in' : 'Create one'}</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label, value, onValue, ...rest
}: {
  label: string;
  value: string;
  /** Named `onValue` rather than `onChange`, which TextInput already owns
   *  with a different signature. */
  onValue: (v: string) => void;
} & Omit<React.ComponentProps<typeof TextInput>, 'value' | 'onChangeText'>) {
  const { colors } = useTheme();
  return (
    <View style={{ marginTop: space.xl }}>
      <Text style={[t.label, { color: colors.textMuted, marginBottom: space.sm }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onValue}
        placeholderTextColor={colors.textDim}
        style={[
          t.body,
          styles.input,
          { color: colors.text, backgroundColor: colors.card, borderColor: colors.border },
        ]}
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    height: 52, borderRadius: radius.md, paddingHorizontal: space.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
});

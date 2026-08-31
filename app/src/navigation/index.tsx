import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  NavigationContainer, DarkTheme, DefaultTheme, type LinkingOptions,
} from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from '../theme/ThemeProvider';
import { font } from '../theme';
import { usePrefs } from '../store/prefs';
import type { RootStackParamList, TabParamList } from './types';

import { MatchesScreen } from '../screens/MatchesScreen';
import { LiveScreen } from '../screens/LiveScreen';
import { FavouritesScreen } from '../screens/FavouritesScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { MatchDetailScreen } from '../screens/MatchDetailScreen';
import { TableScreen } from '../screens/TableScreen';
import { LeaguesScreen } from '../screens/LeaguesScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { AuthScreen } from '../screens/AuthScreen';
import { SignInScreen } from '../screens/SignInScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function TabBarLabel({ label, focused }: { label: string; focused: boolean }) {
  const { colors } = useTheme();
  return (
    <Text
      style={{
        color: focused ? colors.accent : colors.textMuted,
        fontFamily: font.medium,
        fontSize: 11,
      }}
    >
      {label}
    </Text>
  );
}

function Tabs() {
  const { colors } = useTheme();
  // Android 16 makes edge-to-edge mandatory, so the tab bar sits under the
  // system navigation bar unless it reserves the inset itself. Without this
  // the labels are clipped by Samsung's gesture pill.
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.chrome,
          borderTopColor: colors.divider,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 62 + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tab.Screen
        name="Matches"
        component={MatchesScreen}
        options={{
          tabBarLabel: ({ focused }) => <TabBarLabel label="Matches" focused={focused} />,
          tabBarIcon: ({ color }) => <Ionicons name="home" size={22} color={color} />,
        }}
      />
      <Tab.Screen
        name="Live"
        component={LiveScreen}
        options={{
          tabBarLabel: ({ focused }) => <TabBarLabel label="Live" focused={focused} />,
          tabBarIcon: ({ color }) => <MaterialCommunityIcons name="chart-bar" size={22} color={color} />,
        }}
      />
      <Tab.Screen
        name="Favourites"
        component={FavouritesScreen}
        options={{
          tabBarLabel: ({ focused }) => <TabBarLabel label="Favourite" focused={focused} />,
          tabBarIcon: ({ color }) => <Ionicons name="star" size={22} color={color} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: ({ focused }) => <TabBarLabel label="Profile" focused={focused} />,
          tabBarIcon: ({ color }) => <Ionicons name="person-circle-outline" size={23} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

/**
 * Deep links. Tapping a live-match notification opens that match directly —
 * `livescorex://match/espn:401879295`. Without this the notification would
 * just cold-start the app on the fixture list, which is the single most
 * annoying thing a score notification can do.
 */
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [Linking.createURL('/'), 'livescorex://'],
  config: {
    screens: {
      MatchDetail: {
        path: 'match/:matchId',
        parse: { matchId: decodeURIComponent },
      },
      Table: { path: 'league/:leagueSlug' },
      Tabs: {
        screens: {
          Matches: 'matches',
          Live: 'live',
          Favourites: 'favourites',
          Profile: 'profile',
        },
      },
    },
  },
};

export function Navigation() {
  const { colors, name } = useTheme();
  const { prefs, ready } = usePrefs();

  const navTheme = {
    ...(name === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(name === 'dark' ? DarkTheme : DefaultTheme).colors,
      background: colors.bg,
      card: colors.chrome,
      text: colors.text,
      border: colors.divider,
      primary: colors.accent,
    },
  };

  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <NavigationContainer theme={navTheme} linking={linking}>
      <Stack.Navigator
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}
        initialRouteName={prefs.onboarded ? 'Tabs' : 'Onboarding'}
      >
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        <Stack.Screen name="Tabs" component={Tabs} />
        <Stack.Screen name="MatchDetail" component={MatchDetailScreen} />
        <Stack.Screen name="Table" component={TableScreen} />
        <Stack.Screen name="Leagues" component={LeaguesScreen} />
        <Stack.Screen name="Search" component={SearchScreen} options={{ animation: 'fade' }} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Auth" component={AuthScreen} options={{ presentation: 'modal' }} />
        <Stack.Screen name="SignIn" component={SignInScreen} options={{ presentation: 'modal' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

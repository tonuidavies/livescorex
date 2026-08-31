import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
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
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.chrome,
          borderTopColor: colors.divider,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 62,
          paddingTop: 6,
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
    <NavigationContainer theme={navTheme}>
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

import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type TabParamList = {
  Matches: undefined;
  Live: undefined;
  Favourites: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Onboarding: undefined;
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  /** `leagueSlug` is optional because a notification deep link carries only
   *  the match id; the detail screen resolves the league from the server. */
  MatchDetail: { matchId: string; leagueSlug?: string };
  Table: { leagueSlug: string };
  Leagues: undefined;
  Search: undefined;
  Settings: undefined;
  Auth: undefined;
  SignIn: { provider?: 'google' | 'email'; mode?: 'signin' | 'signup' } | undefined;
};

/**
 * Tab screens can navigate to both their siblings and the parent stack, so
 * they need the composite type — otherwise `navigation.navigate('Settings')`
 * from inside a tab does not typecheck.
 */
export type TabScreenProps<T extends keyof TabParamList> = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}

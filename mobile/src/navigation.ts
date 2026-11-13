import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Listing } from './listings/store';

export type RootStack = {
  Listings: undefined;
  Login: undefined;
  AuthFlow: { mode: 'register' | 'verify' | 'reset' | 'change' };
  Listing: { listing: Listing };
  CreateListing: undefined;
  Profile: undefined;
};

export type Nav = NativeStackNavigationProp<RootStack>;

import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Listing } from './listings/store';

export type RootStack = {
  Listings: undefined;
  Login: undefined;
  Listing: { listing: Listing };
  CreateListing: undefined;
  Profile: undefined;
};

export type Nav = NativeStackNavigationProp<RootStack>;

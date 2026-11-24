import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Listing } from './listings/store';
import type { InventoryItem } from './inventory/types';

export type RootStack = {
  Listings: undefined;
  Login: undefined;
  AuthFlow: { mode: 'register' | 'verify' | 'reset' | 'change' };
  Listing: { listing: Listing };
  CreateListing: undefined;
  Profile: undefined;
  InventoryList: undefined;
  InventoryDetail: { id: string };
  InventoryForm: { mode: 'create' | 'edit'; id?: string; item?: InventoryItem };
};

export type Nav = NativeStackNavigationProp<RootStack>;

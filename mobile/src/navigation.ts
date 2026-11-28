import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Listing } from './listings/store';
import type { ListingSummary } from './listings/types';
import type { InventoryItem } from './inventory/types';
import type {
  TransactionListStatusFilter,
  TransactionRoleFilter,
} from './transactions/types';

import type { OrderRoleFilter, OrderStatus } from './orders/types';

export type RootStack = {
  Listings: undefined;
  Login: undefined;
  AuthFlow: { mode: 'register' | 'verify' | 'reset' | 'change' };
  Listing: { id?: string; listing?: ListingSummary | Listing };
  CreateListing: { preselectedItemId?: string } | undefined;
  MyListings: undefined;
  EditListing: { id: string };
  Profile: undefined;
  Settings: undefined;
  InventoryList: undefined;
  InventoryDetail: { id: string };
  InventoryForm: { mode: 'create' | 'edit'; id?: string; item?: InventoryItem };
  Transactions: { initialRole?: TransactionRoleFilter; initialStatus?: TransactionListStatusFilter } | undefined;
  TransactionDetail: { id: string };
  ReservationRequest: {
    listingId: string;
    listing?: ListingSummary;
    agreedPriceVnd?: number;
  };
  Orders:
    | {
        initialRole?: OrderRoleFilter;
        initialStatus?: OrderStatus | 'ALL';
        listingId?: string;
        listingTitle?: string;
      }
    | undefined;
  OrderDetail: { id: string; justCreated?: boolean };
};

export type Nav = NativeStackNavigationProp<RootStack>;

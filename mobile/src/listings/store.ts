import { create } from 'zustand';
import { api } from '../api/client';
import { normalizeListingSummary, type ListingSummary } from './types';

export type Listing = { id: string; title: string; description: string; price: number; seller: string };

type ListingState = {
  listings: Listing[];
  loading: boolean;
  load: () => Promise<void>;
  create: (input: Omit<Listing, 'id' | 'seller'>) => Promise<void>;
};

function toLegacyListing(raw: unknown): Listing {
  const summary: ListingSummary = normalizeListingSummary(raw);
  return {
    id: summary.id,
    title: summary.title,
    description: summary.description,
    price: summary.priceVnd,
    seller: summary.seller.displayName,
  };
}

export const useListings = create<ListingState>((set, get) => ({
  listings: [],
  loading: false,
  load: async () => {
    set({ loading: true });
    try {
      const data = await api<Listing[] | { items?: unknown[] }>('/listings');
      const rawItems = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
      set({ listings: rawItems.map(toLegacyListing) });
    } finally {
      set({ loading: false });
    }
  },
  create: async (input) => {
    const response = await api<Listing | { listing?: unknown }>('/listings', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    const rawListing =
      response && typeof response === 'object' && 'listing' in response && response.listing
        ? response.listing
        : response;
    set({ listings: [toLegacyListing(rawListing), ...get().listings] });
  },
}));

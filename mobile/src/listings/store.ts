import { create } from 'zustand';
import { api } from '../api/client';

export type Listing = { id: string; title: string; description: string; price: number; seller: string };
type ListingState = {
  listings: Listing[];
  loading: boolean;
  load: () => Promise<void>;
  create: (input: Omit<Listing, 'id' | 'seller'>) => Promise<void>;
};

export const useListings = create<ListingState>((set, get) => ({
  listings: [],
  loading: false,
  load: async () => {
    set({ loading: true });
    try {
      set({ listings: await api<Listing[]>('/listings') });
    } finally {
      set({ loading: false });
    }
  },
  create: async (input) => {
    const listing = await api<Listing>('/listings', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    set({ listings: [listing, ...get().listings] });
  },
}));

import { create } from 'zustand';
import { api } from '../api/client';
import { tokenStore } from './tokenStore';

export type User = { id: string; name: string; role: 'admin' | 'moderator' | 'seller' };
type SessionState = {
  token: string | null;
  user: User | null;
  loading: boolean;
  setSession: (token: string, user: User) => Promise<void>;
  restore: () => Promise<void>;
  logout: () => Promise<void>;
};

export const useSession = create<SessionState>((set) => ({
  token: null,
  user: null,
  loading: true,
  setSession: async (token, user) => {
    await tokenStore.save(token);
    set({ token, user, loading: false });
  },
  restore: async () => {
    try {
      const token = await tokenStore.get();
      if (!token) return set({ token: null, user: null, loading: false });
      const user = await api<User>('/auth/me');
      set({ token, user, loading: false });
    } catch {
      await tokenStore.clear();
      set({ token: null, user: null, loading: false });
    }
  },
  logout: async () => {
    await tokenStore.clear();
    set({ token: null, user: null, loading: false });
  },
}));

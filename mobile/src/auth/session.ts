import { create } from 'zustand';
import { api } from '../api/client';
import { tokenStore } from './tokenStore';
export type User = { id: string; name: string; email: string; studentId: string; role: 'admin' | 'moderator' | 'member'; roles: string[]; emailVerified: boolean; profileApproved: boolean; accountStatus: string };
type SessionState = {
  token: string | null; user: User | null; loading: boolean;
  setSession: (token: string, user: User, refreshToken?: string) => Promise<void>;
  restore: () => Promise<void>; logout: () => Promise<void>;
};
export const useSession = create<SessionState>((set) => ({
  token: null, user: null, loading: true,
  setSession: async (token, user, refreshToken) => {
    if (refreshToken) await tokenStore.saveRefresh(refreshToken);
    await tokenStore.save(token); set({ token, user, loading: false });
  },
  restore: async () => {
    try {
      if (!await tokenStore.get()) return set({ token: null, user: null, loading: false });
      const user = await api<User>('/auth/me');
      set({ token: await tokenStore.get(), user, loading: false });
    } catch { set({ token: null, user: null, loading: false }); }
  },
  logout: async () => {
    await api<void>('/auth/logout', { method: 'POST' });
    await tokenStore.clear(); set({ token: null, user: null, loading: false });
  },
}));

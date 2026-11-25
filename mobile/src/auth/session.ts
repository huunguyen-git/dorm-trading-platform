import { create } from 'zustand';
import { api } from '../api/client';
import { tokenStore } from './tokenStore';
import {
  registerSessionStore,
  resolveUserRestriction,
  type AccountRestriction,
  type SessionState,
  type User,
} from './sessionTypes';

export { resolveUserRestriction, type AccountRestriction, type User };

export const useSession = create<SessionState>((set) => ({
  token: null,
  user: null,
  loading: true,
  restriction: null,
  restrictionDismissed: false,
  setSession: async (token, user, refreshToken) => {
    if (refreshToken) await tokenStore.saveRefresh(refreshToken);
    await tokenStore.save(token);
    set({
      token,
      user,
      loading: false,
      restriction: resolveUserRestriction(user),
      restrictionDismissed: false,
    });
  },
  clearRestriction: () => set({ restriction: null, restrictionDismissed: true }),
  restore: async () => {
    try {
      if (!(await tokenStore.get())) return set({ token: null, user: null, loading: false });
      const user = await api<User>('/auth/me');
      set({
        token: await tokenStore.get(),
        user,
        loading: false,
        restriction: resolveUserRestriction(user),
        restrictionDismissed: false,
      });
    } catch {
      set({ token: null, user: null, loading: false });
    }
  },
  logout: async () => {
    try {
      await api<void>('/auth/logout', { method: 'POST' });
    } catch {
      // Best-effort server token revocation; always clear local session so the user is never trapped.
    } finally {
      await tokenStore.clear();
      set({ token: null, user: null, loading: false, restriction: null, restrictionDismissed: false });
    }
  },
}));

registerSessionStore(useSession);

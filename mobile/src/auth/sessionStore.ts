import { create } from 'zustand';
import { tokenStore } from './tokenStore';
import { resolveUserRestriction, type SessionState } from './sessionTypes';

export const useSessionStore = create<SessionState>((set) => ({
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
    throw new Error('Session actions are not initialized. Import useSession from auth/session.');
  },
  logout: async () => {
    throw new Error('Session actions are not initialized. Import useSession from auth/session.');
  },
}));

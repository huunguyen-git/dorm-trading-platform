import { api, ApiError } from '../api/client';
import { tokenStore } from './tokenStore';
import { useSessionStore } from './sessionStore';
import {
  resolveUserRestriction,
  type AccountRestriction,
  type User,
} from './sessionTypes';

export { resolveUserRestriction, type AccountRestriction, type User };

useSessionStore.setState({
  restore: async () => {
    try {
      if (!(await tokenStore.get())) {
        return useSessionStore.setState({ token: null, user: null, loading: false });
      }
      const user = await api<User>('/auth/me');
      useSessionStore.setState({
        token: await tokenStore.get(),
        user,
        loading: false,
        restriction: resolveUserRestriction(user),
        restrictionDismissed: false,
      });
    } catch {
      useSessionStore.setState({ token: null, user: null, loading: false });
    }
  },
  logout: async () => {
    try {
      await api<void>('/auth/logout', { method: 'POST' });
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401) throw e;
    }
    await tokenStore.clear();
    useSessionStore.setState({
      token: null,
      user: null,
      loading: false,
      restriction: null,
      restrictionDismissed: false,
    });
  },
});

export const useSession = useSessionStore;

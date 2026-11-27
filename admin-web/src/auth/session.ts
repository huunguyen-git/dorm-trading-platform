import { api, ApiError, setAccessToken } from '../api/client';
export type Role = 'admin' | 'moderator' | 'member';
export type User = { id: string; name: string; role: Role; email: string; roles: string[]; emailVerified: boolean; profileApproved: boolean; accountStatus: string };
type LoginResponse = { token: string; user: User };
let passwordChanged = false;
export function consumePasswordChanged() { const changed = passwordChanged; passwordChanged = false; return changed; }
export const auth = {
  me: () => api<User>('/auth/me'),
  async login(email: string, password: string) {
    const session = await api<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password, client: 'admin-web' }) });
    setAccessToken(session.token); return session.user;
  },
  async logout() {
    // Keep credentials on network failure so users can retry server-side revocation.
    try { await api<void>('/auth/logout', { method: 'POST' }); }
    catch (e) { if (!(e instanceof ApiError) || e.status !== 401) throw e; }
    setAccessToken(null);
  },
  async change(currentPassword: string, password: string) {
    await api<void>('/auth/password/change', { method: 'POST', body: JSON.stringify({ currentPassword, password }) });
    passwordChanged = true; setAccessToken(null); window.dispatchEvent(new Event('session-expired'));
  },
};

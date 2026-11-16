import { useSession } from '../auth/session';
import { tokenStore } from '../auth/tokenStore';
let refreshFlight: Promise<void> | null = null;
const baseUrl = () => { const url = process.env.EXPO_PUBLIC_API_URL; if (!url) throw new Error('EXPO_PUBLIC_API_URL is required'); return url; };
async function refresh() {
  if (!refreshFlight) refreshFlight = (async () => {
    const refreshToken = await tokenStore.getRefresh();
    if (!refreshToken) throw new Error('Phiên đã hết hạn.');
    const response = await fetch(`${baseUrl()}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken, client: 'mobile' }) });
    if (!response.ok) throw new Error('Phiên đã hết hạn.');
    const session = await response.json();
    await useSession.getState().setSession(session.token, session.user, session.refreshToken);
  })().finally(() => { refreshFlight = null; });
  return refreshFlight;
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const origin = baseUrl();
  const publicCall = ['/auth/login','/auth/register','/auth/otp/resend','/auth/otp/verify','/auth/password/reset'].includes(path);
  const send = async () => {
    const token = publicCall ? null : await tokenStore.get();
    return fetch(`${origin}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers } });
  };
  const sentToken = await tokenStore.get();
  let response = await send();
  if (response.status === 401 && !publicCall && response.headers?.get('WWW-Authenticate')?.startsWith('Bearer')) {
    try { if (await tokenStore.get() === sentToken) await refresh(); response = await send(); } catch { /* handled below */ }
  }
  if (response.status === 401 && !publicCall && path !== '/auth/password/change') { await tokenStore.clear(); useSession.setState({ token: null, user: null, loading: false }); }
  if (!response.ok) {
    const raw = await response.text(); let message = `API ${response.status}: ${raw}`;
    try { message = JSON.parse(raw).message ?? message; } catch { /* plain response */ }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

import { useSession } from '../auth/session';
import { tokenStore } from '../auth/tokenStore';
let refreshFlight: Promise<void> | null = null;
const baseUrl = () => { const url = process.env.EXPO_PUBLIC_API_URL; if (!url) throw new Error('EXPO_PUBLIC_API_URL is required'); return url; };
export const apiUrl = (path: string) => `${baseUrl()}${path}`;
async function errorOf(response: Response) {
  const raw = await response.text(); let message = `API ${response.status}: ${raw}`;
  try { message = JSON.parse(raw).message ?? message; } catch { /* plain response */ }
  return new Error(message);
}
/** Upload multipart; không tự đặt Content-Type để fetch sinh boundary. */
export async function upload(path: string, file: { uri: string; name: string; type: string }) {
  const form = new FormData();
  form.append('file', file as unknown as Blob);
  const token = await tokenStore.get();
  const response = await fetch(apiUrl(path), { method: 'POST', body: form, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (response.status === 401) { await tokenStore.clear(); useSession.setState({ token: null, user: null, loading: false }); }
  if (!response.ok) throw await errorOf(response);
}
/** Tải tệp nhị phân cần Authorization (ảnh thẻ). Trả null khi 404. */
export async function attachment(path: string) {
  const token = await tokenStore.get();
  const response = await fetch(apiUrl(path), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (response.status === 404) return null;
  if (!response.ok) throw await errorOf(response);
  return { type: response.headers.get('Content-Type') ?? 'image/jpeg', bytes: await response.arrayBuffer() };
}
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
  if (!response.ok) throw await errorOf(response);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

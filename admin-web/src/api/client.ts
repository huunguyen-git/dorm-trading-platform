let accessToken: string | null = null;
let refreshFlight: Promise<void> | null = null;
let epoch = 0;
export function setAccessToken(token: string | null) { accessToken = token; epoch++; sessionStorage.removeItem('session_token'); }
export class ApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
const baseUrl = () => { const url = import.meta.env.VITE_API_URL; if (!url) throw new Error('VITE_API_URL is required'); return url; };
export async function refreshSession() {
  if (!refreshFlight) {
    const generation = epoch;
    const rotate = async () => {
      const response = await fetch(`${baseUrl()}/auth/refresh`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client: 'admin-web' }) });
      if (!response.ok) throw new ApiError(response.status, 'Phiên đã hết hạn. Vui lòng đăng nhập lại.');
      const body = await response.json() as { token: string };
      if (epoch === generation) accessToken = body.token;
    };
    refreshFlight = (navigator.locks ? navigator.locks.request('dorm-refresh', rotate) : rotate()).finally(() => { refreshFlight = null; });
  }
  return refreshFlight;
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const origin = baseUrl();
  const publicCall = ['/auth/login','/auth/register','/auth/otp/resend','/auth/otp/verify','/auth/password/reset'].includes(path);
  const send = () => fetch(`${origin}${path}`, { ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', ...(!publicCall && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...init.headers } });
  const sentToken = accessToken;
  let response = await send();
  if (response.status === 401 && !publicCall && response.headers?.get('WWW-Authenticate')?.startsWith('Bearer')) {
    try {
      if (accessToken === sentToken) await refreshSession();
      // A security-filter 401 occurs before the controller; never replay other errors.
      response = await send();
    } catch { /* handled below */ }
  }
  if (response.status === 401 && !publicCall && path !== '/auth/password/change') { setAccessToken(null); window.dispatchEvent(new Event('session-expired')); }
  if (!response.ok) {
    const raw = await response.text();
    let message = raw || `API ${response.status}`;
    try { message = JSON.parse(raw).message ?? message; } catch { /* plain response */ }
    throw new ApiError(response.status, message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

let accessToken: string | null = null;
let refreshFlight: Promise<void> | null = null;
let epoch = 0;
export function setAccessToken(token: string | null) { accessToken = token; epoch++; sessionStorage.removeItem('session_token'); }
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
  }
}
const baseUrl = () => { const url = import.meta.env.VITE_API_URL; if (!url) throw new Error('VITE_API_URL is required'); return url; };
function hasBearerChallenge(response: Response): boolean {
  const header = response.headers?.get('WWW-Authenticate') ?? response.headers?.get('www-authenticate');
  return typeof header === 'string' && /^Bearer(?:\s|$)/i.test(header.trim());
}
export async function refreshSession() {
  if (!refreshFlight) {
    const generation = epoch;
    const rotate = async () => {
      const response = await fetch(`${baseUrl()}/auth/refresh`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client: 'admin-web' }) });
      if (!response.ok) {
        let message = response.status === 401 ? 'Phiên đã hết hạn. Vui lòng đăng nhập lại.' : 'Chưa thể làm mới phiên. Vui lòng thử lại.';
        let code: string | undefined;
        try {
          const parsed = JSON.parse(await response.text()) as { code?: string; message?: string };
          code = parsed?.code;
          if (response.status === 403 && parsed?.code === 'ACCOUNT_RESTRICTED' && parsed.message) {
            message = parsed.message;
          }
        } catch { /* ignore */ }
        throw new ApiError(response.status, message, code);
      }
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
  let refreshError: ApiError | null = null;
  if (response.status === 401 && !publicCall && hasBearerChallenge(response)) {
    try {
      if (accessToken === sentToken) await refreshSession();
      // A security-filter 401 occurs before the controller; never replay other errors.
      response = await send();
    } catch (error) {
      if (error instanceof ApiError && error.status === 403 && error.code === 'ACCOUNT_RESTRICTED') {
        setAccessToken(null);
        window.dispatchEvent(new Event('session-expired'));
        throw error;
      }
      // Only an explicit refresh 401 proves the session is no longer usable.
      // Network errors, 5xx and other rejections must leave credentials available for retry.
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      refreshError = error;
    }
  }
  if (response.status === 401 && !publicCall && (path !== '/auth/password/change' || hasBearerChallenge(response))) { setAccessToken(null); window.dispatchEvent(new Event('session-expired')); }
  if (!response.ok) {
    if (refreshError) throw refreshError;
    const raw = await response.text();
    let message = raw || `API ${response.status}`;
    let code: string | undefined;
    try {
      const parsed = JSON.parse(raw) as { code?: string; message?: string };
      code = parsed?.code;
      message = parsed?.message ?? message;
    } catch { /* plain response */ }
    if (response.status === 403 && code === 'ACCOUNT_RESTRICTED' && !publicCall) {
      setAccessToken(null);
      window.dispatchEvent(new Event('session-expired'));
    }
    throw new ApiError(response.status, message, code);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

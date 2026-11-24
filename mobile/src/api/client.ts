import { useSession, type AccountRestriction } from '../auth/session';
import { tokenStore } from '../auth/tokenStore';

export class RestrictedAccountError extends Error {
  readonly restriction: AccountRestriction;

  constructor(message: string, restriction: AccountRestriction) {
    super(message);
    this.name = 'RestrictedAccountError';
    this.restriction = restriction;
    Object.setPrototypeOf(this, RestrictedAccountError.prototype);
  }
}

type RawRestrictionResponse = {
  code?: unknown;
  message?: unknown;
  restriction?: {
    accountStatus?: unknown;
    lockType?: unknown;
    reason?: unknown;
    lockedUntil?: unknown;
    appealable?: unknown;
    reputationScore?: unknown;
  } | null;
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
  }
}
let refreshFlight: Promise<void> | null = null;

const baseUrl = () => {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (!url) throw new Error('EXPO_PUBLIC_API_URL is required');
  return url;
};

async function readResponseText(response: Response): Promise<string> {
  if (typeof response.text === 'function') {
    return response.text();
  }
  if (typeof response.json === 'function') {
    const body = await response.json();
    return typeof body === 'string' ? body : JSON.stringify(body);
  }
  return '';
}

function parseAccountRestriction(raw: string): AccountRestriction | null {
  try {
    const parsed = JSON.parse(raw) as RawRestrictionResponse;
    if (!parsed || typeof parsed !== 'object' || parsed.code !== 'ACCOUNT_RESTRICTED') {
      return null;
    }
    const message =
      typeof parsed.message === 'string' && parsed.message.trim()
        ? parsed.message
        : 'Tài khoản đang bị hạn chế.';
    const details =
      parsed.restriction && typeof parsed.restriction === 'object' ? parsed.restriction : null;
    return {
      accountStatus:
        typeof details?.accountStatus === 'string' && details.accountStatus.trim()
          ? details.accountStatus
          : 'BI_KHOA',
      lockType:
        typeof details?.lockType === 'string' && details.lockType.trim()
          ? details.lockType
          : null,
      reason:
        typeof details?.reason === 'string' && details.reason.trim() ? details.reason : null,
      lockedUntil:
        typeof details?.lockedUntil === 'string' && details.lockedUntil.trim()
          ? details.lockedUntil
          : null,
      appealable: typeof details?.appealable === 'boolean' ? details.appealable : false,
      reputationScore:
        typeof details?.reputationScore === 'number' && Number.isFinite(details.reputationScore)
          ? details.reputationScore
          : null,
      message,
    };
  } catch {
    return null;
  }
}

async function handleRestrictedResponse(
  response: Response,
  raw: string,
  clearSession: boolean,
): Promise<void> {
  if (response.status !== 403) return;
  const restriction = parseAccountRestriction(raw);
  if (!restriction) return;

  if (clearSession) {
    await tokenStore.clear();
    useSession.setState({
      token: null,
      user: null,
      loading: false,
      restriction,
      restrictionDismissed: false,
    });
  } else {
    const currentUser = useSession.getState().user;
    if (!currentUser && !useSession.getState().token) {
      await tokenStore.clear();
      useSession.setState({
        token: null,
        user: null,
        loading: false,
        restriction,
        restrictionDismissed: false,
      });
    } else {
      useSession.setState({
        loading: false,
        restriction,
        restrictionDismissed: false,
        user: currentUser
          ? {
              ...currentUser,
              accountStatus: restriction.accountStatus,
              roles: [],
            }
          : null,
      });
    }
  }

  throw new RestrictedAccountError(restriction.message, restriction);
}

async function refresh() {
  if (!refreshFlight) {
    refreshFlight = (async () => {
      const refreshToken = await tokenStore.getRefresh();
      if (!refreshToken) throw new ApiError(401, 'Phiên đã hết hạn.');
      const response = await fetch(`${baseUrl()}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken, client: 'mobile' }),
      });
      if (!response.ok) {
        const raw = await readResponseText(response);
        await handleRestrictedResponse(response, raw, true);
        throw new ApiError(response.status, response.status === 401 ? 'Phiên đã hết hạn.' : 'Chưa thể làm mới phiên. Vui lòng thử lại.');
      }
      const session = await response.json();
      await useSession.getState().setSession(session.token, session.user, session.refreshToken);
    })().finally(() => {
      refreshFlight = null;
    });
  }
  return refreshFlight;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const origin = baseUrl();
  const publicCall = [
    '/auth/login',
    '/auth/register',
    '/auth/otp/resend',
    '/auth/otp/verify',
    '/auth/password/reset',
  ].includes(path);
  const send = async () => {
    const token = publicCall ? null : await tokenStore.get();
    return fetch(`${origin}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  };
  const sentToken = await tokenStore.get();
  let response = await send();
  const authHeader =
    response.headers?.get('WWW-Authenticate') ?? response.headers?.get('www-authenticate');
  if (response.status === 401 && !publicCall && authHeader?.startsWith('Bearer')) {
    try {
      if ((await tokenStore.get()) === sentToken) await refresh();
      response = await send();
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
    }
  }
  if (response.status === 401 && !publicCall && (path !== '/auth/password/change' || response.headers?.get('WWW-Authenticate')?.startsWith('Bearer'))) {
    await tokenStore.clear();
    useSession.setState({ token: null, user: null, loading: false });
  }
  if (!response.ok) {
    const raw = await readResponseText(response);
    await handleRestrictedResponse(response, raw, path === '/auth/login' || path === '/auth/refresh');
    let message = `API ${response.status}: ${raw}`;
    let code: string | undefined;
    try {
      const parsed = JSON.parse(raw);
      message = parsed.message ?? message;
      code = parsed.code;
    } catch {
      /* plain response */
    }
    throw new ApiError(response.status, message, code);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

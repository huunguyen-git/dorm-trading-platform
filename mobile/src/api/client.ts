import { useSessionStore } from '../auth/sessionStore';
import type { AccountRestriction } from '../auth/sessionTypes';
import { tokenStore } from '../auth/tokenStore';
import { appendMultipartFile, type MultipartFileInput } from './multipart';

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

export interface ApiErrorDetails {
  attemptsUsed?: number;
  maxAttempts?: number;
  remainingAttempts?: number;
  locked?: boolean;
  expiresAt?: string | null;
  [key: string]: unknown;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly details?: ApiErrorDetails,
  ) {
    super(message);
  }
}

function extractErrorDetails(parsed: unknown): ApiErrorDetails | undefined {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return undefined;
  }
  const record = parsed as Record<string, unknown>;
  const extra: ApiErrorDetails = {};
  let hasExtra = false;
  for (const [key, value] of Object.entries(record)) {
    if (key === 'message' || key === 'code') continue;
    extra[key] = value;
    hasExtra = true;
  }
  return hasExtra ? extra : undefined;
}

let refreshFlight: Promise<void> | null = null;

const baseUrl = () => {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (!url) throw new Error('EXPO_PUBLIC_API_URL is required');
  return url;
};

export const apiUrl = (path: string) => `${baseUrl()}${path}`;

function hasBearerChallenge(response: Response): boolean {
  const header =
    response.headers?.get('WWW-Authenticate') ?? response.headers?.get('www-authenticate');
  return typeof header === 'string' && /^Bearer(?:\s|$)/i.test(header.trim());
}

function isLocalOrPrivateHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return false;
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '10.0.2.2') {
    return true;
  }
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
    return true;
  }
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) {
    return true;
  }
  const m172 = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host);
  if (m172) {
    const second = Number(m172[1]);
    return second >= 16 && second <= 31;
  }
  return false;
}

const CANONICAL_MEDIA_PATH_RE =
  /^\/api\/v1\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getConfiguredApiOrigin(): string {
  return process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') ?? '';
}

function getConfiguredApiOriginUrl(): URL | null {
  const configuredOrigin = getConfiguredApiOrigin();
  if (!configuredOrigin) return null;
  try {
    const parsed = new URL(configuredOrigin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed;
  } catch {
    return null;
  }
}

function joinApiMediaPath(configuredOrigin: string, mediaPath: string, search = ''): string {
  if (configuredOrigin.endsWith('/api/v1')) {
    return `${configuredOrigin}${mediaPath.slice('/api/v1'.length)}${search}`;
  }
  return `${configuredOrigin}${mediaPath}${search}`;
}

/**
 * Chuẩn hóa URL ảnh từ `/api/v1/media/{id}` sang gốc `EXPO_PUBLIC_API_URL` của thiết bị hiện tại
 * để ảnh hiển thị nhất quán trên cả iOS (Simulator / Expo Go), Android Emulator (`10.0.2.2`) và máy thật qua LAN.
 */
export function resolveMediaUrl(rawUrl: string): string {
  if (typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  const configuredOrigin = getConfiguredApiOrigin();
  if (!configuredOrigin) return trimmed;

  if (CANONICAL_MEDIA_PATH_RE.test(trimmed)) {
    return joinApiMediaPath(configuredOrigin, trimmed);
  }

  try {
    const parsed = new URL(trimmed);
    if (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      CANONICAL_MEDIA_PATH_RE.test(parsed.pathname) &&
      isLocalOrPrivateHost(parsed.hostname)
    ) {
      return joinApiMediaPath(configuredOrigin, parsed.pathname, parsed.search);
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

/**
 * Kiểm tra xem URL ảnh có trỏ chính xác tới dịch vụ `/api/v1/media/{uuid}` cùng origin (scheme + host + port)
 * của ứng dụng hay không (dùng để chỉ gửi Bearer token cho backend của chính mình, tuyệt đối không rò rỉ token
 * sang domain, giao thức hoặc cổng khác).
 */
export function isAppMediaUrl(rawUrl: string): boolean {
  if (typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;
  if (CANONICAL_MEDIA_PATH_RE.test(trimmed)) return true;

  try {
    const parsed = new URL(trimmed);
    if (
      (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
      !CANONICAL_MEDIA_PATH_RE.test(parsed.pathname)
    ) {
      return false;
    }
    const configuredUrl = getConfiguredApiOriginUrl();
    if (!configuredUrl) {
      return false;
    }
    return parsed.origin === configuredUrl.origin;
  } catch {
    return false;
  }
}

/**
 * Chuẩn hóa URL ảnh về đường dẫn tương đối `/api/v1/media/{id}` trước khi gửi lên backend lưu CSDL
 * (tránh làm bẩn DB bằng `localhost`/`10.0.2.2`/IP LAN). URL ngoài giữ nguyên.
 */
export function toPersistableMediaUrl(rawUrl: string): string {
  if (typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  if (CANONICAL_MEDIA_PATH_RE.test(trimmed)) return trimmed;

  try {
    const parsed = new URL(trimmed);
    if (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      CANONICAL_MEDIA_PATH_RE.test(parsed.pathname)
    ) {
      const configuredUrl = getConfiguredApiOriginUrl();
      if (
        (configuredUrl && parsed.origin === configuredUrl.origin) ||
        isLocalOrPrivateHost(parsed.hostname)
      ) {
        return parsed.pathname;
      }
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

/**
 * Tạo đối tượng `source` cho `<Image>` với URL đã chuẩn hóa và header `Authorization`
 * chỉ khi URL đích đã chuẩn hóa trùng khớp origin & đường dẫn `/api/v1/media/{uuid}` của backend
 * (hỗ trợ xem ảnh nháp/kho/tin ẩn cho chủ tin mà không bao giờ rò rỉ token sang host/cổng/giao thức khác).
 */
export function buildMediaImageSource(
  rawUrl: string,
  token?: string | null,
): { uri: string; headers?: Record<string, string> } {
  const uri = resolveMediaUrl(rawUrl);
  if (!uri) return { uri: '' };
  const resolvedToken = token === undefined ? useSessionStore.getState().token : token;
  const authToken = typeof resolvedToken === 'string' ? resolvedToken.trim() : '';
  if (authToken && isAppMediaUrl(uri)) {
    return {
      uri,
      headers: { Authorization: `Bearer ${authToken}` },
    };
  }
  return { uri };
}

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
    useSessionStore.setState({
      token: null,
      user: null,
      loading: false,
      restriction,
      restrictionDismissed: false,
    });
  } else {
    const currentUser = useSessionStore.getState().user ?? null;
    if (!currentUser && !useSessionStore.getState().token) {
      await tokenStore.clear();
      useSessionStore.setState({
        token: null,
        user: null,
        loading: false,
        restriction,
        restrictionDismissed: false,
      });
    } else {
      useSessionStore.setState({
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

async function errorOf(response: Response) {
  const raw = await readResponseText(response);
  await handleRestrictedResponse(response, raw, false);
  let message = `API ${response.status}: ${raw}`;
  let code: string | undefined;
  let details: ApiErrorDetails | undefined;
  try {
    const parsed = JSON.parse(raw);
    message = parsed.message ?? message;
    code = parsed.code;
    details = extractErrorDetails(parsed);
  } catch {
    /* plain response */
  }
  return new ApiError(response.status, message, code, details);
}

/** Upload multipart; không tự đặt Content-Type để fetch sinh boundary. */
export async function upload(path: string, file: MultipartFileInput) {
  // FormData mới mỗi lần gọi để retry sau refresh không gửi lại body đã dùng.
  const response = await authorizedSend(path, async () => {
    const form = new FormData();
    await appendMultipartFile(form, 'file', file);
    return { method: 'POST', body: form };
  });
  if (!response.ok) throw await errorOf(response);
}

/** Upload multipart trả về JSON với FormData mới ở mỗi lần gửi (an toàn khi retry 401 refresh). */
export async function apiMultipart<T>(
  path: string,
  buildFormData: () => FormData | Promise<FormData>,
): Promise<T> {
  const response = await authorizedSend(path, async () => ({
    method: 'POST',
    body: await buildFormData(),
  }));
  if (!response.ok) throw await errorOf(response);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

/** Tải tệp nhị phân cần Authorization (ảnh thẻ). Trả null khi 404. */
export async function attachment(path: string) {
  const response = await authorizedSend(path, () => ({}));
  if (response.status === 404) return null;
  if (!response.ok) throw await errorOf(response);
  return {
    type: response.headers.get('Content-Type') ?? 'image/jpeg',
    bytes: await response.arrayBuffer(),
  };
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
        throw new ApiError(
          response.status,
          response.status === 401
            ? 'Phiên đã hết hạn.'
            : 'Chưa thể làm mới phiên. Vui lòng thử lại.',
        );
      }
      const session = await response.json();
      await useSessionStore.getState().setSession(session.token, session.user, session.refreshToken);
    })().finally(() => {
      refreshFlight = null;
    });
  }
  return refreshFlight;
}

function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {};
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return headers as Record<string, string>;
}

/**
 * Gửi request cần Bearer token với cùng state machine của api(): 401 + thử thách Bearer thì refresh một lần rồi thử lại.
 * Chỉ refresh trả 401 mới xóa phiên; lỗi mạng/5xx giữ nguyên token để lần sau thử tiếp.
 */
async function authorizedSend(
  path: string,
  build: () => RequestInit | Promise<RequestInit>,
): Promise<Response> {
  const send = async () => {
    const token = await tokenStore.get();
    const requestInit = await build();
    return fetch(apiUrl(path), {
      ...requestInit,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  };
  const sentToken = await tokenStore.get();
  let response = await send();
  let refreshError: ApiError | null = null;
  if (response.status === 401 && hasBearerChallenge(response)) {
    try {
      if ((await tokenStore.get()) === sentToken) await refresh();
      response = await send();
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      refreshError = error;
    }
  }
  if (response.status === 401 && hasBearerChallenge(response)) {
    await tokenStore.clear();
    useSessionStore.setState({
      token: null,
      user: null,
      loading: false,
      restriction: null,
      restrictionDismissed: false,
    });
  }
  if (refreshError) throw refreshError;
  return response;
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
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  const send = async () => {
    const token = publicCall ? null : await tokenStore.get();
    return fetch(`${origin}${path}`, {
      ...init,
      headers: {
        ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...normalizeHeaders(init.headers),
      },
    });
  };
  const sentToken = await tokenStore.get();
  let response = await send();
  let refreshError: ApiError | null = null;
  if (response.status === 401 && !publicCall && hasBearerChallenge(response)) {
    try {
      if ((await tokenStore.get()) === sentToken) await refresh();
      response = await send();
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      refreshError = error;
    }
  }
  // Chỉ 401 có thử thách Bearer mới chứng minh phiên hỏng. 401 sai mật khẩu (không có header) phải giữ phiên.
  if (response.status === 401 && !publicCall && hasBearerChallenge(response)) {
    await tokenStore.clear();
    useSessionStore.setState({
      token: null,
      user: null,
      loading: false,
      restriction: null,
      restrictionDismissed: false,
    });
  }
  if (!response.ok) {
    if (refreshError) throw refreshError;
    const raw = await readResponseText(response);
    await handleRestrictedResponse(response, raw, path === '/auth/login' || path === '/auth/refresh');
    let message = `API ${response.status}: ${raw}`;
    let code: string | undefined;
    let details: ApiErrorDetails | undefined;
    try {
      const parsed = JSON.parse(raw);
      message = parsed.message ?? message;
      code = parsed.code;
      details = extractErrorDetails(parsed);
    } catch {
      /* plain response */
    }
    throw new ApiError(response.status, message, code, details);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

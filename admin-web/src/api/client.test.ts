import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, setAccessToken } from './client';
import { auth } from '../auth/session';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  sessionStorage.clear(); setAccessToken(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('api client', () => {
  it.each(['offline', '503', '403', 'retry-offline'])('keeps logout retryable after refresh path failure: %s', async (failure) => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:8082/api/v1'); setAccessToken('expired');
    const onExpire = vi.fn(); window.addEventListener('session-expired', onExpire);
    const expired = () => new Response('', { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } });
    fetchMock.mockResolvedValueOnce(expired());
    if (failure === 'offline') fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    else if (failure === 'retry-offline') {
      fetchMock.mockResolvedValueOnce(Response.json({ token: 'fresh' }));
      fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    } else fetchMock.mockResolvedValueOnce(new Response('', { status: Number(failure) }));
    try {
      await expect(auth.logout()).rejects.toThrow();
      expect(onExpire).not.toHaveBeenCalled();
      const retained = failure === 'retry-offline' ? 'fresh' : 'expired';
      fetchMock.mockResolvedValueOnce(Response.json({ id: '1' }));
      await api('/auth/me');
      expect(fetchMock.mock.lastCall?.[1].headers.Authorization).toBe(`Bearer ${retained}`);
      fetchMock.mockResolvedValueOnce(expired()).mockResolvedValueOnce(Response.json({ token: 'retry-token' }))
        .mockResolvedValueOnce(new Response(null, { status: 204 }));
      await expect(auth.logout()).resolves.toBeUndefined();
      expect(fetchMock.mock.lastCall?.[0]).toContain('/auth/logout');
      expect(fetchMock.mock.lastCall?.[1].headers.Authorization).toBe('Bearer retry-token');
      fetchMock.mockResolvedValueOnce(Response.json({})); await api('/auth/me');
      expect(fetchMock.mock.lastCall?.[1].headers.Authorization).toBeUndefined();
    } finally { window.removeEventListener('session-expired', onExpire); }
  });
  it('finishes logout when refresh explicitly rejects the session with 401', async () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:8082/api/v1'); setAccessToken('expired');
    fetchMock.mockResolvedValueOnce(new Response('', { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } }))
      .mockResolvedValueOnce(new Response('', { status: 401 }));
    await expect(auth.logout()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('finishes logout when the session has expired but preserves network failures', async () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:8082/api/v1'); setAccessToken('expired');
    fetchMock.mockResolvedValue(new Response('', { status: 401 }));
    await expect(auth.logout()).resolves.toBeUndefined();
    setAccessToken('valid'); fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    await expect(auth.logout()).rejects.toThrow('offline');
  });
  it('clears the browser session after changing password with a 204 response', async () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:8082/api/v1'); setAccessToken('valid');
    const expired = vi.fn(); window.addEventListener('session-expired', expired);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await auth.change('old password', 'River!82');
    expect(expired).toHaveBeenCalledOnce();
    fetchMock.mockResolvedValueOnce(Response.json({}));
    await api('/auth/me');
    expect(fetchMock.mock.lastCall?.[1].headers.Authorization).toBeUndefined();
    window.removeEventListener('session-expired', expired);
  });
  it('shares one refresh across concurrent protected calls and retries with new access token', async () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:8082/api/v1'); setAccessToken('expired');
    let refreshes = 0;
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith('/auth/refresh')) { refreshes++; await new Promise((resolve) => setTimeout(resolve, 10)); return Response.json({ token: 'fresh' }); }
      if ((init.headers as Record<string,string>).Authorization === 'Bearer fresh') return Response.json({ id: '1' });
      return new Response('', { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } });
    });
    await expect(Promise.all([api('/auth/me'), api('/auth/me')])).resolves.toEqual([{ id: '1' }, { id: '1' }]);
    expect(refreshes).toBe(1);
    expect(sessionStorage.getItem('session_token')).toBeNull();
  });
  it('does not replay a controller rejection for wrong current password', async () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:8082/api/v1'); setAccessToken('valid');
    fetchMock.mockResolvedValue(Response.json({ message: 'Wrong password' }, { status: 401 }));
    await expect(api('/auth/password/change', { method: 'POST' })).rejects.toThrow('Wrong password');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('handles lowercase bearer challenge on password change and surfaces Vietnamese refresh 401 message', async () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:8082/api/v1'); setAccessToken('expired');
    const onExpire = vi.fn(); window.addEventListener('session-expired', onExpire);
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 401, headers: { 'www-authenticate': 'bearer error="invalid_token"' } }))
      .mockResolvedValueOnce(new Response('', { status: 401 }));
    try {
      await expect(api('/auth/password/change', { method: 'POST', body: '{}' })).rejects.toMatchObject({
        status: 401,
        message: 'Phiên đã hết hạn. Vui lòng đăng nhập lại.',
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(onExpire).toHaveBeenCalledOnce();
    } finally { window.removeEventListener('session-expired', onExpire); }
  });
  it('rejects without calling fetch when VITE_API_URL is missing', async () => {
    vi.stubEnv('VITE_API_URL', '');
    await expect(api('/auth/me')).rejects.toThrow('VITE_API_URL is required');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clears the stored token and emits session-expired on 401', async () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:8082/api/v1');
    setAccessToken('stale');
    fetchMock.mockResolvedValue(new Response('', { status: 401 }));
    const onExpire = vi.fn();
    window.addEventListener('session-expired', onExpire);

    await expect(api('/auth/me')).rejects.toBeInstanceOf(ApiError);

    expect(sessionStorage.getItem('session_token')).toBeNull();
    expect(onExpire).toHaveBeenCalledOnce();
    window.removeEventListener('session-expired', onExpire);
  });

  it('sends the bearer token and returns parsed json', async () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:8082/api/v1');
    setAccessToken('abc');
    fetchMock.mockResolvedValue(Response.json({ id: '1' }));

    await expect(api('/auth/me')).resolves.toEqual({ id: '1' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8082/api/v1/auth/me',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer abc' }),
      }),
    );
  });

  it('evicts session on mid-session 403 ACCOUNT_RESTRICTED but keeps session on 403 INSUFFICIENT_PRIVILEGE', async () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:8082/api/v1');
    setAccessToken('mod-token');
    const onExpire = vi.fn();
    window.addEventListener('session-expired', onExpire);

    // 1) Ordinary RBAC 403 (e.g. moderator trying to lock senior admin) must NOT evict session
    fetchMock.mockResolvedValueOnce(
      Response.json({ code: 'INSUFFICIENT_PRIVILEGE', message: 'Không đủ quyền.' }, { status: 403 }),
    );
    await expect(api('/admin/users/u-1/lock', { method: 'POST' })).rejects.toThrow('Không đủ quyền.');
    expect(onExpire).not.toHaveBeenCalled();

    // 2) Public login 403 ACCOUNT_RESTRICTED surfaces message without emitting session-expired
    fetchMock.mockResolvedValueOnce(
      Response.json(
        { code: 'ACCOUNT_RESTRICTED', message: 'Tài khoản đang bị khóa tạm thời.' },
        { status: 403 },
      ),
    );
    await expect(api('/auth/login', { method: 'POST' })).rejects.toThrow('Tài khoản đang bị khóa tạm thời.');
    expect(onExpire).not.toHaveBeenCalled();

    // 3) Protected call 403 ACCOUNT_RESTRICTED clears token and emits session-expired
    fetchMock.mockResolvedValueOnce(
      Response.json(
        { code: 'ACCOUNT_RESTRICTED', message: 'Tài khoản bị khóa vĩnh viễn.' },
        { status: 403 },
      ),
    );
    await expect(api('/admin/users')).rejects.toThrow('Tài khoản bị khóa vĩnh viễn.');
    expect(onExpire).toHaveBeenCalledOnce();

    // 4) Preserves server error code on ApiError (e.g. 409 STUDENT_ID_CONFLICT)
    fetchMock.mockResolvedValueOnce(
      Response.json(
        { code: 'STUDENT_ID_CONFLICT', message: 'Mã số sinh viên đã tồn tại ở tài khoản khác.' },
        { status: 409 },
      ),
    );
    await expect(api('/admin/users/u-1', { method: 'PATCH' })).rejects.toMatchObject({
      status: 409,
      code: 'STUDENT_ID_CONFLICT',
      message: 'Mã số sinh viên đã tồn tại ở tài khoản khác.',
    });

    window.removeEventListener('session-expired', onExpire);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, setAccessToken } from './client';

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
});

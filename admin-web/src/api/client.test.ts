import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from './client';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('api client', () => {
  it('rejects without calling fetch when VITE_API_URL is missing', async () => {
    vi.stubEnv('VITE_API_URL', '');
    await expect(api('/auth/me')).rejects.toThrow('VITE_API_URL is required');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clears the stored token and emits session-expired on 401', async () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:8082/api/v1');
    sessionStorage.setItem('session_token', 'stale');
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
    sessionStorage.setItem('session_token', 'abc');
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

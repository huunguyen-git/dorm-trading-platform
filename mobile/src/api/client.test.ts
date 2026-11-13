import { beforeEach, expect, jest, test } from '@jest/globals';
import { api } from './client';
import { tokenStore } from '../auth/tokenStore';
import { useSession } from '../auth/session';

jest.mock('../auth/tokenStore', () => ({
  tokenStore: { save: jest.fn(), get: jest.fn(), clear: jest.fn(), getRefresh: jest.fn(), saveRefresh: jest.fn() },
}));

const store = tokenStore as jest.Mocked<typeof tokenStore>;
const fetchMock = jest.fn<() => Promise<unknown>>();

beforeEach(() => {
  jest.clearAllMocks();
  store.get.mockResolvedValue(null);
  global.fetch = fetchMock as unknown as typeof fetch;
  delete process.env.EXPO_PUBLIC_API_URL;
});

test('rejects without calling fetch when EXPO_PUBLIC_API_URL is missing', async () => {
  await expect(api('/auth/me')).rejects.toThrow('EXPO_PUBLIC_API_URL is required');
  expect(fetchMock).not.toHaveBeenCalled();
});

test('clears the stored token and resets the session on 401', async () => {
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8082/api/v1';
  store.get.mockResolvedValue('stale');
  fetchMock.mockResolvedValue({ status: 401, ok: false, text: async () => '' });

  await expect(api('/auth/me')).rejects.toThrow('API 401');

  expect(store.clear).toHaveBeenCalled();
  expect(useSession.getState().token).toBeNull();
});

test('sends the bearer token and returns parsed json', async () => {
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8082/api/v1';
  store.get.mockResolvedValue('abc');
  fetchMock.mockResolvedValue({ status: 200, ok: true, json: async () => ({ id: '1' }) });

  await expect(api('/auth/me')).resolves.toEqual({ id: '1' });

  expect(fetchMock).toHaveBeenCalledWith(
    'http://localhost:8082/api/v1/auth/me',
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer abc' }),
    }),
  );
});

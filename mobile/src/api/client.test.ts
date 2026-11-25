import { beforeEach, expect, jest, test } from '@jest/globals';
import { api, RestrictedAccountError } from './client';
import { tokenStore } from '../auth/tokenStore';
import { useSession, type AccountRestriction, type User } from '../auth/session';

jest.mock('../auth/tokenStore', () => ({
  tokenStore: { save: jest.fn(), get: jest.fn(), clear: jest.fn(), getRefresh: jest.fn(), saveRefresh: jest.fn() },
}));

const store = tokenStore as jest.Mocked<typeof tokenStore>;
const fetchMock = jest.fn<() => Promise<unknown>>();

const activeUser: User = {
  id: 'u-1',
  name: 'Sinh Viên A',
  email: 'sv@uni.edu.vn',
  studentId: '22120001',
  role: 'member',
  roles: ['MEMBER'],
  emailVerified: true,
  profileApproved: true,
  accountStatus: 'HOAT_DONG',
};

beforeEach(() => {
  jest.clearAllMocks();
  store.get.mockResolvedValue(null);
  store.getRefresh.mockResolvedValue(null);
  store.save.mockResolvedValue(undefined);
  store.saveRefresh.mockResolvedValue(undefined);
  store.clear.mockResolvedValue(undefined);
  useSession.setState({
    token: null,
    user: null,
    loading: false,
    restriction: null,
    restrictionDismissed: false,
  });
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

test('setSession and restore keep limited session and populate restriction for BI_KHOA user (UC-03 3.2)', async () => {
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8082/api/v1';
  const lockedUserWithPayload: User = {
    ...activeUser,
    roles: [],
    accountStatus: 'BI_KHOA',
    restriction: {
      accountStatus: 'BI_KHOA',
      lockType: 'KHOA_TAM_THOI',
      reason: 'Vi phạm nội quy đăng tin',
      lockedUntil: '2026-12-02T10:00:00Z',
      appealable: false,
      reputationScore: 45,
    } as unknown as AccountRestriction,
  };

  await useSession.getState().setSession('limited-jwt', lockedUserWithPayload, 'limited-refresh');
  expect(useSession.getState().token).toBe('limited-jwt');
  expect(useSession.getState().user).toEqual(lockedUserWithPayload);
  expect(useSession.getState().restriction).toEqual({
    accountStatus: 'BI_KHOA',
    lockType: 'KHOA_TAM_THOI',
    reason: 'Vi phạm nội quy đăng tin',
    lockedUntil: '2026-12-02T10:00:00Z',
    appealable: false,
    reputationScore: 45,
    message: 'Tài khoản của bạn đang bị khóa tạm thời. Các chức năng giao dịch tạm thời bị giới hạn.',
  });

  // Fallback when user only has accountStatus === 'BI_KHOA' without restriction object
  store.get.mockResolvedValue('limited-jwt');
  fetchMock.mockResolvedValueOnce({
    status: 200,
    ok: true,
    json: async () => ({ ...activeUser, roles: [], accountStatus: 'BI_KHOA' }),
  });
  await useSession.getState().restore();
  expect(useSession.getState().token).toBe('limited-jwt');
  expect(useSession.getState().user?.accountStatus).toBe('BI_KHOA');
  expect(useSession.getState().restriction).toMatchObject({
    accountStatus: 'BI_KHOA',
    lockType: null,
    appealable: false,
  });

  // Unlocking clears restriction on next setSession / restore
  await useSession.getState().setSession('active-jwt', activeUser, 'active-refresh');
  expect(useSession.getState().restriction).toBeNull();
});

test('handles 403 ACCOUNT_RESTRICTED on /auth/login for temporary lock', async () => {
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8082/api/v1';
  fetchMock.mockResolvedValue({
    status: 403,
    ok: false,
    text: async () =>
      JSON.stringify({
        code: 'ACCOUNT_RESTRICTED',
        message: 'Tài khoản đang bị khóa tạm thời 14 ngày.',
        restriction: {
          accountStatus: 'BI_KHOA',
          lockType: 'KHOA_TAM_THOI',
          reason: 'Vi phạm quy định giao dịch',
          lockedUntil: '2026-12-02T10:00:00Z',
          appealable: false,
          reputationScore: 45,
        },
      }),
  });

  let caught: unknown;
  try {
    await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'sv@uni.edu.vn', password: 'secret' }) });
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(RestrictedAccountError);
  const restrictedError = caught as RestrictedAccountError;
  expect(restrictedError.message).toBe('Tài khoản đang bị khóa tạm thời 14 ngày.');
  expect(restrictedError.restriction).toEqual({
    accountStatus: 'BI_KHOA',
    lockType: 'KHOA_TAM_THOI',
    reason: 'Vi phạm quy định giao dịch',
    lockedUntil: '2026-12-02T10:00:00Z',
    appealable: false,
    reputationScore: 45,
    message: 'Tài khoản đang bị khóa tạm thời 14 ngày.',
  });
  expect(store.clear).toHaveBeenCalled();
  expect(useSession.getState().token).toBeNull();
  expect(useSession.getState().user).toBeNull();
  expect(useSession.getState().restriction).toEqual(restrictedError.restriction);
});

test('handles 403 ACCOUNT_RESTRICTED on /auth/login for permanent lock with appeal right', async () => {
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8082/api/v1';
  fetchMock.mockResolvedValue({
    status: 403,
    ok: false,
    text: async () =>
      JSON.stringify({
        code: 'ACCOUNT_RESTRICTED',
        message: 'Tài khoản bị khóa vĩnh viễn do điểm uy tín từ 30 trở xuống.',
        restriction: {
          accountStatus: 'BI_KHOA',
          lockType: 'KHOA_VINH_VIEN',
          reason: 'Điểm uy tín giảm xuống 30',
          lockedUntil: null,
          appealable: true,
          reputationScore: 30,
        },
      }),
  });

  await expect(
    api('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'sv@uni.edu.vn', password: 'secret' }) }),
  ).rejects.toBeInstanceOf(RestrictedAccountError);

  expect(useSession.getState().restriction).toEqual({
    accountStatus: 'BI_KHOA',
    lockType: 'KHOA_VINH_VIEN',
    reason: 'Điểm uy tín giảm xuống 30',
    lockedUntil: null,
    appealable: true,
    reputationScore: 30,
    message: 'Tài khoản bị khóa vĩnh viễn do điểm uy tín từ 30 trở xuống.',
  });
});

test('surfaces RestrictedAccountError when 401 Bearer triggers /auth/refresh returning 403 ACCOUNT_RESTRICTED', async () => {
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8082/api/v1';
  useSession.setState({ token: 'expired-access', user: activeUser, loading: false, restriction: null });
  store.get.mockResolvedValue('expired-access');
  store.getRefresh.mockResolvedValue('revoked-refresh');

  fetchMock
    .mockResolvedValueOnce({
      status: 401,
      ok: false,
      headers: { get: (name: string) => (name.toLowerCase() === 'www-authenticate' ? 'Bearer error="invalid_token"' : null) },
      text: async () => '',
    })
    .mockResolvedValueOnce({
      status: 403,
      ok: false,
      text: async () =>
        JSON.stringify({
          code: 'ACCOUNT_RESTRICTED',
          message: 'Phiên đăng nhập đã bị thu hồi do tài khoản bị khóa.',
          restriction: {
            accountStatus: 'BI_KHOA',
            lockType: 'KHOA_TAM_THOI',
            reason: 'Báo cáo vi phạm được xác nhận',
            lockedUntil: '2026-12-05T08:30:00Z',
            appealable: false,
            reputationScore: 40,
          },
        }),
    });

  let caught: unknown;
  try {
    await api('/auth/me');
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(RestrictedAccountError);
  expect((caught as RestrictedAccountError).message).toBe('Phiên đăng nhập đã bị thu hồi do tài khoản bị khóa.');
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(store.clear).toHaveBeenCalledTimes(1);
  expect(useSession.getState().token).toBeNull();
  expect(useSession.getState().user).toBeNull();
  expect(useSession.getState().restriction).toEqual({
    accountStatus: 'BI_KHOA',
    lockType: 'KHOA_TAM_THOI',
    reason: 'Báo cáo vi phạm được xác nhận',
    lockedUntil: '2026-12-05T08:30:00Z',
    appealable: false,
    reputationScore: 40,
    message: 'Phiên đăng nhập đã bị thu hồi do tài khoản bị khóa.',
  });
});

test('syncs limited user state and populates restriction on mid-session 403 ACCOUNT_RESTRICTED', async () => {
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8082/api/v1';
  useSession.setState({ token: 'valid-jwt', user: activeUser, loading: false, restriction: null });
  store.get.mockResolvedValue('valid-jwt');
  fetchMock.mockResolvedValueOnce({
    status: 403,
    ok: false,
    text: async () =>
      JSON.stringify({
        code: 'ACCOUNT_RESTRICTED',
        message: 'Tài khoản bị khóa vĩnh viễn.',
        restriction: {
          accountStatus: 'BI_KHOA',
          lockType: 'KHOA_VINH_VIEN',
          reason: 'Điểm uy tín giảm xuống 25',
          lockedUntil: null,
          appealable: true,
          reputationScore: 25,
        },
      }),
  });

  await expect(api('/auth/profile', { method: 'PATCH', body: JSON.stringify({ name: 'Mới' }) })).rejects.toBeInstanceOf(
    RestrictedAccountError,
  );

  expect(store.clear).not.toHaveBeenCalled();
  expect(useSession.getState().token).toBe('valid-jwt');
  expect(useSession.getState().user).toEqual({
    ...activeUser,
    accountStatus: 'BI_KHOA',
    roles: [],
  });
  expect(useSession.getState().restriction).toEqual({
    accountStatus: 'BI_KHOA',
    lockType: 'KHOA_VINH_VIEN',
    reason: 'Điểm uy tín giảm xuống 25',
    lockedUntil: null,
    appealable: true,
    reputationScore: 25,
    message: 'Tài khoản bị khóa vĩnh viễn.',
  });
});

test('leaves session intact on ordinary non-restriction 403 error', async () => {
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8082/api/v1';
  useSession.setState({ token: 'valid-jwt', user: activeUser, loading: false, restriction: null });
  store.get.mockResolvedValue('valid-jwt');
  fetchMock.mockResolvedValueOnce({
    status: 403,
    ok: false,
    text: async () => JSON.stringify({ code: 'INSUFFICIENT_PRIVILEGE', message: 'Không đủ quyền thực hiện.' }),
  });

  await expect(api('/listings', { method: 'POST', body: '{}' })).rejects.toThrow('Không đủ quyền thực hiện.');
  expect(store.clear).not.toHaveBeenCalled();
  expect(useSession.getState().token).toBe('valid-jwt');
  expect(useSession.getState().restriction).toBeNull();
});

test('omits Content-Type header for FormData uploads while preserving Bearer auth', async () => {
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8082/api/v1';
  store.get.mockResolvedValue('upload-jwt');
  const formData = new FormData();
  formData.append('files', { uri: 'file:///photo.jpg', name: 'photo.jpg', type: 'image/jpeg' } as unknown as Blob);
  const responseBody = {
    items: [
      {
        id: 'm-1',
        url: 'http://localhost:8082/api/v1/media/m-1',
        contentType: 'image/jpeg',
        sizeBytes: 12345,
      },
    ],
  };
  fetchMock.mockResolvedValueOnce({
    status: 201,
    ok: true,
    json: async () => responseBody,
  });

  await expect(api('/media/images', { method: 'POST', body: formData })).resolves.toEqual(responseBody);

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [calledUrl, calledInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(calledUrl).toBe('http://localhost:8082/api/v1/media/images');
  expect(calledInit.method).toBe('POST');
  expect(calledInit.body).toBe(formData);
  const headers = calledInit.headers as Record<string, string>;
  expect(headers.Authorization).toBe('Bearer upload-jwt');
  expect(headers['Content-Type']).toBeUndefined();
  expect(headers['content-type']).toBeUndefined();
});

test('preserves Content-Type application/json for non-FormData JSON requests', async () => {
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8082/api/v1';
  store.get.mockResolvedValue('json-jwt');
  fetchMock.mockResolvedValueOnce({
    status: 200,
    ok: true,
    json: async () => ({ ok: true }),
  });

  await expect(api('/listings', { method: 'POST', body: JSON.stringify({ title: 'Sách' }) })).resolves.toEqual({
    ok: true,
  });

  const [, calledInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  const headers = calledInit.headers as Record<string, string>;
  expect(headers['Content-Type']).toBe('application/json');
  expect(headers.Authorization).toBe('Bearer json-jwt');
});

test('retries FormData upload after 401 Bearer single-flight refresh without injecting JSON Content-Type', async () => {
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8082/api/v1';
  let currentToken = 'expired-upload-jwt';
  store.get.mockImplementation(async () => currentToken);
  store.getRefresh.mockResolvedValue('valid-refresh-token');
  store.save.mockImplementation(async (nextToken) => {
    currentToken = nextToken;
  });

  const formData = new FormData();
  formData.append('files', { uri: 'file:///desk.png', name: 'desk.png', type: 'image/png' } as unknown as Blob);

  fetchMock
    .mockResolvedValueOnce({
      status: 401,
      ok: false,
      headers: { get: (name: string) => (name.toLowerCase() === 'www-authenticate' ? 'Bearer error="invalid_token"' : null) },
      text: async () => '',
    })
    .mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({
        token: 'refreshed-upload-jwt',
        refreshToken: 'next-refresh-token',
        user: activeUser,
      }),
    })
    .mockResolvedValueOnce({
      status: 201,
      ok: true,
      json: async () => ({ items: [{ id: 'm-2', url: 'http://localhost:8082/api/v1/media/m-2', contentType: 'image/png', sizeBytes: 2048 }] }),
    });

  await expect(api('/media/images', { method: 'POST', body: formData })).resolves.toEqual({
    items: [{ id: 'm-2', url: 'http://localhost:8082/api/v1/media/m-2', contentType: 'image/png', sizeBytes: 2048 }],
  });

  expect(fetchMock).toHaveBeenCalledTimes(3);
  const [, retryInit] = fetchMock.mock.calls[2] as unknown as [string, RequestInit];
  const retryHeaders = retryInit.headers as Record<string, string>;
  expect(retryHeaders.Authorization).toBe('Bearer refreshed-upload-jwt');
  expect(retryHeaders['Content-Type']).toBeUndefined();
  expect(retryInit.body).toBe(formData);
});

test('handles 403 ACCOUNT_RESTRICTED and preserves error status/code on FormData upload', async () => {
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8082/api/v1';
  useSession.setState({ token: 'valid-jwt', user: activeUser, loading: false, restriction: null });
  store.get.mockResolvedValue('valid-jwt');
  const formData = new FormData();
  formData.append('files', { uri: 'file:///a.webp', name: 'a.webp', type: 'image/webp' } as unknown as Blob);

  fetchMock.mockResolvedValueOnce({
    status: 403,
    ok: false,
    text: async () =>
      JSON.stringify({
        code: 'ACCOUNT_RESTRICTED',
        message: 'Tài khoản bị khóa tạm thời.',
        restriction: {
          accountStatus: 'BI_KHOA',
          lockType: 'KHOA_TAM_THOI',
          reason: 'Vi phạm nội quy',
          lockedUntil: '2026-12-10T00:00:00Z',
          appealable: false,
          reputationScore: 40,
        },
      }),
  });

  await expect(api('/media/images', { method: 'POST', body: formData })).rejects.toBeInstanceOf(RestrictedAccountError);
  expect(useSession.getState().restriction?.lockType).toBe('KHOA_TAM_THOI');

  fetchMock.mockResolvedValueOnce({
    status: 413,
    ok: false,
    text: async () => JSON.stringify({ code: 'FILE_TOO_LARGE', message: 'Ảnh vượt quá giới hạn 5MB.' }),
  });

  let mediaError: (Error & { status?: number; code?: string }) | undefined;
  try {
    await api('/media/images', { method: 'POST', body: formData });
  } catch (err) {
    mediaError = err as Error & { status?: number; code?: string };
  }
  expect(mediaError?.message).toBe('Ảnh vượt quá giới hạn 5MB.');
  expect(mediaError?.status).toBe(413);
  expect(mediaError?.code).toBe('FILE_TOO_LARGE');
});

test('logout clears local tokens and session state even when /auth/logout fails', async () => {
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8082/api/v1';
  useSession.setState({ token: 'valid-jwt', user: activeUser, loading: false, restriction: null });
  store.get.mockResolvedValue('valid-jwt');
  fetchMock.mockRejectedValueOnce(new Error('Network request failed'));

  await expect(useSession.getState().logout()).resolves.toBeUndefined();

  expect(store.clear).toHaveBeenCalledTimes(1);
  expect(useSession.getState().token).toBeNull();
  expect(useSession.getState().user).toBeNull();
  expect(useSession.getState().restriction).toBeNull();
});

import { beforeEach, expect, jest, test } from '@jest/globals';
import {
  api,
  attachment,
  buildMediaImageSource,
  resolveMediaUrl,
  RestrictedAccountError,
  toPersistableMediaUrl,
  upload,
} from './client';
import { tokenStore } from '../auth/tokenStore';
import { useSession, type AccountRestriction, type User } from '../auth/session';

jest.mock('../auth/tokenStore', () => ({
  tokenStore: { save: jest.fn(), get: jest.fn(), clear: jest.fn(), getRefresh: jest.fn(), saveRefresh: jest.fn() },
}));

const store = tokenStore as jest.Mocked<typeof tokenStore>;
const fetchMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();

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
  fetchMock.mockReset();
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

test.each(['offline', '503', '403', 'retry-offline'])('keeps mobile credentials until logout succeeds after %s', async (failure) => {
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8082/api/v1';
  let access: string | null = 'expired'; let refresh: string | null = 'refresh-original';
  store.get.mockImplementation(async () => access);
  store.getRefresh.mockImplementation(async () => refresh);
  store.save.mockImplementation(async (value) => { access = value; });
  store.saveRefresh.mockImplementation(async (value) => { refresh = value; });
  store.clear.mockImplementation(async () => { access = null; refresh = null; });
  useSession.setState({ token: 'expired', user: null, loading: false });
  const expired = { status: 401, ok: false, headers: { get: () => 'Bearer' }, text: async () => '' };
  const fresh = { status: 200, ok: true, json: async () => ({ token: 'fresh', refreshToken: 'refresh-new', user: null }) };
  fetchMock.mockResolvedValueOnce(expired);
  if (failure === 'offline') fetchMock.mockRejectedValueOnce(new TypeError('offline'));
  else if (failure === 'retry-offline') fetchMock.mockResolvedValueOnce(fresh).mockRejectedValueOnce(new TypeError('offline'));
  else fetchMock.mockResolvedValueOnce({ status: Number(failure), ok: false });
  await expect(useSession.getState().logout()).rejects.toThrow();
  expect(store.clear).not.toHaveBeenCalled();
  expect(access).toBe(failure === 'retry-offline' ? 'fresh' : 'expired');
  expect(refresh).toBe(failure === 'retry-offline' ? 'refresh-new' : 'refresh-original');
  expect(useSession.getState().token).toBe(access);
  fetchMock.mockResolvedValueOnce(expired).mockResolvedValueOnce(fresh).mockResolvedValueOnce({ status: 204, ok: true });
  await expect(useSession.getState().logout()).resolves.toBeUndefined();
  expect(access).toBeNull(); expect(refresh).toBeNull(); expect(useSession.getState().token).toBeNull();
});

test('finishes mobile logout after refresh returns an explicit 401', async () => {
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8082/api/v1';
  store.get.mockResolvedValue('expired'); store.getRefresh.mockResolvedValue('rejected');
  fetchMock.mockResolvedValueOnce({ status: 401, ok: false, headers: { get: () => 'Bearer' }, text: async () => '' })
    .mockResolvedValueOnce({ status: 401, ok: false });
  await expect(useSession.getState().logout()).resolves.toBeUndefined();
  expect(store.clear).toHaveBeenCalled(); expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('rejects without calling fetch when EXPO_PUBLIC_API_URL is missing', async () => {
  await expect(api('/auth/me')).rejects.toThrow('EXPO_PUBLIC_API_URL is required');
  expect(fetchMock).not.toHaveBeenCalled();
});

test('clears the stored token and resets the session on 401 with a Bearer challenge', async () => {
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8082/api/v1';
  store.get.mockResolvedValue('stale');
  fetchMock.mockResolvedValue({ status: 401, ok: false, headers: { get: () => 'Bearer' }, text: async () => '' });

  await expect(api('/auth/me')).rejects.toMatchObject({ status: 401 });

  expect(store.clear).toHaveBeenCalled();
  expect(useSession.getState().token).toBeNull();
});

test('keeps the session on a 401 without a Bearer challenge (wrong current password)', async () => {
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8082/api/v1';
  store.get.mockResolvedValue('valid-jwt');
  useSession.setState({ token: 'valid-jwt', user: activeUser, loading: false });
  fetchMock.mockResolvedValue({
    status: 401,
    ok: false,
    text: async () => JSON.stringify({ code: 'INVALID_CREDENTIALS', message: 'Mật khẩu hiện tại không đúng.' }),
  });

  await expect(api('/profile/email', { method: 'PATCH', body: '{}' })).rejects.toMatchObject({
    status: 401,
    code: 'INVALID_CREDENTIALS',
  });
  expect(store.clear).not.toHaveBeenCalled();
  expect(useSession.getState().token).toBe('valid-jwt');
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

test('logout succeeds on expired credentials but does not hide network failure', async () => {
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8082/api/v1';
  store.get.mockResolvedValue('expired');
  fetchMock.mockResolvedValue({ status: 401, ok: false, text: async () => '' });
  await expect(useSession.getState().logout()).resolves.toBeUndefined();
  expect(useSession.getState().token).toBeNull();
  store.clear.mockClear();
  fetchMock.mockRejectedValueOnce(new TypeError('offline'));
  await expect(useSession.getState().logout()).rejects.toThrow('offline');
  expect(store.clear).not.toHaveBeenCalled();
});

test('handles lowercase www-authenticate bearer challenge on password change, clears restriction, and preserves Vietnamese refresh 401 message', async () => {
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8082/api/v1';
  store.get.mockResolvedValue('expired');
  store.getRefresh.mockResolvedValue('expired-refresh');
  useSession.setState({
    token: 'expired',
    user: activeUser,
    loading: false,
    restriction: {
      accountStatus: 'BI_KHOA',
      lockType: 'KHOA_TAM_THOI',
      reason: 'Cũ',
      lockedUntil: null,
      appealable: false,
      reputationScore: 45,
      message: 'Cũ',
    },
    restrictionDismissed: true,
  });
  fetchMock
    .mockResolvedValueOnce({
      status: 401,
      ok: false,
      headers: { get: (name: string) => (name === 'www-authenticate' ? 'bearer error="invalid_token"' : null) },
      text: async () => '',
    })
    .mockResolvedValueOnce({ status: 401, ok: false, text: async () => '' });

  await expect(api('/auth/password/change', { method: 'POST', body: '{}' })).rejects.toMatchObject({
    status: 401,
    message: 'Phiên đã hết hạn.',
  });
  expect(store.clear).toHaveBeenCalledTimes(1);
  expect(useSession.getState().token).toBeNull();
  expect(useSession.getState().user).toBeNull();
  expect(useSession.getState().restriction).toBeNull();
  expect(useSession.getState().restrictionDismissed).toBe(false);
});

test('resolveMediaUrl rewrites local/private /api/v1/media URLs to EXPO_PUBLIC_API_URL for iOS and Android devices', () => {
  const sampleId = '7f255386-74df-4ed0-8334-c0a345ea24f4';
  expect(resolveMediaUrl(`http://127.0.0.1:8082/api/v1/media/${sampleId}`)).toBe(
    `http://127.0.0.1:8082/api/v1/media/${sampleId}`,
  );

  process.env.EXPO_PUBLIC_API_URL = 'http://192.168.100.181:8082/api/v1/';
  expect(resolveMediaUrl(`http://127.0.0.1:8082/api/v1/media/${sampleId}`)).toBe(
    `http://192.168.100.181:8082/api/v1/media/${sampleId}`,
  );
  expect(resolveMediaUrl(`http://10.0.2.2:8082/api/v1/media/${sampleId}`)).toBe(
    `http://192.168.100.181:8082/api/v1/media/${sampleId}`,
  );
  expect(resolveMediaUrl(`/api/v1/media/${sampleId}`)).toBe(
    `http://192.168.100.181:8082/api/v1/media/${sampleId}`,
  );

  process.env.EXPO_PUBLIC_API_URL = 'http://10.0.2.2:8082/api/v1';
  expect(resolveMediaUrl(`http://192.168.1.42:8082/api/v1/media/${sampleId}`)).toBe(
    `http://10.0.2.2:8082/api/v1/media/${sampleId}`,
  );

  expect(resolveMediaUrl('https://cdn.example.com/books/se100.jpg')).toBe(
    'https://cdn.example.com/books/se100.jpg',
  );
  expect(resolveMediaUrl(`https://api.dormtrading.vn/api/v1/media/${sampleId}`)).toBe(
    `https://api.dormtrading.vn/api/v1/media/${sampleId}`,
  );
});

test('toPersistableMediaUrl normalizes app media URLs to relative /api/v1/media/{id} and preserves external URLs', () => {
  const sampleId = '7f255386-74df-4ed0-8334-c0a345ea24f4';
  process.env.EXPO_PUBLIC_API_URL = 'https://api.dormtrading.vn/api/v1';

  expect(toPersistableMediaUrl(`/api/v1/media/${sampleId}`)).toBe(`/api/v1/media/${sampleId}`);
  expect(toPersistableMediaUrl(`http://10.0.2.2:8082/api/v1/media/${sampleId}`)).toBe(`/api/v1/media/${sampleId}`);
  expect(toPersistableMediaUrl(`http://192.168.1.42:8082/api/v1/media/${sampleId}`)).toBe(`/api/v1/media/${sampleId}`);
  expect(toPersistableMediaUrl(`https://api.dormtrading.vn/api/v1/media/${sampleId}`)).toBe(
    `/api/v1/media/${sampleId}`,
  );
  expect(toPersistableMediaUrl('https://cdn.example.com/books/se100.jpg')).toBe(
    'https://cdn.example.com/books/se100.jpg',
  );
});

test('buildMediaImageSource attaches Bearer Authorization header only to same-origin canonical app media URLs and never leaks on protocol/port/path mismatch', () => {
  const sampleId = '7f255386-74df-4ed0-8334-c0a345ea24f4';
  process.env.EXPO_PUBLIC_API_URL = 'https://api.dormtrading.vn/api/v1';

  expect(buildMediaImageSource(`/api/v1/media/${sampleId}`, 'secret-jwt')).toEqual({
    uri: `https://api.dormtrading.vn/api/v1/media/${sampleId}`,
    headers: { Authorization: 'Bearer secret-jwt' },
  });
  expect(buildMediaImageSource(`/api/v1/media/${sampleId}`, null)).toEqual({
    uri: `https://api.dormtrading.vn/api/v1/media/${sampleId}`,
  });
  // External URL must NEVER receive Bearer token!
  expect(buildMediaImageSource('https://cdn.example.com/books/se100.jpg', 'secret-jwt')).toEqual({
    uri: 'https://cdn.example.com/books/se100.jpg',
  });
  // Same hostname with downgraded protocol or different port must NEVER receive Bearer token!
  expect(
    buildMediaImageSource(`http://api.dormtrading.vn:9999/api/v1/media/${sampleId}`, 'secret-jwt'),
  ).toEqual({
    uri: `http://api.dormtrading.vn:9999/api/v1/media/${sampleId}`,
  });
  expect(
    buildMediaImageSource(`http://api.dormtrading.vn/api/v1/media/${sampleId}`, 'secret-jwt'),
  ).toEqual({
    uri: `http://api.dormtrading.vn/api/v1/media/${sampleId}`,
  });
  // Path traversal or non-UUID media subpath must NEVER receive Bearer token or be rewritten!
  expect(
    buildMediaImageSource('/api/v1/media/../../admin/secret', 'secret-jwt'),
  ).toEqual({
    uri: '/api/v1/media/../../admin/secret',
  });
  expect(
    buildMediaImageSource('http://192.168.1.99:8080/api/v1/media/not-a-uuid', 'secret-jwt'),
  ).toEqual({
    uri: 'http://192.168.1.99:8080/api/v1/media/not-a-uuid',
  });
});

test('importing client.ts before session.ts still persists refreshed tokens and updates session state without silent no-op', async () => {
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8082/api/v1';
  let isolatedApi!: typeof api;
  let isolatedStore!: jest.Mocked<typeof tokenStore>;
  let isolatedSessionStore!: { getState: () => { token: string | null; user: User | null } };

  jest.isolateModules(() => {
    // Deliberately load client.ts WITHOUT importing auth/session.ts first
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const clientMod = require('./client') as typeof import('./client');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const tokenMod = require('../auth/tokenStore') as { tokenStore: jest.Mocked<typeof tokenStore> };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sessionStateMod = require('../auth/sessionStore') as typeof import('../auth/sessionStore');
    isolatedApi = clientMod.api;
    isolatedStore = tokenMod.tokenStore;
    isolatedSessionStore = sessionStateMod.useSessionStore;
  });

  isolatedStore.get.mockResolvedValueOnce('expired-jwt').mockResolvedValueOnce('expired-jwt')
    .mockResolvedValueOnce('expired-jwt').mockResolvedValue('fresh-jwt');
  isolatedStore.getRefresh.mockResolvedValueOnce('refresh-tok');
  fetchMock
    .mockResolvedValueOnce({
      ok: false,
      status: 401,
      headers: new Headers({ 'WWW-Authenticate': 'Bearer error="invalid_token"' }),
      text: async () => JSON.stringify({ code: 'UNAUTHORIZED', message: 'Expired' }),
    })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ token: 'fresh-jwt', refreshToken: 'fresh-refresh', user: activeUser }),
    })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ ok: true }),
    });

  await expect(isolatedApi('/listings/quota')).resolves.toEqual({ ok: true });
  expect(isolatedStore.saveRefresh).toHaveBeenCalledWith('fresh-refresh');
  expect(isolatedStore.save).toHaveBeenCalledWith('fresh-jwt');
  expect(isolatedSessionStore.getState().token).toBe('fresh-jwt');
  expect(isolatedSessionStore.getState().user?.id).toBe('u-1');
});

test('preserves server error code on ApiError for 409 inventory conflicts', async () => {
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8082/api/v1';
  store.get.mockResolvedValue('valid-jwt');
  fetchMock.mockResolvedValueOnce({
    status: 409,
    ok: false,
    text: async () => JSON.stringify({ code: 'VERSION_CONFLICT', message: 'Phiên bản dữ liệu đã cũ.' }),
  });

  await expect(api('/inventory/item-1', { method: 'PUT', body: '{}' })).rejects.toMatchObject({
    status: 409,
    code: 'VERSION_CONFLICT',
    message: 'Phiên bản dữ liệu đã cũ.',
  });
});

test('refreshes once and retries a multipart upload with a fresh form body', async () => {
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8082/api/v1';
  let access: string | null = 'expired';
  store.get.mockImplementation(async () => access);
  store.getRefresh.mockResolvedValue('refresh-ok');
  store.save.mockImplementation(async (value) => { access = value; });
  const expired = { status: 401, ok: false, headers: { get: () => 'Bearer' }, text: async () => '' };
  const refreshed = { status: 200, ok: true, json: async () => ({ token: 'fresh', refreshToken: 'refresh-new', user: null }) };
  fetchMock.mockResolvedValueOnce(expired).mockResolvedValueOnce(refreshed).mockResolvedValueOnce({ status: 204, ok: true });

  await upload('/profile/me/student-card', { uri: 'file://card.jpg', name: 'card.jpg', type: 'image/jpeg' });

  expect(fetchMock).toHaveBeenCalledTimes(3);
  const [firstUrl] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
  expect(firstUrl).toContain('/auth/refresh');
  const [retryUrl, retryInit] = fetchMock.mock.calls[2] as unknown as [string, RequestInit];
  expect(retryUrl).toContain('/profile/me/student-card');
  expect((retryInit.headers as Record<string, string>).Authorization).toBe('Bearer fresh');
  expect(retryInit.body).toBeInstanceOf(FormData);
  expect(retryInit.headers).not.toHaveProperty('Content-Type');
});

test('keeps the mobile session when the upload refresh fails with 503', async () => {
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8082/api/v1';
  store.get.mockResolvedValue('expired');
  store.getRefresh.mockResolvedValue('refresh-original');
  fetchMock.mockResolvedValueOnce({ status: 401, ok: false, headers: { get: () => 'Bearer' }, text: async () => '' })
    .mockResolvedValueOnce({ status: 503, ok: false, text: async () => '' });

  await expect(upload('/profile/me/student-card', { uri: 'file://card.jpg', name: 'card.jpg', type: 'image/jpeg' }))
    .rejects.toMatchObject({ status: 503 });
  expect(store.clear).not.toHaveBeenCalled();
});

test('refreshes then retries a protected attachment download, clears the session on a real 401 and returns null on 404', async () => {
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8082/api/v1';
  let access: string | null = 'expired';
  store.get.mockImplementation(async () => access);
  store.getRefresh.mockResolvedValue('refresh-ok');
  store.save.mockImplementation(async (value) => { access = value; });
  const expired = () => ({ status: 401, ok: false, headers: { get: () => 'Bearer' }, text: async () => '' });
  const refreshed = { status: 200, ok: true, json: async () => ({ token: 'fresh', refreshToken: 'refresh-new', user: null }) };
  const blob = { status: 200, ok: true, headers: { get: () => 'image/png' }, arrayBuffer: async () => new ArrayBuffer(4) };

  fetchMock.mockResolvedValueOnce(expired()).mockResolvedValueOnce(refreshed).mockResolvedValueOnce(blob);
  await expect(attachment('/profile/me/student-card')).resolves.toMatchObject({ type: 'image/png' });
  const retry = fetchMock.mock.calls[2] as unknown as [string, RequestInit];
  expect((retry[1].headers as Record<string, string>).Authorization).toBe('Bearer fresh');

  fetchMock.mockResolvedValueOnce({ status: 404, ok: false, headers: { get: () => null } });
  await expect(attachment('/profile/me/student-card')).resolves.toBeNull();

  // Retry vẫn 401: phiên chết thật thì xóa token, không trả ảnh cũ.
  access = 'expired';
  fetchMock.mockResolvedValueOnce(expired()).mockResolvedValueOnce(expired()).mockResolvedValueOnce(expired());
  await expect(attachment('/profile/me/student-card')).rejects.toMatchObject({ status: 401 });
  expect(store.clear).toHaveBeenCalled();
});

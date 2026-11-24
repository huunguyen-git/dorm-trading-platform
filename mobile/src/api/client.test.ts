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

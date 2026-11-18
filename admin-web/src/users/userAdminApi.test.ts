import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import {
  buildAdminUsersQuery,
  getAdminUserDetail,
  getAdminUserModerationLogs,
  getAdminUserReputationHistory,
  getAdminUserTransactions,
  listAdminUsers,
  lockAdminUser,
  unlockAdminUser,
  updateAdminUserIdentity,
  type UpdateAdminUserIdentityPayload,
} from './userAdminApi';

vi.mock('../api/client', () => ({
  api: vi.fn(),
}));

const mockedApi = vi.mocked(api);

describe('userAdminApi', () => {
  beforeEach(() => {
    mockedApi.mockReset();
    mockedApi.mockResolvedValue({} as never);
  });

  describe('buildAdminUsersQuery', () => {
    it('serializes default pagination and omits blank optional filters', () => {
      expect(
        buildAdminUsersQuery({
          q: '   ',
          accountStatus: '',
          studentStatus: '',
          emailVerified: '',
          profileApproved: '',
          role: '  ',
          minReputation: '',
          maxReputation: '',
        }),
      ).toBe('page=0&size=20');
    });

    it('preserves boolean false, zero reputation bounds, and trimmed search terms', () => {
      const query = buildAdminUsersQuery({
        q: '  Nguyễn Văn A  ',
        accountStatus: 'BI_KHOA',
        studentStatus: 'DA_TOT_NGHIEP',
        emailVerified: false,
        profileApproved: true,
        role: ' MODERATOR ',
        minReputation: 0,
        maxReputation: 50,
        page: 2,
        size: 15,
      });

      const params = new URLSearchParams(query);
      expect(params.get('q')).toBe('Nguyễn Văn A');
      expect(params.get('accountStatus')).toBe('BI_KHOA');
      expect(params.get('studentStatus')).toBe('DA_TOT_NGHIEP');
      expect(params.get('emailVerified')).toBe('false');
      expect(params.get('profileApproved')).toBe('true');
      expect(params.get('role')).toBe('MODERATOR');
      expect(params.get('minReputation')).toBe('0');
      expect(params.get('maxReputation')).toBe('50');
      expect(params.get('page')).toBe('2');
      expect(params.get('size')).toBe('15');
    });
  });

  it('calls GET /admin/users with serialized query string', async () => {
    await listAdminUsers({ q: '21120001', accountStatus: 'HOAT_DONG', page: 1, size: 10 });
    expect(mockedApi).toHaveBeenCalledWith('/admin/users?q=21120001&accountStatus=HOAT_DONG&page=1&size=10');
  });

  it('calls GET /admin/users/:userId with URL-encoded userId', async () => {
    await getAdminUserDetail('user-123');
    expect(mockedApi).toHaveBeenCalledWith('/admin/users/user-123');
  });

  it('sends strictly the allowed UC-12 keys (including student cards and expectedVersion) in PATCH /admin/users/:userId', async () => {
    const payload = {
      fullName: 'Trần Thị B',
      studentId: '20110999',
      phone: '0901234567',
      university: 'ĐHQG TP.HCM',
      campus: 'Khu đô thị ĐHQG',
      major: 'Kỹ thuật phần mềm',
      cohort: 'K2020',
      studentStatus: 'DA_TOT_NGHIEP',
      studentCardFront: '/uploads/cards/front-20110999.jpg',
      studentCardBack: '/uploads/cards/back-20110999.jpg',
      reason: 'Cập nhật trạng thái tốt nghiệp theo minh chứng',
      expectedVersion: 3,
      email: 'ignored@uni.edu.vn',
      password: 'secret',
      reputationScore: 999,
      accountStatus: 'BI_KHOA',
    } as UpdateAdminUserIdentityPayload & Record<string, unknown>;

    await updateAdminUserIdentity('u-42', payload);

    expect(mockedApi).toHaveBeenCalledWith(
      '/admin/users/u-42',
      expect.objectContaining({
        method: 'PATCH',
      }),
    );

    const rawBody = mockedApi.mock.calls[0][1]?.body as string;
    const parsed = JSON.parse(rawBody) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual([
      'fullName',
      'studentId',
      'phone',
      'university',
      'campus',
      'major',
      'cohort',
      'studentStatus',
      'studentCardFront',
      'studentCardBack',
      'reason',
      'expectedVersion',
    ]);
    expect(parsed.studentStatus).toBe('DA_TOT_NGHIEP');
    expect(parsed.expectedVersion).toBe(3);
    expect(parsed).not.toHaveProperty('email');
    expect(parsed).not.toHaveProperty('password');
    expect(parsed).not.toHaveProperty('reputationScore');
    expect(parsed).not.toHaveProperty('accountStatus');
  });

  it('calls paginated sub-resource endpoints for transactions, reputation history, and moderation logs', async () => {
    await getAdminUserTransactions('u-1', 2, 10);
    await getAdminUserReputationHistory('u-1', 0, 20);
    await getAdminUserModerationLogs('u-1', 1, 5);

    expect(mockedApi).toHaveBeenNthCalledWith(1, '/admin/users/u-1/transactions?page=2&size=10');
    expect(mockedApi).toHaveBeenNthCalledWith(2, '/admin/users/u-1/reputation-history?page=0&size=20');
    expect(mockedApi).toHaveBeenNthCalledWith(3, '/admin/users/u-1/moderation-logs?page=1&size=5');
  });

  it('calls POST /admin/users/:userId/lock with expectedVersion for temporary and permanent locks', async () => {
    await lockAdminUser('u-9', {
      lockType: 'TEMPORARY',
      durationDays: 14,
      reason: 'Vi phạm quy định đăng tin nhiều lần',
      appealable: false,
      expectedVersion: 2,
    });
    await lockAdminUser('u-9', {
      lockType: 'PERMANENT',
      reason: 'Vi phạm nghiêm trọng điều khoản cộng đồng',
      appealable: true,
      expectedVersion: 3,
    });

    expect(mockedApi).toHaveBeenNthCalledWith(1, '/admin/users/u-9/lock', {
      method: 'POST',
      body: JSON.stringify({
        lockType: 'TEMPORARY',
        durationDays: 14,
        reason: 'Vi phạm quy định đăng tin nhiều lần',
        appealable: false,
        expectedVersion: 2,
      }),
    });
    expect(mockedApi).toHaveBeenNthCalledWith(2, '/admin/users/u-9/lock', {
      method: 'POST',
      body: JSON.stringify({
        lockType: 'PERMANENT',
        reason: 'Vi phạm nghiêm trọng điều khoản cộng đồng',
        appealable: true,
        expectedVersion: 3,
      }),
    });
  });

  it('calls POST /admin/users/:userId/unlock with mandatory reason and expectedVersion', async () => {
    await unlockAdminUser('u-9', { reason: 'Đã xác minh khiếu nại hợp lệ', expectedVersion: 4 });

    expect(mockedApi).toHaveBeenCalledWith('/admin/users/u-9/unlock', {
      method: 'POST',
      body: JSON.stringify({ reason: 'Đã xác minh khiếu nại hợp lệ', expectedVersion: 4 }),
    });
  });
});

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { ApiError, api } from '../api/client';
import type { User } from '../auth/session';
import UserRestrictionPanel from './UserRestrictionPanel';
import type { AdminUserDetail, AdminUserSummary, PaginatedResponse } from './userAdminApi';

vi.mock('../api/client', () => ({
  api: vi.fn(),
  setAccessToken: vi.fn(),
  ApiError: class MockApiError extends Error {
    constructor(
      public readonly status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));

const mockedApi = vi.mocked(api);

const moderatorActor: User = {
  id: 'mod-1',
  name: 'Kiểm duyệt viên Minh',
  role: 'moderator',
  email: 'mod@uni.edu.vn',
  roles: ['MODERATOR'],
  emailVerified: true,
  profileApproved: true,
  accountStatus: 'HOAT_DONG',
};

const seniorAdminActor: User = {
  id: 'adm-1',
  name: 'Quản trị viên Lan',
  role: 'admin',
  email: 'admin@uni.edu.vn',
  roles: ['SENIOR_ADMIN'],
  emailVerified: true,
  profileApproved: true,
  accountStatus: 'HOAT_DONG',
};

const activeMemberDetail: AdminUserDetail = {
  id: 'user-500',
  fullName: 'Võ Thanh Tùng',
  email: 'tung.vo@uni.edu.vn',
  studentId: '21120500',
  phone: '0912345678',
  university: 'ĐH Bách Khoa',
  campus: 'Cơ sở Dĩ An',
  major: 'Khoa học máy tính',
  cohort: 'K2021',
  studentStatus: 'DANG_HOC',
  hasStudentCardFront: true,
  hasStudentCardBack: true,
  studentCardFront: '/uploads/cards/500-front.jpg',
  studentCardBack: '/uploads/cards/500-back.jpg',
  emailVerified: true,
  profileApproved: true,
  reputationScore: 85,
  accountStatus: 'HOAT_DONG',
  restrictionType: null,
  restrictionReason: null,
  lockedUntil: null,
  appealable: false,
  systemRoles: ['MEMBER'],
  createdAt: '2026-11-01T08:00:00Z',
  updatedAt: '2026-11-10T08:00:00Z',
  version: 4,
};

const permanentlyLockedDetail: AdminUserDetail = {
  ...activeMemberDetail,
  accountStatus: 'BI_KHOA',
  restrictionType: 'KHOA_VINH_VIEN',
  restrictionReason: 'Điểm uy tín giảm xuống ngưỡng 30 do nhiều lần vi phạm',
  lockedUntil: null,
  appealable: true,
  reputationScore: 30,
  systemRoles: [],
  version: 5,
};

describe('UserRestrictionPanel', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mockedApi.mockReset();
  });

  it('enforces UC-13 2-step temporary lock flow: blocks blank reason, supports cancel, and confirms with expectedVersion', async () => {
    const onChanged = vi.fn();
    const lockedResponse: AdminUserDetail = {
      ...activeMemberDetail,
      accountStatus: 'BI_KHOA',
      restrictionType: 'KHOA_TAM_THOI',
      restrictionReason: 'Đăng tin sai danh mục nhiều lần',
      lockedUntil: '2026-12-02T08:00:00Z',
      appealable: false,
      version: 5,
    };
    mockedApi.mockResolvedValueOnce(lockedResponse as never);

    render(
      <UserRestrictionPanel
        currentUser={moderatorActor}
        detail={activeMemberDetail}
        onRestrictionChanged={onChanged}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Mở khóa tài khoản' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Khóa tài khoản' }));

    const durationInput = screen.getByLabelText('Số ngày khóa tạm thời (1–365 ngày) *') as HTMLInputElement;
    expect(durationInput.value).toBe('14');

    // Invalid duration > 365 blocked at step 1
    fireEvent.change(durationInput, { target: { value: '400' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Số ngày khóa tạm thời phải là số nguyên từ 1 đến 365 ngày.',
    );

    // UC-13 3.3: Blank reason blocked from entering confirmation step
    fireEvent.change(durationInput, { target: { value: '14' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Vui lòng nhập lý do khóa tài khoản.');
    expect(screen.queryByLabelText('Xác nhận quyết định khóa')).not.toBeInTheDocument();

    // Enter valid reason -> proceed to confirmation step (UC-13 step 4)
    fireEvent.change(screen.getByLabelText('Lý do khóa tài khoản *'), {
      target: { value: '  Đăng tin sai danh mục nhiều lần  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));

    const confirmBox = await screen.findByLabelText('Xác nhận quyết định khóa');
    expect(within(confirmBox).getByText('Bị khóa — Khóa tạm thời (14 ngày)')).toBeInTheDocument();
    expect(within(confirmBox).getByText('Đăng tin sai danh mục nhiều lần')).toBeInTheDocument();
    expect(mockedApi).not.toHaveBeenCalled();

    // UC-13 3.2: Clicking "Hủy" at confirmation closes form without calling POST /lock
    fireEvent.click(within(confirmBox).getByRole('button', { name: 'Hủy' }));
    expect(screen.queryByLabelText('Biểu mẫu khóa tài khoản')).not.toBeInTheDocument();
    expect(mockedApi).not.toHaveBeenCalled();

    // Re-open, enter reason, continue, and confirm lock (UC-13 step 5)
    fireEvent.click(screen.getByRole('button', { name: 'Khóa tài khoản' }));
    fireEvent.change(screen.getByLabelText('Lý do khóa tài khoản *'), {
      target: { value: 'Đăng tin sai danh mục nhiều lần' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận khóa' }));

    await waitFor(() =>
      expect(mockedApi).toHaveBeenCalledWith('/admin/users/user-500/lock', {
        method: 'POST',
        body: JSON.stringify({
          lockType: 'TEMPORARY',
          durationDays: 14,
          reason: 'Đăng tin sai danh mục nhiều lần',
          expectedVersion: 4,
        }),
      }),
    );
    expect(onChanged).toHaveBeenCalledWith(lockedResponse);
    expect(await screen.findByText('Đã khóa tạm thời tài khoản trong 14 ngày.')).toBeInTheDocument();
  });

  it('shows permanent lock confirmation summary (no auto-unlock + appealable) and submits expectedVersion (UC-13 3.2)', async () => {
    const onChanged = vi.fn();
    mockedApi.mockResolvedValueOnce(permanentlyLockedDetail as never);

    render(
      <UserRestrictionPanel
        currentUser={moderatorActor}
        detail={activeMemberDetail}
        onRestrictionChanged={onChanged}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Khóa tài khoản' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Khóa vĩnh viễn' }));
    expect(
      screen.getByText(/Theo quy định FR-12, khóa vĩnh viễn không có mốc tự mở khóa và bảo lưu quyền gửi khiếu nại/),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Lý do khóa tài khoản *'), {
      target: { value: 'Gian lận bằng chứng bàn giao nghiêm trọng' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));

    const confirmBox = await screen.findByLabelText('Xác nhận quyết định khóa');
    expect(within(confirmBox).getByText('Bị khóa — Khóa vĩnh viễn')).toBeInTheDocument();
    expect(within(confirmBox).getByText(/Không có mốc tự mở khóa/)).toBeInTheDocument();
    expect(within(confirmBox).getByText('Có quyền khiếu nại')).toBeInTheDocument();

    fireEvent.click(within(confirmBox).getByRole('button', { name: 'Xác nhận khóa' }));

    await waitFor(() =>
      expect(mockedApi).toHaveBeenCalledWith('/admin/users/user-500/lock', {
        method: 'POST',
        body: JSON.stringify({
          lockType: 'PERMANENT',
          reason: 'Gian lận bằng chứng bàn giao nghiêm trọng',
          appealable: true,
          expectedVersion: 4,
        }),
      }),
    );
    expect(onChanged).toHaveBeenCalledWith(permanentlyLockedDetail);
  });

  it('enforces UC-14 2-step unlock flow showing restored status (Hoạt động vs Chờ kích hoạt) and cancel', async () => {
    const onChanged = vi.fn();
    mockedApi.mockResolvedValueOnce({ ...activeMemberDetail, version: 6 } as never);

    const pendingLockedDetail: AdminUserDetail = {
      ...permanentlyLockedDetail,
      id: 'user-501',
      emailVerified: true,
      profileApproved: false,
    };

    const { rerender } = render(
      <UserRestrictionPanel
        currentUser={moderatorActor}
        detail={pendingLockedDetail}
        onRestrictionChanged={onChanged}
      />,
    );

    // Check unapproved profile restores to "Chờ kích hoạt"
    fireEvent.click(screen.getByRole('button', { name: 'Mở khóa tài khoản' }));
    fireEvent.change(screen.getByLabelText('Lý do mở khóa tài khoản *'), {
      target: { value: 'Mở khóa để bổ sung hồ sơ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    expect(await screen.findByText('Chờ kích hoạt')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(mockedApi).not.toHaveBeenCalled();

    // Rerender with fully verified & approved locked member -> restores to "Hoạt động"
    rerender(
      <UserRestrictionPanel
        currentUser={moderatorActor}
        detail={permanentlyLockedDetail}
        onRestrictionChanged={onChanged}
      />,
    );

    const banner = screen.getByLabelText('Trạng thái hạn chế hiện tại');
    expect(within(banner).getByText('Khóa vĩnh viễn')).toBeInTheDocument();
    expect(within(banner).getByText('Có quyền khiếu nại')).toBeInTheDocument();
    expect(within(banner).getByText('30')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Mở khóa tài khoản' }));

    // Blank unlock reason blocked (UC-14 3.3)
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Vui lòng nhập lý do mở khóa tài khoản.');

    // Enter reason -> Continue -> Confirm unlock
    fireEvent.change(screen.getByLabelText('Lý do mở khóa tài khoản *'), {
      target: { value: 'Khiếu nại của sinh viên đã được đối chiếu hợp lệ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));

    const confirmBox = await screen.findByLabelText('Xác nhận quyết định mở khóa');
    expect(within(confirmBox).getByText('Hoạt động')).toBeInTheDocument();
    expect(within(confirmBox).getByText('Khiếu nại của sinh viên đã được đối chiếu hợp lệ')).toBeInTheDocument();

    fireEvent.click(within(confirmBox).getByRole('button', { name: 'Xác nhận mở khóa' }));

    await waitFor(() =>
      expect(mockedApi).toHaveBeenCalledWith('/admin/users/user-500/unlock', {
        method: 'POST',
        body: JSON.stringify({
          reason: 'Khiếu nại của sinh viên đã được đối chiếu hợp lệ',
          expectedVersion: 5,
        }),
      }),
    );
    expect(await screen.findByText('Đã mở khóa tài khoản thành công.')).toBeInTheDocument();
  });

  it('enforces self-lock, VO_HIEU_HOA deleted account, and peer-moderator/senior-admin RBAC guards', () => {
    const selfDetail: AdminUserDetail = {
      ...permanentlyLockedDetail,
      id: moderatorActor.id,
      systemRoles: ['MODERATOR'],
    };

    const { rerender } = render(
      <UserRestrictionPanel
        currentUser={moderatorActor}
        detail={selfDetail}
        onRestrictionChanged={vi.fn()}
      />,
    );
    expect(screen.getByText('Không thể tự khóa/mở khóa tài khoản của chính mình.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Khóa tài khoản' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Mở khóa tài khoản' })).toBeDisabled();

    // VO_HIEU_HOA deleted account guard
    rerender(
      <UserRestrictionPanel
        currentUser={seniorAdminActor}
        detail={{ ...activeMemberDetail, accountStatus: 'VO_HIEU_HOA' }}
        onRestrictionChanged={vi.fn()}
      />,
    );
    expect(
      screen.getByText('Tài khoản đã bị xóa/vô hiệu hóa, không thể thực hiện khóa hoặc mở khóa.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Khóa tài khoản' })).toBeDisabled();

    // Peer moderator guard for moderator vs allowed for senior admin
    const peerModDetail: AdminUserDetail = {
      ...activeMemberDetail,
      id: 'mod-2',
      systemRoles: ['MEMBER', 'MODERATOR'],
    };
    rerender(
      <UserRestrictionPanel
        currentUser={moderatorActor}
        detail={peerModDetail}
        onRestrictionChanged={vi.fn()}
      />,
    );
    expect(
      screen.getByText(
        'Kiểm duyệt viên không được khóa/mở khóa Kiểm duyệt viên khác hoặc Quản trị viên cấp cao.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Khóa tài khoản' })).toBeDisabled();

    rerender(
      <UserRestrictionPanel
        currentUser={seniorAdminActor}
        detail={peerModDetail}
        onRestrictionChanged={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Khóa tài khoản' })).toBeEnabled();
  });

  it('surfaces 403 error and auto-reloads user detail when lock or unlock returns 409 conflict (UC-13/14 3.3)', async () => {
    const onChanged = vi.fn();
    const reloadedLockedDetail: AdminUserDetail = {
      ...permanentlyLockedDetail,
      version: 9,
    };
    const reloadedUnlockedDetail: AdminUserDetail = {
      ...activeMemberDetail,
      version: 10,
    };

    // Case 1: 403 on lock
    mockedApi.mockRejectedValueOnce(new ApiError(403, 'Không đủ quyền thực hiện thao tác khóa tài khoản này.'));

    const { rerender } = render(
      <UserRestrictionPanel
        currentUser={seniorAdminActor}
        detail={activeMemberDetail}
        onRestrictionChanged={onChanged}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Khóa tài khoản' }));
    fireEvent.change(screen.getByLabelText('Lý do khóa tài khoản *'), { target: { value: 'Thử khóa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận khóa' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không đủ quyền thực hiện thao tác khóa tài khoản này.',
    );

    // Case 2: 409 STATE_CONFLICT on lock -> auto-reloads GET /admin/users/user-500
    mockedApi
      .mockRejectedValueOnce(new ApiError(409, 'Trạng thái khóa đã thay đổi đồng thời.'))
      .mockResolvedValueOnce(reloadedLockedDetail as never);

    fireEvent.click(screen.getByRole('button', { name: 'Khóa tài khoản' }));
    fireEvent.change(screen.getByLabelText('Lý do khóa tài khoản *'), { target: { value: 'Khóa lần 2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận khóa' }));

    const lockConflictAlert = await screen.findByRole('alert');
    expect(lockConflictAlert).toHaveTextContent('Trạng thái khóa đã thay đổi đồng thời.');
    expect(lockConflictAlert).toHaveTextContent('Đã tự động tải lại thông tin tài khoản mới nhất.');
    expect(mockedApi).toHaveBeenCalledWith('/admin/users/user-500');
    expect(onChanged).toHaveBeenCalledWith(reloadedLockedDetail);

    // Case 3: 409 ACCOUNT_NOT_LOCKED / STATE_CONFLICT on unlock -> auto-reloads GET /admin/users/user-500
    rerender(
      <UserRestrictionPanel
        currentUser={seniorAdminActor}
        detail={reloadedLockedDetail}
        onRestrictionChanged={onChanged}
      />,
    );

    mockedApi
      .mockRejectedValueOnce(new ApiError(409, 'Tài khoản vừa được mở khóa trước đó.'))
      .mockResolvedValueOnce(reloadedUnlockedDetail as never);

    fireEvent.click(screen.getByRole('button', { name: 'Mở khóa tài khoản' }));
    fireEvent.change(screen.getByLabelText('Lý do mở khóa tài khoản *'), { target: { value: 'Thử mở khóa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận mở khóa' }));

    const unlockConflictAlert = await screen.findByRole('alert');
    expect(unlockConflictAlert).toHaveTextContent('Tài khoản vừa được mở khóa trước đó.');
    expect(unlockConflictAlert).toHaveTextContent('Trạng thái đã thay đổi; đã tự động tải lại thông tin tài khoản.');
    expect(onChanged).toHaveBeenCalledWith(reloadedUnlockedDetail);
  });

  it('refreshes user list, detail, and moderation logs when locking from UsersManagementPage', async () => {
    let isLocked = false;
    const initialSummary: AdminUserSummary = {
      id: 'user-500',
      fullName: 'Võ Thanh Tùng',
      email: 'tung.vo@uni.edu.vn',
      studentId: '21120500',
      phone: '0912345678',
      studentStatus: 'DANG_HOC',
      accountStatus: 'HOAT_DONG',
      restrictionType: null,
      lockedUntil: null,
      emailVerified: true,
      profileApproved: true,
      reputationScore: 85,
      systemRoles: ['MEMBER'],
      createdAt: '2026-11-01T08:00:00Z',
    };

    const lockedSummary: AdminUserSummary = {
      ...initialSummary,
      accountStatus: 'BI_KHOA',
      restrictionType: 'KHOA_TAM_THOI',
      lockedUntil: '2026-12-02T08:00:00Z',
      systemRoles: [],
    };

    const lockedDetail: AdminUserDetail = {
      ...activeMemberDetail,
      accountStatus: 'BI_KHOA',
      restrictionType: 'KHOA_TAM_THOI',
      restrictionReason: 'Vi phạm quy tắc ứng xử cộng đồng',
      lockedUntil: '2026-12-02T08:00:00Z',
      appealable: false,
      systemRoles: [],
      version: 5,
    };

    mockedApi.mockImplementation(async (path, init) => {
      if (path === '/auth/me') return moderatorActor as never;
      if (path.startsWith('/admin/users?')) {
        const list: PaginatedResponse<AdminUserSummary> = {
          items: [isLocked ? lockedSummary : initialSummary],
          page: 0,
          size: 20,
          totalElements: 1,
          totalPages: 1,
        };
        return list as never;
      }
      if (path === '/admin/users/user-500' && (!init || !init.method)) {
        return (isLocked ? lockedDetail : activeMemberDetail) as never;
      }
      if (path === '/admin/users/user-500/lock' && init?.method === 'POST') {
        isLocked = true;
        return lockedDetail as never;
      }
      if (path.startsWith('/admin/users/user-500/moderation-logs')) {
        return {
          items: [
            {
              id: 'log-lock-1',
              actionType: 'LOCK_TEMPORARY',
              reason: 'Vi phạm quy tắc ứng xử cộng đồng',
              previousStatus: 'HOAT_DONG',
              newStatus: 'BI_KHOA',
              lockType: 'KHOA_TAM_THOI',
              lockedUntil: '2026-12-02T08:00:00Z',
              appealable: false,
              actorId: 'mod-1',
              actorName: 'Kiểm duyệt viên Minh',
              details: { durationDays: 14 },
              createdAt: '2026-11-18T08:00:00Z',
            },
          ],
          page: 0,
          size: 20,
          totalElements: 1,
          totalPages: 1,
        } as never;
      }
      throw new Error(`Unexpected API call: ${init?.method ?? 'GET'} ${path}`);
    });

    render(
      <MemoryRouter initialEntries={['/users']}>
        <App />
      </MemoryRouter>,
    );

    await screen.findByText('Võ Thanh Tùng');
    const rows = screen.getAllByRole('row');
    fireEvent.click(within(rows[1]).getByRole('button', { name: 'Chi tiết' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Khóa tài khoản' }));
    fireEvent.change(screen.getByLabelText('Lý do khóa tài khoản *'), {
      target: { value: 'Vi phạm quy tắc ứng xử cộng đồng' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận khóa' }));

    expect(await screen.findByLabelText('Trạng thái hạn chế hiện tại')).toBeInTheDocument();
    expect(mockedApi).toHaveBeenCalledWith('/admin/users/user-500/moderation-logs?page=0&size=20');

    fireEvent.click(screen.getByRole('tab', { name: 'Vết kiểm duyệt' }));
    const logPanel = await screen.findByRole('tabpanel', { name: 'Vết kiểm duyệt' });
    expect(within(logPanel).getByText('LOCK_TEMPORARY')).toBeInTheDocument();
    expect(within(logPanel).getByText('Hình thức: Khóa tạm thời')).toBeInTheDocument();
  });
});

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { ApiError, api } from '../api/client';
import type {
  AdminUserDetail,
  AdminUserSummary,
  ModerationLogsPage,
  PaginatedResponse,
  ReputationHistoryPage,
  UserTransactionsPage,
} from './userAdminApi';

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

const moderatorSession = {
  id: 'mod-1',
  name: 'Kiểm duyệt viên A',
  role: 'moderator' as const,
  email: 'mod@uni.edu.vn',
  roles: ['MODERATOR'],
  emailVerified: true,
  profileApproved: true,
  accountStatus: 'HOAT_DONG',
};

const adminSession = {
  id: 'adm-1',
  name: 'Quản trị viên B',
  role: 'admin' as const,
  email: 'admin@uni.edu.vn',
  roles: ['SENIOR_ADMIN'],
  emailVerified: true,
  profileApproved: true,
  accountStatus: 'HOAT_DONG',
};

const memberUserSummary: AdminUserSummary = {
  id: 'u-101',
  fullName: 'Nguyễn Minh Khoa',
  email: 'khoa.nguyen@uni.edu.vn',
  studentId: '21120001',
  phone: '0901234567',
  studentStatus: 'DANG_HOC',
  accountStatus: 'HOAT_DONG',
  restrictionType: null,
  lockedUntil: null,
  emailVerified: true,
  profileApproved: true,
  reputationScore: 100,
  systemRoles: ['MEMBER'],
  createdAt: '2026-11-01T08:00:00Z',
};

const lockedTempSummary: AdminUserSummary = {
  id: 'u-102',
  fullName: 'Lê Thu Hà',
  email: 'ha.le@uni.edu.vn',
  studentId: '21120002',
  phone: null,
  studentStatus: 'DANG_HOC',
  accountStatus: 'BI_KHOA',
  restrictionType: 'KHOA_TAM_THOI',
  lockedUntil: '2026-12-01T08:00:00Z',
  emailVerified: true,
  profileApproved: true,
  reputationScore: 45,
  systemRoles: [],
  createdAt: '2026-11-02T08:00:00Z',
};

const lockedPermSummary: AdminUserSummary = {
  id: 'u-103',
  fullName: 'Phạm Quốc Bảo',
  email: 'bao.pham@uni.edu.vn',
  studentId: '21120003',
  phone: null,
  studentStatus: 'DA_TOT_NGHIEP',
  accountStatus: 'BI_KHOA',
  restrictionType: 'KHOA_VINH_VIEN',
  lockedUntil: null,
  emailVerified: true,
  profileApproved: true,
  reputationScore: 30,
  systemRoles: [],
  createdAt: '2026-11-03T08:00:00Z',
};

const memberUserDetail: AdminUserDetail = {
  id: 'u-101',
  fullName: 'Nguyễn Minh Khoa',
  email: 'khoa.nguyen@uni.edu.vn',
  studentId: '21120001',
  phone: '0901234567',
  university: 'ĐH Khoa học Tự nhiên',
  campus: 'Cơ sở Linh Trung',
  major: 'Công nghệ thông tin',
  cohort: 'K2021',
  studentStatus: 'DANG_HOC',
  hasStudentCardFront: true,
  hasStudentCardBack: false,
  studentCardFront: '/uploads/cards/u-101-front.jpg',
  studentCardBack: null,
  emailVerified: true,
  profileApproved: true,
  reputationScore: 100,
  accountStatus: 'HOAT_DONG',
  restrictionType: null,
  restrictionReason: null,
  lockedUntil: null,
  appealable: false,
  systemRoles: ['MEMBER'],
  createdAt: '2026-11-01T08:00:00Z',
  updatedAt: '2026-11-10T09:30:00Z',
  version: 2,
};

const defaultListResponse: PaginatedResponse<AdminUserSummary> = {
  items: [memberUserSummary, lockedTempSummary, lockedPermSummary],
  page: 0,
  size: 20,
  totalElements: 3,
  totalPages: 1,
};

const transactionsResponse: UserTransactionsPage = {
  items: [
    {
      transactionId: 'tx-1',
      listingId: 'lst-99',
      listingTitle: 'Giáo trình Giải tích 1',
      transactionRole: 'SELLER',
      counterpartyId: 'u-200',
      counterpartyName: 'Trần Hoàng Nam',
      counterpartyStudentId: '22120055',
      agreedPrice: 45000,
      status: 'HOAN_TAT',
      scheduledAt: '2026-11-12T10:00:00Z',
      completedAt: '2026-11-12T14:00:00Z',
      createdAt: '2026-11-11T09:00:00Z',
    },
    {
      transactionId: 'tx-2',
      listingId: 'lst-105',
      listingTitle: 'Đèn bàn học chống cận',
      transactionRole: 'BUYER',
      counterpartyId: 'u-201',
      counterpartyName: 'Đỗ Mai Anh',
      counterpartyStudentId: '20120088',
      agreedPrice: 0,
      status: 'DANG_GIU_CHO',
      scheduledAt: null,
      completedAt: null,
      createdAt: '2026-11-14T09:00:00Z',
    },
  ],
  page: 0,
  size: 20,
  totalElements: 2,
  totalPages: 1,
};

const reputationResponse: ReputationHistoryPage = {
  currentScore: 100,
  items: [
    {
      id: 'rep-1',
      changeType: 'KHOI_TAO_KICH_HOAT',
      delta: 100,
      scoreBefore: 0,
      scoreAfter: 100,
      reason: 'Khởi tạo điểm uy tín khi duyệt hồ sơ kích hoạt',
      referenceSource: 'ACTIVATION',
      referenceId: 'u-101',
      actorId: 'mod-1',
      actorName: 'Kiểm duyệt viên A',
      createdAt: '2026-11-01T08:05:00Z',
    },
  ],
  page: 0,
  size: 20,
  totalElements: 1,
  totalPages: 1,
};

const moderationLogsResponse: ModerationLogsPage = {
  items: [
    {
      id: 'log-1',
      actionType: 'UPDATE_IDENTITY',
      reason: 'Đối chiếu lại MSSV trên thẻ sinh viên',
      previousStatus: 'HOAT_DONG',
      newStatus: 'HOAT_DONG',
      lockType: null,
      lockedUntil: null,
      appealable: false,
      actorId: 'mod-1',
      actorName: 'Kiểm duyệt viên A',
      details: {},
      createdAt: '2026-11-10T09:30:00Z',
    },
  ],
  page: 0,
  size: 20,
  totalElements: 1,
  totalPages: 1,
};

function renderUsersRoute() {
  return render(
    <MemoryRouter initialEntries={['/users']}>
      <App />
    </MemoryRouter>,
  );
}

describe('UsersManagementPage', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mockedApi.mockReset();
    mockedApi.mockImplementation(async (path, init) => {
      if (path === '/auth/me') return moderatorSession as never;
      if (path.startsWith('/admin/users?')) return defaultListResponse as never;
      if (path === '/admin/users/u-101' && (!init || !init.method)) return memberUserDetail as never;
      if (path.startsWith('/admin/users/u-101/transactions')) return transactionsResponse as never;
      if (path.startsWith('/admin/users/u-101/reputation-history')) return reputationResponse as never;
      if (path.startsWith('/admin/users/u-101/moderation-logs')) return moderationLogsResponse as never;
      throw new Error(`Unexpected API call: ${init?.method ?? 'GET'} ${path}`);
    });
  });

  it('allows moderator access to /users and renders distinct temporary vs permanent lock badges', async () => {
    renderUsersRoute();

    expect(await screen.findByRole('heading', { name: 'Quản lý người dùng' })).toBeInTheDocument();
    expect(await screen.findByText('Nguyễn Minh Khoa')).toBeInTheDocument();
    expect(screen.getByText('Khóa tạm thời')).toBeInTheDocument();
    expect(screen.getByText('Khóa vĩnh viễn')).toBeInTheDocument();
    expect(mockedApi).toHaveBeenCalledWith('/admin/users?page=0&size=20');
  });

  it('allows senior admin access to /users via navigation and route', async () => {
    mockedApi.mockImplementation(async (path) => {
      if (path === '/auth/me') return adminSession as never;
      if (path.startsWith('/admin/users?')) return defaultListResponse as never;
      return {} as never;
    });

    renderUsersRoute();

    expect(await screen.findByRole('heading', { name: 'Quản lý người dùng' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Người dùng' })).toBeInTheDocument();
    expect(await screen.findByText('21120001')).toBeInTheDocument();
  });

  it('denies member access to /users without calling /admin/users', async () => {
    mockedApi.mockImplementation(async (path) => {
      if (path === '/auth/me') {
        return {
          ...moderatorSession,
          role: 'member',
          roles: ['MEMBER'],
        } as never;
      }
      return {} as never;
    });

    renderUsersRoute();

    expect(await screen.findByText('Tài khoản không có quyền quản trị.')).toBeInTheDocument();
    expect(mockedApi).not.toHaveBeenCalledWith(expect.stringContaining('/admin/users'));
  });

  it('submits search and filter criteria and handles empty results and filter reset', async () => {
    mockedApi.mockImplementation(async (path) => {
      if (path === '/auth/me') return moderatorSession as never;
      if (path === '/admin/users?page=0&size=20') return defaultListResponse as never;
      if (path.startsWith('/admin/users?')) {
        return { items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 } as never;
      }
      return {} as never;
    });

    renderUsersRoute();
    await screen.findByText('Nguyễn Minh Khoa');

    fireEvent.change(screen.getByLabelText('Từ khóa tìm kiếm'), { target: { value: '21120999' } });
    fireEvent.change(screen.getByLabelText('Trạng thái tài khoản'), { target: { value: 'BI_KHOA' } });
    fireEvent.change(screen.getByLabelText('Tình trạng học tập'), { target: { value: 'DA_TOT_NGHIEP' } });
    fireEvent.change(screen.getByLabelText('Xác minh email'), { target: { value: 'true' } });
    fireEvent.change(screen.getByLabelText('Duyệt hồ sơ'), { target: { value: 'false' } });
    fireEvent.change(screen.getByLabelText('Vai trò hệ thống'), { target: { value: 'MEMBER' } });
    fireEvent.change(screen.getByLabelText('Điểm uy tín tối thiểu'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('Điểm uy tín tối đa'), { target: { value: '50' } });

    fireEvent.click(screen.getByRole('button', { name: 'Tìm kiếm' }));

    await waitFor(() =>
      expect(mockedApi).toHaveBeenCalledWith(
        '/admin/users?q=21120999&accountStatus=BI_KHOA&studentStatus=DA_TOT_NGHIEP&emailVerified=true&profileApproved=false&role=MEMBER&minReputation=20&maxReputation=50&page=0&size=20',
      ),
    );
    expect(await screen.findByText('Không tìm thấy người dùng phù hợp với bộ lọc hiện tại.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Đặt lại bộ lọc' }));
    expect(await screen.findByText('Nguyễn Minh Khoa')).toBeInTheDocument();
  });

  it('handles 404 when loading detail of a missing user', async () => {
    mockedApi.mockImplementation(async (path) => {
      if (path === '/auth/me') return moderatorSession as never;
      if (path.startsWith('/admin/users?')) return defaultListResponse as never;
      if (path === '/admin/users/u-101') throw new ApiError(404, 'Not found');
      return {} as never;
    });

    renderUsersRoute();
    await screen.findByText('Nguyễn Minh Khoa');

    const rows = screen.getAllByRole('row');
    fireEvent.click(within(rows[1]).getByRole('button', { name: 'Chi tiết' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không tìm thấy người dùng hoặc hồ sơ không tồn tại.',
    );
  });

  it('renders student card preview in view mode and loads transaction, reputation, and audit tabs (UC-11)', async () => {
    renderUsersRoute();
    await screen.findByText('Nguyễn Minh Khoa');

    const rows = screen.getAllByRole('row');
    fireEvent.click(within(rows[1]).getByRole('button', { name: 'Chi tiết' }));

    const frontImg = await screen.findByAltText('Thẻ sinh viên mặt trước');
    expect(frontImg).toHaveAttribute('src', '/uploads/cards/u-101-front.jpg');
    expect(screen.getByText('Chưa có ảnh thẻ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sửa hồ sơ' })).toBeEnabled();

    fireEvent.click(screen.getByRole('tab', { name: 'Lịch sử giao dịch' }));
    expect(await screen.findByText('Giáo trình Giải tích 1')).toBeInTheDocument();
    expect(screen.getByText('Người bán')).toBeInTheDocument();
    expect(screen.getByText('Người mua')).toBeInTheDocument();
    expect(screen.getByText('MSSV: 22120055')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Biến động điểm uy tín' }));
    expect(await screen.findByText('Điểm hiện tại: 100')).toBeInTheDocument();
    expect(screen.getByText(/30 < điểm ≤ 50/)).toBeInTheDocument();
    expect(screen.getByText(/Điểm ≤ 30/)).toBeInTheDocument();
    expect(screen.getByText('+100')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Vết kiểm duyệt' }));
    expect(await screen.findByText('Đối chiếu lại MSSV trên thẻ sinh viên')).toBeInTheDocument();
  });

  it('supports UC-12 edit flow: cancel restores original data, validates card format, and saves DA_TOT_NGHIEP with expectedVersion', async () => {
    const graduatedDetail: AdminUserDetail = {
      ...memberUserDetail,
      studentStatus: 'DA_TOT_NGHIEP',
      accountStatus: 'HOAT_DONG',
      studentCardBack: 'https://cdn.uni.edu.vn/cards/u-101-back.png',
      hasStudentCardBack: true,
      cohort: 'K2020',
      version: 3,
    };

    let patchCalls = 0;
    mockedApi.mockImplementation(async (path, init) => {
      if (path === '/auth/me') return moderatorSession as never;
      if (path.startsWith('/admin/users?')) return defaultListResponse as never;
      if (path === '/admin/users/u-101' && (!init || !init.method)) return memberUserDetail as never;
      if (path === '/admin/users/u-101' && init?.method === 'PATCH') {
        patchCalls += 1;
        return graduatedDetail as never;
      }
      return {} as never;
    });

    renderUsersRoute();
    await screen.findByText('Nguyễn Minh Khoa');

    const rows = screen.getAllByRole('row');
    fireEvent.click(within(rows[1]).getByRole('button', { name: 'Chi tiết' }));

    // Step 1: Open edit form via "Sửa hồ sơ"
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa hồ sơ' }));
    expect(screen.getByText('Chuyển trạng thái Đã tốt nghiệp không khóa tài khoản.')).toBeInTheDocument();

    // UC-12 3.2: Modify input then click "Hủy" -> closes form without PATCH and keeps original view
    fireEvent.change(screen.getByLabelText('Họ và tên *'), { target: { value: 'Tên Tạm Chưa Lưu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(screen.queryByLabelText('Họ và tên *')).not.toBeInTheDocument();
    expect(patchCalls).toBe(0);

    // Re-open edit form -> original value is restored
    fireEvent.click(screen.getByRole('button', { name: 'Sửa hồ sơ' }));
    expect((screen.getByLabelText('Họ và tên *') as HTMLInputElement).value).toBe('Nguyễn Minh Khoa');

    // UC-12 3.3: Invalid student card URL is rejected before calling PATCH
    fireEvent.change(screen.getByLabelText('Ảnh thẻ sinh viên mặt sau'), {
      target: { value: 'ftp://invalid-card-source' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận lưu' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ảnh thẻ sinh viên mặt sau không đáp ứng quy chuẩn',
    );
    expect(patchCalls).toBe(0);

    // Valid graduation update (reason optional per UC-12) -> sends expectedVersion, returns to view mode
    fireEvent.change(screen.getByLabelText('Ảnh thẻ sinh viên mặt sau'), {
      target: { value: 'https://cdn.uni.edu.vn/cards/u-101-back.png' },
    });
    fireEvent.change(screen.getByLabelText('Tình trạng học tập *'), { target: { value: 'DA_TOT_NGHIEP' } });
    fireEvent.change(screen.getByLabelText('Khóa tuyển sinh'), { target: { value: 'K2020' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận lưu' }));

    expect(await screen.findByText('Đã cập nhật thông tin định danh người dùng.')).toBeInTheDocument();
    expect(patchCalls).toBe(1);
    expect(screen.getByAltText('Thẻ sinh viên mặt sau')).toHaveAttribute(
      'src',
      'https://cdn.uni.edu.vn/cards/u-101-back.png',
    );

    const patchCall = mockedApi.mock.calls.find(
      ([url, opts]) => url === '/admin/users/u-101' && opts?.method === 'PATCH',
    );
    const sentBody = JSON.parse(patchCall![1]!.body as string) as Record<string, unknown>;
    expect(sentBody.studentStatus).toBe('DA_TOT_NGHIEP');
    expect(sentBody.expectedVersion).toBe(2);
    expect(sentBody.studentCardBack).toBe('https://cdn.uni.edu.vn/cards/u-101-back.png');
  });

  it('reloads latest user detail automatically when PATCH returns 409 STATE_CONFLICT / ACCOUNT_DELETED (UC-12 3.3)', async () => {
    let detailCalls = 0;
    const deletedDetail: AdminUserDetail = {
      ...memberUserDetail,
      accountStatus: 'VO_HIEU_HOA',
      version: 5,
    };

    mockedApi.mockImplementation(async (path, init) => {
      if (path === '/auth/me') return moderatorSession as never;
      if (path.startsWith('/admin/users?')) return defaultListResponse as never;
      if (path === '/admin/users/u-101' && (!init || !init.method)) {
        detailCalls += 1;
        return (detailCalls === 1 ? memberUserDetail : deletedDetail) as never;
      }
      if (path === '/admin/users/u-101' && init?.method === 'PATCH') {
        throw new ApiError(409, 'Tài khoản mục tiêu vừa bị xóa hoặc thay đổi phiên bản.');
      }
      return {} as never;
    });

    renderUsersRoute();
    await screen.findByText('Nguyễn Minh Khoa');

    const rows = screen.getAllByRole('row');
    fireEvent.click(within(rows[1]).getByRole('button', { name: 'Chi tiết' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Sửa hồ sơ' }));
    fireEvent.change(screen.getByLabelText('Khóa tuyển sinh'), { target: { value: 'K2022' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận lưu' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Tài khoản mục tiêu vừa bị xóa hoặc thay đổi phiên bản.');
    expect(alert).toHaveTextContent('Đã tải lại trạng thái tài khoản mới nhất.');
    expect(detailCalls).toBe(2);
    expect(screen.getByRole('button', { name: 'Sửa hồ sơ' })).toBeDisabled();
    expect(screen.getByText('Tài khoản đã bị xóa/vô hiệu hóa, không thể chỉnh sửa hồ sơ.')).toBeInTheDocument();
  });

  it('disables editing when moderator views a SENIOR_ADMIN profile', async () => {
    mockedApi.mockImplementation(async (path) => {
      if (path === '/auth/me') return moderatorSession as never;
      if (path.startsWith('/admin/users?')) return defaultListResponse as never;
      if (path === '/admin/users/u-101') {
        return {
          ...memberUserDetail,
          systemRoles: ['SENIOR_ADMIN'],
        } as never;
      }
      return {} as never;
    });

    renderUsersRoute();
    await screen.findByText('Nguyễn Minh Khoa');

    const rows = screen.getAllByRole('row');
    fireEvent.click(within(rows[1]).getByRole('button', { name: 'Chi tiết' }));

    expect(
      await screen.findByText('Kiểm duyệt viên không được chỉnh sửa hồ sơ định danh của Quản trị viên cấp cao.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sửa hồ sơ' })).toBeDisabled();
  });
});

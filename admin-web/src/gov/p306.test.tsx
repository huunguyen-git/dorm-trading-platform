import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiError, api } from '../api/client';
import type * as ApiClient from '../api/client';
import ReportsModerationPage from './ReportsModerationPage';
import StatisticsPage from './StatisticsPage';

vi.mock('../api/client', async (importOriginal) => ({
  ...await importOriginal<typeof ApiClient>(),
  api: vi.fn(),
}));
afterEach(() => cleanup());

const request = vi.mocked(api);

beforeEach(() => {
  request.mockReset();
  if (!HTMLDialogElement.prototype.showModal) HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  if (!HTMLDialogElement.prototype.close) HTMLDialogElement.prototype.close = function () { this.open = false; };
});

it('loads report groups, opens detail, and resolves group as VI_PHAM', async () => {
  request.mockImplementation(async (path, init) => {
    if (path.startsWith('/admin/reports/groups?')) {
      return {
        items: [{
          targetType: 'TIN_DANG',
          targetId: 't-1',
          targetLabel: 'Giáo trình Giải tích 1',
          targetStatus: 'DANG_BAN',
          category: 'SPAM',
          reportCount: 2,
          latestReportAt: '2026-11-28T07:00:00Z',
          status: 'CHO_XU_LY',
          decisionId: null,
          decision: null,
        }],
        page: 0,
        size: 20,
        total: 1,
      } as never;
    }
    if (path.startsWith('/admin/reports/groups/detail?')) {
      return {
        targetType: 'TIN_DANG',
        targetId: 't-1',
        targetLabel: 'Giáo trình Giải tích 1',
        targetStatus: 'DANG_BAN',
        category: 'SPAM',
        status: 'CHO_XU_LY',
        reports: [{
          reportId: 'r-1',
          reporterId: 'u-1',
          reporterName: 'Nguyễn Văn A',
          reporterStudentId: '23520001',
          description: 'Đăng lặp nhiều lần',
          evidence: [],
          createdAt: '2026-11-28T07:00:00Z',
          status: 'CHO_XU_LY',
        }],
        decision: null,
      } as never;
    }
    if (path === '/admin/reports/penalties') {
      return [{ id: 'SPAM_01', name: 'Spam tin đăng', points: 15, description: 'Đăng lặp' }] as never;
    }
    if (path === '/admin/reports/duplicate-candidates') {
      return [] as never;
    }
    if (path === '/admin/reports/groups/resolve' && init?.method === 'POST') {
      return {
        decisionId: 'd-1',
        conclusion: 'VI_PHAM',
        updatedReportCount: 2,
        penaltyApplied: true,
        scoreAfter: 85,
        accountStatusAfter: 'HOAT_DONG',
        listingHidden: true,
      } as never;
    }
    return undefined as never;
  });

  const user = userEvent.setup();
  render(<ReportsModerationPage />);

  expect(await screen.findByText('Giáo trình Giải tích 1')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Xem & xử lý' }));

  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText(/Đăng lặp nhiều lần/)).toBeInTheDocument();

  await user.type(within(dialog).getByLabelText(/Căn cứ xử lý/), 'Xác nhận vi phạm');
  await user.click(within(dialog).getByRole('button', { name: 'Xác nhận quyết định' }));

  expect(await screen.findByText(/Đã xử lý 2 báo cáo/)).toBeInTheDocument();
  expect(screen.getByText(/Tin đăng vi phạm đã được ẩn/)).toBeInTheDocument();
});

it('shows conflict error when report group was already processed concurrently', async () => {
  request.mockImplementation(async (path, init) => {
    if (path.startsWith('/admin/reports/groups?')) {
      return {
        items: [{
          targetType: 'NGUOI_DUNG',
          targetId: 'u-2',
          targetLabel: 'Trần Văn B (23520002)',
          targetStatus: 'HOAT_DONG',
          category: 'LUA_DAO',
          reportCount: 1,
          latestReportAt: '2026-11-28T07:00:00Z',
          status: 'CHO_XU_LY',
          decisionId: null,
          decision: null,
        }],
        page: 0,
        size: 20,
        total: 1,
      } as never;
    }
    if (path.startsWith('/admin/reports/groups/detail?')) {
      return {
        targetType: 'NGUOI_DUNG',
        targetId: 'u-2',
        targetLabel: 'Trần Văn B (23520002)',
        targetStatus: 'HOAT_DONG',
        category: 'LUA_DAO',
        status: 'CHO_XU_LY',
        reports: [{
          reportId: 'r-2',
          reporterId: 'u-1',
          reporterName: 'Nguyễn Văn A',
          reporterStudentId: '23520001',
          description: 'Không giao tài liệu',
          evidence: [],
          createdAt: '2026-11-28T07:00:00Z',
          status: 'CHO_XU_LY',
        }],
        decision: null,
      } as never;
    }
    if (path === '/admin/reports/penalties') {
      return [{ id: 'SCAM_01', name: 'Gian lận', points: 30, description: 'Gian lận' }] as never;
    }
    if (path === '/admin/reports/duplicate-candidates') return [] as never;
    if (path === '/admin/reports/groups/resolve' && init?.method === 'POST') {
      throw new ApiError(409, 'Nhóm báo cáo đã được xử lý bởi Kiểm duyệt viên khác.', 'REPORT_GROUP_ALREADY_PROCESSED');
    }
    return undefined as never;
  });

  const user = userEvent.setup();
  render(<ReportsModerationPage />);

  await user.click(await screen.findByRole('button', { name: 'Xem & xử lý' }));
  const dialog = await screen.findByRole('dialog');
  await user.type(within(dialog).getByLabelText(/Căn cứ xử lý/), 'Kiểm tra');
  await user.click(within(dialog).getByRole('button', { name: 'Xác nhận quyết định' }));

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(/đã được xử lý/);
});

it('renders statistics dashboard sections for senior admin', async () => {
  const period = { code: '2026-HK1', label: 'HK1 (2026-2027)', from: '2026-09-01T00:00:00Z', to: '2027-01-01T00:00:00Z' };
  request.mockImplementation(async (path) => {
    if (path === '/admin/senior/statistics/semesters') return [period] as never;
    if (path.startsWith('/admin/senior/statistics/zero-price')) {
      return {
        period,
        totalCompleted: 10,
        zeroPriceCount: 4,
        paidCount: 6,
        zeroPricePercentage: 40,
        totalActiveListings: 20,
        zeroPriceActiveListings: 8,
      } as never;
    }
    if (path.startsWith('/admin/senior/statistics/top-subjects')) {
      return {
        period,
        searchTrackingActive: false,
        items: [{
          subjectCode: 'IT002',
          subjectName: 'Lập trình hướng đối tượng',
          exchangedCount: 5,
          activeListingCount: 3,
          searchCount: 0,
        }],
      } as never;
    }
    if (path.startsWith('/admin/senior/statistics/category-location')) {
      return {
        period,
        totalCompleted: 10,
        byCategory: [{ code: 'GIAO_TRINH', name: 'Giáo trình', count: 7, percentage: 70 }],
        byLocation: [{ code: 'KTX_KHU_A', name: 'KTX Khu A', count: 6, percentage: 60 }],
        matrix: [],
      } as never;
    }
    if (path.startsWith('/admin/senior/statistics/low-reputation-disputes')) {
      return {
        items: [{
          userId: 'u-9',
          fullName: 'Lê Văn C',
          studentId: '23520009',
          reputationScore: 42,
          accountStatus: 'KHOA_TAM_THOI',
          disputeCount: 2,
          violationCount: 1,
        }],
        page: 0,
        size: 20,
        total: 1,
      } as never;
    }
    return undefined as never;
  });

  render(<StatisticsPage />);

  expect(await screen.findByText('40.00%')).toBeInTheDocument();
  expect(await screen.findByText('Lập trình hướng đối tượng')).toBeInTheDocument();
  expect(await screen.findByText('KTX Khu A')).toBeInTheDocument();
  expect(await screen.findByText('Lê Văn C')).toBeInTheDocument();
});

it('resolves duplicate report group with originalDecisionId and handles conflict-of-interest', async () => {
  request.mockImplementation(async (path, init) => {
    if (path.startsWith('/admin/reports/groups?')) {
      return {
        items: [{
          targetType: 'TIN_DANG',
          targetId: 't-dup',
          targetLabel: 'Tin trùng lặp',
          targetStatus: 'CONG_KHAI',
          category: 'SPAM',
          reportCount: 1,
          latestReportAt: '2026-11-28T07:00:00Z',
          status: 'CHO_XU_LY',
          decisionId: null,
          decision: null,
        }],
        page: 0,
        size: 20,
        total: 1,
      } as never;
    }
    if (path.startsWith('/admin/reports/groups/detail?')) {
      return {
        targetType: 'TIN_DANG',
        targetId: 't-dup',
        targetLabel: 'Tin trùng lặp',
        targetStatus: 'CONG_KHAI',
        category: 'SPAM',
        status: 'CHO_XU_LY',
        reports: [{
          reportId: 'r-dup',
          reporterId: 'u-1',
          reporterName: 'Nguyễn Văn A',
          reporterStudentId: '23520001',
          description: 'Trùng bài trước',
          evidence: [],
          createdAt: '2026-11-28T07:00:00Z',
          status: 'CHO_XU_LY',
        }],
        decision: null,
      } as never;
    }
    if (path === '/admin/reports/penalties') return [] as never;
    if (path === '/admin/reports/duplicate-candidates') {
      return [{
        decisionId: 'd-orig',
        targetType: 'TIN_DANG',
        targetLabel: 'Tin gốc',
        category: 'SPAM',
        conclusion: 'VI_PHAM',
        decidedAt: '2026-11-28T06:00:00Z',
      }] as never;
    }
    if (path === '/admin/reports/groups/resolve' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      expect(body.conclusion).toBe('TRUNG');
      expect(body.originalDecisionId).toBe('d-orig');
      return {
        decisionId: 'd-dup',
        conclusion: 'TRUNG',
        updatedReportCount: 1,
        penaltyApplied: false,
        scoreAfter: null,
        accountStatusAfter: null,
        listingHidden: false,
      } as never;
    }
    return undefined as never;
  });

  const user = userEvent.setup();
  render(<ReportsModerationPage />);

  await user.click(await screen.findByRole('button', { name: 'Xem & xử lý' }));
  const dialog = await screen.findByRole('dialog');
  await user.selectOptions(within(dialog).getByLabelText(/Kết luận/), 'TRUNG');
  await user.type(within(dialog).getByLabelText(/Căn cứ xử lý/), 'Trùng nhóm đã xử lý');
  await user.click(within(dialog).getByRole('button', { name: 'Xác nhận quyết định' }));

  expect(await screen.findByText(/Đã xử lý 1 báo cáo/)).toBeInTheDocument();
});

it('shows conflict of interest alert when moderator opens self-related report group', async () => {
  request.mockImplementation(async (path) => {
    if (path.startsWith('/admin/reports/groups?')) {
      return {
        items: [{
          targetType: 'TIN_DANG',
          targetId: 't-self',
          targetLabel: 'Tin của chính moderator',
          targetStatus: 'CONG_KHAI',
          category: 'SPAM',
          reportCount: 1,
          latestReportAt: '2026-11-28T07:00:00Z',
          status: 'CHO_XU_LY',
          decisionId: null,
          decision: null,
        }],
        page: 0,
        size: 20,
        total: 1,
      } as never;
    }
    if (path.startsWith('/admin/reports/groups/detail?')) {
      throw new ApiError(403, 'Bạn có xung đột lợi ích với nhóm báo cáo này.', 'CONFLICT_OF_INTEREST');
    }
    if (path === '/admin/reports/penalties') return [] as never;
    if (path === '/admin/reports/duplicate-candidates') return [] as never;
    return undefined as never;
  });

  const user = userEvent.setup();
  render(<ReportsModerationPage />);

  await user.click(await screen.findByRole('button', { name: 'Xem & xử lý' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/xung đột lợi ích/);
});

it('caps the violation basis at the ledger limit of 1000 characters', async () => {
  request.mockImplementation(async (path) => {
    if (path.startsWith('/admin/reports/groups?')) {
      return {
        items: [{
          targetType: 'TIN_DANG', targetId: 't-len', targetLabel: 'Tin căn cứ dài',
          targetStatus: 'CONG_KHAI', category: 'SPAM', reportCount: 1,
          latestReportAt: '2026-11-28T07:00:00Z', status: 'CHO_XU_LY',
          decisionId: null, decision: null,
        }],
        page: 0, size: 20, total: 1,
      } as never;
    }
    if (path.startsWith('/admin/reports/groups/detail?')) {
      return {
        targetType: 'TIN_DANG', targetId: 't-len', targetLabel: 'Tin căn cứ dài',
        targetStatus: 'CONG_KHAI', category: 'SPAM', status: 'CHO_XU_LY',
        reports: [], decision: null,
      } as never;
    }
    if (path === '/admin/reports/penalties') return [] as never;
    if (path === '/admin/reports/duplicate-candidates') return [] as never;
    return undefined as never;
  });

  const user = userEvent.setup();
  render(<ReportsModerationPage />);
  await user.click(await screen.findByRole('button', { name: 'Xem & xử lý' }));
  const dialog = await screen.findByRole('dialog');

  // VI_PHAM phải khớp trần 1000 ký tự của sổ điểm uy tín, không phải 2000.
  expect(within(dialog).getByLabelText(/Căn cứ xử lý/)).toHaveAttribute('maxLength', '1000');
  await user.selectOptions(within(dialog).getByLabelText(/Kết luận/), 'KHONG_VI_PHAM');
  expect(within(dialog).getByLabelText(/Căn cứ xử lý/)).toHaveAttribute('maxLength', '2000');
});

it('keys and requests each resolved decision of a re-reported group separately', async () => {
  const detailCalls: string[] = [];
  request.mockImplementation(async (path) => {
    if (path.startsWith('/admin/reports/groups?')) {
      return {
        items: [
          {
            targetType: 'TIN_DANG', targetId: 't-twice', targetLabel: 'Tin hai quyết định',
            targetStatus: 'CONG_KHAI', category: 'SPAM', reportCount: 1,
            latestReportAt: '2026-11-28T08:00:00Z', status: 'DA_XU_LY',
            decisionId: 'd-new',
            decision: { decisionId: 'd-new', conclusion: 'VI_PHAM', penaltyId: 'P1', penaltyName: 'Phạt 1',
              penaltyPoints: 10, basis: 'Đợt hai', originalDecisionId: null, moderatorId: 'm',
              moderatorName: 'Mod', decidedAt: '2026-11-28T08:00:00Z' },
          },
          {
            targetType: 'TIN_DANG', targetId: 't-twice', targetLabel: 'Tin hai quyết định',
            targetStatus: 'CONG_KHAI', category: 'SPAM', reportCount: 1,
            latestReportAt: '2026-11-28T07:00:00Z', status: 'DA_XU_LY',
            decisionId: 'd-old',
            decision: { decisionId: 'd-old', conclusion: 'KHONG_VI_PHAM', penaltyId: null, penaltyName: null,
              penaltyPoints: null, basis: 'Đợt một', originalDecisionId: null, moderatorId: 'm',
              moderatorName: 'Mod', decidedAt: '2026-11-28T07:00:00Z' },
          },
        ],
        page: 0, size: 20, total: 2,
      } as never;
    }
    if (path.startsWith('/admin/reports/groups/detail?')) {
      detailCalls.push(new URL(path, 'http://localhost').searchParams.get('decisionId') ?? '');
      return {
        targetType: 'TIN_DANG', targetId: 't-twice', targetLabel: 'Tin hai quyết định',
        targetStatus: 'CONG_KHAI', category: 'SPAM', status: 'DA_XU_LY',
        reports: [], decision: null,
      } as never;
    }
    return undefined as never;
  });

  const user = userEvent.setup();
  const { container } = render(<ReportsModerationPage />);
  const buttons = await screen.findAllByRole('button', { name: 'Xem chi tiết' });
  // Hai dong cung (doi tuong, danh muc, trang thai) phai khong bi React gộp key.
  expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
  expect(buttons).toHaveLength(2);

  await user.click(buttons[1]);
  await user.click(buttons[0]);
  expect(detailCalls).toContain('d-old');
  expect(detailCalls).toContain('d-new');
});

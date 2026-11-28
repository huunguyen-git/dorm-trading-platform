import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReviewModerationPage from './ReviewModerationPage';
import { api, attachment, ApiError } from '../api/client';
import type { ModerationCaseDetail, ModerationQueueItem } from './types';

vi.mock('../api/client', () => ({
  api: vi.fn(),
  attachment: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(
      public readonly status: number,
      message: string,
      public readonly code?: string,
    ) {
      super(message);
    }
  },
}));

const mockedApi = vi.mocked(api);
const mockedAttachment = vi.mocked(attachment);

const sampleComplaintItem: ModerationQueueItem = {
  caseType: 'COMPLAINT',
  caseId: 'cmp-100',
  reviewId: 'rev-100',
  transactionId: 'tx-100',
  listingTitle: 'Bàn học gấp gọn KTX',
  buyerId: 'buyer-1',
  buyerName: 'Nguyễn Minh Quân',
  sellerId: 'seller-1',
  sellerName: 'Trần Lan Anh',
  stars: 1,
  reviewStatus: 'CHAP_NHAN',
  complaintStatus: 'CHO_XU_LY',
  reasonLabel: 'Nội dung đánh giá sai sự thật',
  supplementalStatus: null,
  submittedAt: '2026-11-28T06:00:00Z',
  resolvedAt: null,
  conclusion: null,
  priorReviewerWarning: false,
};

const sampleLowStarItem: ModerationQueueItem = {
  caseType: 'LOW_STAR_REVIEW',
  caseId: 'rev-200',
  reviewId: 'rev-200',
  transactionId: 'tx-200',
  listingTitle: 'Giáo trình Giải tích 2',
  buyerId: 'buyer-2',
  buyerName: 'Phạm Gia Huy',
  sellerId: 'seller-2',
  sellerName: 'Lê Ngọc Mai',
  stars: 2,
  reviewStatus: 'CHO_XET',
  complaintStatus: null,
  reasonLabel: 'Đánh giá 2 sao chờ kiểm duyệt',
  supplementalStatus: null,
  submittedAt: '2026-11-28T05:00:00Z',
  resolvedAt: null,
  conclusion: null,
  priorReviewerWarning: false,
};

const sampleComplaintDetail: ModerationCaseDetail = {
  caseType: 'COMPLAINT',
  caseId: 'cmp-100',
  reviewId: 'rev-100',
  reviewVersion: 1,
  reviewStatus: 'CHAP_NHAN',
  stars: 1,
  reviewComment: 'Bàn bị gãy chân',
  reviewSnapshotJson: null,
  appliedScoreDelta: -5,
  reviewCreatedAt: '2026-11-27T08:00:00Z',
  reviewPublishedAt: '2026-11-27T09:00:00Z',
  transactionId: 'tx-100',
  listingId: 'list-100',
  listingTitle: 'Bàn học gấp gọn KTX',
  agreedPriceVnd: 120000,
  handoverProofRef: null,
  transactionCompletedAt: '2026-11-26T10:00:00Z',
  buyerId: 'buyer-1',
  buyerName: 'Nguyễn Minh Quân',
  sellerId: 'seller-1',
  sellerName: 'Trần Lan Anh',
  sellerReputationScore: 48,
  sellerAccountStatus: 'BI_KHOA',
  complaintStatus: 'CHO_XU_LY',
  complaintReasonCode: 'SAI_SU_THAT',
  complaintReasonLabel: 'Nội dung đánh giá sai sự thật',
  complaintDescription: 'Ảnh bàn giao chứng minh bàn nguyên vẹn.',
  complaintCreatedAt: '2026-11-28T06:00:00Z',
  complaintConclusion: null,
  complaintRationale: null,
  complaintVersion: 0,
  supplementalStatus: null,
  canCurrentModeratorDecide: true,
  cannotDecideReason: null,
  singleModeratorOverride: false,
  evidences: [
    {
      id: 'ev-img-1',
      source: 'KHIEU_NAI_NGUOI_BAN',
      type: 'HINH_ANH',
      originalFilename: 'handover.png',
      contentType: 'image/png',
      sizeBytes: 24000,
      conversationId: null,
      createdAt: '2026-11-28T06:00:00Z',
    },
  ],
  supplementalRequests: [],
  decisions: [],
};

const sampleLowStarDetail: ModerationCaseDetail = {
  ...sampleComplaintDetail,
  caseType: 'LOW_STAR_REVIEW',
  caseId: 'rev-200',
  reviewId: 'rev-200',
  reviewStatus: 'CHO_XET',
  stars: 2,
  reviewComment: 'Thiếu 10 trang cuối sách',
  appliedScoreDelta: null,
  listingTitle: 'Giáo trình Giải tích 2',
  buyerName: 'Phạm Gia Huy',
  sellerName: 'Lê Ngọc Mai',
  sellerReputationScore: 100,
  sellerAccountStatus: 'HOAT_DONG',
  complaintStatus: null,
  complaintReasonCode: null,
  complaintReasonLabel: null,
  complaintDescription: null,
  complaintVersion: null,
  evidences: [],
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  mockedApi.mockReset();
  mockedAttachment.mockReset();
  URL.createObjectURL = vi.fn(() => 'blob:mock-evidence');
  URL.revokeObjectURL = vi.fn();
});

describe('ReviewModerationPage (P3-05 / UC-34)', () => {
  it('blocks decision when evidence fails to load, retries evidence, and upholds complaint with score reversal', async () => {
    mockedApi.mockImplementation(async (path, init) => {
      if (path.startsWith('/admin/review-moderation/queue')) {
        return { items: [sampleComplaintItem, sampleLowStarItem], page: 0, size: 50, total: 2 } as never;
      }
      if (path === '/admin/review-moderation/cases/COMPLAINT/cmp-100') {
        return sampleComplaintDetail as never;
      }
      if (path === '/admin/review-moderation/complaints/cmp-100/decide' && init?.method === 'POST') {
        return {
          caseType: 'COMPLAINT',
          caseId: 'cmp-100',
          reviewId: 'rev-100',
          action: 'UPHOLD',
          newReviewStatus: 'DA_GO',
          newComplaintStatus: 'DA_XU_LY',
          scoreDelta: 5,
          sellerScoreAfter: 53,
          restrictionChange: 'UNLOCKED',
          singleModeratorOverride: false,
          decidedAt: '2026-11-28T09:00:00Z',
        } as never;
      }
      return {} as never;
    });

    // First evidence load fails (UC-34 §3.3), retry succeeds
    mockedAttachment
      .mockRejectedValueOnce(new Error('Lỗi tải bằng chứng tạm thời.'))
      .mockResolvedValueOnce(new Blob(['img'], { type: 'image/png' }));

    render(<ReviewModerationPage />);

    const row = await screen.findByRole('button', { name: /Bàn học gấp gọn KTX/i });
    fireEvent.click(row);

    // Decision button must be disabled while evidence failed
    expect(await screen.findByText('Lỗi tải bằng chứng tạm thời.')).toBeInTheDocument();
    const upholdBtn = screen.getByRole('button', { name: /Chấp nhận khiếu nại/i });
    expect(upholdBtn).toBeDisabled();

    // Retry loading evidence
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại bằng chứng' }));
    await waitFor(() => expect(upholdBtn).not.toBeDisabled());

    // Submit without rationale -> validation error (UC-34 §3.3)
    fireEvent.click(upholdBtn);
    expect(await screen.findByText('Vui lòng nhập căn cứ quyết định trước khi xác nhận.')).toBeInTheDocument();

    // Enter rationale and uphold complaint
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Ảnh bàn giao xác nhận bàn nguyên vẹn.' },
    });
    fireEvent.click(upholdBtn);

    expect(
      await screen.findByText(/Tác động điểm: \+5 \(điểm sau xử lý: 53\)\. Tài khoản người bán đã được tự động mở khóa\./),
    ).toBeInTheDocument();
  });

  it('approves a 1-3 star review and handles 409 ALREADY_DECIDED cleanly', async () => {
    let decidedOnce = false;
    mockedApi.mockImplementation(async (path, init) => {
      if (path.startsWith('/admin/review-moderation/queue')) {
        return { items: decidedOnce ? [] : [sampleLowStarItem], page: 0, size: 50, total: decidedOnce ? 0 : 1 } as never;
      }
      if (path === '/admin/review-moderation/cases/LOW_STAR_REVIEW/rev-200') {
        return sampleLowStarDetail as never;
      }
      if (path === '/admin/review-moderation/reviews/rev-200/decide' && init?.method === 'POST') {
        if (!decidedOnce) {
          decidedOnce = true;
          throw new ApiError(409, 'Đánh giá này đã được kiểm duyệt viên khác xử lý.', 'ALREADY_DECIDED');
        }
      }
      return {} as never;
    });

    render(<ReviewModerationPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Giáo trình Giải tích 2/i }));
    await screen.findByText('Thiếu 10 trang cuối sách');

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Xác nhận thiếu trang theo ảnh.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Chấp nhận đánh giá/i }));

    expect(await screen.findByText('Đánh giá này đã được kiểm duyệt viên khác xử lý.')).toBeInTheDocument();
  });
});

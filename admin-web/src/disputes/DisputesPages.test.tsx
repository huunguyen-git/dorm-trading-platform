import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { api, ApiError, attachment } from '../api/client';
import App from '../App';
import { rolePages } from '../config/rolePages';
import {
  formatCancelReasonCode,
  formatCancelStatus,
  formatItemStatus,
  formatListingStatus,
  formatScheduleStatus,
  formatTimelineAction,
  loadEvidenceBlobUrl,
  normalizeApiPath,
} from './api';
import DisputeDetailPage from './DisputeDetailPage';
import DisputesQueuePage from './DisputesQueuePage';
import type { DisputeDetail, DisputePage, DisputeSummary } from './types';

vi.mock('../api/client', () => ({
  api: vi.fn(),
  attachment: vi.fn(),
  setAccessToken: vi.fn(),
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

const ORDER_ID = '11111111-2222-3333-4444-555555555555';
const SECOND_ORDER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function makeSummary(overrides: Partial<DisputeSummary> = {}): DisputeSummary {
  return {
    orderId: ORDER_ID,
    version: 5,
    status: 'CHO_XU_LY',
    escalationReason: 'OVERDUE_24H',
    escalatedAt: '2026-11-25T08:00:00Z',
    responseDeadlineAt: '2026-11-28T08:00:00Z',
    overdueSla: true,
    queueState: 'READY',
    listing: {
      id: 'listing-1',
      title: 'Bàn học gỗ KTX khu B',
      listedPriceVnd: 250000,
      isCombo: false,
      isFree: false,
      status: 'GIU_CHO',
      thumbnailUrl: null,
    },
    agreedPriceVnd: 220000,
    buyer: {
      id: 'buyer-1',
      displayName: 'Nguyễn Minh An',
      reputationScore: 95,
    },
    seller: {
      id: 'seller-1',
      displayName: 'Trần Gia Bảo',
      reputationScore: 112,
    },
    reportedDeliveredAt: '2026-11-24T08:00:00Z',
    hasActiveEvidenceRequest: false,
    decisionSummary: null,
    ...overrides,
  };
}

function makeQueuePage(items: DisputeSummary[] = [makeSummary()]): DisputePage {
  return {
    items,
    counts: {
      all: 4,
      ready: 2,
      waitingEvidence: 1,
      resolved: 1,
      overdue24h: 3,
      cancelDispute: 1,
    },
    page: 0,
    size: 20,
    totalElements: items.length,
    totalPages: items.length > 0 ? 1 : 0,
  };
}

function makeDetail(overrides: Partial<DisputeDetail> = {}): DisputeDetail {
  return {
    ...makeSummary(),
    items: [
      {
        id: 'item-1',
        name: 'Bàn học gấp gọn màu sồi',
        condition: 'NHU_MOI',
        status: 'DANG_GIU',
        heldByThisOrder: true,
      },
    ],
    meetingTime: '2026-11-24T07:30:00Z',
    meetingLocation: 'Sảnh tòa B3 KTX Khu B',
    deliveryStartedAt: '2026-11-24T07:35:00Z',
    deliveryNote: 'Đã bàn giao tận tay tại sảnh B3 kèm hóa đơn mua cũ.',
    completedAt: null,
    cancelledAt: null,
    reviewDeadlineAt: null,
    handoverPhotos: [
      {
        id: 'photo-1',
        url: `/api/v1/admin/disputes/${ORDER_ID}/evidence/handover/photo-1`,
        contentType: 'image/jpeg',
        sizeBytes: 184320,
        uploadedAt: '2026-11-24T07:58:00Z',
      },
    ],
    scheduleProposals: [
      {
        id: 'sched-1',
        proposedByName: 'Trần Gia Bảo',
        proposedTime: '2026-11-24T07:30:00Z',
        proposedLocation: 'Sảnh tòa B3 KTX Khu B',
        note: 'Mình xuống sảnh trước giờ học.',
        status: 'DA_CHAP_NHAN',
        respondedAt: '2026-11-23T15:00:00Z',
        rejectReason: null,
        createdAt: '2026-11-23T14:00:00Z',
      },
    ],
    cancelRequests: [
      {
        id: 'cancel-1',
        requesterId: 'buyer-1',
        requesterRole: 'BUYER',
        requesterName: 'Nguyễn Minh An',
        reasonCode: 'ITEM_NOT_AS_DESCRIBED',
        reasonNote: 'Mặt bàn có vết trầy nhỏ ở góc.',
        status: 'BI_TU_CHOI',
        responderName: 'Trần Gia Bảo',
        responseNote: 'Vết trầy đã chụp rõ trong ảnh tin đăng từ đầu.',
        respondedAt: '2026-11-24T12:00:00Z',
        createdAt: '2026-11-24T10:00:00Z',
      },
    ],
    evidenceRequests: [
      {
        id: 'ev-req-1',
        targetParty: 'BUYER',
        instruction: 'Cung cấp ảnh cận cảnh góc bàn bị trầy.',
        dueAt: '2026-11-27T08:00:00Z',
        status: 'DA_PHAN_HOI',
        requestedByName: 'KDV Lê Hòa',
        createdAt: '2026-11-25T09:00:00Z',
        respondedAt: '2026-11-25T11:00:00Z',
        responses: [
          {
            id: 'ev-resp-1',
            senderId: 'buyer-1',
            senderRole: 'BUYER',
            senderName: 'Nguyễn Minh An',
            note: 'Em gửi ảnh chụp góc bàn vừa nhận.',
            createdAt: '2026-11-25T11:00:00Z',
            attachments: [
              {
                id: 'att-1',
                url: `/api/v1/admin/disputes/${ORDER_ID}/evidence/supplementary/att-1`,
                originalFilename: 'goc-ban.jpg',
                contentType: 'image/jpeg',
                sizeBytes: 98304,
                uploadedAt: '2026-11-25T11:00:00Z',
              },
            ],
          },
        ],
      },
    ],
    chatMessages: [
      {
        id: 'msg-1',
        senderId: 'buyer-1',
        senderRole: 'BUYER',
        senderName: 'Nguyễn Minh An',
        content: 'Anh để em 220k sáng mai em lấy tại sảnh B3 nhé.',
        proposedPriceVnd: 220000,
        sentAt: '2026-11-23T13:00:00Z',
      },
    ],
    timeline: [
      {
        id: 'tl-1',
        action: 'AUTO_ESCALATED_OVERDUE_24H',
        fromStatus: 'CHO_XAC_NHAN',
        toStatus: 'CHO_XU_LY',
        actorRole: 'SYSTEM',
        note: 'Quá 24 giờ kể từ lúc báo giao chưa có xác nhận OTP.',
        createdAt: '2026-11-25T08:00:00Z',
      },
    ],
    decision: null,
    decidable: true,
    ...overrides,
  };
}

let blobCounter = 0;
let createObjectURLSpy: MockInstance<(obj: Blob | MediaSource) => string>;
let revokeObjectURLSpy: MockInstance<(url: string) => void>;

beforeEach(() => {
  cleanup();
  mockedApi.mockReset();
  mockedAttachment.mockReset();
  blobCounter = 0;

  if (!URL.createObjectURL) {
    Object.defineProperty(URL, 'createObjectURL', { writable: true, value: vi.fn() });
  }
  if (!URL.revokeObjectURL) {
    Object.defineProperty(URL, 'revokeObjectURL', { writable: true, value: vi.fn() });
  }
  createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
    blobCounter += 1;
    return `blob:mock-evidence-${blobCounter}`;
  });
  revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
});

afterEach(() => {
  createObjectURLSpy.mockRestore();
  revokeObjectURLSpy.mockRestore();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function renderQueue(state?: { done?: string }) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/disputes', state }]}>
      <Routes>
        <Route path="/disputes" element={<DisputesQueuePage />} />
        <Route path="/disputes/:id" element={<p>Trang chi tiết hồ sơ</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderDetail(orderId = ORDER_ID) {
  return render(
    <MemoryRouter initialEntries={[`/disputes/${orderId}`]}>
      <Routes>
        <Route path="/disputes" element={<p>Hàng đợi tranh chấp</p>} />
        <Route path="/disputes/:id" element={<DisputeDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('normalizeApiPath & status formatters', () => {
  it('strips leading /api/v1 only for relative or same-origin URLs and keeps cross-origin URLs intact', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.com/api/v1/');

    expect(normalizeApiPath('/api/v1/admin/disputes/123/evidence/handover/p1')).toBe(
      '/admin/disputes/123/evidence/handover/p1',
    );
    expect(normalizeApiPath('/admin/disputes/123/evidence/supplementary/a1')).toBe(
      '/admin/disputes/123/evidence/supplementary/a1',
    );
    expect(normalizeApiPath('https://api.example.com/api/v1/admin/disputes/123/evidence/handover/p1?v=1')).toBe(
      '/admin/disputes/123/evidence/handover/p1?v=1',
    );
    // Cross-origin legacy URL must NOT be stripped or sent through authenticated attachment()
    expect(normalizeApiPath('https://cdn.example.com/legacy/handover-1.jpg')).toBe(
      'https://cdn.example.com/legacy/handover-1.jpg',
    );
    expect(normalizeApiPath('https://cdn.example.com/api/v1/legacy/handover-2.jpg')).toBe(
      'https://cdn.example.com/api/v1/legacy/handover-2.jpg',
    );

    await expect(loadEvidenceBlobUrl('https://cdn.example.com/legacy/handover-1.jpg')).resolves.toBe(
      'https://cdn.example.com/legacy/handover-1.jpg',
    );
    expect(mockedAttachment).not.toHaveBeenCalled();
  });

  it('normalizes trailing slashes in VITE_API_URL inside client baseUrl()', async () => {
    vi.stubEnv('VITE_API_URL', '  http://localhost:8082/api/v1///  ');
    const fetchSpy = vi.fn().mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetchSpy);

    const actualClient = await vi.importActual<typeof import('../api/client')>('../api/client');
    await expect(actualClient.api('/admin/disputes')).resolves.toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledWith('http://localhost:8082/api/v1/admin/disputes', expect.any(Object));
  });

  it('formats V13/V14 schedule, cancel, reasonCode, timeline, listing, and item statuses into Vietnamese without raw enum leaks', () => {
    expect(formatScheduleStatus('DA_XAC_NHAN')).toBe('Đã xác nhận');
    expect(formatScheduleStatus('DA_THAY_THE')).toBe('Đã thay thế');
    expect(formatCancelStatus('CHO_XAC_NHAN')).toBe('Chờ xác nhận');
    expect(formatCancelStatus('DA_DONG_DO_HUY')).toBe('Đã đóng do hủy giao dịch');
    expect(formatCancelReasonCode('ITEM_NOT_AS_DESCRIBED')).toBe('Sản phẩm không đúng mô tả');
    expect(formatCancelReasonCode('DEFECT_AT_HANDOVER')).toBe('Phát hiện lỗi/hư hỏng khi bàn giao');
    expect(formatCancelReasonCode('COMBO_MISSING_ITEM')).toBe('Combo thiếu đồ vật thành phần');
    expect(formatCancelReasonCode('MUTUAL_AGREEMENT')).toBe('Hai bên thỏa thuận hủy');
    expect(formatCancelReasonCode('OTHER')).toBe('Lý do khác');
    expect(formatCancelReasonCode(null)).toBe('');
    expect(formatTimelineAction('CANCEL_DISPUTE_ESCALATED')).toBe('Chuyển tranh chấp hủy lên kiểm duyệt');
    expect(formatListingStatus('CHO_DUYET')).toBe('Chờ duyệt');
    expect(formatListingStatus('DA_RUT')).toBe('Đã rút');
    expect(formatListingStatus('HET_HAN')).toBe('Hết hạn');
    expect(formatItemStatus('DA_XOA')).toBe('Đã xóa khỏi kho');
  });
});

describe('DisputesQueuePage', () => {
  it('renders queue items, badge counts, SLA overdue warning, flash notice, and detail link', async () => {
    const cancelItem = makeSummary({
      orderId: SECOND_ORDER_ID,
      escalationReason: 'CANCEL_DISPUTE',
      overdueSla: false,
      queueState: 'WAITING_EVIDENCE',
      listing: {
        id: 'listing-2',
        title: 'Quạt đứng mini Senko',
        listedPriceVnd: 180000,
        isCombo: false,
        isFree: false,
        status: 'GIU_CHO',
        thumbnailUrl: null,
      },
      agreedPriceVnd: 150000,
    });
    mockedApi.mockResolvedValueOnce(makeQueuePage([makeSummary(), cancelItem]));

    renderQueue({ done: 'Đã xác nhận hoàn tất giao dịch #11111111.' });

    expect(await screen.findByText('Bàn học gỗ KTX khu B')).toBeInTheDocument();
    expect(screen.getByText('Đã xác nhận hoàn tất giao dịch #11111111.')).toBeInTheDocument();
    expect(screen.getByText('#11111111')).toBeInTheDocument();
    expect(screen.getByText('Quá hạn SLA 3 ngày')).toBeInTheDocument();
    expect(screen.getAllByText('Nguyễn Minh An').length).toBeGreaterThan(0);
    expect(screen.getAllByText('(95 đ)').length).toBeGreaterThan(0);
    expect(screen.getByText('Quạt đứng mini Senko')).toBeInTheDocument();

    expect(screen.getByRole('tab', { name: /Tất cả\s*4/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Cần xử lý\s*2/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Chờ bổ sung\s*1/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Đã xử lý\s*1/ })).toBeInTheDocument();

    const links = screen.getAllByRole('link', { name: 'Mở hồ sơ' });
    expect(links[0]).toHaveAttribute('href', `/disputes/${ORDER_ID}`);
    expect(links[1]).toHaveAttribute('href', `/disputes/${SECOND_ORDER_ID}`);
  });

  it('filters by queueState tab, reason select, and search keyword', async () => {
    mockedApi.mockResolvedValue(makeQueuePage([makeSummary()]));

    renderQueue();
    await screen.findByText('Bàn học gỗ KTX khu B');

    fireEvent.click(screen.getByRole('tab', { name: /Cần xử lý/ }));
    await waitFor(() =>
      expect(mockedApi).toHaveBeenCalledWith(
        '/admin/disputes?reason=ALL&queueState=READY&q=&page=0&size=20',
      ),
    );

    fireEvent.change(screen.getByLabelText('Lý do chuyển xử lý'), { target: { value: 'CANCEL_DISPUTE' } });
    await waitFor(() =>
      expect(mockedApi).toHaveBeenCalledWith(
        '/admin/disputes?reason=CANCEL_DISPUTE&queueState=READY&q=&page=0&size=20',
      ),
    );

    fireEvent.change(screen.getByLabelText('Tìm kiếm hồ sơ'), { target: { value: '  Bàn học  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tìm kiếm' }));
    await waitFor(() =>
      expect(mockedApi).toHaveBeenCalledWith(
        '/admin/disputes?reason=CANCEL_DISPUTE&queueState=READY&q=B%C3%A0n+h%E1%BB%8Dc&page=0&size=20',
      ),
    );
  });

  it('shows empty state and handles API error with retry', async () => {
    mockedApi.mockRejectedValueOnce(new ApiError(500, 'Lỗi máy chủ tạm thời.'));
    mockedApi.mockResolvedValueOnce(makeQueuePage([]));

    renderQueue();

    expect(await screen.findByRole('alert')).toHaveTextContent('Lỗi máy chủ tạm thời.');
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));

    expect(
      await screen.findByText('Hiện không có giao dịch quá hạn hoặc tranh chấp nào cần xem xét.'),
    ).toBeInTheDocument();
  });

  it('enforces maxLength=200 on search input and recovers cleanly when page > 0 becomes empty', async () => {
    const page0: DisputePage = {
      ...makeQueuePage([makeSummary()]),
      page: 0,
      totalElements: 21,
      totalPages: 2,
    };
    const emptyPage1: DisputePage = {
      ...makeQueuePage([]),
      page: 1,
      totalElements: 20,
      totalPages: 1,
    };

    mockedApi.mockResolvedValueOnce(page0).mockResolvedValueOnce(emptyPage1).mockResolvedValueOnce(page0);

    renderQueue();

    expect(await screen.findByText('Bàn học gỗ KTX khu B')).toBeInTheDocument();
    expect(screen.getByLabelText('Tìm kiếm hồ sơ')).toHaveAttribute('maxlength', '200');

    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    expect(await screen.findByText('Trang 2 hiện không còn hồ sơ tranh chấp nào.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Quay về trang đầu' }));
    await waitFor(() =>
      expect(mockedApi).toHaveBeenLastCalledWith('/admin/disputes?reason=ALL&queueState=ALL&q=&page=0&size=20'),
    );
    expect(await screen.findByText('Bàn học gỗ KTX khu B')).toBeInTheDocument();
  });
});

describe('DisputeDetailPage', () => {
  it('renders complete dossier sections, loads authenticated images with stripped /api/v1, and revokes URLs on unmount', async () => {
    mockedApi.mockResolvedValueOnce(makeDetail());
    mockedAttachment.mockResolvedValue(new Blob(['img-bytes'], { type: 'image/jpeg' }));

    const view = renderDetail();

    expect(await screen.findByRole('heading', { name: /Bàn học gỗ KTX khu B/ })).toBeInTheDocument();
    expect(screen.getByText(/Quyết định trong UC-29 không làm thay đổi điểm uy tín của hai bên/)).toBeInTheDocument();
    expect(screen.getByText(/\(UC-35\/UC-36\/UC-37\)/)).toBeInTheDocument();
    expect(screen.queryByText(/UC-25\/UC-26/)).not.toBeInTheDocument();
    expect(screen.getByText('Bàn học gấp gọn màu sồi')).toBeInTheDocument();
    expect(screen.getByText(/Đã bàn giao tận tay tại sảnh B3/)).toBeInTheDocument();
    expect(screen.getByText(/Mình xuống sảnh trước giờ học\./)).toBeInTheDocument();
    expect(screen.getByText(/\[Sản phẩm không đúng mô tả\]/)).toBeInTheDocument();
    expect(screen.queryByText(/\[ITEM_NOT_AS_DESCRIBED\]/)).not.toBeInTheDocument();
    expect(screen.getByText(/Mặt bàn có vết trầy nhỏ ở góc/)).toBeInTheDocument();
    expect(screen.getByText('Cung cấp ảnh cận cảnh góc bàn bị trầy.')).toBeInTheDocument();
    expect(screen.getByText('Anh để em 220k sáng mai em lấy tại sảnh B3 nhé.')).toBeInTheDocument();
    expect(screen.getByText('Tự động chuyển xử lý do quá hạn 24 giờ')).toBeInTheDocument();

    await waitFor(() => {
      expect(mockedAttachment).toHaveBeenCalledWith(`/admin/disputes/${ORDER_ID}/evidence/handover/photo-1`);
      expect(mockedAttachment).toHaveBeenCalledWith(`/admin/disputes/${ORDER_ID}/evidence/supplementary/att-1`);
    });

    expect(await screen.findByAltText('Ảnh bàn giao #1')).toHaveAttribute('src', 'blob:mock-evidence-1');
    expect(await screen.findByAltText('goc-ban.jpg')).toHaveAttribute('src', 'blob:mock-evidence-2');
    expect(screen.getByTestId('decision-complete-btn')).toBeEnabled();
    expect(screen.getByTestId('decision-cancel-btn')).toBeEnabled();

    view.unmount();
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-evidence-1');
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-evidence-2');
  });

  it('UC-29 Exception 3: disables decision buttons when a handover photo fails and re-enables them after retry succeeds', async () => {
    const detailNoSupp = makeDetail({ evidenceRequests: [] });
    mockedApi.mockResolvedValueOnce(detailNoSupp);
    mockedAttachment
      .mockRejectedValueOnce(new ApiError(502, 'Không tải được ảnh bàn giao.'))
      .mockResolvedValueOnce(new Blob(['recovered-img'], { type: 'image/jpeg' }));

    renderDetail();

    expect(await screen.findByTestId('media-error-alert')).toHaveTextContent('Không tải được ảnh bằng chứng');
    expect(screen.getByTestId('decision-disabled-hint')).toHaveTextContent('UC-29 §3.3');
    expect(screen.getByTestId('decision-complete-btn')).toBeDisabled();
    expect(screen.getByTestId('decision-cancel-btn')).toBeDisabled();

    fireEvent.click(screen.getByTestId('retry-evidence-media'));

    expect(await screen.findByAltText('Ảnh bàn giao #1')).toHaveAttribute('src', 'blob:mock-evidence-1');
    await waitFor(() => {
      expect(screen.queryByTestId('media-error-alert')).not.toBeInTheDocument();
      expect(screen.getByTestId('decision-complete-btn')).toBeEnabled();
      expect(screen.getByTestId('decision-cancel-btn')).toBeEnabled();
    });
  });

  it('UC-29 Exception 3: also blocks decisions if a supplementary attachment returns 404 (null) until retried', async () => {
    mockedApi.mockResolvedValueOnce(makeDetail());
    mockedAttachment
      .mockResolvedValueOnce(new Blob(['handover-ok'], { type: 'image/jpeg' }))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(new Blob(['supp-ok'], { type: 'image/jpeg' }));

    renderDetail();

    expect(await screen.findByTestId('media-error-alert')).toHaveTextContent('1/2 ảnh');
    expect(screen.getByTestId('decision-complete-btn')).toBeDisabled();
    expect(screen.getByTestId('decision-cancel-btn')).toBeDisabled();

    fireEvent.click(screen.getByTestId('retry-evidence-media'));

    expect(await screen.findByAltText('goc-ban.jpg')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('decision-complete-btn')).toBeEnabled();
      expect(screen.getByTestId('decision-cancel-btn')).toBeEnabled();
    });
  });

  it('UC-29 Exception 2: rejects empty or short decision basis client-side without calling API', async () => {
    mockedApi.mockResolvedValueOnce(makeDetail({ handoverPhotos: [], evidenceRequests: [] }));

    renderDetail();

    fireEvent.click(await screen.findByTestId('decision-complete-btn'));
    fireEvent.change(screen.getByLabelText(/Căn cứ quyết định/), { target: { value: '   ngắn   ' } });
    fireEvent.click(screen.getByTestId('decision-review-btn'));

    expect(await screen.findByRole('alert')).toHaveTextContent('từ 10 đến 2000 ký tự');
    expect(screen.getByLabelText(/Căn cứ quyết định/)).toHaveAttribute('aria-invalid', 'true');
    expect(mockedApi.mock.calls.some(([path]) => String(path).endsWith('/complete'))).toBe(false);
  });

  it('UC-29 Basic Flow: completes a dispute after explicit confirmation and renders outcome with 15-day review deadline', async () => {
    const initial = makeDetail({ handoverPhotos: [], evidenceRequests: [] });
    const resolved = makeDetail({
      handoverPhotos: [],
      evidenceRequests: [],
      status: 'HOAN_TAT',
      queueState: 'RESOLVED',
      decidable: false,
      version: 6,
      completedAt: '2026-11-26T10:00:00Z',
      reviewDeadlineAt: '2026-12-11T10:00:00Z',
      decision: {
        id: 'dec-1',
        conclusion: 'HOAN_TAT',
        basis: 'Ảnh bàn giao rõ ràng tại sảnh B3, người mua không phản hồi sau 24 giờ.',
        decidedById: 'mod-1',
        decidedByName: 'KDV Lê Hòa',
        decidedAt: '2026-11-26T10:00:00Z',
        listingStatusAfter: 'KET_THUC',
        listingHiddenReason: null,
      },
    });
    mockedApi.mockResolvedValueOnce(initial).mockResolvedValueOnce(resolved);

    renderDetail();

    fireEvent.click(await screen.findByTestId('decision-complete-btn'));
    fireEvent.change(screen.getByLabelText(/Căn cứ quyết định/), {
      target: { value: 'Ảnh bàn giao rõ ràng tại sảnh B3, người mua không phản hồi sau 24 giờ.' },
    });
    fireEvent.click(screen.getByTestId('decision-review-btn'));
    expect(await screen.findByTestId('decision-confirm-box')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('decision-confirm-submit-btn'));

    await waitFor(() =>
      expect(mockedApi).toHaveBeenCalledWith(`/admin/disputes/${ORDER_ID}/complete`, {
        method: 'POST',
        body: JSON.stringify({
          basis: 'Ảnh bàn giao rõ ràng tại sảnh B3, người mua không phản hồi sau 24 giờ.',
          expectedVersion: 5,
        }),
      }),
    );

    expect(await screen.findByText('QUYẾT ĐỊNH ĐÃ GHI NHẬN')).toBeInTheDocument();
    expect(screen.getByText(/Mở thời hạn đánh giá 15 ngày cho người mua/)).toBeInTheDocument();
  });

  it('UC-29 Alt 1 & Exception 4: cancels a dispute and prominently displays listingHiddenReason when listingStatusAfter is AN', async () => {
    const initial = makeDetail({ handoverPhotos: [], evidenceRequests: [] });
    const cancelled = makeDetail({
      handoverPhotos: [],
      evidenceRequests: [],
      status: 'HUY',
      queueState: 'RESOLVED',
      decidable: false,
      version: 6,
      cancelledAt: '2026-11-26T10:30:00Z',
      decision: {
        id: 'dec-2',
        conclusion: 'HUY',
        basis: 'Hai bên chưa hoàn tất bàn giao và sản phẩm không đúng mô tả đã đăng.',
        decidedById: 'mod-1',
        decidedByName: 'KDV Lê Hòa',
        decidedAt: '2026-11-26T10:30:00Z',
        listingStatusAfter: 'AN',
        listingHiddenReason: 'Tin đăng đã quá thời hạn hiển thị 30 ngày nên giữ trạng thái Ẩn.',
      },
    });
    mockedApi.mockResolvedValueOnce(initial).mockResolvedValueOnce(cancelled);

    renderDetail();

    fireEvent.click(await screen.findByTestId('decision-cancel-btn'));
    fireEvent.change(screen.getByLabelText(/Căn cứ quyết định/), {
      target: { value: 'Hai bên chưa hoàn tất bàn giao và sản phẩm không đúng mô tả đã đăng.' },
    });
    fireEvent.click(screen.getByTestId('decision-review-btn'));
    fireEvent.click(await screen.findByTestId('decision-confirm-submit-btn'));

    await waitFor(() =>
      expect(mockedApi).toHaveBeenCalledWith(`/admin/disputes/${ORDER_ID}/cancel`, {
        method: 'POST',
        body: JSON.stringify({
          basis: 'Hai bên chưa hoàn tất bàn giao và sản phẩm không đúng mô tả đã đăng.',
          expectedVersion: 5,
        }),
      }),
    );

    expect(await screen.findByTestId('listing-hidden-reason')).toHaveTextContent(
      'Tin đăng đã quá thời hạn hiển thị 30 ngày nên giữ trạng thái Ẩn.',
    );
  });

  it('UC-29 Alt 2: submits supplementary evidence request and locks the form while active CHO_BO_SUNG exists', async () => {
    const initial = makeDetail({ handoverPhotos: [], evidenceRequests: [] });
    const withRequest = makeDetail({
      handoverPhotos: [],
      version: 6,
      queueState: 'WAITING_EVIDENCE',
      hasActiveEvidenceRequest: true,
      evidenceRequests: [
        {
          id: 'ev-req-new',
          targetParty: 'SELLER',
          instruction: 'Vui lòng gửi thêm ảnh chụp toàn bộ mặt bàn trước khi giao.',
          dueAt: '2026-11-28T10:00:00Z',
          status: 'CHO_BO_SUNG',
          requestedByName: 'KDV Lê Hòa',
          createdAt: '2026-11-26T10:00:00Z',
          respondedAt: null,
          responses: [],
        },
      ],
    });
    mockedApi.mockResolvedValueOnce(initial).mockResolvedValueOnce(withRequest);

    renderDetail();

    await screen.findByTestId('submit-evidence-request-btn');

    // Client-side validation rejects too-short instruction
    fireEvent.change(screen.getByLabelText(/Nội dung cần cung cấp/), { target: { value: 'abc' } });
    fireEvent.click(screen.getByTestId('submit-evidence-request-btn'));
    expect(await screen.findByRole('alert')).toHaveTextContent('từ 5 đến 2000 ký tự');
    expect(mockedApi.mock.calls.some(([path]) => String(path).endsWith('/request-evidence'))).toBe(false);

    // Valid submit
    fireEvent.change(screen.getByLabelText('Bên cần bổ sung'), { target: { value: 'SELLER' } });
    fireEvent.change(screen.getByLabelText(/Nội dung cần cung cấp/), {
      target: { value: 'Vui lòng gửi thêm ảnh chụp toàn bộ mặt bàn trước khi giao.' },
    });
    fireEvent.change(screen.getByLabelText(/Thời hạn phản hồi/), { target: { value: '24' } });
    fireEvent.click(screen.getByTestId('submit-evidence-request-btn'));

    await waitFor(() =>
      expect(mockedApi).toHaveBeenCalledWith(`/admin/disputes/${ORDER_ID}/request-evidence`, {
        method: 'POST',
        body: JSON.stringify({
          targetParty: 'SELLER',
          instruction: 'Vui lòng gửi thêm ảnh chụp toàn bộ mặt bàn trước khi giao.',
          dueInHours: 24,
          expectedVersion: 5,
        }),
      }),
    );

    expect(await screen.findByTestId('active-evidence-lock-notice')).toBeInTheDocument();
    expect(screen.getByTestId('submit-evidence-request-btn')).toBeDisabled();
  });

  it('UC-29 Alt 2: keeps evidence request form enabled when an overdue CHO_BO_SUNG row exists but backend reports hasActiveEvidenceRequest=false', async () => {
    const expiredRowDetail = makeDetail({
      handoverPhotos: [],
      hasActiveEvidenceRequest: false,
      queueState: 'READY',
      evidenceRequests: [
        {
          id: 'ev-req-expired',
          targetParty: 'BUYER',
          instruction: 'Yêu cầu cũ đã quá hạn nhưng chưa chạy batch.',
          dueAt: '2026-11-24T08:00:00Z',
          status: 'CHO_BO_SUNG',
          requestedByName: 'KDV Lê Hòa',
          createdAt: '2026-11-22T08:00:00Z',
          respondedAt: null,
          responses: [],
        },
      ],
    });
    mockedApi.mockResolvedValueOnce(expiredRowDetail);

    renderDetail();

    expect(await screen.findByTestId('submit-evidence-request-btn')).toBeEnabled();
    expect(screen.queryByTestId('active-evidence-lock-notice')).not.toBeInTheDocument();
  });

  it('UC-29 Exception 1: shows persistent stale banner and refreshes dossier on 409 DISPUTE_ALREADY_RESOLVED', async () => {
    const initial = makeDetail({ handoverPhotos: [], evidenceRequests: [] });
    const resolvedByPeer = makeDetail({
      handoverPhotos: [],
      evidenceRequests: [],
      status: 'HOAN_TAT',
      queueState: 'RESOLVED',
      decidable: false,
      version: 6,
      decision: {
        id: 'dec-peer',
        conclusion: 'HOAN_TAT',
        basis: 'KDV khác đã xác nhận hoàn tất trước đó.',
        decidedById: 'mod-2',
        decidedByName: 'KDV Phạm Dũng',
        decidedAt: '2026-11-26T09:59:00Z',
        listingStatusAfter: 'KET_THUC',
        listingHiddenReason: null,
      },
    });
    mockedApi
      .mockResolvedValueOnce(initial)
      .mockRejectedValueOnce(new ApiError(409, 'Giao dịch đã được xử lý.', 'DISPUTE_ALREADY_RESOLVED'))
      .mockResolvedValueOnce(resolvedByPeer);

    renderDetail();

    fireEvent.click(await screen.findByTestId('decision-complete-btn'));
    fireEvent.change(screen.getByLabelText(/Căn cứ quyết định/), {
      target: { value: 'Căn cứ hợp lệ đủ độ dài để gửi quyết định hoàn tất.' },
    });
    fireEvent.click(screen.getByTestId('decision-review-btn'));
    fireEvent.click(await screen.findByTestId('decision-confirm-submit-btn'));

    expect(await screen.findByTestId('stale-alert')).toHaveTextContent(
      'Giao dịch này đã được quyết định hoặc đã kết thúc trước khi bạn xác nhận.',
    );
    await waitFor(() =>
      expect(mockedApi.mock.calls.filter(([path]) => path === `/admin/disputes/${ORDER_ID}`)).toHaveLength(2),
    );
    expect(await screen.findByText(/KDV Phạm Dũng/)).toBeInTheDocument();
    // Stale banner must survive the auto-reload
    expect(screen.getByTestId('stale-alert')).toBeInTheDocument();
    expect(screen.queryByTestId('decision-complete-btn')).not.toBeInTheDocument();
  });

  it('UC-29 Exception 1: shows version-conflict stale banner and reloads updated dossier on 409 VERSION_CONFLICT', async () => {
    const initial = makeDetail({ handoverPhotos: [], evidenceRequests: [], version: 5 });
    const updatedStillOpen = makeDetail({
      handoverPhotos: [],
      evidenceRequests: [],
      version: 6,
      deliveryNote: 'Đã cập nhật thêm ghi chú mới sau lần tải đầu.',
    });
    mockedApi
      .mockResolvedValueOnce(initial)
      .mockRejectedValueOnce(new ApiError(409, 'Phiên bản giao dịch đã cũ.', 'VERSION_CONFLICT'))
      .mockResolvedValueOnce(updatedStillOpen);

    renderDetail();

    fireEvent.click(await screen.findByTestId('decision-complete-btn'));
    fireEvent.change(screen.getByLabelText(/Căn cứ quyết định/), {
      target: { value: 'Căn cứ hợp lệ đủ độ dài để gửi quyết định hoàn tất.' },
    });
    fireEvent.click(screen.getByTestId('decision-review-btn'));
    fireEvent.click(await screen.findByTestId('decision-confirm-submit-btn'));

    expect(await screen.findByTestId('stale-alert')).toHaveTextContent(
      'Hồ sơ giao dịch đã có thay đổi mới sau khi bạn mở trang.',
    );
    expect(await screen.findByText(/Đã cập nhật thêm ghi chú mới sau lần tải đầu\./)).toBeInTheDocument();
    expect(screen.getByTestId('decision-complete-btn')).toBeEnabled();
    expect(screen.getByTestId('stale-alert')).toBeInTheDocument();
  });

  it('displays conflict-of-interest message and back button on 403 SELF_DISPUTE_FORBIDDEN', async () => {
    mockedApi.mockRejectedValueOnce(
      new ApiError(403, 'Không được tự xử lý giao dịch của chính mình.', 'SELF_DISPUTE_FORBIDDEN'),
    );

    renderDetail();

    expect(
      await screen.findByRole('heading', { name: 'Không thể xem hoặc xử lý giao dịch của chính bạn' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('xung đột lợi ích');

    fireEvent.click(screen.getByRole('button', { name: 'Quay lại hàng đợi tranh chấp' }));
    expect(await screen.findByText('Hàng đợi tranh chấp')).toBeInTheDocument();
  });

  it('renders cross-origin legacy handover photos directly without attachment() Bearer fetch and enforces UC-29 §3.3 via onLoad/onError', async () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:8082/api/v1');
    const externalUrl = 'https://cdn.example.com/legacy/handover-1.jpg';
    mockedApi.mockResolvedValueOnce(
      makeDetail({
        evidenceRequests: [],
        handoverPhotos: [
          {
            id: 'legacy-1',
            url: externalUrl,
            contentType: 'image/jpeg',
            sizeBytes: 64000,
            uploadedAt: '2026-11-24T07:58:00Z',
          },
        ],
      }),
    );

    const view = renderDetail();

    const img = await screen.findByAltText('Ảnh bàn giao #1');
    expect(img).toHaveAttribute('src', externalUrl);
    expect(mockedAttachment).not.toHaveBeenCalled();

    // Still loading -> decision buttons disabled until browser confirms image loaded
    expect(screen.getByTestId('decision-complete-btn')).toBeDisabled();
    expect(screen.getByTestId('decision-cancel-btn')).toBeDisabled();

    // If image fails to render -> UC-29 §3.3 alert appears and buttons remain blocked
    fireEvent.error(img);
    expect(await screen.findByTestId('media-error-alert')).toHaveTextContent('Không tải được ảnh bằng chứng');
    expect(screen.getByTestId('decision-complete-btn')).toBeDisabled();

    // Retry re-renders the direct image; onLoad unlocks decision buttons
    fireEvent.click(screen.getByTestId('retry-evidence-media'));
    const retriedImg = await screen.findByAltText('Ảnh bàn giao #1');
    expect(retriedImg).toHaveAttribute('src', externalUrl);
    fireEvent.load(retriedImg);

    await waitFor(() => {
      expect(screen.queryByTestId('media-error-alert')).not.toBeInTheDocument();
      expect(screen.getByTestId('decision-complete-btn')).toBeEnabled();
      expect(screen.getByTestId('decision-cancel-btn')).toBeEnabled();
    });
    expect(mockedAttachment).not.toHaveBeenCalled();

    view.unmount();
    expect(revokeObjectURLSpy).not.toHaveBeenCalledWith(externalUrl);
  });

  it('omits decision-blocking copy in media-error-alert when dispute is already resolved (!decidable)', async () => {
    mockedApi.mockResolvedValueOnce(
      makeDetail({
        status: 'HOAN_TAT',
        queueState: 'RESOLVED',
        decidable: false,
        evidenceRequests: [],
      }),
    );
    mockedAttachment.mockRejectedValueOnce(new ApiError(502, 'Storage error'));

    renderDetail();

    const alert = await screen.findByTestId('media-error-alert');
    expect(alert).toHaveTextContent('Không tải được ảnh bằng chứng (1/1 ảnh).');
    expect(alert).not.toHaveTextContent('chưa cho phép ra quyết định');
    expect(alert).not.toHaveTextContent('UC-29 §3.3');
  });

  it('separates dueInHours ARIA error from instruction input on evidence request validation', async () => {
    mockedApi.mockResolvedValueOnce(makeDetail({ handoverPhotos: [], evidenceRequests: [] }));

    renderDetail();

    await screen.findByTestId('submit-evidence-request-btn');

    const instructionInput = screen.getByLabelText(/Nội dung cần cung cấp/);
    const dueHoursInput = screen.getByLabelText(/Thời hạn phản hồi/);

    fireEvent.change(instructionInput, {
      target: { value: 'Đề nghị người mua gửi thêm ảnh góc bàn còn lại.' },
    });
    fireEvent.change(dueHoursInput, { target: { value: '0' } });
    fireEvent.click(screen.getByTestId('submit-evidence-request-btn'));

    expect(await screen.findByText(/Thời hạn bổ sung phải là số nguyên từ 1 đến 168 giờ/)).toBeInTheDocument();
    expect(dueHoursInput).toHaveAttribute('aria-invalid', 'true');
    expect(dueHoursInput).toHaveAttribute('aria-describedby', 'evidence-due-hours-error');
    expect(instructionInput).toHaveAttribute('aria-invalid', 'false');
    expect(instructionInput).not.toHaveAttribute('aria-describedby');
    expect(mockedApi.mock.calls.some(([path]) => String(path).endsWith('/request-evidence'))).toBe(false);
  });

  it('prevents synchronous double-submit on decision & evidence actions and keeps Panel B label isolated via activeAction', async () => {
    let resolveComplete!: (value: DisputeDetail) => void;
    const completeDeferred = new Promise<DisputeDetail>((resolve) => {
      resolveComplete = resolve;
    });
    const initial = makeDetail({ handoverPhotos: [], evidenceRequests: [] });
    const resolved = makeDetail({
      handoverPhotos: [],
      evidenceRequests: [],
      status: 'HOAN_TAT',
      queueState: 'RESOLVED',
      decidable: false,
      version: 6,
      decision: {
        id: 'dec-sync',
        conclusion: 'HOAN_TAT',
        basis: 'Căn cứ hợp lệ đầy đủ sau khi kiểm tra biên nhận và ảnh bàn giao.',
        decidedById: 'mod-1',
        decidedByName: 'KDV Lê Hòa',
        decidedAt: '2026-11-26T10:00:00Z',
        listingStatusAfter: 'KET_THUC',
        listingHiddenReason: null,
      },
    });
    mockedApi.mockResolvedValueOnce(initial).mockReturnValueOnce(completeDeferred);

    const view = renderDetail();

    fireEvent.click(await screen.findByTestId('decision-complete-btn'));
    fireEvent.change(screen.getByLabelText(/Căn cứ quyết định/), {
      target: { value: 'Căn cứ hợp lệ đầy đủ sau khi kiểm tra biên nhận và ảnh bàn giao.' },
    });
    fireEvent.click(screen.getByTestId('decision-review-btn'));
    const confirmBtn = await screen.findByTestId('decision-confirm-submit-btn');

    // Synchronous double-click before React re-renders disabled state
    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn);

    const completeCalls = mockedApi.mock.calls.filter(([path]) => String(path).endsWith('/complete'));
    expect(completeCalls).toHaveLength(1);
    expect(screen.getByTestId('decision-confirm-submit-btn')).toHaveTextContent('Đang lưu quyết định…');
    // Panel B must remain disabled without changing its own label to "Đang gửi yêu cầu…"
    expect(screen.getByTestId('submit-evidence-request-btn')).toBeDisabled();
    expect(screen.getByTestId('submit-evidence-request-btn')).toHaveTextContent('Gửi yêu cầu bổ sung');

    await act(async () => {
      resolveComplete(resolved);
    });
    expect(await screen.findByText('QUYẾT ĐỊNH ĐÃ GHI NHẬN')).toBeInTheDocument();
    view.unmount();

    // Also verify synchronous double-submit guard on evidence request form
    mockedApi.mockReset();
    let resolveEvidence!: (value: DisputeDetail) => void;
    const evidenceDeferred = new Promise<DisputeDetail>((resolve) => {
      resolveEvidence = resolve;
    });
    mockedApi.mockResolvedValueOnce(initial).mockReturnValueOnce(evidenceDeferred);

    renderDetail();
    const submitEvidenceBtn = await screen.findByTestId('submit-evidence-request-btn');
    fireEvent.change(screen.getByLabelText(/Nội dung cần cung cấp/), {
      target: { value: 'Bổ sung ảnh chụp hóa đơn hoặc tin nhắn xác nhận.' },
    });
    const evidenceForm = submitEvidenceBtn.closest('form')!;
    fireEvent.submit(evidenceForm);
    fireEvent.submit(evidenceForm);

    const evidenceCalls = mockedApi.mock.calls.filter(([path]) => String(path).endsWith('/request-evidence'));
    expect(evidenceCalls).toHaveLength(1);
    expect(screen.getByTestId('submit-evidence-request-btn')).toHaveTextContent('Đang gửi yêu cầu…');

    await act(async () => {
      resolveEvidence(makeDetail({ handoverPhotos: [], evidenceRequests: [], hasActiveEvidenceRequest: true }));
    });
    expect(await screen.findByTestId('active-evidence-lock-notice')).toBeInTheDocument();
  });

  it('discards stale mutation response after switching :id and clears stale alert on subsequent submit', async () => {
    let resolveFirstPost!: (value: DisputeDetail) => void;
    const firstPostDeferred = new Promise<DisputeDetail>((resolve) => {
      resolveFirstPost = resolve;
    });

    const firstDetail = makeDetail({
      orderId: ORDER_ID,
      handoverPhotos: [],
      evidenceRequests: [],
    });
    const firstResolved = makeDetail({
      orderId: ORDER_ID,
      handoverPhotos: [],
      evidenceRequests: [],
      status: 'HOAN_TAT',
      queueState: 'RESOLVED',
      decidable: false,
      version: 6,
    });
    const secondDetail = makeDetail({
      orderId: SECOND_ORDER_ID,
      handoverPhotos: [],
      evidenceRequests: [],
      listing: {
        id: 'listing-2',
        title: 'Đèn bàn chống cận Rạng Đông',
        listedPriceVnd: 150000,
        isCombo: false,
        isFree: false,
        status: 'GIU_CHO',
        thumbnailUrl: null,
      },
    });

    mockedApi.mockImplementation((path) => {
      if (path === `/admin/disputes/${ORDER_ID}`) return Promise.resolve(firstDetail);
      if (path === `/admin/disputes/${ORDER_ID}/complete`) return firstPostDeferred;
      if (path === `/admin/disputes/${SECOND_ORDER_ID}`) return Promise.resolve(secondDetail);
      return Promise.reject(new ApiError(500, 'Unexpected call'));
    });

    function SwitchableHarness() {
      const navigate = useNavigate();
      return (
        <>
          <button type="button" onClick={() => navigate(`/disputes/${SECOND_ORDER_ID}`)}>
            Chuyển hồ sơ B
          </button>
          <Routes>
            <Route path="/disputes/:id" element={<DisputeDetailPage />} />
          </Routes>
        </>
      );
    }

    render(
      <MemoryRouter initialEntries={[`/disputes/${ORDER_ID}`]}>
        <SwitchableHarness />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByTestId('decision-complete-btn'));
    fireEvent.change(screen.getByLabelText(/Căn cứ quyết định/), {
      target: { value: 'Căn cứ hợp lệ đủ độ dài cho giao dịch đầu tiên.' },
    });
    fireEvent.click(screen.getByTestId('decision-review-btn'));
    fireEvent.click(await screen.findByTestId('decision-confirm-submit-btn'));

    // Switch to second dispute while POST for first dispute is still in flight
    fireEvent.click(screen.getByRole('button', { name: 'Chuyển hồ sơ B' }));
    expect(await screen.findByRole('heading', { name: /Đèn bàn chống cận Rạng Đông/ })).toBeInTheDocument();

    // Late resolution of first dispute's POST must be completely ignored
    await act(async () => {
      resolveFirstPost(firstResolved);
    });
    expect(screen.getByRole('heading', { name: /Đèn bàn chống cận Rạng Đông/ })).toBeInTheDocument();
    expect(screen.queryByText(/Đã xác nhận hoàn tất giao dịch/)).not.toBeInTheDocument();
    expect(screen.getByTestId('decision-complete-btn')).toBeEnabled();

    // Verify stale alert from 409 is cleared on the start of a subsequent submit (no stacked red alerts)
    mockedApi.mockReset();
    mockedApi
      .mockRejectedValueOnce(new ApiError(409, 'Phiên bản cũ.', 'VERSION_CONFLICT'))
      .mockResolvedValueOnce(makeDetail({ ...secondDetail, version: 6 }))
      .mockRejectedValueOnce(new ApiError(503, 'Hệ thống tạm bận, thử lại sau.', 'DISPUTE_UNAVAILABLE'));

    fireEvent.click(screen.getByTestId('decision-complete-btn'));
    fireEvent.change(screen.getByLabelText(/Căn cứ quyết định/), {
      target: { value: 'Căn cứ hợp lệ cho lần gửi gây xung đột phiên bản.' },
    });
    fireEvent.click(screen.getByTestId('decision-review-btn'));
    fireEvent.click(await screen.findByTestId('decision-confirm-submit-btn'));
    expect(await screen.findByTestId('stale-alert')).toBeInTheDocument();

    // Second submit triggers 503 -> stale-alert must be cleared, showing only 503 error
    fireEvent.click(screen.getByTestId('decision-complete-btn'));
    fireEvent.click(screen.getByTestId('decision-review-btn'));
    fireEvent.click(await screen.findByTestId('decision-confirm-submit-btn'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Hệ thống tạm bận, thử lại sau.');
    expect(screen.queryByTestId('stale-alert')).not.toBeInTheDocument();
  });
});

describe('Disputes role routing', () => {
  it('exposes disputes menu item to both moderator and admin, and routes /disputes and /disputes/:id', async () => {
    expect(rolePages.moderator.some((p) => p.path === 'disputes' && p.label === 'Tranh chấp giao dịch')).toBe(true);
    expect(rolePages.admin.some((p) => p.path === 'disputes' && p.label === 'Tranh chấp giao dịch')).toBe(true);
    expect(rolePages.member.some((p) => p.path === 'disputes')).toBe(false);

    mockedApi.mockImplementation(async (path) => {
      if (path === '/auth/me') return { id: 'mod-1', name: 'KDV Lê Hòa', role: 'moderator' } as never;
      if (String(path).startsWith('/admin/disputes?')) return makeQueuePage([makeSummary()]) as never;
      if (path === `/admin/disputes/${ORDER_ID}`) {
        return makeDetail({ handoverPhotos: [], evidenceRequests: [] }) as never;
      }
      return {} as never;
    });

    const queueView = render(
      <MemoryRouter initialEntries={['/disputes']}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('link', { name: 'Tranh chấp giao dịch' })).toHaveAttribute('href', '/disputes');
    expect(await screen.findByText('Bàn học gỗ KTX khu B')).toBeInTheDocument();
    queueView.unmount();

    render(
      <MemoryRouter initialEntries={[`/disputes/${ORDER_ID}`]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: /#11111111 — Bàn học gỗ KTX khu B/ })).toBeInTheDocument();
  });
});

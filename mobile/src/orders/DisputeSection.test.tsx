import React from 'react';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import {
  api,
  ApiError,
  apiMultipart,
  attachment,
  RestrictedAccountError,
} from '../api/client';
import { useSession, type User } from '../auth/session';
import * as imagePicker from '../media/imagePicker';
import { OrderDisputeSection } from '../components/OrderDisputeSection';
import OrderDetailScreen from '../screens/OrderDetailScreen';
import { useOrders } from './store';
import { getNotificationTone, type OrderDetail } from './types';
import type { MemberDispute } from './disputeTypes';
import { normalizeDisputeEvidencePath } from './disputeApi';

jest.setTimeout(15000);

const mockNavigate = jest.fn();
const mockReplace = jest.fn();
const mockGoBack = jest.fn();
const mockAddListener = jest.fn(() => () => {});
let mockRouteParams: Record<string, unknown> = {};

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native') as Record<string, unknown>;
  return {
    ...actual,
    useNavigation: () => ({
      navigate: mockNavigate,
      replace: mockReplace,
      goBack: mockGoBack,
      canGoBack: () => true,
      addListener: mockAddListener,
    }),
    useRoute: () => ({
      params: mockRouteParams,
    }),
  };
});

jest.mock('../api/client', () => {
  const actual = jest.requireActual<typeof import('../api/client')>('../api/client');
  return {
    ...actual,
    api: jest.fn(),
    apiMultipart: jest.fn(),
    attachment: jest.fn(),
  };
});

jest.mock('../media/imagePicker', () => {
  const actual = jest.requireActual<typeof import('../media/imagePicker')>('../media/imagePicker');
  return {
    ...actual,
    pickImagesFromLibrary: jest.fn(),
    takePhotoWithCamera: jest.fn(),
  };
});

const mockedApi = api as unknown as jest.Mock<(path: string, init?: RequestInit) => Promise<unknown>>;
const mockedApiMultipart = apiMultipart as unknown as jest.Mock<
  (
    path: string,
    buildFormData: () => FormData,
    init?: { method?: 'POST' | 'PUT' | 'PATCH'; headers?: Record<string, string> },
  ) => Promise<unknown>
>;
const mockedAttachment = attachment as unknown as jest.Mock<
  (path: string) => Promise<{ type: string; bytes: ArrayBuffer } | null>
>;
const mockedPickLibrary = imagePicker.pickImagesFromLibrary as unknown as jest.Mock<
  (remainingSlots: number) => Promise<imagePicker.PickableImageAsset[]>
>;
const mockedTakePhoto = imagePicker.takePhotoWithCamera as unknown as jest.Mock<
  () => Promise<imagePicker.PickableImageAsset | null>
>;

const activeBuyer: User = {
  id: 'buyer-1',
  name: 'Nguyễn Minh Quân',
  email: 'quan@uit.edu.vn',
  studentId: '22520001',
  role: 'member',
  roles: ['MEMBER'],
  emailVerified: true,
  profileApproved: true,
  accountStatus: 'HOAT_DONG',
};

const lockedBuyer: User = {
  ...activeBuyer,
  roles: [],
  accountStatus: 'BI_KHOA',
};

function makeOrder(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: 'order-1',
    listing: {
      id: 'listing-1',
      title: 'Bàn học gấp gỗ sồi',
      listedPriceVnd: 150000,
      listingType: 'BAN_LE',
      isCombo: false,
      isFree: false,
      status: 'GIU_CHO',
      thumbnailUrl: null,
      locationName: 'KTX Khu A ĐHQG-HCM',
    },
    seller: { id: 'seller-1', displayName: 'Trần Lan Anh', reputationScore: 120 },
    buyer: { id: 'buyer-1', displayName: 'Nguyễn Minh Quân', reputationScore: 100 },
    agreedPriceVnd: 140000,
    status: 'CHO_XU_LY',
    note: null,
    scheduleConfirmed: true,
    meetingTime: '2026-11-26T10:00:00Z',
    meetingLocation: 'Cổng KTX Khu A',
    proposedMeetingTime: null,
    proposedMeetingLocation: null,
    items: [
      {
        id: 'item-1',
        name: 'Bàn học gấp gỗ sồi',
        condition: 'Mới 95%',
        status: 'DANG_GIU',
        images: [],
        heldByThisOrder: true,
      },
    ],
    pendingScheduleProposal: null,
    scheduleProposals: [],
    cancelledById: null,
    cancelReason: null,
    createdAt: '2026-11-24T08:00:00Z',
    reservedAt: '2026-11-24T09:00:00Z',
    deliveryStartedAt: '2026-11-25T09:00:00Z',
    reportedDeliveredAt: '2026-11-25T10:00:00Z',
    completedAt: null,
    cancelledAt: null,
    updatedAt: '2026-11-26T10:05:00Z',
    version: 3,
    viewer: {
      isBuyer: true,
      isSeller: false,
      canAccept: false,
      canReject: false,
      canCancel: false,
      canProposeSchedule: false,
      canStartDelivery: false,
      requiresPostDeliveryCancel: false,
    },
    ...overrides,
  };
}

function makeDispute(overrides: Partial<MemberDispute> = {}): MemberDispute {
  return {
    orderId: 'order-1',
    status: 'CHO_XU_LY',
    version: 3,
    viewerRole: 'BUYER',
    escalationReason: 'OVERDUE_24H',
    escalatedAt: '2026-11-26T10:05:00Z',
    responseDeadlineAt: '2026-12-01T10:05:00Z',
    reviewDeadlineAt: null,
    decision: null,
    evidenceRequests: [],
    timeline: [
      {
        id: 'tl-1',
        action: 'AUTO_ESCALATED_OVERDUE_24H',
        fromStatus: 'CHO_XAC_NHAN',
        toStatus: 'CHO_XU_LY',
        actorRole: 'SYSTEM',
        note: 'Quá 24 giờ kể từ thời điểm báo đã giao mà chưa xác nhận.',
        createdAt: '2026-11-26T10:05:00Z',
      },
    ],
    ...overrides,
  };
}

describe('P3-03 (UC-29) Mobile Dispute Section, Evidence Upload & Moderator Decision', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.mockReset();
    mockedApiMultipart.mockReset();
    mockedAttachment.mockReset();
    mockedPickLibrary.mockReset();
    mockedTakePhoto.mockReset();
    mockRouteParams = {};
    useOrders.getState().reset();
    useSession.setState({
      token: 'buyer-jwt',
      user: activeBuyer,
      loading: false,
      restriction: null,
      restrictionDismissed: false,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('getNotificationTone maps DISPUTE_* and ORDER_ESCALATED_* cleanly while preserving existing tones', () => {
    expect(getNotificationTone('ORDER_ESCALATED_OVERDUE_24H')).toBe('warning');
    expect(getNotificationTone('ORDER_ESCALATED_CANCEL_DISPUTE')).toBe('warning');
    expect(getNotificationTone('DISPUTE_EVIDENCE_REQUESTED')).toBe('warning');
    expect(getNotificationTone('DISPUTE_EVIDENCE_SUBMITTED')).toBe('accent');
    expect(getNotificationTone('DISPUTE_RESOLVED_COMPLETED')).toBe('success');
    expect(getNotificationTone('DISPUTE_RESOLVED_CANCELLED')).toBe('danger');
    // Existing tones preserved
    expect(getNotificationTone('ORDER_CANCELLED')).toBe('danger');
    expect(getNotificationTone('ORDER_REJECTED')).toBe('danger');
    expect(getNotificationTone('ORDER_ACCEPTED')).toBe('success');
    expect(getNotificationTone('LISTING_UPDATED_WITH_PENDING_REQUEST')).toBe('warning');
    expect(getNotificationTone('ORDER_REQUESTED')).toBe('accent');
    // Path normalization blocks external/traversal paths
    expect(
      normalizeDisputeEvidencePath('/api/v1/orders/order-1/dispute/evidence/att-1'),
    ).toBe('/orders/order-1/dispute/evidence/att-1');
    expect(normalizeDisputeEvidencePath('https://evil.example/steal')).toBeNull();
    expect(normalizeDisputeEvidencePath('/api/v1/orders/order-1/dispute/evidence/..')).toBeNull();
  });

  test('renders CHO_XU_LY status card for OVERDUE_24H and CANCEL_DISPUTE with SLA, hold/reputation notes and timeline', async () => {
    const overdueDispute = makeDispute({ escalationReason: 'OVERDUE_24H' });
    mockedApi.mockResolvedValueOnce(overdueDispute);

    const { unmount } = render(
      <OrderDisputeSection order={makeOrder({ status: 'CHO_XU_LY' })} isRestricted={false} />,
    );

    expect(await screen.findByTestId('dispute-pending-card')).toBeTruthy();
    expect(screen.getByText('Quá hạn 24 giờ chưa xác nhận')).toBeTruthy();
    expect(screen.getByTestId('dispute-sla-note')).toBeTruthy();
    expect(screen.getByText(/Phản hồi dự kiến trong 3 ngày làm việc/)).toBeTruthy();
    expect(screen.getByTestId('dispute-hold-reputation-note')).toBeTruthy();
    expect(
      screen.getByText(/Đồ vật vẫn đang được giữ cho giao dịch này cho đến khi có quyết định\./),
    ).toBeTruthy();
    expect(screen.queryByText(/DANG_GIU/)).toBeNull();
    expect(screen.getByText(/Điểm uy tín của hai bên không thay đổi/)).toBeTruthy();
    expect(screen.getByTestId('dispute-timeline-section')).toBeTruthy();
    expect(screen.getByText('Tự động chuyển Chờ xử lý (quá hạn 24 giờ)')).toBeTruthy();
    unmount();

    const cancelDispute = makeDispute({
      orderId: 'order-2',
      escalationReason: 'CANCEL_DISPUTE',
      timeline: [
        {
          id: 'tl-2',
          action: 'CANCEL_DISPUTE_ESCALATED',
          fromStatus: 'CHO_XAC_NHAN',
          toStatus: 'CHO_XU_LY',
          actorRole: 'BUYER',
          note: 'Người bán từ chối yêu cầu hủy sau báo giao.',
          createdAt: '2026-11-26T11:00:00Z',
        },
      ],
    });
    mockedApi.mockResolvedValueOnce(cancelDispute);

    render(
      <OrderDisputeSection
        order={makeOrder({ id: 'order-2', status: 'CHO_XU_LY' })}
        isRestricted={false}
      />,
    );

    expect(await screen.findByText('Tranh chấp yêu cầu hủy')).toBeTruthy();
    expect(screen.getByText('Chuyển Chờ xử lý do tranh chấp yêu cầu hủy')).toBeTruthy();
  });

  test('active evidence request validates note >= 3 chars, picks/removes photos, submits multipart FormData and refreshes', async () => {
    const futureDueAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const initialDispute = makeDispute({
      evidenceRequests: [
        {
          id: 'req-1',
          targetParty: 'BUYER',
          instruction: 'Vui lòng cung cấp ảnh chụp sản phẩm khi nhận và mô tả chi tiết.',
          dueAt: futureDueAt,
          status: 'CHO_BO_SUNG',
          createdAt: '2026-11-26T12:00:00Z',
          canSubmitResponse: true,
          hasViewerResponded: false,
          responses: [],
        },
      ],
    });

    const submittedDispute = makeDispute({
      version: 4,
      evidenceRequests: [
        {
          id: 'req-1',
          targetParty: 'BUYER',
          instruction: 'Vui lòng cung cấp ảnh chụp sản phẩm khi nhận và mô tả chi tiết.',
          dueAt: futureDueAt,
          status: 'CHO_BO_SUNG',
          createdAt: '2026-11-26T12:00:00Z',
          canSubmitResponse: false,
          hasViewerResponded: true,
          responses: [
            {
              id: 'resp-1',
              senderRole: 'BUYER',
              senderName: 'Nguyễn Minh Quân',
              note: 'Mình đã kiểm tra tại cổng KTX, mặt bàn bị nứt ở góc phải.',
              createdAt: '2026-11-26T13:00:00Z',
              attachments: [
                {
                  id: 'att-1',
                  url: '/api/v1/orders/order-1/dispute/evidence/att-1',
                  originalFilename: 'mat-ban-nut.jpg',
                  contentType: 'image/jpeg',
                  sizeBytes: 245760,
                  uploadedAt: '2026-11-26T13:00:00Z',
                },
              ],
            },
          ],
        },
      ],
    });

    const onDisputeUpdated = jest.fn();
    mockedApi.mockResolvedValueOnce(initialDispute);
    mockedApiMultipart.mockImplementationOnce(async (_path, buildFormData) => {
      const form = buildFormData();
      expect(form).toBeInstanceOf(FormData);
      return submittedDispute;
    });
    mockedPickLibrary.mockResolvedValueOnce([
      {
        uri: 'file:///tmp/photo-1.jpg',
        fileName: 'photo-1.jpg',
        mimeType: 'image/jpeg',
        fileSize: 120000,
      },
      {
        uri: 'file:///tmp/photo-2.png',
        fileName: 'photo-2.png',
        mimeType: 'image/png',
        fileSize: 90000,
      },
    ]);

    const appendSpy = jest.spyOn(FormData.prototype, 'append');

    render(
      <OrderDisputeSection
        order={makeOrder({ status: 'CHO_XU_LY' })}
        isRestricted={false}
        onDisputeUpdated={onDisputeUpdated}
      />,
    );

    expect(await screen.findByTestId('dispute-active-evidence-request')).toBeTruthy();
    expect(screen.getByText(/Bên cần bổ sung: Người mua/)).toBeTruthy();
    expect(
      screen.getByText('Vui lòng cung cấp ảnh chụp sản phẩm khi nhận và mô tả chi tiết.'),
    ).toBeTruthy();

    fireEvent.press(screen.getByTestId('open-evidence-sheet-button'));
    expect(screen.getByTestId('dispute-evidence-sheet')).toBeTruthy();

    // Validation: < 3 chars blocked without API call
    fireEvent.changeText(screen.getByTestId('dispute-evidence-note-input'), 'ab');
    fireEvent.press(screen.getByTestId('submit-dispute-evidence-button'));
    expect(screen.getByText('Vui lòng nhập nội dung bổ sung tối thiểu 3 ký tự.')).toBeTruthy();
    expect(mockedApiMultipart).not.toHaveBeenCalled();

    // Pick 2 images, remove the second one, enter valid note and submit
    fireEvent.press(screen.getByTestId('dispute-pick-library-button'));
    expect(await screen.findByTestId('dispute-selected-photo-0')).toBeTruthy();
    expect(screen.getByTestId('dispute-selected-photo-1')).toBeTruthy();

    fireEvent.press(screen.getByTestId('dispute-remove-photo-1'));
    expect(screen.queryByTestId('dispute-selected-photo-1')).toBeNull();
    expect(screen.getByText('1/5 ảnh')).toBeTruthy();

    fireEvent.changeText(
      screen.getByTestId('dispute-evidence-note-input'),
      'Mình đã kiểm tra tại cổng KTX, mặt bàn bị nứt ở góc phải.',
    );
    fireEvent.press(screen.getByTestId('submit-dispute-evidence-button'));

    await waitFor(() => {
      expect(mockedApiMultipart).toHaveBeenCalledWith(
        '/orders/order-1/dispute/evidence-requests/req-1/responses',
        expect.any(Function),
        { method: 'POST' },
      );
      expect(onDisputeUpdated).toHaveBeenCalledWith(submittedDispute);
      expect(screen.getByTestId('dispute-submit-success-notice')).toBeTruthy();
      expect(screen.getByTestId('dispute-viewer-responded-badge')).toBeTruthy();
      expect(screen.getByText('Bạn đã gửi bằng chứng bổ sung')).toBeTruthy();
      expect(screen.queryByTestId('open-evidence-sheet-button')).toBeNull();
    });

    const appendCalls = appendSpy.mock.calls as unknown[][];
    expect(appendCalls).toContainEqual([
      'note',
      'Mình đã kiểm tra tại cổng KTX, mặt bàn bị nứt ở góc phải.',
    ]);
    expect(appendCalls).toContainEqual([
      'files',
      expect.objectContaining({
        uri: 'file:///tmp/photo-1.jpg',
        name: 'photo-1.jpg',
        type: 'image/jpeg',
      }),
    ]);

    // On-demand private attachment preview uses attachment() with normalized path + onError fallback
    const bytes = new Uint8Array([137, 80, 78, 71]).buffer;
    mockedAttachment.mockResolvedValueOnce({ type: 'image/jpeg', bytes });
    fireEvent.press(screen.getByTestId('dispute-attachment-att-1'));
    await waitFor(() => {
      expect(mockedAttachment).toHaveBeenCalledWith('/orders/order-1/dispute/evidence/att-1');
      expect(screen.getByTestId('dispute-preview-image')).toBeTruthy();
    });

    fireEvent(screen.getByTestId('dispute-preview-image'), 'error');
    expect(await screen.findByTestId('dispute-preview-error')).toBeTruthy();
    expect(screen.getByText(/Không thể hiển thị ảnh bằng chứng/)).toBeTruthy();
  });

  test('BI_KHOA restricted viewer is strictly read-only and hides evidence submission controls (standalone and OrderDetailScreen)', async () => {
    const futureDueAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const activeReqDispute = makeDispute({
      evidenceRequests: [
        {
          id: 'req-2',
          targetParty: 'BOTH',
          instruction: 'Gửi thêm ảnh tin nhắn thỏa thuận.',
          dueAt: futureDueAt,
          status: 'CHO_BO_SUNG',
          createdAt: '2026-11-26T12:00:00Z',
          canSubmitResponse: true,
          hasViewerResponded: false,
          responses: [],
        },
      ],
    });
    mockedApi.mockResolvedValueOnce(activeReqDispute);

    const { unmount } = render(
      <OrderDisputeSection order={makeOrder({ status: 'CHO_XU_LY' })} isRestricted={true} />,
    );

    expect(await screen.findByTestId('dispute-restricted-readonly-notice')).toBeTruthy();
    expect(screen.queryByTestId('open-evidence-sheet-button')).toBeNull();
    unmount();

    // Verify full OrderDetailScreen enforces read-only for BI_KHOA even when restrictionDismissed is true
    useSession.setState({
      token: 'locked-jwt',
      user: lockedBuyer,
      loading: false,
      restriction: null,
      restrictionDismissed: true,
    });
    mockRouteParams = { id: 'order-1' };
    mockedApi
      .mockResolvedValueOnce(makeOrder({ status: 'CHO_XU_LY' }))
      .mockResolvedValueOnce(activeReqDispute);

    render(<OrderDetailScreen />);

    expect(await screen.findByTestId('dispute-restricted-readonly-notice')).toBeTruthy();
    expect(screen.queryByTestId('open-evidence-sheet-button')).toBeNull();
  });

  test('HOAN_TAT decision card displays basis, reputation-unchanged note, and 15-day review window for BUYER only', async () => {
    const buyerCompletedDispute = makeDispute({
      status: 'HOAN_TAT',
      viewerRole: 'BUYER',
      reviewDeadlineAt: '2026-12-12T10:00:00Z',
      decision: {
        id: 'dec-1',
        conclusion: 'HOAN_TAT',
        basis: 'Ảnh bàn giao rõ nét tại KTX Khu A, quá 24 giờ không có khiếu nại từ người mua.',
        decidedAt: '2026-11-27T10:00:00Z',
        listingStatusAfter: 'KET_THUC',
        listingHiddenReason: null,
      },
      timeline: [
        {
          id: 'tl-done',
          action: 'MODERATOR_DECIDED_COMPLETE',
          fromStatus: 'CHO_XU_LY',
          toStatus: 'HOAN_TAT',
          actorRole: 'MODERATOR',
          note: 'Đã đối chiếu ảnh bàn giao và lịch hẹn.',
          createdAt: '2026-11-27T10:00:00Z',
        },
      ],
    });
    mockedApi.mockResolvedValueOnce(buyerCompletedDispute);

    const { unmount } = render(
      <OrderDisputeSection order={makeOrder({ status: 'HOAN_TAT' })} isRestricted={false} />,
    );

    expect(await screen.findByTestId('dispute-decision-card')).toBeTruthy();
    expect(screen.getByText('Kết quả xử lý của Kiểm duyệt viên')).toBeTruthy();
    expect(screen.getByText('Xác nhận hoàn tất')).toBeTruthy();
    expect(
      screen.getByText(
        'Ảnh bàn giao rõ nét tại KTX Khu A, quá 24 giờ không có khiếu nại từ người mua.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Điểm uy tín không thay đổi từ quyết định này.')).toBeTruthy();
    expect(screen.getByTestId('dispute-buyer-review-window')).toBeTruthy();
    expect(screen.getByText(/Hạn đánh giá giao dịch đến/)).toBeTruthy();
    expect(screen.getByText('Kiểm duyệt viên xác nhận hoàn tất giao dịch')).toBeTruthy();
    unmount();

    // Seller viewing the same HOAN_TAT decision does not see buyer-only 15-day review CTA
    mockedApi.mockResolvedValueOnce({
      ...buyerCompletedDispute,
      orderId: 'order-seller-done',
      viewerRole: 'SELLER',
    });

    render(
      <OrderDisputeSection
        order={makeOrder({ id: 'order-seller-done', status: 'HOAN_TAT' })}
        isRestricted={false}
      />,
    );

    expect(await screen.findByTestId('dispute-decision-card')).toBeTruthy();
    expect(screen.queryByTestId('dispute-buyer-review-window')).toBeNull();
  });

  test('HUY decision card with listingStatusAfter === AN shows listingHiddenReason warning to SELLER (UC-29 Exception 4) and hides it from BUYER', async () => {
    const sellerCancelledDispute = makeDispute({
      orderId: 'order-huy-an',
      status: 'HUY',
      viewerRole: 'SELLER',
      escalationReason: 'CANCEL_DISPUTE',
      decision: {
        id: 'dec-2',
        conclusion: 'HUY',
        basis: 'Hai bên chưa bàn giao thực tế do sai tình trạng đồ vật ghi trong tin.',
        decidedAt: '2026-11-27T14:30:00Z',
        listingStatusAfter: 'AN',
        listingHiddenReason: 'Tin đăng đã quá thời hạn 30 ngày hiển thị công khai (FR-13).',
      },
    });
    mockedApi.mockResolvedValueOnce(sellerCancelledDispute);

    const { unmount } = render(
      <OrderDisputeSection
        order={makeOrder({ id: 'order-huy-an', status: 'HUY' })}
        isRestricted={false}
      />,
    );

    expect(await screen.findByTestId('dispute-decision-card')).toBeTruthy();
    expect(screen.getByText('Hủy giao dịch')).toBeTruthy();
    expect(
      screen.getByText('Hai bên chưa bàn giao thực tế do sai tình trạng đồ vật ghi trong tin.'),
    ).toBeTruthy();
    expect(screen.getByTestId('dispute-seller-listing-hidden-alert')).toBeTruthy();
    expect(screen.getByText(/Tin đăng đã quá thời hạn 30 ngày hiển thị công khai/)).toBeTruthy();
    expect(screen.getByText(/trở về trạng thái Khả dụng/)).toBeTruthy();
    expect(screen.getByText('Điểm uy tín không thay đổi từ quyết định này.')).toBeTruthy();
    unmount();

    // Buyer viewing HUY decision does not see seller-only hidden listing alert
    mockedApi.mockResolvedValueOnce({
      ...sellerCancelledDispute,
      orderId: 'order-huy-buyer',
      viewerRole: 'BUYER',
    });

    render(
      <OrderDisputeSection
        order={makeOrder({ id: 'order-huy-buyer', status: 'HUY' })}
        isRestricted={false}
      />,
    );

    expect(await screen.findByTestId('dispute-decision-card')).toBeTruthy();
    expect(screen.queryByTestId('dispute-seller-listing-hidden-alert')).toBeNull();
  });

  test('silent no-op when non-disputed order returns 404, empty dispute data, or non-dispute status', async () => {
    // 1. 404 on normal HUY order renders nothing
    mockedApi.mockRejectedValueOnce(new ApiError(404, 'Not found', 'DISPUTE_NOT_FOUND'));
    const { unmount: unmount404 } = render(
      <OrderDisputeSection
        order={makeOrder({ id: 'order-normal-huy', status: 'HUY' })}
        isRestricted={false}
      />,
    );
    await waitFor(() => {
      expect(mockedApi).toHaveBeenCalledWith('/orders/order-normal-huy/dispute');
    });
    expect(screen.queryByTestId('order-dispute-section')).toBeNull();
    expect(screen.queryByTestId('dispute-load-error')).toBeNull();
    unmount404();

    // 2. Empty dispute payload (escalationReason=null, decision=null, evidenceRequests=[]) renders nothing
    mockedApi.mockResolvedValueOnce({
      orderId: 'order-normal-done',
      status: 'HOAN_TAT',
      version: 5,
      viewerRole: 'BUYER',
      escalationReason: null,
      escalatedAt: null,
      responseDeadlineAt: null,
      reviewDeadlineAt: '2026-12-15T00:00:00Z',
      decision: null,
      evidenceRequests: [],
      timeline: [],
    });
    const { unmount: unmountEmpty } = render(
      <OrderDisputeSection
        order={makeOrder({ id: 'order-normal-done', status: 'HOAN_TAT' })}
        isRestricted={false}
      />,
    );
    await waitFor(() => {
      expect(mockedApi).toHaveBeenCalledWith('/orders/order-normal-done/dispute');
    });
    expect(screen.queryByTestId('order-dispute-section')).toBeNull();
    unmountEmpty();

    // 3. Non-dispute status GIU_CHO never calls /dispute
    mockedApi.mockClear();
    render(
      <OrderDisputeSection
        order={makeOrder({ id: 'order-giu-cho', status: 'GIU_CHO' })}
        isRestricted={false}
      />,
    );
    expect(mockedApi).not.toHaveBeenCalled();
    expect(screen.queryByTestId('order-dispute-section')).toBeNull();
  });

  test('supports 0-photo note-only submit and enforces 5-photo limit with camera capture', async () => {
    const futureDueAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const initialDispute = makeDispute({
      evidenceRequests: [
        {
          id: 'req-note-only',
          targetParty: 'BUYER',
          instruction: 'Giải trình thêm về lịch hẹn.',
          dueAt: futureDueAt,
          status: 'CHO_BO_SUNG',
          createdAt: '2026-11-26T12:00:00Z',
          canSubmitResponse: true,
          hasViewerResponded: false,
          responses: [],
        },
      ],
    });
    const afterNoteOnly = makeDispute({
      version: 4,
      evidenceRequests: [
        {
          ...initialDispute.evidenceRequests[0],
          canSubmitResponse: false,
          hasViewerResponded: true,
        },
      ],
    });

    mockedApi.mockResolvedValueOnce(initialDispute);
    const appendSpy = jest.spyOn(FormData.prototype, 'append');
    mockedApiMultipart.mockImplementationOnce(async (_path, buildFormData) => {
      buildFormData();
      return afterNoteOnly;
    });

    const { unmount } = render(
      <OrderDisputeSection order={makeOrder({ status: 'CHO_XU_LY' })} isRestricted={false} />,
    );

    fireEvent.press(await screen.findByTestId('open-evidence-sheet-button'));
    fireEvent.changeText(
      screen.getByTestId('dispute-evidence-note-input'),
      'Mình chỉ có giải trình văn bản, không đính kèm ảnh.',
    );
    fireEvent.press(screen.getByTestId('submit-dispute-evidence-button'));

    await waitFor(() => {
      expect(screen.getByTestId('dispute-submit-success-notice')).toBeTruthy();
    });
    const fileCalls = appendSpy.mock.calls.filter((call) => call[0] === 'files');
    expect(fileCalls).toHaveLength(0);
    unmount();

    // 5-photo limit: 4 from library + 1 from camera disables picker buttons at 5/5
    mockedApi.mockResolvedValueOnce(initialDispute);
    mockedPickLibrary.mockResolvedValueOnce([
      { uri: 'file:///p1.jpg', fileName: 'p1.jpg', mimeType: 'image/jpeg', fileSize: 1000 },
      { uri: 'file:///p2.jpg', fileName: 'p2.jpg', mimeType: 'image/jpeg', fileSize: 1000 },
      { uri: 'file:///p3.jpg', fileName: 'p3.jpg', mimeType: 'image/jpeg', fileSize: 1000 },
      { uri: 'file:///p4.jpg', fileName: 'p4.jpg', mimeType: 'image/jpeg', fileSize: 1000 },
    ]);
    mockedTakePhoto.mockResolvedValueOnce({
      uri: 'file:///cam5.jpg',
      fileName: 'cam5.jpg',
      mimeType: 'image/jpeg',
      fileSize: 1200,
    });

    render(<OrderDisputeSection order={makeOrder({ status: 'CHO_XU_LY' })} isRestricted={false} />);
    fireEvent.press(await screen.findByTestId('open-evidence-sheet-button'));

    fireEvent.press(screen.getByTestId('dispute-pick-library-button'));
    expect(await screen.findByText('4/5 ảnh')).toBeTruthy();

    fireEvent.press(screen.getByTestId('dispute-take-photo-button'));
    expect(await screen.findByText('5/5 ảnh')).toBeTruthy();

    expect(screen.getByTestId('dispute-pick-library-button').props.accessibilityState?.disabled ?? true).toBe(
      true,
    );
    expect(screen.getByTestId('dispute-take-photo-button').props.accessibilityState?.disabled ?? true).toBe(
      true,
    );
    // Pressing disabled buttons must not trigger additional picker calls
    fireEvent.press(screen.getByTestId('dispute-pick-library-button'));
    fireEvent.press(screen.getByTestId('dispute-take-photo-button'));
    expect(mockedPickLibrary).toHaveBeenCalledTimes(1);
    expect(mockedTakePhoto).toHaveBeenCalledTimes(1);
  });

  test('409 DISPUTE_ALREADY_RESOLVED closes sheet, shows conflict banner, and auto-reloads dispute + parent order', async () => {
    const futureDueAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const initialDispute = makeDispute({
      evidenceRequests: [
        {
          id: 'req-409',
          targetParty: 'BUYER',
          instruction: 'Cung cấp ảnh bàn giao.',
          dueAt: futureDueAt,
          status: 'CHO_BO_SUNG',
          createdAt: '2026-11-26T12:00:00Z',
          canSubmitResponse: true,
          hasViewerResponded: false,
          responses: [],
        },
      ],
    });
    const resolvedDispute = makeDispute({
      status: 'HOAN_TAT',
      version: 5,
      decision: {
        id: 'dec-409',
        conclusion: 'HOAN_TAT',
        basis: 'Kiểm duyệt viên đã xác nhận hoàn tất giao dịch.',
        decidedAt: '2026-11-27T15:00:00Z',
        listingStatusAfter: 'KET_THUC',
        listingHiddenReason: null,
      },
      evidenceRequests: [
        {
          ...initialDispute.evidenceRequests[0],
          status: 'DA_DONG',
          canSubmitResponse: false,
        },
      ],
    });

    const onDisputeUpdated = jest.fn();
    mockedApi.mockResolvedValueOnce(initialDispute).mockResolvedValueOnce(resolvedDispute);
    mockedApiMultipart.mockRejectedValueOnce(
      new ApiError(409, 'Giao dịch này đã được xử lý.', 'DISPUTE_ALREADY_RESOLVED'),
    );

    render(
      <OrderDisputeSection
        order={makeOrder({ status: 'CHO_XU_LY' })}
        isRestricted={false}
        onDisputeUpdated={onDisputeUpdated}
      />,
    );

    fireEvent.press(await screen.findByTestId('open-evidence-sheet-button'));
    fireEvent.changeText(
      screen.getByTestId('dispute-evidence-note-input'),
      'Phản hồi bổ sung từ người mua.',
    );
    fireEvent.press(screen.getByTestId('submit-dispute-evidence-button'));

    await waitFor(() => {
      expect(screen.getByTestId('dispute-conflict-notice')).toBeTruthy();
      expect(screen.getByTestId('dispute-decision-card')).toBeTruthy();
      expect(onDisputeUpdated).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByTestId('dispute-evidence-sheet')).toBeNull();
    expect(mockedApi).toHaveBeenCalledTimes(2);
  });

  test('413 FILE_TOO_LARGE keeps sheet open and renders server error banner', async () => {
    const futureDueAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    mockedApi.mockResolvedValueOnce(
      makeDispute({
        evidenceRequests: [
          {
            id: 'req-413',
            targetParty: 'BUYER',
            instruction: 'Bổ sung ảnh chụp.',
            dueAt: futureDueAt,
            status: 'CHO_BO_SUNG',
            createdAt: '2026-11-26T12:00:00Z',
            canSubmitResponse: true,
            hasViewerResponded: false,
            responses: [],
          },
        ],
      }),
    );
    mockedApiMultipart.mockRejectedValueOnce(
      new ApiError(413, 'Ảnh vượt quá giới hạn 5MB.', 'FILE_TOO_LARGE'),
    );

    render(<OrderDisputeSection order={makeOrder({ status: 'CHO_XU_LY' })} isRestricted={false} />);

    fireEvent.press(await screen.findByTestId('open-evidence-sheet-button'));
    fireEvent.changeText(screen.getByTestId('dispute-evidence-note-input'), 'Ảnh lớn hơn 5MB.');
    fireEvent.press(screen.getByTestId('submit-dispute-evidence-button'));

    expect(await screen.findByTestId('dispute-evidence-submit-error')).toBeTruthy();
    expect(screen.getByText('Ảnh vượt quá giới hạn 5MB.')).toBeTruthy();
    expect(screen.getByTestId('dispute-evidence-sheet')).toBeTruthy();
  });

  test('synchronous double-submit guard fires only one multipart request on rapid double tap', async () => {
    const futureDueAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const initialDispute = makeDispute({
      evidenceRequests: [
        {
          id: 'req-dbl',
          targetParty: 'BUYER',
          instruction: 'Gửi bằng chứng.',
          dueAt: futureDueAt,
          status: 'CHO_BO_SUNG',
          createdAt: '2026-11-26T12:00:00Z',
          canSubmitResponse: true,
          hasViewerResponded: false,
          responses: [],
        },
      ],
    });
    let resolveSubmit!: (value: unknown) => void;
    mockedApi.mockResolvedValueOnce(initialDispute);
    mockedApiMultipart.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSubmit = resolve;
        }),
    );

    render(<OrderDisputeSection order={makeOrder({ status: 'CHO_XU_LY' })} isRestricted={false} />);

    fireEvent.press(await screen.findByTestId('open-evidence-sheet-button'));
    fireEvent.changeText(screen.getByTestId('dispute-evidence-note-input'), 'Nội dung hợp lệ 123');

    const submitBtn = screen.getByTestId('submit-dispute-evidence-button');
    fireEvent.press(submitBtn);
    fireEvent.press(submitBtn);

    expect(mockedApiMultipart).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSubmit(
        makeDispute({
          version: 4,
          evidenceRequests: [
            {
              ...initialDispute.evidenceRequests[0],
              canSubmitResponse: false,
              hasViewerResponded: true,
            },
          ],
        }),
      );
    });
    expect(await screen.findByTestId('dispute-submit-success-notice')).toBeTruthy();
  });

  test('fast order.id switch and stale in-flight loadDispute never overwrite newer order or submitted response', async () => {
    const futureDueAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    let resolveOrderAFetch!: (value: unknown) => void;
    let resolveOrderBFetch!: (value: unknown) => void;

    mockedApi
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOrderAFetch = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOrderBFetch = resolve;
          }),
      );

    const { rerender } = render(
      <OrderDisputeSection
        order={makeOrder({ id: 'order-A', status: 'CHO_XU_LY' })}
        isRestricted={false}
      />,
    );

    // Switch immediately to non-eligible GIU_CHO order-C while order-A fetch is still in-flight
    rerender(
      <OrderDisputeSection
        order={makeOrder({ id: 'order-C', status: 'GIU_CHO' })}
        isRestricted={false}
      />,
    );
    await act(async () => {
      resolveOrderAFetch(makeDispute({ orderId: 'order-A', escalationReason: 'CANCEL_DISPUTE' }));
    });
    expect(screen.queryByTestId('order-dispute-section')).toBeNull();

    // Now switch to order-B (CHO_XU_LY) with active evidence request, start a slow refresh, submit evidence, and verify slow refresh does NOT clobber submit
    let resolveStaleRefresh!: (value: unknown) => void;
    const orderBInitial = makeDispute({
      orderId: 'order-B',
      version: 3,
      evidenceRequests: [
        {
          id: 'req-B',
          targetParty: 'BUYER',
          instruction: 'Bổ sung bằng chứng đơn B.',
          dueAt: futureDueAt,
          status: 'CHO_BO_SUNG',
          createdAt: '2026-11-26T12:00:00Z',
          canSubmitResponse: true,
          hasViewerResponded: false,
          responses: [],
        },
      ],
    });
    const orderBSubmitted = makeDispute({
      orderId: 'order-B',
      version: 4,
      evidenceRequests: [
        {
          ...orderBInitial.evidenceRequests[0],
          canSubmitResponse: false,
          hasViewerResponded: true,
        },
      ],
    });

    rerender(
      <OrderDisputeSection
        order={makeOrder({ id: 'order-B', status: 'CHO_XU_LY', version: 3 })}
        isRestricted={false}
        refreshNonce={0}
      />,
    );
    await act(async () => {
      resolveOrderBFetch(orderBInitial);
    });
    expect(await screen.findByTestId('open-evidence-sheet-button')).toBeTruthy();

    // Open sheet, trigger a slow background refresh via refreshNonce, then submit before refresh resolves
    fireEvent.press(screen.getByTestId('open-evidence-sheet-button'));
    mockedApi.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveStaleRefresh = resolve;
        }),
    );
    rerender(
      <OrderDisputeSection
        order={makeOrder({ id: 'order-B', status: 'CHO_XU_LY', version: 3 })}
        isRestricted={false}
        refreshNonce={1}
      />,
    );

    mockedApiMultipart.mockResolvedValueOnce(orderBSubmitted);
    fireEvent.changeText(screen.getByTestId('dispute-evidence-note-input'), 'Bằng chứng đơn B.');
    fireEvent.press(screen.getByTestId('submit-dispute-evidence-button'));

    expect(await screen.findByTestId('dispute-viewer-responded-badge')).toBeTruthy();

    // Stale pre-submit refresh resolves later — MUST be ignored due to fetchSeqRef bump!
    await act(async () => {
      resolveStaleRefresh(orderBInitial);
    });
    expect(screen.getByTestId('dispute-viewer-responded-badge')).toBeTruthy();
    expect(screen.queryByTestId('open-evidence-sheet-button')).toBeNull();
  });

  test('detects client-side expired CHO_BO_SUNG dueAt and shows Đã quá hạn bổ sung instead of waiting copy', async () => {
    const pastDueAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    mockedApi.mockResolvedValueOnce(
      makeDispute({
        evidenceRequests: [
          {
            id: 'req-expired',
            targetParty: 'BUYER',
            instruction: 'Nộp bổ sung trong 24 giờ.',
            dueAt: pastDueAt,
            status: 'CHO_BO_SUNG',
            createdAt: '2026-11-25T10:00:00Z',
            canSubmitResponse: false,
            hasViewerResponded: false,
            responses: [],
          },
        ],
      }),
    );

    render(<OrderDisputeSection order={makeOrder({ status: 'CHO_XU_LY' })} isRestricted={false} />);

    expect(await screen.findByTestId('dispute-evidence-expired-notice')).toBeTruthy();
    expect(screen.getAllByText('Đã quá hạn bổ sung').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByTestId('dispute-waiting-other-party')).toBeNull();
    expect(screen.queryByTestId('open-evidence-sheet-button')).toBeNull();
  });

  test('exposes retry button on initial /dispute load failure and reloads on refreshNonce even with unchanged order.version', async () => {
    const initialDispute = makeDispute({ version: 3 });
    const refreshedDispute = makeDispute({
      version: 3,
      timeline: [
        ...initialDispute.timeline,
        {
          id: 'tl-refresh',
          action: 'MODERATOR_REQUESTED_EVIDENCE',
          fromStatus: 'CHO_XU_LY',
          toStatus: 'CHO_XU_LY',
          actorRole: 'MODERATOR',
          note: 'Cập nhật mới.',
          createdAt: '2026-11-27T09:00:00Z',
        },
      ],
    });

    mockedApi
      .mockRejectedValueOnce(new ApiError(503, 'Hệ thống tạm bận.', 'DISPUTE_UNAVAILABLE'))
      .mockResolvedValueOnce(initialDispute)
      .mockResolvedValueOnce(refreshedDispute);

    const order = makeOrder({ status: 'CHO_XU_LY', version: 3 });
    const { rerender } = render(
      <OrderDisputeSection order={order} isRestricted={false} refreshNonce={0} />,
    );

    expect(await screen.findByTestId('dispute-load-error')).toBeTruthy();
    fireEvent.press(screen.getByTestId('dispute-retry-button'));
    expect(await screen.findByTestId('dispute-pending-card')).toBeTruthy();

    // Increment refreshNonce while order.version stays 3 -> forces fresh /dispute GET
    rerender(<OrderDisputeSection order={order} isRestricted={false} refreshNonce={1} />);
    expect(await screen.findByText('Cập nhật mới.')).toBeTruthy();
    expect(mockedApi).toHaveBeenCalledTimes(3);
  });

  test('OrderDetailScreen renders read-only OrderDisputeSection fallback when GET /orders/{id} returns 403 ACCOUNT_RESTRICTED for BI_KHOA', async () => {
    const restriction = {
      accountStatus: 'BI_KHOA',
      lockType: 'KHOA_TAM_THOI',
      reason: 'Vi phạm nội quy',
      lockedUntil: '2026-12-10T00:00:00Z',
      appealable: false,
      reputationScore: 45,
      message: 'Tài khoản đang bị khóa tạm thời.',
    };
    useSession.setState({
      token: 'locked-jwt',
      user: lockedBuyer,
      loading: false,
      restriction,
      restrictionDismissed: false,
    });
    mockRouteParams = { id: 'order-1' };

    const decidedDispute = makeDispute({
      status: 'HOAN_TAT',
      decision: {
        id: 'dec-locked',
        conclusion: 'HOAN_TAT',
        basis: 'Bằng chứng bàn giao đầy đủ, xác nhận hoàn tất giao dịch.',
        decidedAt: '2026-11-27T11:00:00Z',
        listingStatusAfter: 'KET_THUC',
        listingHiddenReason: null,
      },
    });

    mockedApi
      .mockRejectedValueOnce(new RestrictedAccountError(restriction.message, restriction))
      .mockResolvedValueOnce(decidedDispute);

    render(<OrderDetailScreen />);

    expect(await screen.findByTestId('order-detail-restricted-fallback')).toBeTruthy();
    expect(screen.getByTestId('order-detail-restricted-readonly-banner')).toBeTruthy();
    expect(await screen.findByTestId('dispute-decision-card')).toBeTruthy();
    expect(
      screen.getByText('Bằng chứng bàn giao đầy đủ, xác nhận hoàn tất giao dịch.'),
    ).toBeTruthy();
    expect(screen.queryByTestId('open-evidence-sheet-button')).toBeNull();
    expect(mockedApi).toHaveBeenNthCalledWith(1, '/orders/order-1');
    expect(mockedApi).toHaveBeenNthCalledWith(2, '/orders/order-1/dispute');
  });
});

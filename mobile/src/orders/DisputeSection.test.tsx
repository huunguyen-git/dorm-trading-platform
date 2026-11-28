import React from 'react';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { api, ApiError, attachment } from '../api/client';
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
    expect(screen.getByText(/DANG_GIU/)).toBeTruthy();
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
    const initialDispute = makeDispute({
      evidenceRequests: [
        {
          id: 'req-1',
          targetParty: 'BUYER',
          instruction: 'Vui lòng cung cấp ảnh chụp sản phẩm khi nhận và mô tả chi tiết.',
          dueAt: '2026-11-28T10:00:00Z',
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
          dueAt: '2026-11-28T10:00:00Z',
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
    mockedApi.mockResolvedValueOnce(initialDispute).mockResolvedValueOnce(submittedDispute);
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
    expect(mockedApi).toHaveBeenCalledTimes(1);

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
      expect(mockedApi).toHaveBeenCalledWith(
        '/orders/order-1/dispute/evidence-requests/req-1/responses',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(FormData),
        }),
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

    // On-demand private attachment preview uses attachment() with normalized path
    const bytes = new Uint8Array([137, 80, 78, 71]).buffer;
    mockedAttachment.mockResolvedValueOnce({ type: 'image/jpeg', bytes });
    fireEvent.press(screen.getByTestId('dispute-attachment-att-1'));
    await waitFor(() => {
      expect(mockedAttachment).toHaveBeenCalledWith('/orders/order-1/dispute/evidence/att-1');
    });
  });

  test('BI_KHOA restricted viewer is strictly read-only and hides evidence submission controls (standalone and OrderDetailScreen)', async () => {
    const activeReqDispute = makeDispute({
      evidenceRequests: [
        {
          id: 'req-2',
          targetParty: 'BOTH',
          instruction: 'Gửi thêm ảnh tin nhắn thỏa thuận.',
          dueAt: '2026-11-29T10:00:00Z',
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
});

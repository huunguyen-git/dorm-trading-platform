import React from 'react';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { api, apiMultipart, ApiError, attachment, RestrictedAccountError } from '../api/client';
import { useSession, type User } from '../auth/session';
import { useDiscovery } from '../listings/discoveryStore';
import { useSellerListings } from '../listings/sellerStore';
import { useOrders } from '../orders/store';
import type { OrderDetail } from '../orders/types';
import * as imagePicker from '../media/imagePicker';
import { useReviews } from './store';
import { extractReviewApiError } from './api';
import {
  formatAppliedScoreDelta,
  formatDaysRemainingLabel,
  getReviewLockExplanation,
  hasReviewFormChanges,
  isOrderWithinReviewWindow,
  normalizeReviewDetail,
  normalizeSellerReviewsResponse,
  validateReviewFormInput,
  type OrderReviewState,
  type ReviewDetail,
  type SellerReviewsResponse,
} from './types';
import OrderDetailScreen from '../screens/OrderDetailScreen';
import OrdersScreen from '../screens/OrdersScreen';
import SellerReviewsScreen from '../screens/SellerReviewsScreen';
import ListingScreen from '../screens/ListingScreen';
import ProfileScreen from '../screens/ProfileScreen';

jest.setTimeout(15000);

const mockNavigate = jest.fn();
const mockReplace = jest.fn();
const mockGoBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);
const focusListeners = new Set<() => void>();
const blurListeners = new Set<() => void>();
const mockAddListener = jest.fn((event: string, cb: () => void) => {
  if (event === 'focus') {
    focusListeners.add(cb);
  } else if (event === 'blur') {
    blurListeners.add(cb);
  }
  return () => {
    focusListeners.delete(cb);
    blurListeners.delete(cb);
  };
});

const mockNavigation = {
  navigate: mockNavigate,
  replace: mockReplace,
  goBack: mockGoBack,
  canGoBack: mockCanGoBack,
  addListener: mockAddListener,
};

let mockRouteParams: Record<string, unknown> = {};

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native') as Record<string, unknown>;
  return {
    ...actual,
    useNavigation: () => mockNavigation,
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

const mockedApi = api as unknown as jest.Mock<
  (path: string, init?: RequestInit) => Promise<unknown>
>;
const mockedApiMultipart = apiMultipart as unknown as jest.Mock<
  (
    path: string,
    buildFormData: () => FormData | Promise<FormData>,
    init?: Omit<RequestInit, 'body'>,
  ) => Promise<unknown>
>;
const mockedAttachment = attachment as unknown as jest.Mock<
  (path: string) => Promise<{ type: string; bytes: ArrayBuffer } | null>
>;

const buyerUser: User = {
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

const sellerUser: User = {
  id: 'seller-1',
  name: 'Trần Lan Anh',
  email: 'lananh@uit.edu.vn',
  studentId: '22520999',
  role: 'member',
  roles: ['MEMBER'],
  emailVerified: true,
  profileApproved: true,
  accountStatus: 'HOAT_DONG',
};

const EVIDENCE_UUID_1 = '11111111-1111-4111-8111-111111111111';
const EVIDENCE_UUID_2 = '22222222-2222-4222-8222-222222222222';

function makeCompletedOrder(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: 'order-done-1',
    listing: {
      id: 'listing-1',
      title: 'Giáo trình Nhập môn CNPM SE100',
      listedPriceVnd: 95000,
      listingType: 'BAN_LE',
      isCombo: false,
      isFree: false,
      status: 'KET_THUC',
      thumbnailUrl: null,
      locationName: 'KTX Khu A ĐHQG-HCM',
    },
    seller: { id: 'seller-1', displayName: 'Trần Lan Anh', reputationScore: 112 },
    buyer: { id: 'buyer-1', displayName: 'Nguyễn Minh Quân', reputationScore: 100 },
    agreedPriceVnd: 95000,
    status: 'HOAN_TAT',
    note: null,
    scheduleConfirmed: true,
    meetingTime: '2026-11-24T10:00:00Z',
    meetingLocation: 'Cổng KTX Khu A ĐHQG-HCM',
    proposedMeetingTime: null,
    proposedMeetingLocation: null,
    items: [
      {
        id: 'item-1',
        name: 'Giáo trình SE100',
        condition: 'Mới 95%',
        status: 'DA_CHUYEN_GIAO',
        images: [],
        heldByThisOrder: false,
      },
    ],
    pendingScheduleProposal: null,
    scheduleProposals: [],
    cancelledById: null,
    cancelReason: null,
    createdAt: '2026-11-23T08:00:00Z',
    reservedAt: '2026-11-23T09:00:00Z',
    deliveryStartedAt: '2026-11-24T09:45:00Z',
    reportedDeliveredAt: '2026-11-24T10:15:00Z',
    completedAt: '2026-11-24T10:20:00Z',
    cancelledAt: null,
    updatedAt: '2026-11-24T10:20:00Z',
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

function makeReviewDetail(overrides: Partial<ReviewDetail> = {}): ReviewDetail {
  return {
    id: 'rev-1',
    orderId: 'order-done-1',
    listingId: 'listing-1',
    listingTitle: 'Giáo trình Nhập môn CNPM SE100',
    buyerId: 'buyer-1',
    buyerDisplayName: 'Nguyễn Minh Quân',
    sellerId: 'seller-1',
    sellerDisplayName: 'Trần Lan Anh',
    rating: 5,
    comment: 'Sách sạch đẹp, giao đúng giờ tại cổng KTX.',
    status: 'CHAP_NHAN',
    publiclyVisible: true,
    currentVersionNo: 1,
    appliedScoreDelta: 2,
    moderated: false,
    moderatedAt: null,
    complaintStatus: null,
    queueEnteredAt: null,
    publishedAt: '2026-11-25T10:00:00Z',
    createdAt: '2026-11-25T10:00:00Z',
    updatedAt: '2026-11-25T10:00:00Z',
    deletedAt: null,
    version: 1,
    evidence: [],
    versions: [],
    ...overrides,
  };
}

function makeOrderReviewState(overrides: Partial<OrderReviewState> = {}): OrderReviewState {
  return {
    orderId: 'order-done-1',
    listingId: 'listing-1',
    listingTitle: 'Giáo trình Nhập môn CNPM SE100',
    orderStatus: 'HOAN_TAT',
    seller: { id: 'seller-1', displayName: 'Trần Lan Anh', reputationScore: 112 },
    buyer: { id: 'buyer-1', displayName: 'Nguyễn Minh Quân', reputationScore: 100 },
    completedAt: '2026-11-24T10:20:00Z',
    reviewDeadlineAt: '2026-12-09T10:20:00Z',
    daysRemaining: 12,
    withinReviewWindow: true,
    noReviewBonusApplied: false,
    noReviewBonusAppliedAt: null,
    canReview: true,
    canEdit: false,
    canDelete: false,
    lockReason: null,
    lockMessage: null,
    hasPendingModerationReview: false,
    review: null,
    ...overrides,
  };
}

function makeSellerReviewsResponse(
  overrides: Partial<SellerReviewsResponse> = {},
): SellerReviewsResponse {
  return {
    seller: {
      id: 'seller-1',
      displayName: 'Trần Lan Anh',
      reputationScore: 125,
      averageRating: 4.8,
      reviewCount: 2,
    },
    starDistribution: { '1': 0, '2': 0, '3': 0, '4': 1, '5': 1 },
    items: [
      {
        id: 'pub-rev-1',
        listingId: 'listing-1',
        listingTitle: 'Giáo trình Nhập môn CNPM SE100',
        buyerDisplayName: 'Nguyễn Minh Quân',
        rating: 5,
        comment: 'Giao hàng đúng hẹn, sách rất mới.',
        edited: false,
        publishedAt: '2026-11-25T10:00:00Z',
        createdAt: '2026-11-25T10:00:00Z',
        updatedAt: '2026-11-25T10:00:00Z',
      },
      {
        id: 'pub-rev-2',
        listingId: 'listing-2',
        listingTitle: 'Đèn bàn LED chống cận',
        buyerDisplayName: 'Lê Hoàng Nam',
        rating: 4,
        comment: 'Đèn sáng tốt, mô tả đúng thực tế.',
        edited: true,
        publishedAt: '2026-11-24T09:00:00Z',
        createdAt: '2026-11-24T08:00:00Z',
        updatedAt: '2026-11-24T09:00:00Z',
      },
    ],
    page: 0,
    size: 20,
    totalElements: 2,
    totalPages: 1,
    ...overrides,
  };
}

describe('P3-04 Mobile Reviews (UC-30, UC-31, UC-32, FR-10, NFR-01, NFR-03)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.mockReset();
    mockedApiMultipart.mockReset();
    mockedAttachment.mockReset();
    mockedAttachment.mockResolvedValue({
      type: 'image/jpeg',
      bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer,
    });
    focusListeners.clear();
    blurListeners.clear();
    mockRouteParams = {};
    process.env.EXPO_PUBLIC_API_URL = 'https://api.dormtrading.vn/api/v1';
    useOrders.getState().reset();
    useReviews.getState().reset();
    useDiscovery.getState().reset();
    useSellerListings.getState().reset();
    useSession.setState({
      token: 'buyer-jwt-token',
      user: buyerUser,
      loading: false,
      restriction: null,
      restrictionDismissed: false,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('pure validation, helpers, and error mapping enforce UC-30/UC-31/FR-10 rules', () => {
    // 1-3 stars require comment OR >=1 evidence
    expect(
      validateReviewFormInput({ mode: 'create', rating: 2, comment: '   ', evidenceIds: [] }),
    ).toMatchObject({ valid: false, commentError: expect.stringContaining('1–3 sao') });
    expect(
      validateReviewFormInput({ mode: 'create', rating: 3, comment: 'Trầy nhiều', evidenceIds: [] }),
    ).toEqual({ valid: true });
    expect(
      validateReviewFormInput({ mode: 'create', rating: 1, comment: '', evidenceIds: [EVIDENCE_UUID_1] }),
    ).toEqual({ valid: true });

    // 4-5 stars allow blank comment and zero evidence
    expect(
      validateReviewFormInput({ mode: 'create', rating: 5, comment: '', evidenceIds: [] }),
    ).toEqual({ valid: true });

    // Edit rejects no-op changes (including reordered identical evidence IDs)
    expect(
      hasReviewFormChanges(
        { rating: 5, comment: ' Tốt ', evidenceIds: [EVIDENCE_UUID_2, EVIDENCE_UUID_1] },
        { rating: 5, comment: 'Tốt', evidenceIds: [EVIDENCE_UUID_1, EVIDENCE_UUID_2] },
      ),
    ).toBe(false);
    expect(
      validateReviewFormInput({
        mode: 'edit',
        rating: 5,
        comment: 'Tốt',
        evidenceIds: [EVIDENCE_UUID_1],
        original: { rating: 5, comment: 'Tốt', evidenceIds: [EVIDENCE_UUID_1] },
      }),
    ).toMatchObject({ valid: false, generalError: expect.stringContaining('chưa thay đổi') });

    // Days remaining & score delta formatting
    expect(formatDaysRemainingLabel(12, true)).toBe('Còn 12 ngày để đánh giá');
    expect(formatDaysRemainingLabel(0, true)).toBe('Còn dưới 1 ngày để đánh giá');
    expect(formatDaysRemainingLabel(0, false)).toBe('Đã hết hạn đánh giá 15 ngày');
    expect(formatAppliedScoreDelta(2, 'CHAP_NHAN')).toBe('+2 điểm uy tín');
    expect(formatAppliedScoreDelta(0, 'CHO_XET')).toBe('Chưa trừ điểm · Chờ xét duyệt');
    expect(getReviewLockExplanation('REVIEW_MODERATED')).toContain('Kiểm duyệt viên');

    // Error code mapping (including backend NO_REVIEW_BONUS_ALREADY_APPLIED)
    const conflict = extractReviewApiError(
      new ApiError(409, 'API 409: {}', 'VERSION_CONFLICT'),
      'fallback',
    );
    expect(conflict.code).toBe('VERSION_CONFLICT');
    expect(conflict.message).toContain('phiên bản mới nhất');

    const bonusAlready = extractReviewApiError(
      new ApiError(409, 'API 409: {}', 'NO_REVIEW_BONUS_ALREADY_APPLIED'),
      'fallback',
    );
    expect(bonusAlready.code).toBe('NO_REVIEW_BONUS_ALREADY_APPLIED');
    expect(bonusAlready.message).toContain('+1 điểm uy tín');

    // Review window check helper
    const now = Date.parse('2026-11-28T12:00:00Z');
    expect(isOrderWithinReviewWindow('2026-11-20T12:00:00Z', now)).toBe(true);
    expect(isOrderWithinReviewWindow('2026-11-10T12:00:00Z', now)).toBe(false);
    expect(isOrderWithinReviewWindow(null, now)).toBe(false);

    // ReviewVersionDto alignment (no id field; preserves evidenceCount, evidenceIds, reversedAt)
    const detailWithVersions = normalizeReviewDetail({
      id: 'rev-v2',
      orderId: 'order-1',
      listingId: 'listing-1',
      listingTitle: 'Sách',
      buyerId: 'b-1',
      buyerDisplayName: 'Minh Quân',
      sellerId: 's-1',
      sellerDisplayName: 'Lan Anh',
      rating: 4,
      comment: 'Ổn',
      status: 'CHAP_NHAN',
      publiclyVisible: true,
      currentVersionNo: 2,
      appliedScoreDelta: 0,
      version: 2,
      versions: [
        {
          versionNo: 1,
          rating: 5,
          comment: 'Rất tốt',
          status: 'CHAP_NHAN',
          scoreDeltaApplied: 2,
          evidenceCount: 1,
          evidenceIds: [EVIDENCE_UUID_1],
          reversedAt: '2026-11-25T11:00:00Z',
          createdAt: '2026-11-25T10:00:00Z',
        },
      ],
    });
    expect(detailWithVersions.versions).toEqual([
      {
        versionNo: 1,
        rating: 5,
        comment: 'Rất tốt',
        status: 'CHAP_NHAN',
        scoreDeltaApplied: 2,
        evidenceCount: 1,
        evidenceIds: [EVIDENCE_UUID_1],
        reversedAt: '2026-11-25T11:00:00Z',
        createdAt: '2026-11-25T10:00:00Z',
      },
    ]);

    // Public review normalizer strips unexpected private evidence/PII keys (NFR-01)
    const normalized = normalizeSellerReviewsResponse({
      seller: { id: 's-1', displayName: 'Lan Anh', reputationScore: 120, averageRating: 5, reviewCount: 1 },
      starDistribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 1 },
      items: [
        {
          id: 'r-1',
          orderId: 'o-1',
          listingId: 'l-1',
          listingTitle: 'Sách',
          buyerDisplayName: 'Minh Quân',
          rating: 5,
          comment: 'Tốt',
          edited: false,
          evidence: [{ id: EVIDENCE_UUID_1, url: '/api/v1/reviews/evidence/' + EVIDENCE_UUID_1 }],
          buyerEmail: 'secret@uit.edu.vn',
        },
      ],
      page: 0,
      size: 20,
      totalElements: 1,
      totalPages: 1,
    });
    expect(normalized?.items[0]).not.toHaveProperty('evidence');
    expect(normalized?.items[0]).not.toHaveProperty('buyerEmail');
    expect(normalized?.items[0]).not.toHaveProperty('orderId');
  });

  test('UC-30 Basic Flow: buyer sees 15-day eligibility, submits 5-star review with idempotency key, and sees public review card', async () => {
    mockRouteParams = { id: 'order-done-1' };
    const order = makeCompletedOrder();
    const eligibleState = makeOrderReviewState();
    const createdReview = makeReviewDetail({ rating: 5, comment: 'Rất hài lòng!', appliedScoreDelta: 2 });
    const afterCreateState = makeOrderReviewState({
      canReview: false,
      canEdit: true,
      canDelete: true,
      review: createdReview,
    });

    mockedApi.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/orders/order-done-1' && !init?.method) return order;
      if (path === '/orders/order-done-1/review' && !init?.method) return eligibleState;
      if (path === '/orders/order-done-1/review' && init?.method === 'POST') {
        return {
          review: createdReview,
          orderReviewState: afterCreateState,
          idempotentReplay: false,
        };
      }
      return {};
    });

    render(<OrderDetailScreen />);

    expect(
      await screen.findByTestId('order-review-eligible-card', {}, { timeout: 5000 }),
    ).toBeTruthy();
    expect(screen.getByTestId('order-review-days-remaining').props.children.join('')).toContain(
      'Còn 12 ngày để đánh giá',
    );

    fireEvent.press(screen.getByTestId('open-create-review-button'));
    expect(screen.getByTestId('create-review-sheet')).toBeTruthy();
    expect(screen.getByTestId('review-form-order-summary')).toBeTruthy();
    expect(screen.getByTestId('review-selected-rating-label').props.children.join('')).toBe(
      '5 sao · Rất hài lòng',
    );

    fireEvent.changeText(screen.getByTestId('review-comment-input'), 'Rất hài lòng!');
    fireEvent.press(screen.getByTestId('review-form-submit-button'));

    await waitFor(() => {
      const postCall = mockedApi.mock.calls.find(
        ([p, init]) => p === '/orders/order-done-1/review' && init?.method === 'POST',
      );
      expect(postCall).toBeTruthy();
      const body = JSON.parse(String(postCall?.[1]?.body ?? '{}'));
      expect(body.rating).toBe(5);
      expect(body.comment).toBe('Rất hài lòng!');
      expect(typeof body.idempotencyKey).toBe('string');
      expect((postCall?.[1]?.headers as Record<string, string>)['Idempotency-Key']).toBe(
        body.idempotencyKey,
      );
    });

    expect(await screen.findByTestId('order-review-card')).toBeTruthy();
    expect(screen.getByTestId('order-review-score-delta').props.children).toBe('+2 điểm uy tín');
    // Verify no duplicated "để đánh giá để chỉnh sửa" phrase
    expect(screen.getByTestId('order-review-edit-window-hint').props.children).toBe(
      'Còn 12 ngày để chỉnh sửa (tính từ ngày hoàn tất giao dịch).',
    );
    expect(screen.getByTestId('open-edit-review-button')).toBeTruthy();
    expect(screen.getByTestId('open-delete-review-button')).toBeTruthy();
  });

  test('UC-30 Alt 1, Alt 2, Exceptions & NFR-03: 1-3 star requires comment/evidence, uploads private evidence, preserves form on error, prevents double submit, and supports cancel', async () => {
    mockRouteParams = { id: 'order-done-1' };
    const order = makeCompletedOrder();
    const eligibleState = makeOrderReviewState();
    const uploadedEvidence = {
      id: EVIDENCE_UUID_1,
      url: `/api/v1/reviews/evidence/${EVIDENCE_UUID_1}`,
      contentType: 'image/jpeg',
      sizeBytes: 24500,
      originalFilename: 'proof.jpg',
      createdAt: '2026-11-25T10:00:00Z',
    };
    const pendingReview = makeReviewDetail({
      rating: 2,
      comment: null,
      status: 'CHO_XET',
      publiclyVisible: false,
      appliedScoreDelta: 0,
      evidence: [uploadedEvidence],
    });
    const afterPendingState = makeOrderReviewState({
      canReview: false,
      canEdit: true,
      canDelete: true,
      hasPendingModerationReview: true,
      review: pendingReview,
    });

    jest.spyOn(imagePicker, 'pickImagesFromLibrary').mockResolvedValueOnce([
      {
        uri: 'file:///proof.jpg',
        fileName: 'proof.jpg',
        mimeType: 'image/jpeg',
        fileSize: 24500,
      },
    ]);

    let postAttempt = 0;
    let resolveSecondPost!: (value: unknown) => void;
    const idempKeys: string[] = [];

    mockedApiMultipart.mockImplementation(async (path: string, buildFormData) => {
      if (path === '/orders/order-done-1/review/evidence') {
        const built = await buildFormData();
        expect(built).toBeInstanceOf(FormData);
        return { items: [uploadedEvidence] };
      }
      return {};
    });

    mockedApi.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/orders/order-done-1' && !init?.method) return order;
      if (path === '/orders/order-done-1/review' && !init?.method) return eligibleState;
      if (path === '/orders/order-done-1/review' && init?.method === 'POST') {
        postAttempt += 1;
        const body = JSON.parse(String(init.body ?? '{}'));
        idempKeys.push(body.idempotencyKey);
        if (postAttempt === 1) {
          throw new ApiError(500, 'Lỗi kết nối máy chủ tạm thời.');
        }
        return new Promise((resolve) => {
          resolveSecondPost = resolve;
        });
      }
      return {};
    });

    render(<OrderDetailScreen />);
    await screen.findByTestId('order-review-eligible-card');

    // Open and Cancel (UC-30 Alt 2)
    fireEvent.press(screen.getByTestId('open-create-review-button'));
    expect(screen.getByTestId('create-review-sheet')).toBeTruthy();
    fireEvent.press(screen.getByTestId('review-form-cancel-button'));
    expect(screen.queryByTestId('create-review-sheet')).toBeNull();
    expect(
      mockedApi.mock.calls.some(([p, i]) => p === '/orders/order-done-1/review' && i?.method === 'POST'),
    ).toBe(false);

    // Reopen and choose 2 stars without comment/evidence -> blocked client-side (UC-30 E3)
    fireEvent.press(screen.getByTestId('open-create-review-button'));
    fireEvent.press(screen.getByTestId('review-star-2'));
    expect(screen.getByTestId('review-rating-policy-hint')).toBeTruthy();
    fireEvent.press(screen.getByTestId('review-form-submit-button'));
    expect(
      screen.getByText(
        'Đánh giá 1–3 sao bắt buộc nhập nhận xét hoặc đính kèm ít nhất 1 bằng chứng.',
      ),
    ).toBeTruthy();
    expect(postAttempt).toBe(0);

    // Upload private evidence image (satisfies 1-3★ requirement without comment) and loads via attachment()
    fireEvent.press(screen.getByTestId('review-evidence-pick-library'));
    expect(await screen.findByTestId(`review-evidence-item-${EVIDENCE_UUID_1}`)).toBeTruthy();
    const previewImg = await screen.findByTestId('review-evidence-image-0');
    expect(mockedAttachment).toHaveBeenCalledWith(`/reviews/evidence/${EVIDENCE_UUID_1}`);
    expect(previewImg.props.source.uri).toMatch(/^data:image\/jpeg;base64,/);

    // First submit fails (500) -> form stays open and preserves 2 stars + evidence (UC-30 E5)
    fireEvent.press(screen.getByTestId('review-form-submit-button'));
    expect(await screen.findByTestId('review-form-error')).toBeTruthy();
    expect(screen.getByTestId('review-selected-rating-label').props.children.join('')).toBe(
      '2 sao · Không hài lòng',
    );
    expect(screen.getByTestId(`review-evidence-item-${EVIDENCE_UUID_1}`)).toBeTruthy();

    // Retry submit + rapid double-tap -> only ONE retry request with SAME idempotencyKey (NFR-03)
    fireEvent.press(screen.getByTestId('review-form-submit-button'));
    fireEvent.press(screen.getByTestId('review-form-submit-button'));
    await waitFor(() => expect(postAttempt).toBe(2));
    expect(idempKeys[0]).toBeTruthy();
    expect(idempKeys[1]).toBe(idempKeys[0]);

    await act(async () => {
      resolveSecondPost({
        review: pendingReview,
        orderReviewState: afterPendingState,
        idempotentReplay: false,
      });
    });

    expect(await screen.findByTestId('order-review-pending-moderation-banner')).toBeTruthy();
    expect(screen.getByTestId('order-review-score-delta').props.children).toBe(
      'Chưa trừ điểm · Chờ xét duyệt',
    );
  });

  test('UC-31 Edit Review: prefills existing review, blocks no-op, handles 409 VERSION_CONFLICT, and edits 5★ -> 3★ into CHO_XET', async () => {
    mockRouteParams = { id: 'order-done-1' };
    const order = makeCompletedOrder();
    const initialReview = makeReviewDetail({
      rating: 5,
      comment: 'Ban đầu rất ổn',
      version: 1,
      currentVersionNo: 1,
      appliedScoreDelta: 2,
    });
    const initialState = makeOrderReviewState({
      canReview: false,
      canEdit: true,
      canDelete: true,
      review: initialReview,
    });
    const editedReview = makeReviewDetail({
      rating: 3,
      comment: 'Phát hiện trang sách bị rách ở giữa',
      status: 'CHO_XET',
      publiclyVisible: false,
      currentVersionNo: 2,
      appliedScoreDelta: 0,
      version: 2,
    });
    const afterEditState = makeOrderReviewState({
      canReview: false,
      canEdit: true,
      canDelete: true,
      hasPendingModerationReview: true,
      review: editedReview,
    });

    let putCalls = 0;
    mockedApi.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/orders/order-done-1' && !init?.method) return order;
      if (path === '/orders/order-done-1/review' && !init?.method) return initialState;
      if (path === '/reviews/rev-1' && init?.method === 'PUT') {
        putCalls += 1;
        if (putCalls === 1) {
          throw new ApiError(409, 'Đánh giá vừa được cập nhật ở phiên khác.', 'VERSION_CONFLICT');
        }
        return {
          review: editedReview,
          orderReviewState: afterEditState,
          idempotentReplay: false,
        };
      }
      return {};
    });

    render(<OrderDetailScreen />);
    await screen.findByTestId('open-edit-review-button');

    fireEvent.press(screen.getByTestId('open-edit-review-button'));
    expect(screen.getByTestId('edit-review-sheet')).toBeTruthy();
    expect(screen.getByTestId('review-comment-input').props.value).toBe('Ban đầu rất ổn');

    // No-op submit rejected without calling PUT
    fireEvent.press(screen.getByTestId('review-form-submit-button'));
    expect(screen.getByTestId('review-form-error')).toBeTruthy();
    expect(putCalls).toBe(0);

    // Edit down to 3★ with updated comment -> shows transition note
    fireEvent.press(screen.getByTestId('review-star-3'));
    expect(screen.getByTestId('review-edit-transition-note')).toBeTruthy();
    fireEvent.changeText(
      screen.getByTestId('review-comment-input'),
      'Phát hiện trang sách bị rách ở giữa',
    );

    // First PUT returns 409 VERSION_CONFLICT -> shows conflict error & refresh action while keeping typed text
    fireEvent.press(screen.getByTestId('review-form-submit-button'));
    expect(await screen.findByTestId('review-form-refresh-conflict')).toBeTruthy();
    expect(screen.getByTestId('review-comment-input').props.value).toBe(
      'Phát hiện trang sách bị rách ở giữa',
    );

    // Second PUT succeeds with expectedVersion: 1
    fireEvent.press(screen.getByTestId('review-form-submit-button'));
    await waitFor(() => {
      const putCall = mockedApi.mock.calls.find(
        ([p, i]) => p === '/reviews/rev-1' && i?.method === 'PUT',
      );
      expect(putCall).toBeTruthy();
      expect(JSON.parse(String(putCall?.[1]?.body ?? '{}'))).toMatchObject({
        rating: 3,
        comment: 'Phát hiện trang sách bị rách ở giữa',
        expectedVersion: 1,
      });
    });

    expect(await screen.findByTestId('order-review-version-badge')).toBeTruthy();
    expect(screen.getByTestId('order-review-pending-moderation-banner')).toBeTruthy();
  });

  test('UC-32 Delete Review: shows explicit consequences, supports cancel, deletes and restores unreviewed 15-day CTA', async () => {
    mockRouteParams = { id: 'order-done-1' };
    const order = makeCompletedOrder();
    const activeReview = makeReviewDetail({ rating: 5, version: 2 });
    const withReviewState = makeOrderReviewState({
      canReview: false,
      canEdit: true,
      canDelete: true,
      daysRemaining: 10,
      withinReviewWindow: true,
      review: activeReview,
    });
    const afterDeleteState = makeOrderReviewState({
      canReview: true,
      canEdit: false,
      canDelete: false,
      daysRemaining: 10,
      withinReviewWindow: true,
      review: null,
    });

    let deleted = false;
    mockedApi.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/orders/order-done-1' && !init?.method) return order;
      if (path === '/orders/order-done-1/review' && !init?.method) {
        return deleted ? afterDeleteState : withReviewState;
      }
      if (path === '/reviews/rev-1?expectedVersion=2' && init?.method === 'DELETE') {
        deleted = true;
        return {
          review: { ...activeReview, status: 'DA_XOA' },
          orderReviewState: afterDeleteState,
          idempotentReplay: false,
        };
      }
      return {};
    });

    render(<OrderDetailScreen />);
    await screen.findByTestId('open-delete-review-button');

    // Open delete confirmation & cancel (UC-32 Alt 1)
    fireEvent.press(screen.getByTestId('open-delete-review-button'));
    expect(screen.getByTestId('delete-review-sheet')).toBeTruthy();
    expect(screen.getByTestId('delete-review-consequences')).toBeTruthy();
    fireEvent.press(screen.getByTestId('delete-review-cancel-button'));
    expect(screen.queryByTestId('delete-review-sheet')).toBeNull();
    expect(deleted).toBe(false);

    // Reopen & confirm delete
    fireEvent.press(screen.getByTestId('open-delete-review-button'));
    fireEvent.press(screen.getByTestId('delete-review-confirm-button'));

    await waitFor(() => {
      expect(mockedApi).toHaveBeenCalledWith(
        '/reviews/rev-1?expectedVersion=2',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    // Order returns to unreviewed state with re-review CTA within 15 days
    expect(await screen.findByTestId('order-review-eligible-card')).toBeTruthy();
    expect(screen.getByTestId('open-create-review-button')).toBeTruthy();
  });

  test('UC-31/UC-32 lock states: post-15d unmoderated review blocks edit but allows delete; moderated/complained review locks both', async () => {
    mockRouteParams = { id: 'order-done-1' };
    const order = makeCompletedOrder();

    // 1. Expired >15d unmoderated review: canEdit=false, canDelete=true
    const expiredDeletableState = makeOrderReviewState({
      withinReviewWindow: false,
      daysRemaining: 0,
      canReview: false,
      canEdit: false,
      canDelete: true,
      lockReason: 'REVIEW_WINDOW_EXPIRED',
      lockMessage: 'Đã quá hạn 15 ngày nên không thể chỉnh sửa đánh giá.',
      review: makeReviewDetail({ rating: 5 }),
    });
    mockedApi.mockImplementation(async (path: string) => {
      if (path === '/orders/order-done-1') return order;
      if (path === '/orders/order-done-1/review') return expiredDeletableState;
      return {};
    });

    const { unmount } = render(<OrderDetailScreen />);
    expect(await screen.findByTestId('order-review-edit-lock-notice')).toBeTruthy();
    expect(screen.queryByTestId('open-edit-review-button')).toBeNull();
    expect(screen.getByTestId('open-delete-review-button')).toBeTruthy();
    unmount();

    // 2. Complaint-locked review: hides both edit & delete and shows clear lock banner
    useOrders.getState().reset();
    useReviews.getState().reset();
    const complaintLockedState = makeOrderReviewState({
      canReview: false,
      canEdit: false,
      canDelete: false,
      lockReason: 'REVIEW_COMPLAINT_PENDING',
      lockMessage: 'Đánh giá đang có khiếu nại chờ kiểm duyệt nên tạm khóa chỉnh sửa và xóa.',
      review: makeReviewDetail({ rating: 4, complaintStatus: 'CHO_XU_LY' }),
    });
    mockedApi.mockImplementation(async (path: string) => {
      if (path === '/orders/order-done-1') return order;
      if (path === '/orders/order-done-1/review') return complaintLockedState;
      return {};
    });

    render(<OrderDetailScreen />);
    expect(await screen.findByTestId('order-review-locked-banner')).toBeTruthy();
    expect(screen.queryByTestId('open-edit-review-button')).toBeNull();
    expect(screen.queryByTestId('open-delete-review-button')).toBeNull();
  });

  test('NFR-01 Seller visibility: hides CHO_XET review details, renders CHAP_NHAN evidence with seller Bearer auth, and hides buyer controls', async () => {
    useSession.setState({ token: 'seller-jwt-token', user: sellerUser, loading: false });
    mockRouteParams = { id: 'order-done-1' };
    const sellerOrder = makeCompletedOrder({
      viewer: {
        isBuyer: false,
        isSeller: true,
        canAccept: false,
        canReject: false,
        canCancel: false,
        canProposeSchedule: false,
        canStartDelivery: false,
        requiresPostDeliveryCancel: false,
      },
    });

    // 1. Seller viewing order with CHO_XET review -> review=null, hasPendingModerationReview=true
    mockedApi.mockImplementation(async (path: string) => {
      if (path === '/orders/order-done-1') return sellerOrder;
      if (path === '/orders/order-done-1/review') {
        return makeOrderReviewState({
          canReview: false,
          canEdit: false,
          canDelete: false,
          hasPendingModerationReview: true,
          review: null,
        });
      }
      return {};
    });

    const { unmount } = render(<OrderDetailScreen />);
    expect(await screen.findByTestId('order-review-seller-pending-banner')).toBeTruthy();
    expect(screen.queryByTestId('open-create-review-button')).toBeNull();
    expect(screen.queryByTestId('order-review-card')).toBeNull();
    unmount();

    // 2. Seller viewing CHAP_NHAN review with private evidence -> loads evidence with seller Bearer auth
    useOrders.getState().reset();
    useReviews.getState().reset();
    mockedApi.mockImplementation(async (path: string) => {
      if (path === '/orders/order-done-1') return sellerOrder;
      if (path === '/orders/order-done-1/review') {
        return makeOrderReviewState({
          canReview: false,
          canEdit: false,
          canDelete: false,
          review: makeReviewDetail({
            status: 'CHAP_NHAN',
            evidence: [
              {
                id: EVIDENCE_UUID_2,
                url: `/api/v1/reviews/evidence/${EVIDENCE_UUID_2}`,
                contentType: 'image/png',
                sizeBytes: 18000,
                originalFilename: 'handover.png',
                createdAt: '2026-11-25T10:00:00Z',
              },
            ],
          }),
        });
      }
      return {};
    });

    render(<OrderDetailScreen />);
    const evImg = await screen.findByTestId('order-review-evidence-img-0');
    expect(mockedAttachment).toHaveBeenCalledWith(`/reviews/evidence/${EVIDENCE_UUID_2}`);
    expect(evImg.props.source.uri).toMatch(/^data:image\/jpeg;base64,/);
    expect(screen.queryByTestId('open-edit-review-button')).toBeNull();
    expect(screen.queryByTestId('open-delete-review-button')).toBeNull();

    // Tapping evidence thumbnail opens authenticated lightbox backed by attachment()
    fireEvent.press(screen.getByTestId('order-review-evidence-thumb-0'));
    expect(screen.getByTestId('review-evidence-lightbox')).toBeTruthy();
    const lightboxImg = await screen.findByTestId('review-evidence-lightbox-image');
    expect(lightboxImg.props.source.uri).toMatch(/^data:image\/jpeg;base64,/);
  });

  test('SellerReviewsScreen renders public accepted reviews, filters by stars, and integrates with ListingScreen & ProfileScreen', async () => {
    // 1. SellerReviewsScreen public view + star filter
    mockRouteParams = { sellerId: 'seller-1', sellerName: 'Trần Lan Anh', reputationScore: 125 };
    mockedApi.mockImplementation(async (path: string) => {
      if (path.includes('rating=5')) {
        const base = makeSellerReviewsResponse();
        return {
          ...base,
          items: [base.items[0]],
          totalElements: 1,
          totalPages: 1,
        };
      }
      return makeSellerReviewsResponse();
    });

    const { unmount: unmountReviews } = render(<SellerReviewsScreen />);
    expect(await screen.findByTestId('public-review-card-pub-rev-1')).toBeTruthy();
    expect(screen.getByTestId('public-review-card-pub-rev-2')).toBeTruthy();
    expect(screen.getByTestId('seller-reviews-average').props.children).toBe('4.8');
    expect(screen.getByTestId('public-review-edited-pub-rev-2')).toBeTruthy();

    fireEvent.press(screen.getByTestId('seller-reviews-filter-5'));
    await waitFor(
      () => {
        expect(mockedApi).toHaveBeenCalledWith(
          expect.stringContaining('/sellers/seller-1/reviews?rating=5'),
        );
        expect(screen.queryByTestId('public-review-card-pub-rev-2') === null).toBe(true);
      },
      { timeout: 5000 },
    );
    unmountReviews();

    // 2. ListingScreen -> Seller Trust Strip -> Reputation BottomSheet -> navigates to SellerReviews (and zero ★)
    mockNavigate.mockClear();
    mockRouteParams = { id: 'listing-1' };
    mockedApi.mockResolvedValueOnce({
      id: 'listing-1',
      title: 'Giáo trình SE100',
      description: 'Mới 95%',
      condition: 'Mới 95%',
      priceVnd: 95000,
      listingType: 'BAN_LE',
      isCombo: false,
      isFree: false,
      status: 'CONG_KHAI',
      categoryId: 'GT_CNTT',
      categoryName: 'GT CNTT',
      courseCode: 'SE100',
      courseName: null,
      author: null,
      locationCode: 'KTX_KHU_A',
      locationName: 'KTX Khu A',
      locationText: null,
      latitude: null,
      longitude: null,
      distanceKm: null,
      thumbnailUrl: null,
      images: [],
      itemCount: 1,
      seller: {
        id: 'seller-1',
        displayName: 'Trần Lan Anh',
        reputationScore: 125,
        averageRating: 4.8,
        reviewCount: 2,
      },
      hasUnavailableItems: false,
      publishedAt: '2026-11-20T00:00:00Z',
      expiresAt: '2026-12-20T00:00:00Z',
      renewalReminderDue: false,
      renewalCount: 0,
      createdAt: '2026-11-20T00:00:00Z',
      updatedAt: '2026-11-20T00:00:00Z',
      version: 1,
      category: null,
      items: [],
      viewer: {
        isOwner: false,
        canEdit: false,
        canWithdraw: false,
        canDelete: false,
        canPublish: false,
        canRenew: false,
        canMakeOffer: true,
        canReserve: true,
        canMessage: true,
      },
      pendingRequestCount: 0,
      closedAt: null,
      hiddenReason: null,
    });

    const { unmount: unmountListing } = render(<ListingScreen />);
    await screen.findByTestId('seller-trust-card');
    expect(screen.queryByText(/★/)).toBeNull();
    fireEvent.press(screen.getByTestId('seller-trust-card'));
    expect(screen.getByTestId('reputation-info-sheet')).toBeTruthy();
    fireEvent.press(screen.getByTestId('open-seller-reviews-from-sheet'));
    expect(mockNavigate).toHaveBeenCalledWith('SellerReviews', {
      sellerId: 'seller-1',
      sellerName: 'Trần Lan Anh',
      reputationScore: 125,
      isOwnProfile: false,
    });
    unmountListing();

    // 3. ProfileScreen shows received reviews preview & shortcut to own SellerReviews
    mockNavigate.mockClear();
    useSession.setState({ token: 'seller-jwt-token', user: sellerUser, loading: false });
    mockedApi.mockImplementation(async (path: string) => {
      if (path === '/profile/me') {
        return {
          id: sellerUser.id,
          name: sellerUser.name,
          studentId: sellerUser.studentId,
          email: sellerUser.email,
          phone: null,
          school: 'UIT',
          campus: 'KTX Khu A',
          major: 'KTPM',
          cohort: 'K18',
          studyStatus: 'DANG_HOC',
          reputation: 125,
          emailVerified: true,
          profileApproved: true,
          profileStatus: 'DA_DUYET',
          rejectReason: null,
          pendingUpdate: false,
          hasStudentCard: false,
          accountStatus: 'HOAT_DONG',
        };
      }
      if (path === '/auth/me') return sellerUser;
      if (path.startsWith('/listings/quota')) {
        return {
          reputationScore: 125,
          activeCount: 1,
          limit: 10,
          remaining: 9,
          canPublish: true,
          highTierThreshold: 120,
          standardLimit: 5,
          highTierLimit: 10,
        };
      }
      if (path.startsWith('/notifications')) {
        return { items: [], unreadCount: 0, page: 0, size: 20, totalElements: 0, totalPages: 0 };
      }
      if (path.startsWith('/sellers/seller-1/reviews')) {
        return makeSellerReviewsResponse();
      }
      return {};
    });

    render(<ProfileScreen />);
    expect(await screen.findByTestId('profile-received-reviews-preview')).toBeTruthy();
    expect(screen.getByTestId('profile-reviews-summary-sub').props.children).toBe(
      '4.8 · 2 đánh giá công khai',
    );
    fireEvent.press(screen.getByTestId('profile-shortcut-reviews'));
    expect(mockNavigate).toHaveBeenCalledWith('SellerReviews', {
      sellerId: 'seller-1',
      sellerName: 'Trần Lan Anh',
      reputationScore: 125,
      isOwnProfile: true,
    });
  });

  test('useReviews resets automatically and discards late in-flight responses when session logs out or switches users', async () => {
    let resolveLateOrderReview!: (v: unknown) => void;
    mockedApi.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveLateOrderReview = resolve;
        }),
    );

    const req = useReviews.getState().loadOrderReview('order-secret');

    act(() => {
      useSession.setState({ token: null, user: null, loading: false });
    });

    resolveLateOrderReview(makeOrderReviewState({ orderId: 'order-secret' }));
    await req;

    expect(useReviews.getState().orderReviewByOrderId).toEqual({});
    expect(useReviews.getState().orderReviewLoading).toBe(false);
  });

  test('UC-30 Exceptions: expired >15d hides CTA, REVIEW_ALREADY_EXISTS suggests refresh, and invalid/413 evidence upload shows inline error without losing form state', async () => {
    mockRouteParams = { id: 'order-done-1' };
    const order = makeCompletedOrder();

    // 1. Expired >15d / +1 bonus applied
    mockedApi.mockImplementation(async (path: string) => {
      if (path === '/orders/order-done-1') return order;
      if (path === '/orders/order-done-1/review') {
        return makeOrderReviewState({
          withinReviewWindow: false,
          daysRemaining: 0,
          noReviewBonusApplied: true,
          canReview: false,
          lockReason: 'NO_REVIEW_BONUS_APPLIED',
          review: null,
        });
      }
      return {};
    });

    const { unmount: unmountExpired } = render(<OrderDetailScreen />);
    expect(await screen.findByTestId('order-review-expired-banner')).toBeTruthy();
    expect(screen.queryByTestId('open-create-review-button')).toBeNull();
    unmountExpired();

    // 2. Evidence upload 413 FILE_TOO_LARGE + REVIEW_ALREADY_EXISTS keep form state & show refresh action
    useOrders.getState().reset();
    useReviews.getState().reset();
    jest.spyOn(imagePicker, 'pickImagesFromLibrary').mockResolvedValueOnce([
      {
        uri: 'file:///huge.jpg',
        fileName: 'huge.jpg',
        mimeType: 'image/jpeg',
        fileSize: 2_000_000,
      },
    ]);
    mockedApiMultipart.mockImplementation(async (path: string) => {
      if (path === '/orders/order-done-1/review/evidence') {
        throw new ApiError(413, 'Kích thước ảnh vượt quá 5MB.', 'FILE_TOO_LARGE');
      }
      return {};
    });
    mockedApi.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/orders/order-done-1' && !init?.method) return order;
      if (path === '/orders/order-done-1/review' && !init?.method) return makeOrderReviewState();
      if (path === '/orders/order-done-1/review' && init?.method === 'POST') {
        throw new ApiError(
          409,
          'Giao dịch này đã được đánh giá. Bạn có thể chỉnh sửa đánh giá.',
          'REVIEW_ALREADY_EXISTS',
        );
      }
      return {};
    });

    render(<OrderDetailScreen />);
    await screen.findByTestId('open-create-review-button');
    fireEvent.press(screen.getByTestId('open-create-review-button'));
    fireEvent.changeText(screen.getByTestId('review-comment-input'), 'Nội dung giữ nguyên');

    // Failed evidence upload shows inline error and preserves comment
    fireEvent.press(screen.getByTestId('review-evidence-pick-library'));
    expect(await screen.findByTestId('review-evidence-error')).toBeTruthy();
    expect(screen.getByTestId('review-comment-input').props.value).toBe('Nội dung giữ nguyên');

    // REVIEW_ALREADY_EXISTS shows error + reload button
    fireEvent.press(screen.getByTestId('review-form-submit-button'));
    expect(await screen.findByTestId('review-form-refresh-conflict')).toBeTruthy();
    expect(screen.getByTestId('review-comment-input').props.value).toBe('Nội dung giữ nguyên');

    // NO_REVIEW_BONUS_ALREADY_APPLIED also surfaces reload button
    mockedApi.mockImplementationOnce(async () => {
      throw new ApiError(409, 'API 409: {}', 'NO_REVIEW_BONUS_ALREADY_APPLIED');
    });
    fireEvent.press(screen.getByTestId('review-form-submit-button'));
    expect(await screen.findByTestId('review-form-refresh-conflict')).toBeTruthy();
    expect(
      screen.getByText(
        'Giao dịch đã hết hạn 15 ngày và đã cộng +1 điểm uy tín cho người bán nên không thể đánh giá.',
      ),
    ).toBeTruthy();
  });

  test('UC-31 Alt 2 (CHO_XET edit with mixed evidence) & UC-32 delete error preservation + OrdersScreen HOAN_TAT review cues', async () => {
    mockRouteParams = { id: 'order-done-1' };
    const order = makeCompletedOrder();
    const existingEvidence = {
      id: EVIDENCE_UUID_1,
      url: `/api/v1/reviews/evidence/${EVIDENCE_UUID_1}`,
      contentType: 'image/jpeg',
      sizeBytes: 12000,
      originalFilename: 'old.jpg',
      createdAt: '2026-11-25T10:00:00Z',
    };
    const newEvidence = {
      id: EVIDENCE_UUID_2,
      url: `/api/v1/reviews/evidence/${EVIDENCE_UUID_2}`,
      contentType: 'image/png',
      sizeBytes: 15000,
      originalFilename: 'new.png',
      createdAt: '2026-11-25T11:00:00Z',
    };
    const pendingReview = makeReviewDetail({
      rating: 2,
      comment: 'Bị lỗi nhẹ',
      status: 'CHO_XET',
      publiclyVisible: false,
      appliedScoreDelta: 0,
      version: 1,
      evidence: [existingEvidence],
    });
    const pendingState = makeOrderReviewState({
      canReview: false,
      canEdit: true,
      canDelete: true,
      hasPendingModerationReview: true,
      review: pendingReview,
    });

    jest.spyOn(imagePicker, 'pickImagesFromLibrary').mockResolvedValueOnce([
      { uri: 'file:///new.png', fileName: 'new.png', mimeType: 'image/png', fileSize: 15000 },
    ]);

    let capturedPutBody: Record<string, unknown> | null = null;
    mockedApiMultipart.mockImplementation(async (path: string) => {
      if (path === '/orders/order-done-1/review/evidence') {
        return { items: [newEvidence] };
      }
      return {};
    });
    mockedApi.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/orders/order-done-1' && !init?.method) return order;
      if (path === '/orders/order-done-1/review' && !init?.method) return pendingState;
      if (path === '/reviews/rev-1' && init?.method === 'PUT') {
        capturedPutBody = JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>;
        return {
          review: { ...pendingReview, version: 2, currentVersionNo: 2, evidence: [newEvidence] },
          orderReviewState: {
            ...pendingState,
            review: { ...pendingReview, version: 2, currentVersionNo: 2, evidence: [newEvidence] },
          },
          idempotentReplay: false,
        };
      }
      if (path.startsWith('/reviews/rev-1') && init?.method === 'DELETE') {
        throw new ApiError(500, 'Lỗi hệ thống khi xóa đánh giá.');
      }
      return {};
    });

    const { unmount } = render(<OrderDetailScreen />);
    await screen.findByTestId('open-edit-review-button');

    // Open CHO_XET edit: verifies queue-preserved note, removes persisted old evidence (NO draft delete!), adds new draft evidence
    fireEvent.press(screen.getByTestId('open-edit-review-button'));
    expect(screen.getByTestId('review-edit-transition-note')).toBeTruthy();
    fireEvent.press(screen.getByTestId(`review-evidence-remove-${EVIDENCE_UUID_1}`));
    expect(
      mockedApi.mock.calls.some(
        ([p, i]) => p.includes('/review/evidence/') && i?.method === 'DELETE',
      ),
    ).toBe(false);
    fireEvent.press(screen.getByTestId('review-evidence-pick-library'));
    expect(await screen.findByTestId(`review-evidence-item-${EVIDENCE_UUID_2}`)).toBeTruthy();

    fireEvent.press(screen.getByTestId('review-form-submit-button'));
    await waitFor(() => {
      expect(capturedPutBody).toMatchObject({
        rating: 2,
        evidenceIds: [EVIDENCE_UUID_2],
        expectedVersion: 1,
      });
    });

    // Delete failure keeps review card intact and surfaces inline error in DeleteReviewSheet
    fireEvent.press(screen.getByTestId('open-delete-review-button'));
    fireEvent.press(screen.getByTestId('delete-review-confirm-button'));
    expect(await screen.findByTestId('delete-review-error')).toBeTruthy();
    fireEvent.press(screen.getByTestId('delete-review-cancel-button'));
    expect(screen.getByTestId('order-review-card')).toBeTruthy();
    unmount();

    // OrdersScreen shows HOAN_TAT review cues only within 15-day window (hides CTA on expired unreviewed order)
    useOrders.getState().reset();
    mockRouteParams = {};
    const recentCompletedIso = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const expiredCompletedIso = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
    mockedApi.mockImplementation(async (path: string) => {
      if (path.startsWith('/notifications')) {
        return { items: [], unreadCount: 0, page: 0, size: 20, totalElements: 0, totalPages: 0 };
      }
      return {
        items: [
          {
            id: 'ord-unreviewed',
            listing: {
              id: 'l-1',
              title: 'Bàn học gấp',
              listedPriceVnd: 100000,
              listingType: 'BAN_LE',
              isCombo: false,
              isFree: false,
              status: 'KET_THUC',
              thumbnailUrl: null,
              locationName: 'KTX Khu A',
            },
            seller: { id: 'seller-1', displayName: 'Trần Lan Anh', reputationScore: 120 },
            buyer: { id: 'buyer-1', displayName: 'Nguyễn Minh Quân', reputationScore: 100 },
            agreedPriceVnd: 100000,
            status: 'HOAN_TAT',
            scheduleConfirmed: true,
            meetingTime: '2026-11-24T09:00:00Z',
            meetingLocation: 'Cổng KTX Khu A ĐHQG-HCM',
            proposedMeetingTime: null,
            proposedMeetingLocation: null,
            hasPendingScheduleProposal: false,
            itemCount: 1,
            createdAt: '2026-11-20T00:00:00Z',
            reservedAt: null,
            deliveryStartedAt: null,
            reportedDeliveredAt: null,
            completedAt: recentCompletedIso,
            cancelledAt: null,
            reviewStatus: null,
            version: 2,
          },
          {
            id: 'ord-expired-unreviewed',
            listing: {
              id: 'l-3',
              title: 'Quạt mini để bàn',
              listedPriceVnd: 60000,
              listingType: 'BAN_LE',
              isCombo: false,
              isFree: false,
              status: 'KET_THUC',
              thumbnailUrl: null,
              locationName: 'KTX Khu A',
            },
            seller: { id: 'seller-1', displayName: 'Trần Lan Anh', reputationScore: 120 },
            buyer: { id: 'buyer-1', displayName: 'Nguyễn Minh Quân', reputationScore: 100 },
            agreedPriceVnd: 60000,
            status: 'HOAN_TAT',
            scheduleConfirmed: true,
            meetingTime: '2026-11-05T09:00:00Z',
            meetingLocation: 'Cổng KTX Khu A ĐHQG-HCM',
            proposedMeetingTime: null,
            proposedMeetingLocation: null,
            hasPendingScheduleProposal: false,
            itemCount: 1,
            createdAt: '2026-11-01T00:00:00Z',
            reservedAt: null,
            deliveryStartedAt: null,
            reportedDeliveredAt: null,
            completedAt: expiredCompletedIso,
            cancelledAt: null,
            reviewStatus: null,
            version: 2,
          },
          {
            id: 'ord-pending-rev',
            listing: {
              id: 'l-2',
              title: 'Đèn bàn LED',
              listedPriceVnd: 80000,
              listingType: 'BAN_LE',
              isCombo: false,
              isFree: false,
              status: 'KET_THUC',
              thumbnailUrl: null,
              locationName: 'KTX Khu B',
            },
            seller: { id: 'seller-1', displayName: 'Trần Lan Anh', reputationScore: 120 },
            buyer: { id: 'buyer-1', displayName: 'Nguyễn Minh Quân', reputationScore: 100 },
            agreedPriceVnd: 80000,
            status: 'HOAN_TAT',
            scheduleConfirmed: true,
            meetingTime: '2026-11-24T11:00:00Z',
            meetingLocation: 'Cổng KTX Khu B ĐHQG-HCM',
            proposedMeetingTime: null,
            proposedMeetingLocation: null,
            hasPendingScheduleProposal: false,
            itemCount: 1,
            createdAt: '2026-11-20T00:00:00Z',
            reservedAt: null,
            deliveryStartedAt: null,
            reportedDeliveredAt: null,
            completedAt: recentCompletedIso,
            cancelledAt: null,
            reviewStatus: 'CHO_XET',
            version: 2,
          },
        ],
        page: 0,
        size: 30,
        totalElements: 3,
        totalPages: 1,
      };
    });

    render(<OrdersScreen />);
    expect(await screen.findByText('Quạt mini để bàn')).toBeTruthy();
    // HOAN_TAT review cues MUST take precedence over confirmed schedule ("Đã hẹn: ...")
    expect(screen.getAllByText('Chạm để đánh giá người bán')).toHaveLength(1);
    expect(screen.getByText('Đánh giá đang chờ kiểm duyệt')).toBeTruthy();
    expect(screen.queryByText(/Đã hẹn:/)).toBeNull();
  });

  test('PR #40 review fixes: BI_KHOA closes sheets cleanly, draft delete frees quota, refresh failure keeps sheet open, and AuthorizedEvidenceImage handles retry', async () => {
    mockRouteParams = { id: 'order-done-1' };
    const order = makeCompletedOrder();
    const restriction = {
      accountStatus: 'BI_KHOA',
      lockType: 'KHOA_TAM_THOI',
      reason: 'Vi phạm nội quy',
      lockedUntil: '2026-12-15T00:00:00Z',
      appealable: false,
      reputationScore: 45,
      message: 'Tài khoản của bạn đang bị khóa tạm thời.',
    };

    const draftEvidence = {
      id: EVIDENCE_UUID_1,
      url: `/api/v1/reviews/evidence/${EVIDENCE_UUID_1}`,
      contentType: 'image/jpeg',
      sizeBytes: 11000,
      originalFilename: 'draft.jpg',
      createdAt: '2026-11-28T10:00:00Z',
    };

    jest.spyOn(imagePicker, 'pickImagesFromLibrary').mockResolvedValue([
      { uri: 'file:///draft.jpg', fileName: 'draft.jpg', mimeType: 'image/jpeg', fileSize: 11000 },
    ]);

    // 1. Draft evidence upload -> AuthorizedEvidenceImage fails once then retries cleanly -> removing draft calls DELETE /orders/{id}/review/evidence/{evId}
    mockedAttachment
      .mockRejectedValueOnce(new Error('Tạm thời mất mạng'))
      .mockResolvedValue({
        type: 'image/jpeg',
        bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer,
      });
    mockedApiMultipart.mockResolvedValueOnce({ items: [draftEvidence] });
    mockedApi.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/orders/order-done-1' && !init?.method) return order;
      if (path === '/orders/order-done-1/review' && !init?.method) return makeOrderReviewState();
      if (
        path === `/orders/order-done-1/review/evidence/${EVIDENCE_UUID_1}` &&
        init?.method === 'DELETE'
      ) {
        return undefined;
      }
      if (path === '/orders/order-done-1/review' && init?.method === 'POST') {
        throw new RestrictedAccountError(restriction.message, restriction);
      }
      return {};
    });

    const { unmount: unmountDraft } = render(<OrderDetailScreen />);
    await screen.findByTestId('open-create-review-button');
    fireEvent.press(screen.getByTestId('open-create-review-button'));

    fireEvent.press(screen.getByTestId('review-evidence-pick-library'));
    expect(await screen.findByTestId('review-evidence-image-0-error')).toBeTruthy();
    fireEvent.press(screen.getByTestId('review-evidence-image-0-retry'));
    expect(await screen.findByTestId('review-evidence-image-0')).toBeTruthy();

    // Removing unattached draft MUST call backend draft-delete endpoint to free quota
    fireEvent.press(screen.getByTestId(`review-evidence-remove-${EVIDENCE_UUID_1}`));
    await waitFor(() => {
      expect(mockedApi).toHaveBeenCalledWith(
        `/orders/order-done-1/review/evidence/${EVIDENCE_UUID_1}`,
        expect.objectContaining({ method: 'DELETE' }),
      );
      expect(screen.queryByTestId(`review-evidence-item-${EVIDENCE_UUID_1}`) === null).toBe(true);
    });

    // BI_KHOA (RestrictedAccountError) on submit closes ReviewFormSheet instead of silent dead button
    fireEvent.press(screen.getByTestId('review-form-submit-button'));
    await waitFor(() => {
      expect(screen.queryByTestId('create-review-sheet') === null).toBe(true);
    });
    expect(useSession.getState().restriction?.accountStatus).toBe('BI_KHOA');
    unmountDraft();

    // 2. BI_KHOA on ReviewEvidenceManager upload closes ReviewFormSheet & BI_KHOA on DeleteReviewSheet closes DeleteReviewSheet
    useOrders.getState().reset();
    useReviews.getState().reset();
    useSession.setState({
      token: 'buyer-jwt-token',
      user: buyerUser,
      loading: false,
      restriction: null,
      restrictionDismissed: false,
    });
    const editableState = makeOrderReviewState({
      canReview: false,
      canEdit: true,
      canDelete: true,
      review: makeReviewDetail({ version: 1 }),
    });
    let reviewGetCount = 0;
    mockedApiMultipart.mockRejectedValueOnce(
      new RestrictedAccountError(restriction.message, restriction),
    );
    mockedApi.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/orders/order-done-1' && !init?.method) return order;
      if (path === '/orders/order-done-1/review' && !init?.method) {
        reviewGetCount += 1;
        // First mount succeeds; conflict refresh fails with network error
        if (reviewGetCount > 1) {
          throw new Error('Mất kết nối mạng');
        }
        return editableState;
      }
      if (path === '/reviews/rev-1' && init?.method === 'PUT') {
        throw new ApiError(409, 'Version cũ', 'VERSION_CONFLICT');
      }
      if (path.startsWith('/reviews/rev-1') && init?.method === 'DELETE') {
        throw new RestrictedAccountError(restriction.message, restriction);
      }
      return {};
    });

    const { unmount: unmountLocked } = render(<OrderDetailScreen />);
    await screen.findByTestId('open-edit-review-button');

    // Trigger 409 conflict then network error on refresh -> sheet MUST stay open (no false onClose)
    fireEvent.press(screen.getByTestId('open-edit-review-button'));
    fireEvent.changeText(screen.getByTestId('review-comment-input'), 'Cập nhật mới');
    fireEvent.press(screen.getByTestId('review-form-submit-button'));
    expect(await screen.findByTestId('review-form-refresh-conflict')).toBeTruthy();
    fireEvent.press(screen.getByTestId('review-form-refresh-conflict'));
    expect(
      await screen.findByText(
        'Không thể tải lại trạng thái mới nhất do lỗi kết nối. Vui lòng thử lại.',
      ),
    ).toBeTruthy();
    expect(screen.getByTestId('edit-review-sheet')).toBeTruthy();

    // RestrictedAccountError on evidence upload closes edit sheet cleanly
    fireEvent.press(screen.getByTestId('review-evidence-pick-library'));
    await waitFor(() => {
      expect(screen.queryByTestId('edit-review-sheet') === null).toBe(true);
    });

    // RestrictedAccountError on DeleteReviewSheet closes delete sheet cleanly
    useSession.setState({ restriction: null, restrictionDismissed: false });
    fireEvent.press(screen.getByTestId('open-delete-review-button'));
    expect(screen.getByTestId('delete-review-sheet')).toBeTruthy();
    fireEvent.press(screen.getByTestId('delete-review-confirm-button'));
    await waitFor(() => {
      expect(screen.queryByTestId('delete-review-sheet') === null).toBe(true);
    });
    expect(useSession.getState().restriction?.accountStatus).toBe('BI_KHOA');
    unmountLocked();

    // 3. GET /orders/{id}/review returning lockReason=ACCOUNT_RESTRICTED shows danger lock banner
    useOrders.getState().reset();
    useReviews.getState().reset();
    mockedApi.mockImplementation(async (path: string) => {
      if (path === '/orders/order-done-1') return order;
      if (path === '/orders/order-done-1/review') {
        return makeOrderReviewState({
          canReview: false,
          canEdit: false,
          canDelete: false,
          lockReason: 'ACCOUNT_RESTRICTED',
          lockMessage:
            'Tài khoản của bạn hiện đang bị hạn chế nên không thể gửi, chỉnh sửa hoặc xóa đánh giá.',
          review: null,
        });
      }
      return {};
    });
    render(<OrderDetailScreen />);
    expect(await screen.findByText('Tài khoản đang bị hạn chế')).toBeTruthy();
    expect(screen.queryByTestId('open-create-review-button')).toBeNull();
  });

  test('useReviews & SellerReviewsScreen: dedupes OFFSET pagination, blocks load-more while refreshing, clears old filter on error, and resets orderReviewLoading on mutation', async () => {
    // 1. Mutation superseding an in-flight loadOrderReview MUST reset orderReviewLoading=false
    let resolveStaleLoad!: (v: unknown) => void;
    mockedApi
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveStaleLoad = resolve;
          }),
      )
      .mockResolvedValueOnce({
        review: makeReviewDetail({ rating: 5 }),
        orderReviewState: makeOrderReviewState({
          canReview: false,
          canEdit: true,
          canDelete: true,
          review: makeReviewDetail({ rating: 5 }),
        }),
        idempotentReplay: false,
      });

    const staleReq = useReviews.getState().loadOrderReview('order-done-1');
    expect(useReviews.getState().orderReviewLoading).toBe(true);
    await useReviews.getState().createReview('order-done-1', { rating: 5 });
    expect(useReviews.getState().orderReviewLoading).toBe(false);
    resolveStaleLoad(makeOrderReviewState());
    await staleReq;
    expect(useReviews.getState().orderReviewLoading).toBe(false);

    // 2. OFFSET pagination dedupes overlapping item IDs & filter change error does NOT leak old filter items
    useReviews.getState().reset();
    mockRouteParams = { sellerId: 'seller-1', sellerName: 'Trần Lan Anh', reputationScore: 125 };
    mockedApi.mockImplementation(async (path: string) => {
      if (path.includes('rating=1')) {
        throw new ApiError(500, 'Máy chủ bận.');
      }
      if (path.includes('page=1')) {
        return makeSellerReviewsResponse({
          items: [
            // Overlapping pub-rev-2 from page 0 + new pub-rev-3
            makeSellerReviewsResponse().items[1],
            {
              id: 'pub-rev-3',
              listingId: 'listing-3',
              listingTitle: 'Quạt đứng Senko',
              buyerDisplayName: 'Phạm Gia Huy',
              rating: 5,
              comment: 'Quạt chạy êm.',
              edited: false,
              publishedAt: '2026-11-23T09:00:00Z',
              createdAt: '2026-11-23T09:00:00Z',
              updatedAt: '2026-11-23T09:00:00Z',
            },
          ],
          page: 1,
          size: 2,
          totalElements: 3,
          totalPages: 2,
        });
      }
      return makeSellerReviewsResponse({ page: 0, size: 2, totalElements: 3, totalPages: 2 });
    });

    render(<SellerReviewsScreen />);
    expect(await screen.findByTestId('public-review-card-pub-rev-1')).toBeTruthy();
    expect(screen.getByTestId('seller-reviews-load-more')).toBeTruthy();

    // Block handleLoadMore while sellerReviewsRefreshing is true
    act(() => {
      useReviews.setState({ sellerReviewsRefreshing: true });
    });
    const callsBeforeBlockedLoadMore = mockedApi.mock.calls.length;
    fireEvent.press(screen.getByTestId('seller-reviews-load-more'));
    expect(mockedApi.mock.calls.length).toBe(callsBeforeBlockedLoadMore);

    // Allow load-more -> page 1 overlaps pub-rev-2; store must dedupe to [pub-rev-1, pub-rev-2, pub-rev-3]
    act(() => {
      useReviews.setState({ sellerReviewsRefreshing: false });
    });
    fireEvent.press(screen.getByTestId('seller-reviews-load-more'));
    expect(await screen.findByTestId('public-review-card-pub-rev-3')).toBeTruthy();
    const mergedIds = useReviews.getState().sellerReviews?.items.map((it) => it.id);
    expect(mergedIds).toEqual(['pub-rev-1', 'pub-rev-2', 'pub-rev-3']);

    // Switching star filter to 1★ which fails -> MUST NOT leak items from previous filter
    fireEvent.press(screen.getByTestId('seller-reviews-filter-1'));
    expect(await screen.findByTestId('seller-reviews-error')).toBeTruthy();
    expect(screen.queryByTestId('public-review-card-pub-rev-1')).toBeNull();
    expect(screen.queryByTestId('public-review-card-pub-rev-3')).toBeNull();
  });
});

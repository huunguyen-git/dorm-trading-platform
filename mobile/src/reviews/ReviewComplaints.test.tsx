import React from 'react';
import { Alert } from 'react-native';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { api, ApiError } from '../api/client';
import { useSession, type User } from '../auth/session';
import * as imagePicker from '../media/imagePicker';
import MyReviewsScreen from '../screens/MyReviewsScreen';
import ReviewComplaintScreen from '../screens/ReviewComplaintScreen';
import type { ComplaintReason, ReviewComplaintRouteParams, SellerReceivedReview } from './types';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockAddListener = jest.fn(() => () => {});
let mockRouteParams: Record<string, unknown> = {};

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native') as Record<string, unknown>;
  return {
    ...actual,
    useNavigation: () => ({
      navigate: mockNavigate,
      goBack: mockGoBack,
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
const mockedPick = imagePicker.pickImagesFromLibrary as unknown as jest.Mock<
  (remaining: number) => Promise<imagePicker.PickableImageAsset[]>
>;

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

const sampleReasons: ComplaintReason[] = [
  { code: 'SAI_SU_THAT', label: 'Nội dung đánh giá sai sự thật', description: 'Không đúng thực tế.' },
  { code: 'AC_Y_XUC_PHAM', label: 'Đánh giá ác ý / Ngôn từ xúc phạm', description: 'Công kích cá nhân.' },
];

const sampleReceivedReview: SellerReceivedReview = {
  reviewId: 'rev-1',
  transactionId: 'tx-1',
  listingId: 'list-1',
  listingTitle: 'Bàn học gấp gọn KTX',
  buyerId: 'buyer-1',
  buyerName: 'Nguyễn Minh Quân',
  stars: 1,
  comment: 'Bàn bị gãy chân',
  status: 'CHAP_NHAN',
  version: 2,
  editLocked: false,
  appliedScoreDelta: -5,
  createdAt: '2026-11-26T08:00:00Z',
  publishedAt: '2026-11-26T08:00:00Z',
  complaintDeadline: '2026-12-03T08:00:00Z',
  daysRemainingToComplain: 5,
  canComplain: true,
  complaint: null,
  pendingSupplementalRequests: [],
};

function setComplaintParams(p: ReviewComplaintRouteParams) {
  mockRouteParams = p as unknown as Record<string, unknown>;
}

describe('P3-05 Mobile: Khiếu nại Đánh giá (UC-33) & Xem kết quả kiểm duyệt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSession.setState({
      token: 'seller-jwt',
      user: sellerUser,
      loading: false,
      restriction: null,
      restrictionDismissed: false,
    });
    mockRouteParams = {};
  });

  test('UC-33: Validates reason & description/evidence, uploads image, submits complaint cleanly', async () => {
    setComplaintParams({
      reviewId: 'rev-1',
      reviewVersion: 2,
      listingTitle: 'Bàn học gấp gọn KTX',
      buyerName: 'Nguyễn Minh Quân',
      stars: 1,
      comment: 'Bàn bị gãy chân',
      daysRemaining: 5,
    });

    mockedApi
      .mockResolvedValueOnce({ items: sampleReasons })
      .mockResolvedValueOnce({ conversations: [] })
      .mockResolvedValueOnce({
        items: [{ id: 'ev-rev-1', originalFilename: 'handover.jpg', contentType: 'image/jpeg', sizeBytes: 15000 }],
      })
      .mockResolvedValueOnce({
        id: 'cmp-1',
        reviewId: 'rev-1',
        reviewVersion: 2,
        reasonCode: 'SAI_SU_THAT',
        reasonLabel: 'Nội dung đánh giá sai sự thật',
        description: 'Bàn còn nguyên vẹn lúc bàn giao.',
        status: 'CHO_XU_LY',
        conclusion: null,
        moderationRationale: null,
        imageEvidenceCount: 1,
        hasChatLog: false,
        supplementalStatus: null,
        createdAt: '2026-11-28T08:00:00Z',
        resolvedAt: null,
        withdrawnAt: null,
        idempotentReplay: false,
      });

    mockedPick.mockResolvedValueOnce([
      { uri: 'file:///handover.jpg', fileName: 'handover.jpg', mimeType: 'image/jpeg', fileSize: 15000 },
    ]);

    render(<ReviewComplaintScreen />);
    await screen.findByTestId('complaint-reason-SAI_SU_THAT');

    // Empty submit shows both validation errors
    fireEvent.press(screen.getByTestId('complaint-submit-button'));
    expect(screen.getByTestId('complaint-reason-error')).toBeTruthy();
    expect(screen.getByTestId('complaint-content-error')).toBeTruthy();

    fireEvent.press(screen.getByTestId('complaint-reason-SAI_SU_THAT'));
    fireEvent.changeText(
      screen.getByTestId('complaint-description-input'),
      'Bàn còn nguyên vẹn lúc bàn giao.',
    );
    fireEvent.press(screen.getByTestId('complaint-pick-image-button'));
    await screen.findByTestId('complaint-evidence-0');

    fireEvent.press(screen.getByTestId('complaint-submit-button'));
    await screen.findByTestId('complaint-success-view');

    const postCall = mockedApi.mock.calls.find(([p]) => p === '/review-complaints');
    const body = JSON.parse(String(postCall?.[1]?.body));
    expect(body.reviewId).toBe('rev-1');
    expect(body.expectedReviewVersion).toBe(2);
    expect(body.reasonCode).toBe('SAI_SU_THAT');
    expect(body.evidenceIds).toEqual(['ev-rev-1']);
  });

  test('UC-33 §3.3: Retains form data on network error and retries with same clientRequestId', async () => {
    setComplaintParams({
      reviewId: 'rev-1',
      reviewVersion: 2,
      listingTitle: 'Bàn học gấp gọn KTX',
      buyerName: 'Nguyễn Minh Quân',
      stars: 1,
      daysRemaining: 5,
    });

    mockedApi
      .mockResolvedValueOnce({ items: sampleReasons })
      .mockResolvedValueOnce({ conversations: [] })
      .mockRejectedValueOnce(new ApiError(503, 'Hệ thống bận.', 'MODERATION_UNAVAILABLE'))
      .mockResolvedValueOnce({
        id: 'cmp-retry',
        reviewId: 'rev-1',
        reviewVersion: 2,
        reasonCode: 'AC_Y_XUC_PHAM',
        reasonLabel: 'Đánh giá ác ý / Ngôn từ xúc phạm',
        description: 'Nội dung công kích.',
        status: 'CHO_XU_LY',
        conclusion: null,
        moderationRationale: null,
        imageEvidenceCount: 0,
        hasChatLog: false,
        supplementalStatus: null,
        createdAt: '2026-11-28T08:05:00Z',
        resolvedAt: null,
        withdrawnAt: null,
        idempotentReplay: false,
      });

    render(<ReviewComplaintScreen />);
    await screen.findByTestId('complaint-reason-AC_Y_XUC_PHAM');

    fireEvent.press(screen.getByTestId('complaint-reason-AC_Y_XUC_PHAM'));
    fireEvent.changeText(screen.getByTestId('complaint-description-input'), 'Nội dung công kích.');
    fireEvent.press(screen.getByTestId('complaint-submit-button'));

    await screen.findByTestId('complaint-submit-error');
    expect(screen.getByDisplayValue('Nội dung công kích.')).toBeTruthy();

    fireEvent.press(screen.getByTestId('complaint-submit-button'));
    await screen.findByTestId('complaint-success-view');

    const posts = mockedApi.mock.calls.filter(([p]) => p === '/review-complaints');
    expect(posts).toHaveLength(2);
    expect(JSON.parse(String(posts[0][1]?.body)).clientRequestId).toBe(
      JSON.parse(String(posts[1][1]?.body)).clientRequestId,
    );
  });

  test('MyReviewsScreen navigates to ReviewComplaint, withdraws pending complaint, and responds to supplemental request', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      const destructive = buttons?.find((b) => b.style === 'destructive');
      destructive?.onPress?.();
    });

    const reviewWithPendingComplaint: SellerReceivedReview = {
      ...sampleReceivedReview,
      reviewId: 'rev-2',
      canComplain: false,
      complaint: {
        id: 'cmp-open',
        reviewId: 'rev-2',
        reviewVersion: 1,
        reasonCode: 'SAI_SU_THAT',
        reasonLabel: 'Nội dung đánh giá sai sự thật',
        description: 'Đã gửi ảnh.',
        status: 'CHO_XU_LY',
        conclusion: null,
        moderationRationale: null,
        imageEvidenceCount: 1,
        hasChatLog: false,
        supplementalStatus: 'CHO_BO_SUNG',
        createdAt: '2026-11-28T08:00:00Z',
        resolvedAt: null,
        withdrawnAt: null,
        idempotentReplay: false,
      },
      pendingSupplementalRequests: [
        {
          id: 'sup-1',
          caseType: 'KHIEU_NAI',
          caseId: 'cmp-open',
          recipientId: 'seller-1',
          recipientRole: 'NGUOI_BAN',
          requestNote: 'Vui lòng cung cấp thêm thông tin giờ hẹn.',
          responseNote: null,
          status: 'CHO_PHAN_HOI',
          createdAt: '2026-11-28T08:10:00Z',
          respondedAt: null,
        },
      ],
    };

    mockedApi
      .mockResolvedValueOnce({ items: [sampleReceivedReview, reviewWithPendingComplaint] })
      .mockResolvedValueOnce({ id: 'sup-1', status: 'DA_PHAN_HOI' })
      .mockResolvedValueOnce({ items: [sampleReceivedReview, reviewWithPendingComplaint] })
      .mockResolvedValueOnce({ id: 'cmp-open', status: 'DA_RUT' })
      .mockResolvedValueOnce({ items: [sampleReceivedReview] });

    render(<MyReviewsScreen />);
    await screen.findByTestId('complain-review-rev-1');

    // Open complaint form
    fireEvent.press(screen.getByTestId('complain-review-rev-1'));
    expect(mockNavigate).toHaveBeenCalledWith(
      'ReviewComplaint',
      expect.objectContaining({ reviewId: 'rev-1', reviewVersion: 2 }),
    );

    // Respond to supplemental request
    fireEvent.changeText(screen.getByTestId('supplemental-input-sup-1'), 'Gặp lúc 14h tại sảnh KTX A.');
    fireEvent.press(screen.getByTestId('supplemental-send-sup-1'));
    await waitFor(() => {
      expect(mockedApi).toHaveBeenCalledWith(
        '/review-complaints/supplemental/sup-1/respond',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    // Withdraw pending complaint
    fireEvent.press(screen.getByTestId('withdraw-complaint-cmp-open'));
    await waitFor(() => {
      expect(mockedApi).toHaveBeenCalledWith(
        '/review-complaints/cmp-open/withdraw',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    alertSpy.mockRestore();
  });
});

import React from 'react';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { api, ApiError } from '../api/client';
import { useSession, type User } from '../auth/session';
import * as imagePicker from '../media/imagePicker';
import ReportScreen from '../screens/ReportScreen';
import ListingScreen from '../screens/ListingScreen';
import { useDiscovery } from '../listings/discoveryStore';
import type { ListingDetail } from '../listings/types';
import type { ReportCategory, ReportRouteParams } from './types';

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
const mockedPickLibrary = imagePicker.pickImagesFromLibrary as unknown as jest.Mock<
  (remaining: number) => Promise<imagePicker.PickableImageAsset[]>
>;
const mockedTakePhoto = imagePicker.takePhotoWithCamera as unknown as jest.Mock<
  () => Promise<imagePicker.PickableImageAsset | null>
>;

const activeMember: User = {
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

const listingCategories: ReportCategory[] = [
  {
    code: 'TIN_DANG_HANG_CAM',
    targetType: 'TIN_DANG',
    name: 'Hàng cấm / Không hợp lệ',
    description: 'Mặt hàng vi phạm quy định.',
    displayOrder: 1,
  },
  {
    code: 'TIN_DANG_SAI_SU_THAT',
    targetType: 'TIN_DANG',
    name: 'Nội dung hoặc ảnh sai sự thật',
    description: 'Ảnh và mô tả không khớp thực tế.',
    displayOrder: 2,
  },
];

const userCategories: ReportCategory[] = [
  {
    code: 'NGUOI_DUNG_LUA_DAO',
    targetType: 'NGUOI_DUNG',
    name: 'Lừa đảo / Gian lận giao dịch',
    description: 'Dấu hiệu gian lận khi trao đổi.',
    displayOrder: 1,
  },
  {
    code: 'NGUOI_DUNG_BO_HEN',
    targetType: 'NGUOI_DUNG',
    name: 'Bỏ hẹn / Không hợp tác giao dịch',
    description: 'Hủy hẹn đột ngột.',
    displayOrder: 2,
  },
];

const sampleListingDetail: ListingDetail = {
  id: 'listing-99',
  title: 'Giáo trình Nhập môn Mạng máy tính',
  description: 'Sách còn mới 95%.',
  condition: 'Mới 95%',
  priceVnd: 65000,
  listingType: 'BAN_LE',
  isCombo: false,
  isFree: false,
  status: 'CONG_KHAI',
  categoryId: 'GT_CNTT',
  categoryName: 'GT CNTT',
  courseCode: 'NT101',
  courseName: 'Mạng máy tính',
  author: 'ĐHQG-HCM',
  locationCode: 'KTX_KHU_A',
  locationName: 'KTX Khu A',
  locationText: 'Sảnh A1',
  latitude: 10.8782,
  longitude: 106.8063,
  distanceKm: null,
  thumbnailUrl: null,
  images: [],
  itemCount: 1,
  seller: {
    id: 'seller-88',
    displayName: 'Trần Lan Anh',
    reputationScore: 110,
    averageRating: 4.8,
    reviewCount: 4,
  },
  hasUnavailableItems: false,
  publishedAt: '2026-11-25T08:00:00Z',
  expiresAt: '2026-12-25T08:00:00Z',
  renewalReminderDue: false,
  renewalCount: 0,
  createdAt: '2026-11-25T08:00:00Z',
  updatedAt: '2026-11-25T08:00:00Z',
  version: 1,
  category: { id: 'GT_CNTT', name: 'GT CNTT', parentId: 'GIAO_TRINH', description: null },
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
};

function setReportParams(params: ReportRouteParams) {
  mockRouteParams = params as unknown as Record<string, unknown>;
}

describe('P2-06 Báo cáo Người dùng (UC-35) & Báo cáo Tin đăng (UC-36)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSession.setState({
      token: 'active-jwt',
      user: activeMember,
      loading: false,
      restriction: null,
      restrictionDismissed: false,
    });
    useDiscovery.getState().reset();
    mockRouteParams = {};
  });

  test('UC-36: Validates missing category and missing description/evidence before submitting', async () => {
    setReportParams({
      targetType: 'TIN_DANG',
      targetId: 'listing-99',
      targetTitle: 'Giáo trình Nhập môn Mạng máy tính',
      sellerName: 'Trần Lan Anh',
    });

    mockedApi
      .mockResolvedValueOnce({ items: listingCategories })
      .mockResolvedValueOnce({ conversations: [] });

    render(<ReportScreen />);
    await screen.findByTestId('report-category-TIN_DANG_SAI_SU_THAT');

    // Submit empty -> both category & content errors shown
    fireEvent.press(screen.getByTestId('report-submit-button'));
    expect(screen.getByTestId('report-category-error')).toBeTruthy();
    expect(screen.getByTestId('report-content-error')).toBeTruthy();
    expect(mockedApi).toHaveBeenCalledTimes(2); // only initial reference calls

    // Select category only -> still requires description or evidence
    fireEvent.press(screen.getByTestId('report-category-TIN_DANG_SAI_SU_THAT'));
    fireEvent.press(screen.getByTestId('report-submit-button'));
    expect(screen.queryByTestId('report-category-error')).toBeNull();
    expect(screen.getByTestId('report-content-error')).toBeTruthy();
  });

  test('UC-36: Uploads image evidence, submits listing report, and shows success confirmation', async () => {
    setReportParams({
      targetType: 'TIN_DANG',
      targetId: 'listing-99',
      targetTitle: 'Giáo trình Nhập môn Mạng máy tính',
      sellerName: 'Trần Lan Anh',
    });

    mockedApi
      .mockResolvedValueOnce({ items: listingCategories })
      .mockResolvedValueOnce({ conversations: [] })
      .mockResolvedValueOnce({
        items: [{ id: 'ev-1', originalFilename: 'proof.jpg', contentType: 'image/jpeg', sizeBytes: 12000 }],
      })
      .mockResolvedValueOnce({
        id: 'rep-1',
        groupId: 'grp-1',
        groupReportCount: 2,
        targetType: 'TIN_DANG',
        targetId: 'listing-99',
        targetSummary: 'Giáo trình Nhập môn Mạng máy tính',
        categoryCode: 'TIN_DANG_SAI_SU_THAT',
        categoryName: 'Nội dung hoặc ảnh sai sự thật',
        description: 'Ảnh không phải sách thật.',
        status: 'CHO_XU_LY',
        imageEvidenceCount: 1,
        hasChatLog: false,
        createdAt: '2026-11-28T07:00:00Z',
        idempotentReplay: false,
      });

    mockedPickLibrary.mockResolvedValueOnce([
      { uri: 'file:///proof.jpg', fileName: 'proof.jpg', mimeType: 'image/jpeg', fileSize: 12000 },
    ]);

    render(<ReportScreen />);
    await screen.findByTestId('report-category-TIN_DANG_SAI_SU_THAT');

    fireEvent.press(screen.getByTestId('report-category-TIN_DANG_SAI_SU_THAT'));
    fireEvent.changeText(screen.getByTestId('report-description-input'), 'Ảnh không phải sách thật.');
    fireEvent.press(screen.getByTestId('report-pick-image-button'));

    await screen.findByTestId('report-evidence-0');
    fireEvent.press(screen.getByTestId('report-submit-button'));

    await screen.findByTestId('report-success-view');
    expect(screen.getByText('Đã gửi báo cáo thành công')).toBeTruthy();

    // Verify POST /reports payload
    const submitCall = mockedApi.mock.calls.find(([path]) => path === '/reports');
    expect(submitCall).toBeDefined();
    const sentBody = JSON.parse(String(submitCall?.[1]?.body));
    expect(sentBody.targetType).toBe('TIN_DANG');
    expect(sentBody.targetId).toBe('listing-99');
    expect(sentBody.categoryCode).toBe('TIN_DANG_SAI_SU_THAT');
    expect(sentBody.evidenceIds).toEqual(['ev-1']);
    expect(typeof sentBody.clientRequestId).toBe('string');

    fireEvent.press(screen.getByTestId('report-done-button'));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  test('UC-35 §3.2: Reports user with chat log evidence only (no text description)', async () => {
    setReportParams({
      targetType: 'NGUOI_DUNG',
      targetId: 'seller-88',
      targetTitle: 'Trần Lan Anh',
      conversationId: 'conv-1',
    });

    mockedApi
      .mockResolvedValueOnce({ items: userCategories })
      .mockResolvedValueOnce({
        conversations: [
          {
            conversationId: 'conv-1',
            listingId: 'listing-99',
            listingTitle: 'Giáo trình Nhập môn Mạng máy tính',
            counterpartyId: 'seller-88',
            counterpartyName: 'Trần Lan Anh',
            messages: [
              {
                id: 'msg-1',
                senderId: 'seller-88',
                senderName: 'Trần Lan Anh',
                content: 'Chuyển khoản trước mới giữ đồ nhé',
                offeredPrice: null,
                sentAt: '2026-11-28T06:00:00Z',
              },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({
        id: 'rep-chat-1',
        groupId: 'grp-user-1',
        groupReportCount: 1,
        targetType: 'NGUOI_DUNG',
        targetId: 'seller-88',
        targetSummary: 'Trần Lan Anh',
        categoryCode: 'NGUOI_DUNG_LUA_DAO',
        categoryName: 'Lừa đảo / Gian lận giao dịch',
        description: '',
        status: 'CHO_XU_LY',
        imageEvidenceCount: 0,
        hasChatLog: true,
        createdAt: '2026-11-28T07:10:00Z',
        idempotentReplay: false,
      });

    render(<ReportScreen />);
    await screen.findByTestId('report-chat-msg-msg-1');

    fireEvent.press(screen.getByTestId('report-category-NGUOI_DUNG_LUA_DAO'));
    fireEvent.press(screen.getByTestId('report-submit-button'));

    await screen.findByTestId('report-success-view');
    const submitCall = mockedApi.mock.calls.find(([path]) => path === '/reports');
    const sentBody = JSON.parse(String(submitCall?.[1]?.body));
    expect(sentBody.attachChatLog).toBe(true);
    expect(sentBody.chatConversationId).toBe('conv-1');
    expect(sentBody.chatMessageIds).toEqual(['msg-1']);
  });

  test('UC-35/36 §3.3: Preserves form input on failure and retries with identical clientRequestId', async () => {
    setReportParams({
      targetType: 'NGUOI_DUNG',
      targetId: 'seller-88',
      targetTitle: 'Trần Lan Anh',
    });

    mockedApi
      .mockResolvedValueOnce({ items: userCategories })
      .mockResolvedValueOnce({ conversations: [] })
      .mockRejectedValueOnce(new ApiError(503, 'Hệ thống bận, vui lòng thử lại.', 'GOVERNANCE_UNAVAILABLE'))
      .mockResolvedValueOnce({
        id: 'rep-retry-1',
        groupId: 'grp-2',
        groupReportCount: 1,
        targetType: 'NGUOI_DUNG',
        targetId: 'seller-88',
        targetSummary: 'Trần Lan Anh',
        categoryCode: 'NGUOI_DUNG_BO_HEN',
        categoryName: 'Bỏ hẹn / Không hợp tác giao dịch',
        description: 'Bỏ hẹn 2 lần liên tiếp.',
        status: 'CHO_XU_LY',
        imageEvidenceCount: 0,
        hasChatLog: false,
        createdAt: '2026-11-28T07:20:00Z',
        idempotentReplay: false,
      });

    render(<ReportScreen />);
    await screen.findByTestId('report-category-NGUOI_DUNG_BO_HEN');

    fireEvent.press(screen.getByTestId('report-category-NGUOI_DUNG_BO_HEN'));
    fireEvent.changeText(screen.getByTestId('report-description-input'), 'Bỏ hẹn 2 lần liên tiếp.');
    fireEvent.press(screen.getByTestId('report-submit-button'));

    await screen.findByTestId('report-submit-error');
    expect(screen.getByDisplayValue('Bỏ hẹn 2 lần liên tiếp.')).toBeTruthy();

    // Retry submit -> must send exact same clientRequestId
    fireEvent.press(screen.getByTestId('report-submit-button'));
    await screen.findByTestId('report-success-view');

    const postCalls = mockedApi.mock.calls.filter(([path]) => path === '/reports');
    expect(postCalls).toHaveLength(2);
    const req1 = JSON.parse(String(postCalls[0][1]?.body));
    const req2 = JSON.parse(String(postCalls[1][1]?.body));
    expect(req1.clientRequestId).toBe(req2.clientRequestId);
  });

  test('UC-35/36 §3.3: Shows duplicate report warning and invalid evidence error cleanly', async () => {
    setReportParams({
      targetType: 'TIN_DANG',
      targetId: 'listing-99',
      targetTitle: 'Giáo trình Nhập môn Mạng máy tính',
    });

    mockedApi
      .mockResolvedValueOnce({ items: listingCategories })
      .mockResolvedValueOnce({ conversations: [] })
      .mockRejectedValueOnce(
        new ApiError(
          409,
          'Bạn đã gửi báo cáo cho đối tượng và danh mục này; báo cáo trước đó đang được xử lý.',
          'DUPLICATE_REPORT',
        ),
      );

    mockedTakePhoto.mockRejectedValueOnce(new Error('Chỉ hỗ trợ ảnh định dạng JPEG, PNG hoặc WebP.'));

    render(<ReportScreen />);
    await screen.findByTestId('report-category-TIN_DANG_HANG_CAM');

    // Invalid evidence file -> error shown, allows retry
    fireEvent.press(screen.getByTestId('report-camera-button'));
    await screen.findByTestId('report-evidence-error');
    expect(screen.getByText('Chỉ hỗ trợ ảnh định dạng JPEG, PNG hoặc WebP.')).toBeTruthy();

    // Duplicate report -> 409 warning banner
    fireEvent.press(screen.getByTestId('report-category-TIN_DANG_HANG_CAM'));
    fireEvent.changeText(screen.getByTestId('report-description-input'), 'Hàng không hợp lệ');
    fireEvent.press(screen.getByTestId('report-submit-button'));

    await screen.findByTestId('report-submit-error');
    expect(screen.getByText('Báo cáo đang được xử lý')).toBeTruthy();
  });

  test('UC-35/36 §3.2: Cancel button closes form without submitting report', async () => {
    setReportParams({
      targetType: 'TIN_DANG',
      targetId: 'listing-99',
      targetTitle: 'Giáo trình Nhập môn Mạng máy tính',
    });

    mockedApi
      .mockResolvedValueOnce({ items: listingCategories })
      .mockResolvedValueOnce({ conversations: [] });

    render(<ReportScreen />);
    await screen.findByTestId('report-cancel-button');

    fireEvent.press(screen.getByTestId('report-cancel-button'));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
    expect(mockedApi.mock.calls.filter(([path]) => path === '/reports')).toHaveLength(0);
  });

  test('ListingScreen navigates to ReportScreen for both listing (UC-36) and seller (UC-35)', async () => {
    mockRouteParams = { id: 'listing-99' };
    mockedApi.mockResolvedValueOnce(sampleListingDetail);

    render(<ListingScreen />);
    await screen.findByText('Giáo trình Nhập môn Mạng máy tính');

    // UC-36 entry point: report listing button
    fireEvent.press(screen.getByTestId('report-button'));
    expect(mockNavigate).toHaveBeenCalledWith(
      'Report',
      expect.objectContaining({
        targetType: 'TIN_DANG',
        targetId: 'listing-99',
        targetTitle: 'Giáo trình Nhập môn Mạng máy tính',
      }),
    );

    // UC-35 entry point: open seller trust card -> report seller button
    fireEvent.press(screen.getByTestId('seller-trust-card'));
    const reportSellerBtn = await screen.findByTestId('report-seller-button');
    fireEvent.press(reportSellerBtn);
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        'Report',
        expect.objectContaining({
          targetType: 'NGUOI_DUNG',
          targetId: 'seller-88',
          targetTitle: 'Trần Lan Anh',
        }),
      );
    });
  });
});

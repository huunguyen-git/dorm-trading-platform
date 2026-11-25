import React from 'react';
import { Alert } from 'react-native';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { api } from '../api/client';
import { useSession, type User } from '../auth/session';
import { useOrders } from './store';
import { parseMeetingTimeInput, type OrderDetail, type OrderSummary } from './types';
import ReservationRequestScreen from '../screens/ReservationRequestScreen';
import OrdersScreen from '../screens/OrdersScreen';
import OrderDetailScreen from '../screens/OrderDetailScreen';

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

const mockedApi = api as unknown as jest.Mock<(path: string, init?: RequestInit) => Promise<unknown>>;

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

function makeOrderDetail(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: 'order-1',
    listing: {
      id: 'listing-1',
      title: 'Combo Bàn học + Đèn LED',
      listedPriceVnd: 150000,
      listingType: 'BAN_COMBO',
      isCombo: true,
      isFree: false,
      status: 'CONG_KHAI',
      thumbnailUrl: 'https://cdn.example.com/combo.jpg',
      locationName: 'KTX Khu A ĐHQG-HCM',
    },
    seller: { id: 'seller-1', displayName: 'Trần Lan Anh', reputationScore: 120 },
    buyer: { id: 'buyer-1', displayName: 'Nguyễn Minh Quân', reputationScore: 100 },
    agreedPriceVnd: 140000,
    status: 'YEU_CAU',
    note: 'Hẹn tối nay nhé',
    scheduleConfirmed: false,
    meetingTime: null,
    meetingLocation: null,
    proposedMeetingTime: '2026-12-01T11:00:00Z',
    proposedMeetingLocation: 'Cổng KTX Khu A ĐHQG-HCM',
    items: [
      {
        id: 'item-1',
        name: 'Bàn học gấp',
        condition: 'Mới 95%',
        status: 'KHA_DUNG',
        images: [],
        heldByThisOrder: false,
      },
      {
        id: 'item-2',
        name: 'Đèn bàn LED',
        condition: 'Tốt',
        status: 'KHA_DUNG',
        images: [],
        heldByThisOrder: false,
      },
    ],
    pendingScheduleProposal: null,
    scheduleProposals: [],
    cancelledById: null,
    cancelReason: null,
    createdAt: '2026-11-25T10:00:00Z',
    reservedAt: null,
    deliveryStartedAt: null,
    reportedDeliveredAt: null,
    completedAt: null,
    cancelledAt: null,
    updatedAt: '2026-11-25T10:00:00Z',
    version: 0,
    viewer: {
      isBuyer: false,
      isSeller: true,
      canAccept: true,
      canReject: true,
      canCancel: false,
      canProposeSchedule: false,
      canStartDelivery: false,
      requiresPostDeliveryCancel: false,
    },
    ...overrides,
  };
}

function makeOrderSummary(overrides: Partial<OrderSummary> = {}): OrderSummary {
  return {
    id: 'order-1',
    listing: {
      id: 'listing-1',
      title: 'Combo Bàn học + Đèn LED',
      listedPriceVnd: 150000,
      listingType: 'BAN_COMBO',
      isCombo: true,
      isFree: false,
      status: 'GIU_CHO',
      thumbnailUrl: null,
      locationName: 'KTX Khu A ĐHQG-HCM',
    },
    seller: { id: 'seller-1', displayName: 'Trần Lan Anh', reputationScore: 120 },
    buyer: { id: 'buyer-1', displayName: 'Nguyễn Minh Quân', reputationScore: 100 },
    agreedPriceVnd: 140000,
    status: 'GIU_CHO',
    scheduleConfirmed: true,
    meetingTime: '2026-12-01T11:00:00Z',
    meetingLocation: 'Cổng KTX Khu A ĐHQG-HCM',
    proposedMeetingTime: null,
    proposedMeetingLocation: null,
    hasPendingScheduleProposal: false,
    itemCount: 2,
    createdAt: '2026-11-25T10:00:00Z',
    reservedAt: '2026-11-25T10:05:00Z',
    deliveryStartedAt: null,
    reportedDeliveredAt: null,
    cancelledAt: null,
    version: 1,
    ...overrides,
  };
}

describe('P2-04 & P2-05 Mobile Orders, Reservation, Scheduling & Start Delivery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = {};
    useOrders.getState().reset();
    useSession.setState({
      token: 'jwt-token',
      user: buyerUser,
      loading: false,
      restriction: null,
      restrictionDismissed: false,
    });
  });

  test('parseMeetingTimeInput parses valid YYYY-MM-DD HH:mm and rejects malformed values', () => {
    expect(parseMeetingTimeInput('2026-12-01 18:30')).toBeTruthy();
    expect(parseMeetingTimeInput('2026-02-31 18:00')).toBeNull();
    expect(parseMeetingTimeInput('not-a-date')).toBeNull();
  });

  test('UC-22: ReservationRequestScreen warns not-locked, shows combo whole-set note, and submits request', async () => {
    mockRouteParams = {
      listingId: 'listing-1',
      listing: {
        id: 'listing-1',
        title: 'Combo Bàn học + Đèn LED',
        priceVnd: 150000,
        isCombo: true,
        isFree: false,
        itemCount: 2,
        locationName: 'KTX Khu A ĐHQG-HCM',
      },
    };
    const createdOrder = makeOrderDetail({
      viewer: {
        isBuyer: true,
        isSeller: false,
        canAccept: false,
        canReject: false,
        canCancel: true,
        canProposeSchedule: false,
        canStartDelivery: false,
        requiresPostDeliveryCancel: false,
      },
    });
    mockedApi
      .mockResolvedValueOnce({
        id: 'listing-1',
        title: 'Combo Bàn học + Đèn LED',
        priceVnd: 150000,
        isCombo: true,
        isFree: false,
        itemCount: 2,
        locationName: 'KTX Khu A ĐHQG-HCM',
        images: [],
        items: [
          { id: 'item-1', name: 'Bàn học gấp', condition: 'Mới 95%', status: 'KHA_DUNG', images: [] },
          { id: 'item-2', name: 'Đèn bàn LED', condition: 'Tốt', status: 'KHA_DUNG', images: [] },
        ],
        seller: { id: 'seller-1', displayName: 'Trần Lan Anh', reputationScore: 120, averageRating: null, reviewCount: 0 },
        viewer: { isOwner: false, canEdit: false, canWithdraw: false, canDelete: false, canPublish: false, canRenew: false, canMakeOffer: true, canReserve: true, canMessage: true },
        status: 'CONG_KHAI',
        listingType: 'BAN_COMBO',
        description: 'Combo',
        condition: 'Tốt',
        categoryId: 'DO_GIA_DUNG',
        categoryName: 'Đồ gia dụng',
        courseCode: null,
        courseName: null,
        author: null,
        locationCode: 'KTX_KHU_A',
        locationText: null,
        latitude: null,
        longitude: null,
        distanceKm: null,
        thumbnailUrl: null,
        hasUnavailableItems: false,
        publishedAt: null,
        expiresAt: null,
        renewalReminderDue: false,
        renewalCount: 0,
        createdAt: '2026-11-25T10:00:00Z',
        updatedAt: '2026-11-25T10:00:00Z',
        version: 0,
        category: null,
        pendingRequestCount: 0,
        closedAt: null,
        hiddenReason: null,
      })
      .mockResolvedValueOnce(createdOrder);

    render(<ReservationRequestScreen />);

    expect(screen.getByTestId('reservation-not-locked-warning')).toBeTruthy();
    expect(screen.getByTestId('reservation-combo-note')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('reservation-location-input'), 'Cổng KTX Khu A');
    fireEvent.changeText(screen.getByTestId('reservation-note-input'), 'Mình lấy nguyên bộ');
    fireEvent.press(screen.getByTestId('submit-reservation-request'));

    await waitFor(() => {
      expect(mockedApi).toHaveBeenCalledWith(
        '/orders',
        expect.objectContaining({
          method: 'POST',
        }),
      );
      expect(mockReplace).toHaveBeenCalledWith('OrderDetail', {
        id: 'order-1',
        justCreated: true,
      });
    });
  });

  test('UC-23: Seller accepts pending reservation on OrderDetailScreen', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      const confirmBtn = buttons?.find((b) => b.text === 'Chấp nhận giữ chỗ');
      confirmBtn?.onPress?.();
    });
    useSession.setState({ token: 'seller-jwt', user: sellerUser, loading: false });
    mockRouteParams = { id: 'order-1' };

    const pendingOrder = makeOrderDetail();
    const acceptedOrder = makeOrderDetail({
      status: 'GIU_CHO',
      reservedAt: '2026-11-25T10:15:00Z',
      version: 1,
      viewer: {
        isBuyer: false,
        isSeller: true,
        canAccept: false,
        canReject: false,
        canCancel: true,
        canProposeSchedule: true,
        canStartDelivery: false,
        requiresPostDeliveryCancel: false,
      },
    });

    mockedApi.mockResolvedValueOnce(pendingOrder).mockResolvedValueOnce(acceptedOrder);

    render(<OrderDetailScreen />);

    expect(await screen.findByTestId('seller-decision-section')).toBeTruthy();
    fireEvent.press(screen.getByTestId('accept-reservation-button'));

    await waitFor(() => {
      expect(mockedApi).toHaveBeenCalledWith(
        '/orders/order-1/accept',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(screen.getByTestId('order-action-notice')).toBeTruthy();
      expect(screen.getByTestId('start-delivery-button').props.accessibilityState.disabled).toBe(
        true,
      );
    });
    alertSpy.mockRestore();
  });

  test('UC-25 & UC-26: Confirming schedule enables Start Delivery; seller starts delivery cleanly', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      const btn = buttons?.find((b) => b.text === 'Bắt đầu giao hàng');
      btn?.onPress?.();
    });
    useSession.setState({ token: 'seller-jwt', user: sellerUser, loading: false });
    mockRouteParams = { id: 'order-1' };

    const withProposal = makeOrderDetail({
      status: 'GIU_CHO',
      version: 1,
      pendingScheduleProposal: {
        id: 'prop-1',
        orderId: 'order-1',
        proposedById: 'buyer-1',
        proposedByName: 'Nguyễn Minh Quân',
        proposedTime: '2026-12-02T11:00:00Z',
        proposedLocation: 'Nhà Văn hóa Sinh viên ĐHQG',
        note: null,
        status: 'CHO_XAC_NHAN',
        respondedById: null,
        respondedAt: null,
        rejectReason: null,
        createdAt: '2026-11-25T10:20:00Z',
        canConfirm: true,
        canReject: true,
      },
      viewer: {
        isBuyer: false,
        isSeller: true,
        canAccept: false,
        canReject: false,
        canCancel: true,
        canProposeSchedule: true,
        canStartDelivery: false,
        requiresPostDeliveryCancel: false,
      },
    });

    const scheduleConfirmed = makeOrderDetail({
      status: 'GIU_CHO',
      scheduleConfirmed: true,
      meetingTime: '2026-12-02T11:00:00Z',
      meetingLocation: 'Nhà Văn hóa Sinh viên ĐHQG',
      pendingScheduleProposal: null,
      version: 2,
      viewer: {
        isBuyer: false,
        isSeller: true,
        canAccept: false,
        canReject: false,
        canCancel: true,
        canProposeSchedule: true,
        canStartDelivery: true,
        requiresPostDeliveryCancel: false,
      },
    });

    const deliveryStarted = makeOrderDetail({
      ...scheduleConfirmed,
      status: 'DANG_GIAO',
      deliveryStartedAt: '2026-12-02T10:30:00Z',
      version: 3,
      viewer: {
        ...scheduleConfirmed.viewer,
        canStartDelivery: false,
        canCancel: true,
      },
    });

    mockedApi
      .mockResolvedValueOnce(withProposal)
      .mockResolvedValueOnce(scheduleConfirmed)
      .mockResolvedValueOnce(deliveryStarted);

    render(<OrderDetailScreen />);

    expect(await screen.findByTestId('confirm-schedule-button')).toBeTruthy();
    fireEvent.press(screen.getByTestId('confirm-schedule-button'));

    await waitFor(() => {
      expect(screen.getByTestId('confirmed-schedule-banner')).toBeTruthy();
      expect(screen.getByTestId('start-delivery-button').props.accessibilityState.disabled).toBe(
        false,
      );
    });

    fireEvent.press(screen.getByTestId('start-delivery-button'));

    await waitFor(() => {
      expect(mockedApi).toHaveBeenCalledWith(
        '/orders/order-1/start-delivery',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(screen.getByTestId('delivery-started-banner')).toBeTruthy();
    });
    alertSpy.mockRestore();
  });

  test('UC-24 boundary: Post-delivery CHO_XAC_NHAN hides pre-delivery cancel and shows UC-28 notice', async () => {
    mockRouteParams = { id: 'order-1' };
    mockedApi.mockResolvedValueOnce(
      makeOrderDetail({
        status: 'CHO_XAC_NHAN',
        reportedDeliveredAt: '2026-12-02T11:30:00Z',
        viewer: {
          isBuyer: true,
          isSeller: false,
          canAccept: false,
          canReject: false,
          canCancel: false,
          canProposeSchedule: false,
          canStartDelivery: false,
          requiresPostDeliveryCancel: true,
        },
      }),
    );

    render(<OrderDetailScreen />);

    expect(await screen.findByTestId('post-delivery-cancel-notice')).toBeTruthy();
    expect(screen.queryByTestId('cancel-reservation-button')).toBeNull();
  });

  test('OrdersScreen renders unread notifications and orders list, navigating to OrderDetail', async () => {
    mockedApi
      .mockResolvedValueOnce({
        items: [makeOrderSummary()],
        page: 0,
        size: 30,
        totalElements: 1,
        totalPages: 1,
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 'notif-1',
            type: 'LISTING_UPDATED_WITH_PENDING_REQUEST',
            title: 'Tin đăng vừa được cập nhật',
            message: 'Người bán vừa sửa giá.',
            listingId: 'listing-1',
            orderId: 'order-1',
            read: false,
            createdAt: '2026-11-25T10:00:00Z',
          },
        ],
        unreadCount: 1,
        page: 0,
        size: 20,
        totalElements: 1,
        totalPages: 1,
      });

    render(<OrdersScreen />);

    expect(await screen.findByTestId('orders-notifications-section')).toBeTruthy();
    expect(screen.getByTestId('order-card-order-1')).toBeTruthy();

    fireEvent.press(screen.getByTestId('order-card-order-1'));
    expect(mockNavigate).toHaveBeenCalledWith('OrderDetail', { id: 'order-1' });
  });
});

import React from 'react';
import { Alert } from 'react-native';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { api } from '../api/client';
import { useSession, type User } from '../auth/session';
import { useDiscovery } from '../listings/discoveryStore';
import { useSellerListings } from '../listings/sellerStore';
import { useOrders } from './store';
import {
  getOrderStepperState,
  parseMeetingTimeInput,
  type AppNotification,
  type OrderDetail,
  type OrderSummary,
} from './types';
import ReservationRequestScreen from '../screens/ReservationRequestScreen';
import OrdersScreen from '../screens/OrdersScreen';
import OrderDetailScreen from '../screens/OrderDetailScreen';
import ProfileScreen from '../screens/ProfileScreen';
import MyListingsScreen from '../screens/MyListingsScreen';

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

function emitFocusEvent() {
  act(() => {
    for (const listener of Array.from(focusListeners)) {
      listener();
    }
  });
}

function emitBlurEvent() {
  act(() => {
    for (const listener of Array.from(blurListeners)) {
      listener();
    }
  });
}

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native') as Record<string, unknown>;
  return {
    ...actual,
    useNavigation: () => mockNavigation,
    useRoute: () => ({
      params: mockRouteParams,
    }),
    useFocusEffect: (cb: () => void | (() => void)) => {
      const reactLib = require('react');
      reactLib.useEffect(() => cb(), [cb]);
    },
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

function makeListingDetailPayload(overrides: Record<string, unknown> = {}) {
  return {
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
    seller: {
      id: 'seller-1',
      displayName: 'Trần Lan Anh',
      reputationScore: 120,
      averageRating: null,
      reviewCount: 0,
    },
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
    ...overrides,
  };
}

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

function makeNotification(id: string, overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id,
    type: 'LISTING_UPDATED_WITH_PENDING_REQUEST',
    title: `Thông báo ${id}`,
    message: `Nội dung ${id}`,
    listingId: 'listing-1',
    orderId: 'order-1',
    read: false,
    createdAt: '2026-11-25T10:00:00Z',
    ...overrides,
  };
}

describe('P2-04 & P2-05 Mobile Orders, Reservation, Scheduling & Start Delivery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.mockReset();
    focusListeners.clear();
    blurListeners.clear();
    mockRouteParams = {};
    useOrders.getState().reset();
    useDiscovery.getState().reset();
    useSellerListings.getState().reset();
    useSession.setState({
      token: 'jwt-token',
      user: buyerUser,
      loading: false,
      restriction: null,
      restrictionDismissed: false,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('parseMeetingTimeInput and getOrderStepperState handle edge cases cleanly', () => {
    expect(parseMeetingTimeInput('2026-12-01 18:30')).toBeTruthy();
    expect(parseMeetingTimeInput('2026-12-01 18:30:45')).toBeTruthy();
    expect(parseMeetingTimeInput('2026-12-01T18:30:00Z')).toBeTruthy();
    expect(parseMeetingTimeInput('2026-02-31 18:00')).toBeNull();
    expect(parseMeetingTimeInput('2026-12-01 10:99')).toBeNull();
    expect(parseMeetingTimeInput('2026-12-01 25:00')).toBeNull();
    expect(parseMeetingTimeInput('2026-12-01 12:00:75')).toBeNull();
    expect(parseMeetingTimeInput('2026-13-01 10:00')).toBeNull();
    expect(parseMeetingTimeInput('2026-12-01T25:00:00Z')).toBeNull();
    expect(parseMeetingTimeInput('2026-02-31T10:00:00Z')).toBeNull();
    expect(parseMeetingTimeInput('not-a-date')).toBeNull();

    expect(getOrderStepperState(makeOrderDetail({ status: 'YEU_CAU' })).currentStep).toBe(0);
    expect(getOrderStepperState(makeOrderDetail({ status: 'GIU_CHO' })).currentStep).toBe(1);
    expect(getOrderStepperState(makeOrderDetail({ status: 'DANG_GIAO' })).currentStep).toBe(2);
    expect(getOrderStepperState(makeOrderDetail({ status: 'HOAN_TAT' })).currentStep).toBe(4);
    const cancelledAfterDelivery = getOrderStepperState(
      makeOrderDetail({
        status: 'HUY',
        reservedAt: '2026-11-25T10:05:00Z',
        deliveryStartedAt: '2026-11-25T11:00:00Z',
      }),
    );
    expect(cancelledAfterDelivery.cancelled).toBe(true);
    expect(cancelledAfterDelivery.currentStep).toBe(2);
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
      .mockResolvedValueOnce(makeListingDetailPayload())
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

  test('UC-22 validations & alternatives: rejects 2026-02-31, rejects past time, supports cancel goBack, and submits 0đ free listing', async () => {
    mockRouteParams = {
      listingId: 'listing-free',
    };
    mockedApi
      .mockResolvedValueOnce(
        makeListingDetailPayload({
          id: 'listing-free',
          title: 'Tặng đèn học LED',
          priceVnd: 0,
          isFree: true,
          isCombo: false,
          listingType: 'CHO_TANG',
          locationName: 'Cổng KTX Khu B',
        }),
      )
      .mockResolvedValueOnce(
        makeOrderDetail({
          id: 'order-free',
          agreedPriceVnd: 0,
        }),
      );

    render(<ReservationRequestScreen />);

    // Syncs default location from loaded detail when opened without params.listing
    await waitFor(() => {
      expect(screen.getByTestId('reservation-location-input').props.value).toBe('Cổng KTX Khu B');
    });
    expect(screen.getByTestId('reservation-applied-price').props.children).toBe('0đ · Cho tặng');

    // Invalid calendar rollover date 2026-02-31
    fireEvent.changeText(screen.getByTestId('reservation-time-input'), '2026-02-31 18:00');
    fireEvent.press(screen.getByTestId('submit-reservation-request'));
    expect(
      screen.getByText('Định dạng thời gian không hợp lệ. Vui lòng dùng dạng YYYY-MM-DD HH:mm.'),
    ).toBeTruthy();
    expect(mockedApi).toHaveBeenCalledTimes(1);

    // Past time validation
    fireEvent.changeText(screen.getByTestId('reservation-time-input'), '2020-01-01 10:00');
    fireEvent.press(screen.getByTestId('submit-reservation-request'));
    expect(screen.getByText('Thời gian hẹn dự kiến phải ở tương lai.')).toBeTruthy();
    expect(mockedApi).toHaveBeenCalledTimes(1);

    // Cancel returns cleanly
    fireEvent.press(screen.getByTestId('cancel-reservation-request'));
    expect(mockGoBack).toHaveBeenCalledTimes(1);

    // Clear time (optional) and submit free 0đ listing
    fireEvent.changeText(screen.getByTestId('reservation-time-input'), '');
    fireEvent.press(screen.getByTestId('submit-reservation-request'));
    await waitFor(() => {
      const postCall = mockedApi.mock.calls.find((c) => c[0] === '/orders');
      expect(postCall).toBeTruthy();
      expect(JSON.parse(String(postCall?.[1]?.body))).toMatchObject({
        listingId: 'listing-free',
        agreedPriceVnd: 0,
      });
    });
  });

  test('UC-22 exceptions: handles 404 listing not found and unavailable listing with redirect to Listings', async () => {
    mockRouteParams = { listingId: 'missing-listing' };
    const notFoundErr = new Error('Không tìm thấy tin đăng.') as Error & { status?: number };
    notFoundErr.status = 404;
    mockedApi.mockRejectedValueOnce(notFoundErr);

    const { unmount } = render(<ReservationRequestScreen />);
    expect(await screen.findByTestId('reservation-listing-not-found')).toBeTruthy();
    fireEvent.press(screen.getByTestId('reservation-not-found-back'));
    expect(mockNavigate).toHaveBeenCalledWith('Listings');
    unmount();

    mockNavigate.mockClear();
    useDiscovery.getState().reset();
    mockRouteParams = { listingId: 'listing-locked' };
    mockedApi.mockResolvedValueOnce(
      makeListingDetailPayload({
        id: 'listing-locked',
        status: 'GIU_CHO',
        viewer: {
          isOwner: false,
          canEdit: false,
          canWithdraw: false,
          canDelete: false,
          canPublish: false,
          canRenew: false,
          canMakeOffer: false,
          canReserve: false,
          canMessage: true,
        },
      }),
    );

    render(<ReservationRequestScreen />);
    expect(await screen.findByTestId('reservation-unavailable-banner')).toBeTruthy();
    expect(screen.getByTestId('submit-reservation-request').props.accessibilityState.disabled).toBe(
      true,
    );
    fireEvent.press(screen.getByTestId('reservation-back-to-listings'));
    expect(mockNavigate).toHaveBeenCalledWith('Listings');
  });

  test('UC-23: Seller accepts pending reservation on OrderDetailScreen and advances OrderProgressStepper', async () => {
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
    expect(screen.getByTestId('order-progress-stepper').props.accessibilityValue.now).toBe(0);
    fireEvent.press(screen.getByTestId('accept-reservation-button'));

    await waitFor(() => {
      const acceptCall = mockedApi.mock.calls.find((c) => c[0] === '/orders/order-1/accept');
      expect(acceptCall).toBeTruthy();
      expect(acceptCall?.[1]?.method).toBe('POST');
      expect(JSON.parse(String(acceptCall?.[1]?.body))).toEqual({ expectedVersion: 0 });
      expect(screen.getByTestId('order-action-notice')).toBeTruthy();
      expect(screen.getByTestId('order-progress-stepper').props.accessibilityValue.now).toBe(1);
      expect(screen.getByTestId('start-delivery-button').props.accessibilityState.disabled).toBe(
        true,
      );
    });
    alertSpy.mockRestore();
  });

  test('UC-23 A1 & pending unavailability: Seller rejects pending request with reason via BottomSheet', async () => {
    useSession.setState({ token: 'seller-jwt', user: sellerUser, loading: false });
    mockRouteParams = { id: 'order-1' };

    const unavailablePendingOrder = makeOrderDetail({
      items: [
        {
          id: 'item-1',
          name: 'Bàn học gấp',
          condition: 'Mới 95%',
          status: 'DANG_GIU',
          images: [],
          heldByThisOrder: false,
        },
      ],
    });
    const rejectedOrder = makeOrderDetail({
      status: 'HUY',
      cancelReason: 'Đã có người hẹn lấy trước',
      version: 1,
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

    mockedApi.mockResolvedValueOnce(unavailablePendingOrder).mockResolvedValueOnce(rejectedOrder);

    render(<OrderDetailScreen />);

    expect(await screen.findByTestId('order-pending-unavailability-banner')).toBeTruthy();
    fireEvent.press(screen.getByTestId('reject-reservation-button'));
    expect(screen.getByTestId('reject-reservation-sheet')).toBeTruthy();

    fireEvent.changeText(
      screen.getByTestId('seller-reject-reason-input'),
      'Đã có người hẹn lấy trước',
    );
    fireEvent.press(screen.getByTestId('confirm-reject-reservation-button'));

    await waitFor(() => {
      const rejectCall = mockedApi.mock.calls.find((c) => c[0] === '/orders/order-1/reject');
      expect(rejectCall).toBeTruthy();
      expect(JSON.parse(String(rejectCall?.[1]?.body))).toMatchObject({
        reason: 'Đã có người hẹn lấy trước',
        expectedVersion: 0,
      });
      expect(screen.getByTestId('order-cancelled-banner')).toBeTruthy();
    });
  });

  test('UC-24: Buyer withdraws YEU_CAU (sees suggested meeting hint) and cancels DANG_GIAO showing delivery state', async () => {
    useSession.setState({ token: 'buyer-jwt', user: buyerUser, loading: false });
    mockRouteParams = { id: 'order-1' };

    const buyerPendingOrder = makeOrderDetail({
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
    const withdrawnOrder = makeOrderDetail({
      status: 'HUY',
      cancelReason: 'Đổi ý',
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
    });

    mockedApi.mockResolvedValueOnce(buyerPendingOrder).mockResolvedValueOnce(withdrawnOrder);

    const { unmount } = render(<OrderDetailScreen />);
    // Buyer sees initial suggested meeting hint on YEU_CAU too
    expect(await screen.findByText(/Gợi ý ban đầu:/)).toBeTruthy();

    fireEvent.press(screen.getByTestId('cancel-reservation-button'));
    expect(screen.getByTestId('cancel-reservation-sheet')).toBeTruthy();
    expect(screen.getByTestId('cancel-sheet-delivery-state')).toBeTruthy();
    expect(screen.getByText(/Chưa bắt đầu giao hàng/)).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('cancel-reason-input'), 'Đổi ý');
    fireEvent.press(screen.getByTestId('confirm-cancel-reservation-button'));

    await waitFor(() => {
      expect(mockedApi).toHaveBeenCalledWith(
        '/orders/order-1/cancel',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    unmount();

    // UC-24 A3: Cancel while DANG_GIAO (pre-delivery) explicitly shows delivery started state
    useOrders.getState().reset();
    mockedApi
      .mockResolvedValueOnce(
        makeOrderDetail({
          status: 'DANG_GIAO',
          reservedAt: '2026-11-25T10:15:00Z',
          deliveryStartedAt: '2026-12-02T10:30:00Z',
          scheduleConfirmed: true,
          meetingTime: '2026-12-02T11:00:00Z',
          meetingLocation: 'Cổng KTX Khu A',
          version: 3,
          viewer: {
            isBuyer: true,
            isSeller: false,
            canAccept: false,
            canReject: false,
            canCancel: true,
            canProposeSchedule: true,
            canStartDelivery: false,
            requiresPostDeliveryCancel: false,
          },
        }),
      )
      .mockResolvedValueOnce(
        makeOrderDetail({
          status: 'HUY',
          version: 4,
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
        }),
      );

    render(<OrderDetailScreen />);
    await screen.findByTestId('delivery-started-banner');
    fireEvent.press(screen.getByTestId('cancel-reservation-button'));
    expect(screen.getByText(/Đã bắt đầu giao hàng lúc/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('confirm-cancel-reservation-button'));

    await waitFor(() => {
      expect(mockedApi).toHaveBeenCalledWith(
        '/orders/order-1/cancel',
        expect.objectContaining({ method: 'POST' }),
      );
    });
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
      expect(screen.getByTestId('order-progress-stepper').props.accessibilityValue.now).toBe(2);
    });
    alertSpy.mockRestore();
  });

  test('UC-25 schedule BottomSheet validation, proposal submission, waiting state, reject A1 & history list', async () => {
    useSession.setState({ token: 'seller-jwt', user: sellerUser, loading: false });
    mockRouteParams = { id: 'order-1' };

    const reservedWithIncomingProposal = makeOrderDetail({
      status: 'GIU_CHO',
      version: 1,
      pendingScheduleProposal: {
        id: 'prop-2',
        orderId: 'order-1',
        proposedById: 'buyer-1',
        proposedByName: 'Nguyễn Minh Quân',
        proposedTime: '2026-12-02T11:00:00Z',
        proposedLocation: 'Cổng KTX Khu A',
        note: null,
        status: 'CHO_XAC_NHAN',
        respondedById: null,
        respondedAt: null,
        rejectReason: null,
        createdAt: '2026-11-25T10:20:00Z',
        canConfirm: true,
        canReject: true,
      },
      scheduleProposals: [
        {
          id: 'prop-1',
          orderId: 'order-1',
          proposedById: 'buyer-1',
          proposedByName: 'Nguyễn Minh Quân',
          proposedTime: '2026-12-01T11:00:00Z',
          proposedLocation: 'Cổng UIT',
          note: null,
          status: 'TU_CHOI',
          respondedById: 'seller-1',
          respondedAt: '2026-11-25T10:15:00Z',
          rejectReason: 'Bận thi giữa kỳ',
          createdAt: '2026-11-25T10:10:00Z',
          canConfirm: false,
          canReject: false,
        },
      ],
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

    const afterReject = makeOrderDetail({
      ...reservedWithIncomingProposal,
      pendingScheduleProposal: null,
      version: 2,
    });

    const afterSellerProposes = makeOrderDetail({
      ...afterReject,
      version: 3,
      pendingScheduleProposal: {
        id: 'prop-3',
        orderId: 'order-1',
        proposedById: 'seller-1',
        proposedByName: 'Trần Lan Anh',
        proposedTime: '2026-12-03T11:00:00Z',
        proposedLocation: 'Nhà Văn hóa Sinh viên ĐHQG',
        note: 'Gặp trước sảnh',
        status: 'CHO_XAC_NHAN',
        respondedById: null,
        respondedAt: null,
        rejectReason: null,
        createdAt: '2026-11-25T10:30:00Z',
        canConfirm: false,
        canReject: false,
      },
    });

    mockedApi
      .mockResolvedValueOnce(reservedWithIncomingProposal)
      .mockResolvedValueOnce(afterReject)
      .mockResolvedValueOnce(afterSellerProposes);

    render(<OrderDetailScreen />);

    // Renders schedule proposal history
    expect(await screen.findByTestId('schedule-history-list')).toBeTruthy();
    expect(screen.getByText(/Bận thi giữa kỳ/)).toBeTruthy();

    // UC-25 A1: Reject incoming proposal with custom reason AND jump directly to counter-proposal sheet
    fireEvent.press(screen.getByTestId('reject-schedule-button'));
    expect(screen.getByTestId('reject-schedule-sheet')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('schedule-reject-reason-input'), 'Bận giờ đó rồi');
    fireEvent.press(screen.getByTestId('reject-and-counter-propose-button'));

    await waitFor(() => {
      expect(mockedApi).toHaveBeenCalledWith(
        '/orders/order-1/schedules/prop-2/reject',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ reason: 'Bận giờ đó rồi' }),
        }),
      );
      expect(screen.getByTestId('schedule-proposal-sheet')).toBeTruthy();
    });

    // Inline validation inside schedule sheet (past date & blank location)
    fireEvent.changeText(screen.getByTestId('schedule-time-input'), '2020-01-01 10:00');
    fireEvent.press(screen.getByTestId('submit-schedule-proposal-button'));
    expect(screen.getByText('Thời gian hẹn giao nhận phải ở tương lai.')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('schedule-time-input'), '2026-12-03 18:00');
    fireEvent.changeText(screen.getByTestId('schedule-location-input'), '   ');
    fireEvent.press(screen.getByTestId('submit-schedule-proposal-button'));
    expect(screen.getByText('Vui lòng nhập địa điểm giao nhận.')).toBeTruthy();

    // Pick quick location chip & submit valid proposal
    fireEvent.press(screen.getByTestId('schedule-loc-chip-2'));
    fireEvent.changeText(screen.getByTestId('schedule-note-input'), 'Gặp trước sảnh');
    fireEvent.press(screen.getByTestId('submit-schedule-proposal-button'));

    await waitFor(() => {
      expect(mockedApi).toHaveBeenCalledWith(
        '/orders/order-1/schedules',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(screen.getByTestId('waiting-counterparty-schedule')).toBeTruthy();
    });
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

  test('OrdersScreen supports notifications (>3 toggle, dismiss, mark-all), UnderlineTabs, SegmentedControl, listingId filter & filtered reset', async () => {
    mockRouteParams = {
      initialRole: 'SELLER',
      initialStatus: 'YEU_CAU',
      listingId: 'listing-1',
      listingTitle: 'Combo Bàn học + Đèn LED',
    };
    const fourUnread = [
      makeNotification('n-1'),
      makeNotification('n-2'),
      makeNotification('n-3'),
      makeNotification('n-4'),
    ];

    mockedApi.mockImplementation(async (path: string) => {
      if (path.startsWith('/notifications/n-1/read')) {
        return { ...fourUnread[0], read: true };
      }
      if (path.startsWith('/notifications/read-all')) {
        return { updatedCount: 3 };
      }
      if (path.startsWith('/notifications')) {
        return {
          items: fourUnread,
          unreadCount: 4,
          page: 0,
          size: 20,
          totalElements: 4,
          totalPages: 1,
        };
      }
      if (path.includes('status=CHO_XAC_NHAN')) {
        return { items: [], page: 0, size: 30, totalElements: 0, totalPages: 0 };
      }
      return {
        items: [makeOrderSummary()],
        page: 0,
        size: 30,
        totalElements: 1,
        totalPages: 1,
      };
    });

    render(<OrdersScreen />);

    expect(await screen.findByTestId('orders-notifications-section')).toBeTruthy();
    expect(screen.getByTestId('orders-listing-filter-chip')).toBeTruthy();
    expect(screen.getByTestId('order-card-order-1')).toBeTruthy();

    // Initially shows 3 unread alerts and expands to 4th on toggle
    expect(screen.queryByTestId('notification-item-n-4')).toBeNull();
    fireEvent.press(screen.getByTestId('toggle-all-notifications'));
    expect(screen.getByTestId('notification-item-n-4')).toBeTruthy();

    // Dismiss single notification (reduce-motion triggers immediate mark-read)
    fireEvent.press(screen.getByTestId('notification-dismiss-n-1'));
    await waitFor(() => {
      expect(mockedApi).toHaveBeenCalledWith(
        '/notifications/n-1/read',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    // Mark all read
    fireEvent.press(screen.getByTestId('mark-all-notifications-read'));
    await waitFor(() => {
      expect(mockedApi).toHaveBeenCalledWith(
        '/notifications/read-all',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    // Switch role & status UnderlineTabs (CHO_XAC_NHAN -> filtered empty state -> Xóa bộ lọc)
    fireEvent.press(screen.getByTestId('orders-role-buyer'));
    fireEvent.press(screen.getByTestId('orders-status-CHO_XAC_NHAN'));
    expect(await screen.findByTestId('orders-empty-reset-filters')).toBeTruthy();
    fireEvent.press(screen.getByTestId('orders-empty-reset-filters'));
    expect(await screen.findByTestId('order-card-order-1')).toBeTruthy();

    // Tapping order navigates to OrderDetail
    fireEvent.press(screen.getByTestId('order-card-order-1'));
    expect(mockNavigate).toHaveBeenCalledWith('OrderDetail', { id: 'order-1' });
  });

  test('ProfileScreen loads unread order notifications badge and MyListingsScreen links GIU_CHO listings to Orders with initialStatus ALL', async () => {
    useSession.setState({ token: 'seller-jwt', user: sellerUser, loading: false });
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
          reputation: 120,
          emailVerified: true,
          profileApproved: true,
          profileStatus: 'DA_DUYET',
          rejectReason: null,
          pendingUpdate: false,
          hasStudentCard: false,
          accountStatus: 'HOAT_DONG',
        };
      }
      if (path === '/auth/me') {
        return sellerUser;
      }
      if (path.startsWith('/notifications')) {
        return {
          items: [makeNotification('n-1'), makeNotification('n-2'), makeNotification('n-3')],
          unreadCount: 3,
          page: 0,
          size: 20,
          totalElements: 3,
          totalPages: 1,
        };
      }
      if (path.startsWith('/listings/quota')) {
        return {
          reputationScore: 120,
          activeCount: 1,
          limit: 10,
          remaining: 9,
          canPublish: true,
          highTierThreshold: 120,
          standardLimit: 5,
          highTierLimit: 10,
        };
      }
      if (path.startsWith('/listings/mine')) {
        return {
          items: [
            {
              id: 'tin-giu-cho',
              title: 'Bàn học KTX Khu A',
              description: 'Mới 95%',
              condition: 'Mới 95%',
              priceVnd: 150000,
              listingType: 'BAN_LE',
              isCombo: false,
              isFree: false,
              status: 'GIU_CHO',
              categoryId: 'DO_GIA_DUNG',
              categoryName: 'Đồ gia dụng',
              courseCode: null,
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
                reputationScore: 120,
                averageRating: null,
                reviewCount: 0,
              },
              hasUnavailableItems: false,
              publishedAt: '2026-11-20T00:00:00Z',
              expiresAt: '2026-12-20T00:00:00Z',
              renewalReminderDue: false,
              renewalCount: 0,
              createdAt: '2026-11-20T00:00:00Z',
              updatedAt: '2026-11-20T00:00:00Z',
              version: 1,
            },
          ],
          page: 0,
          size: 20,
          totalElements: 1,
          totalPages: 1,
          quota: {
            reputationScore: 120,
            activeCount: 1,
            limit: 10,
            remaining: 9,
            canPublish: true,
            highTierThreshold: 120,
            standardLimit: 5,
            highTierLimit: 10,
          },
        };
      }
      return {};
    });

    const { unmount } = render(<ProfileScreen />);
    const orderShortcuts = await screen.findAllByTestId('profile-shortcut-orders');
    expect(orderShortcuts).toHaveLength(1);
    const unreadBadge = await screen.findByTestId('profile-orders-unread-badge');
    expect(unreadBadge).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(
      mockedApi.mock.calls.some((call) => String(call[0]).startsWith('/notifications?')),
    ).toBe(true);
    fireEvent.press(orderShortcuts[0]);
    expect(mockNavigate).toHaveBeenCalledWith('Orders');
    unmount();

    mockNavigate.mockClear();
    render(<MyListingsScreen />);
    expect(await screen.findByTestId('my-listings-orders-btn')).toBeTruthy();
    fireEvent.press(screen.getByTestId('my-listings-orders-btn'));
    expect(mockNavigate).toHaveBeenCalledWith('Orders', { initialRole: 'SELLER' });

    fireEvent.press(await screen.findByTestId('my-listing-view-order-tin-giu-cho'));
    expect(mockNavigate).toHaveBeenCalledWith('Orders', {
      initialRole: 'SELLER',
      initialStatus: 'ALL',
      listingId: 'tin-giu-cho',
      listingTitle: 'Bàn học KTX Khu A',
    });

    mockNavigate.mockClear();
    fireEvent.press(screen.getByTestId('my-listing-more-tin-giu-cho'));
    fireEvent.press(screen.getByTestId('action-sheet-orders-tin-giu-cho'));
    expect(mockNavigate).toHaveBeenCalledWith('Orders', {
      initialRole: 'SELLER',
      initialStatus: 'ALL',
      listingId: 'tin-giu-cho',
      listingTitle: 'Bàn học KTX Khu A',
    });
  });

  test('logout clears useOrders store cleanly', async () => {
    useOrders.setState({
      orders: [makeOrderSummary()],
      selectedOrder: makeOrderDetail(),
      unreadCount: 2,
      listingIdFilter: 'listing-1',
    });
    mockedApi.mockResolvedValueOnce({});

    await act(async () => {
      await useSession.getState().logout();
    });

    const state = useOrders.getState();
    expect(state.orders).toHaveLength(0);
    expect(state.selectedOrder).toBeNull();
    expect(state.unreadCount).toBe(0);
    expect(state.listingIdFilter).toBeNull();
  });

  test('OrdersScreen resets stale listingId/role/status filters when opened without route params', async () => {
    useOrders.setState({
      roleFilter: 'SELLER',
      statusFilter: 'YEU_CAU',
      listingIdFilter: 'stale-listing',
      listingTitleFilter: 'Tin cũ',
    });
    mockRouteParams = {};
    mockedApi.mockImplementation(async (path: string) => {
      if (path.startsWith('/notifications')) {
        return { items: [], unreadCount: 0, page: 0, size: 20, totalElements: 0, totalPages: 0 };
      }
      return { items: [makeOrderSummary()], page: 0, size: 30, totalElements: 1, totalPages: 1 };
    });

    render(<OrdersScreen />);

    await waitFor(() => {
      const orderCalls = mockedApi.mock.calls
        .map((c) => String(c[0]))
        .filter((p) => p.startsWith('/orders?'));
      expect(orderCalls.length).toBeGreaterThan(0);
      expect(orderCalls[0]).toContain('role=ALL');
      expect(orderCalls[0]).not.toContain('listingId=');
      expect(orderCalls[0]).not.toContain('status=');
    });
    expect(screen.queryByTestId('orders-listing-filter-chip')).toBeNull();
  });

  test('OrderDetailScreen displays server conflict errors directly inside open BottomSheet', async () => {
    useSession.setState({ token: 'buyer-jwt', user: buyerUser, loading: false });
    mockRouteParams = { id: 'order-1' };

    const reservedOrder = makeOrderDetail({
      status: 'GIU_CHO',
      version: 1,
      viewer: {
        isBuyer: true,
        isSeller: false,
        canAccept: false,
        canReject: false,
        canCancel: true,
        canProposeSchedule: true,
        canStartDelivery: false,
        requiresPostDeliveryCancel: false,
      },
    });
    const conflictErr = new Error('Người bán đã báo đã giao, cần chuyển sang UC-28.') as Error & {
      status?: number;
      code?: string;
    };
    conflictErr.status = 409;
    conflictErr.code = 'POST_DELIVERY_CANCELLATION_REQUIRED';

    mockedApi.mockResolvedValueOnce(reservedOrder).mockRejectedValueOnce(conflictErr);

    render(<OrderDetailScreen />);

    fireEvent.press(await screen.findByTestId('cancel-reservation-button'));
    expect(screen.getByTestId('cancel-reservation-sheet')).toBeTruthy();

    fireEvent.press(screen.getByTestId('confirm-cancel-reservation-button'));

    expect(await screen.findByTestId('cancel-sheet-error')).toBeTruthy();
    expect(
      screen.getAllByText('Người bán đã báo đã giao, cần chuyển sang UC-28.').length,
    ).toBeGreaterThanOrEqual(1);
  });

  test('OrdersScreen gates CHO_KICH_HOAT, VO_HIEU_HOA, unverified email, and unapproved profile without calling /orders', () => {
    const gatedUsers: User[] = [
      { ...buyerUser, accountStatus: 'CHO_KICH_HOAT' },
      { ...buyerUser, accountStatus: 'VO_HIEU_HOA' },
      { ...buyerUser, emailVerified: false },
      { ...buyerUser, profileApproved: false },
    ];

    for (const gatedUser of gatedUsers) {
      mockedApi.mockClear();
      useSession.setState({
        token: 'jwt-token',
        user: gatedUser,
        loading: false,
        restriction: null,
        restrictionDismissed: false,
      });

      const { unmount } = render(<OrdersScreen />);
      expect(screen.getByText('Tài khoản chưa kích hoạt')).toBeTruthy();
      expect(mockedApi).not.toHaveBeenCalled();
      unmount();
    }
  });

  test('useOrders ignores stale out-of-order responses and discards in-flight responses finishing after reset()/logout()', async () => {
    // 1. Out-of-order loadOrders (older tab resolves after newer tab, and older error does not clobber newer success)
    let resolveOlderOrders!: (v: unknown) => void;
    let resolveNewerOrders!: (v: unknown) => void;
    mockedApi
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOlderOrders = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveNewerOrders = resolve;
          }),
      );

    const pOlder = useOrders.getState().loadOrders({ status: 'YEU_CAU' });
    const pNewer = useOrders.getState().loadOrders({ status: 'DANG_GIAO' });

    resolveNewerOrders({
      items: [makeOrderSummary({ id: 'order-newer', status: 'DANG_GIAO' })],
      page: 0,
      size: 30,
      totalElements: 1,
      totalPages: 1,
    });
    await pNewer;

    resolveOlderOrders({
      items: [makeOrderSummary({ id: 'order-older', status: 'YEU_CAU' })],
      page: 0,
      size: 30,
      totalElements: 1,
      totalPages: 1,
    });
    await pOlder;

    expect(useOrders.getState().orders).toHaveLength(1);
    expect(useOrders.getState().orders[0].id).toBe('order-newer');
    expect(useOrders.getState().statusFilter).toBe('DANG_GIAO');

    // 2. Stale error from older request must not overwrite newer error/loading state
    let rejectOlderErr!: (e: Error) => void;
    let resolveNewerOk!: (v: unknown) => void;
    mockedApi
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectOlderErr = reject;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveNewerOk = resolve;
          }),
      );

    const pErr = useOrders.getState().loadOrders({ status: 'HUY' });
    const pOk = useOrders.getState().loadOrders({ status: 'HOAN_TAT' });
    resolveNewerOk({
      items: [makeOrderSummary({ id: 'order-done', status: 'HOAN_TAT' })],
      page: 0,
      size: 30,
      totalElements: 1,
      totalPages: 1,
    });
    await pOk;

    rejectOlderErr(new Error('Stale network failure'));
    await pErr;

    expect(useOrders.getState().error).toBeNull();
    expect(useOrders.getState().orders[0].id).toBe('order-done');

    // 3. In-flight loadOrders, loadOrderDetail & loadNotifications resolving after logout()/reset() must NEVER leak data
    let resolveOrdersAfterLogout!: (v: unknown) => void;
    let resolveDetailAfterLogout!: (v: unknown) => void;
    let resolveNotifsAfterLogout!: (v: unknown) => void;
    mockedApi
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOrdersAfterLogout = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveDetailAfterLogout = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveNotifsAfterLogout = resolve;
          }),
      )
      .mockResolvedValueOnce({}); // /auth/logout

    const pList = useOrders.getState().loadOrders({ status: 'ALL' });
    const pDetail = useOrders.getState().loadOrderDetail('order-secret');
    const pNotif = useOrders.getState().loadNotifications();

    await act(async () => {
      await useSession.getState().logout();
    });

    resolveOrdersAfterLogout({
      items: [makeOrderSummary({ id: 'leaked-order' })],
      page: 0,
      size: 30,
      totalElements: 1,
      totalPages: 1,
    });
    resolveDetailAfterLogout(makeOrderDetail({ id: 'order-secret' }));
    resolveNotifsAfterLogout({
      items: [makeNotification('leaked-notif')],
      unreadCount: 5,
      page: 0,
      size: 20,
      totalElements: 1,
      totalPages: 1,
    });

    await Promise.all([pList, pDetail, pNotif]);

    const afterState = useOrders.getState();
    expect(afterState.orders).toHaveLength(0);
    expect(afterState.selectedOrder).toBeNull();
    expect(afterState.notifications).toHaveLength(0);
    expect(afterState.unreadCount).toBe(0);
    expect(afterState.loading).toBe(false);
    expect(afterState.detailLoading).toBe(false);
  });

  test('ReservationRequestScreen blocks submit when !preview after network error, recovers on retry, and blocks 0đ on paid listings', async () => {
    // 1. Opened with only { listingId } and loadDetail fails with non-404 network error
    mockRouteParams = { listingId: 'listing-net-err' };
    mockedApi
      .mockRejectedValueOnce(new Error('Không thể kết nối máy chủ.'))
      .mockResolvedValueOnce(makeListingDetailPayload({ id: 'listing-net-err', priceVnd: 150000 }));

    const { unmount } = render(<ReservationRequestScreen />);

    expect(await screen.findByTestId('reservation-detail-error-banner')).toBeTruthy();
    expect(screen.getByTestId('reservation-sticky-price').props.children).toBe('—');
    expect(screen.getByTestId('submit-reservation-request').props.accessibilityState.disabled).toBe(
      true,
    );

    // Pressing disabled submit must NOT post agreedPriceVnd: 0
    fireEvent.press(screen.getByTestId('submit-reservation-request'));
    expect(mockedApi).toHaveBeenCalledTimes(1);
    expect(mockedApi.mock.calls.some((c) => c[0] === '/orders')).toBe(false);

    // Pressing retry loads preview and unblocks submit
    fireEvent.press(screen.getByTestId('reservation-detail-retry-button'));
    expect(await screen.findByTestId('reservation-listing-summary')).toBeTruthy();
    expect(screen.getByTestId('submit-reservation-request').props.accessibilityState.disabled).toBe(
      false,
    );
    unmount();

    // 2. Paid listing with agreedPriceVnd === 0 displays validation error and blocks submit without labeling Cho tặng
    useDiscovery.getState().reset();
    mockedApi.mockClear();
    mockRouteParams = {
      listingId: 'listing-paid',
      listing: {
        id: 'listing-paid',
        title: 'Quạt đứng Senko',
        priceVnd: 150000,
        isCombo: false,
        isFree: false,
        itemCount: 1,
        locationName: 'KTX Khu A ĐHQG-HCM',
      },
      agreedPriceVnd: 0,
    };
    mockedApi.mockResolvedValueOnce(
      makeListingDetailPayload({
        id: 'listing-paid',
        title: 'Quạt đứng Senko',
        priceVnd: 150000,
        isCombo: false,
        isFree: false,
      }),
    );

    render(<ReservationRequestScreen />);

    expect(await screen.findByTestId('reservation-price-error')).toBeTruthy();
    expect(screen.getByText('Tin có phí không thể đặt giá 0đ.')).toBeTruthy();
    expect(screen.getByTestId('reservation-applied-price').props.children).toBe('0đ');
    expect(screen.queryByText(/Cho tặng/)).toBeNull();
    expect(screen.getByTestId('submit-reservation-request').props.accessibilityState.disabled).toBe(
      true,
    );
    fireEvent.press(screen.getByTestId('submit-reservation-request'));
    expect(mockedApi.mock.calls.some((c) => c[0] === '/orders')).toBe(false);
  });

  test('OrderDetailScreen & OrdersScreen only label Cho tặng for free listings, show listedPriceVnd when different, and render DA_XOA items', async () => {
    // 1. OrderDetailScreen with paid listing having agreedPriceVnd: 0 + deleted snapshot item DA_XOA
    useSession.setState({ token: 'buyer-jwt', user: buyerUser, loading: false });
    mockRouteParams = { id: 'order-paid-zero' };
    mockedApi.mockResolvedValueOnce(
      makeOrderDetail({
        id: 'order-paid-zero',
        agreedPriceVnd: 0,
        status: 'HUY',
        listing: {
          id: 'listing-1',
          title: 'Bàn học gấp gỗ',
          listedPriceVnd: 150000,
          listingType: 'BAN_LE',
          isCombo: false,
          isFree: false,
          status: 'DA_RUT',
          thumbnailUrl: null,
          locationName: 'KTX Khu A',
        },
        items: [
          {
            id: 'item-deleted',
            name: 'Bàn học gấp cũ',
            condition: 'Tốt 90%',
            status: 'DA_XOA',
            images: [],
            heldByThisOrder: false,
          },
        ],
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
      }),
    );

    const { unmount: unmountPaidDetail } = render(<OrderDetailScreen />);
    expect(await screen.findByTestId('order-detail-agreed-price')).toBeTruthy();
    expect(screen.getByTestId('order-detail-agreed-price').props.children).toBe(
      'Giá thỏa thuận: 0đ',
    );
    expect(screen.getByTestId('order-detail-listed-price')).toBeTruthy();
    expect(screen.getByText(/Giá niêm yết:\s*150\.000đ/)).toBeTruthy();
    expect(screen.queryByText(/Cho tặng/)).toBeNull();
    expect(screen.getByTestId('order-item-status-item-deleted')).toBeTruthy();
    expect(screen.getByText('Đã xóa khỏi kho')).toBeTruthy();
    unmountPaidDetail();

    // 2. OrderDetailScreen with genuinely free listing shows Cho tặng and hides redundant listed price
    useOrders.getState().reset();
    mockRouteParams = { id: 'order-free-1' };
    mockedApi.mockResolvedValueOnce(
      makeOrderDetail({
        id: 'order-free-1',
        agreedPriceVnd: 0,
        listing: {
          id: 'listing-free',
          title: 'Tặng đèn bàn học',
          listedPriceVnd: 0,
          listingType: 'CHO_TANG',
          isCombo: false,
          isFree: true,
          status: 'CONG_KHAI',
          thumbnailUrl: null,
          locationName: 'KTX Khu B',
        },
      }),
    );
    const { unmount: unmountFreeDetail } = render(<OrderDetailScreen />);
    expect(await screen.findByTestId('order-detail-agreed-price')).toBeTruthy();
    expect(screen.getByTestId('order-detail-agreed-price').props.children).toBe('0đ · Cho tặng');
    expect(screen.queryByTestId('order-detail-listed-price')).toBeNull();
    unmountFreeDetail();

    // 3. OrdersScreen renders negotiated/0đ paid order vs genuine free listing cleanly
    useOrders.getState().reset();
    mockRouteParams = {};
    mockedApi.mockImplementation(async (path: string) => {
      if (path.startsWith('/notifications')) {
        return { items: [], unreadCount: 0, page: 0, size: 20, totalElements: 0, totalPages: 0 };
      }
      return {
        items: [
          makeOrderSummary({
            id: 'order-paid-zero',
            agreedPriceVnd: 0,
            listing: {
              id: 'listing-paid',
              title: 'Nồi cơm mini',
              listedPriceVnd: 200000,
              listingType: 'BAN_LE',
              isCombo: false,
              isFree: false,
              status: 'GIU_CHO',
              thumbnailUrl: null,
              locationName: 'KTX Khu A',
            },
          }),
          makeOrderSummary({
            id: 'order-free-row',
            agreedPriceVnd: 0,
            listing: {
              id: 'listing-free',
              title: 'Tặng sổ tay SE100',
              listedPriceVnd: 0,
              listingType: 'CHO_TANG',
              isCombo: false,
              isFree: true,
              status: 'GIU_CHO',
              thumbnailUrl: null,
              locationName: 'KTX Khu B',
            },
          }),
        ],
        page: 0,
        size: 30,
        totalElements: 2,
        totalPages: 1,
      };
    });

    render(<OrdersScreen />);
    expect(await screen.findByTestId('order-price-order-paid-zero')).toBeTruthy();
    expect(screen.getByTestId('order-price-order-paid-zero').props.children).toBe(
      'Giá thỏa thuận: 0đ',
    );
    expect(screen.getByTestId('order-listed-price-order-paid-zero')).toBeTruthy();
    expect(screen.getByText(/Giá niêm yết:\s*200\.000đ/)).toBeTruthy();
    expect(screen.getByTestId('order-price-order-free-row').props.children).toBe('0đ · Cho tặng');
    expect(screen.queryByTestId('order-listed-price-order-free-row')).toBeNull();
  });

  test('OrdersScreen and OrderDetailScreen avoid duplicate API calls on initial mount + focus while refreshing on return focus', async () => {
    // 1. OrdersScreen
    mockRouteParams = {};
    mockedApi.mockImplementation(async (path: string) => {
      if (path.startsWith('/notifications')) {
        return { items: [], unreadCount: 0, page: 0, size: 20, totalElements: 0, totalPages: 0 };
      }
      return {
        items: [makeOrderSummary()],
        page: 0,
        size: 30,
        totalElements: 1,
        totalPages: 1,
      };
    });

    const { unmount: unmountOrders } = render(<OrdersScreen />);
    expect(await screen.findByTestId('order-card-order-1')).toBeTruthy();

    // Simulate React Navigation emitting initial focus immediately after mount
    emitFocusEvent();
    await waitFor(() => {
      const orderCalls = mockedApi.mock.calls.filter((c) => String(c[0]).startsWith('/orders?'));
      const notifCalls = mockedApi.mock.calls.filter((c) =>
        String(c[0]).startsWith('/notifications?'),
      );
      expect(orderCalls).toHaveLength(1);
      expect(notifCalls).toHaveLength(1);
    });

    // Simulate navigating away and returning (blur -> focus)
    emitBlurEvent();
    emitFocusEvent();
    await waitFor(() => {
      const orderCalls = mockedApi.mock.calls.filter((c) => String(c[0]).startsWith('/orders?'));
      const notifCalls = mockedApi.mock.calls.filter((c) =>
        String(c[0]).startsWith('/notifications?'),
      );
      expect(orderCalls).toHaveLength(2);
      expect(notifCalls).toHaveLength(2);
    });
    unmountOrders();

    // 2. OrderDetailScreen
    mockedApi.mockClear();
    focusListeners.clear();
    blurListeners.clear();
    useOrders.getState().reset();
    mockRouteParams = { id: 'order-1' };
    mockedApi.mockResolvedValue(makeOrderDetail());

    render(<OrderDetailScreen />);
    expect(await screen.findByTestId('order-status-card')).toBeTruthy();

    // Immediate initial focus right after mount must NOT re-fetch
    emitFocusEvent();
    expect(mockedApi).toHaveBeenCalledTimes(1);

    // Returning from another screen triggers refresh
    emitBlurEvent();
    emitFocusEvent();
    await waitFor(() => {
      expect(mockedApi).toHaveBeenCalledTimes(2);
    });
  });

  test('useOrders resets automatically and discards in-flight requests when useSession clears token (401/revocation)', async () => {
    useOrders.setState({
      orders: [makeOrderSummary({ id: 'order-before-revoke' })],
      selectedOrder: makeOrderDetail({ id: 'order-before-revoke' }),
      notifications: [makeNotification('notif-before-revoke')],
      unreadCount: 3,
      listingIdFilter: 'listing-1',
    });

    // Token refresh for the same user must NOT clear cached orders
    act(() => {
      useSession.setState({ token: 'jwt-token-refreshed', user: buyerUser, loading: false });
    });
    expect(useOrders.getState().orders).toHaveLength(1);
    expect(useOrders.getState().unreadCount).toBe(3);

    // Start in-flight list, detail, and notifications requests before token revocation
    let resolveRevokedOrders!: (v: unknown) => void;
    let resolveRevokedDetail!: (v: unknown) => void;
    let resolveRevokedNotifs!: (v: unknown) => void;
    mockedApi
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRevokedOrders = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRevokedDetail = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRevokedNotifs = resolve;
          }),
      );

    const pList = useOrders.getState().loadOrders({ status: 'ALL' });
    const pDetail = useOrders.getState().loadOrderDetail('order-revoked');
    const pNotif = useOrders.getState().loadNotifications();

    // Simulate 401/204 session revocation directly clearing token without calling logout()
    act(() => {
      useSession.setState({ token: null, user: null, loading: false });
    });

    const immediatelyCleared = useOrders.getState();
    expect(immediatelyCleared.orders).toHaveLength(0);
    expect(immediatelyCleared.selectedOrder).toBeNull();
    expect(immediatelyCleared.notifications).toHaveLength(0);
    expect(immediatelyCleared.unreadCount).toBe(0);
    expect(immediatelyCleared.listingIdFilter).toBeNull();
    expect(immediatelyCleared.loading).toBe(false);
    expect(immediatelyCleared.detailLoading).toBe(false);

    // Late in-flight responses from revoked session must be discarded via bumped sessionEpoch
    resolveRevokedOrders({
      items: [makeOrderSummary({ id: 'leaked-after-revoke' })],
      page: 0,
      size: 30,
      totalElements: 1,
      totalPages: 1,
    });
    resolveRevokedDetail(makeOrderDetail({ id: 'order-revoked' }));
    resolveRevokedNotifs({
      items: [makeNotification('leaked-notif-revoke')],
      unreadCount: 4,
      page: 0,
      size: 20,
      totalElements: 1,
      totalPages: 1,
    });

    await Promise.all([pList, pDetail, pNotif]);

    const finalState = useOrders.getState();
    expect(finalState.orders).toHaveLength(0);
    expect(finalState.selectedOrder).toBeNull();
    expect(finalState.notifications).toHaveLength(0);
    expect(finalState.unreadCount).toBe(0);
    expect(finalState.loading).toBe(false);
    expect(finalState.detailLoading).toBe(false);
  });

  test('useOrders resets automatically and discards in-flight requests when useSession switches to a different user.id', async () => {
    useOrders.setState({
      orders: [makeOrderSummary({ id: 'buyer-order-1' })],
      selectedOrder: makeOrderDetail({ id: 'buyer-order-1' }),
      notifications: [makeNotification('buyer-notif-1')],
      unreadCount: 2,
      roleFilter: 'BUYER',
      listingIdFilter: 'listing-buyer',
    });

    let resolveBuyerOrders!: (v: unknown) => void;
    let resolveBuyerDetail!: (v: unknown) => void;
    let resolveBuyerNotifs!: (v: unknown) => void;
    mockedApi
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveBuyerOrders = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveBuyerDetail = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveBuyerNotifs = resolve;
          }),
      );

    const pList = useOrders.getState().loadOrders({ role: 'BUYER' });
    const pDetail = useOrders.getState().loadOrderDetail('buyer-order-secret');
    const pNotif = useOrders.getState().loadNotifications();

    // Switch directly to a different user.id while token remains truthy
    act(() => {
      useSession.setState({ token: 'seller-jwt-token', user: sellerUser, loading: false });
    });

    const afterSwitch = useOrders.getState();
    expect(afterSwitch.orders).toHaveLength(0);
    expect(afterSwitch.selectedOrder).toBeNull();
    expect(afterSwitch.notifications).toHaveLength(0);
    expect(afterSwitch.unreadCount).toBe(0);
    expect(afterSwitch.roleFilter).toBe('ALL');
    expect(afterSwitch.listingIdFilter).toBeNull();
    expect(afterSwitch.loading).toBe(false);
    expect(afterSwitch.detailLoading).toBe(false);

    // Late in-flight responses from previous account must be discarded via bumped sessionEpoch
    resolveBuyerOrders({
      items: [makeOrderSummary({ id: 'leaked-buyer-order' })],
      page: 0,
      size: 30,
      totalElements: 1,
      totalPages: 1,
    });
    resolveBuyerDetail(makeOrderDetail({ id: 'buyer-order-secret' }));
    resolveBuyerNotifs({
      items: [makeNotification('leaked-buyer-notif')],
      unreadCount: 7,
      page: 0,
      size: 20,
      totalElements: 1,
      totalPages: 1,
    });

    await Promise.all([pList, pDetail, pNotif]);

    const finalState = useOrders.getState();
    expect(finalState.orders).toHaveLength(0);
    expect(finalState.selectedOrder).toBeNull();
    expect(finalState.notifications).toHaveLength(0);
    expect(finalState.unreadCount).toBe(0);
    expect(finalState.loading).toBe(false);
    expect(finalState.detailLoading).toBe(false);
  });
});

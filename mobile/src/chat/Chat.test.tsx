import React from 'react';
import { AppState, type AppStateStatus, FlatList } from 'react-native';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ApiError } from '../api/client';
import { useSession } from '../auth/session';
import * as discoveryApi from '../listings/discoveryApi';
import { useDiscovery } from '../listings/discoveryStore';
import type { ListingDetail } from '../listings/types';
import { useChat } from './store';
import * as chatApi from './api';
import type { ChatMessage, ConversationDetail, ConversationSummary } from './types';
import ConversationsScreen from '../screens/ConversationsScreen';
import ChatScreen from '../screens/ChatScreen';
import ListingScreen from '../screens/ListingScreen';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockRouteParams: Record<string, any> = {};
let focusCleanup: (() => void) | undefined;

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native') as any;
  return {
    ...actual,
    useNavigation: () => ({
      navigate: mockNavigate,
      goBack: mockGoBack,
    }),
    useRoute: () => ({
      params: mockRouteParams,
    }),
    useFocusEffect: (cb: () => void | (() => void)) => {
      const ReactModule = require('react');
      ReactModule.useEffect(() => {
        const cleanup = cb();
        focusCleanup = typeof cleanup === 'function' ? cleanup : undefined;
        return () => {
          if (typeof cleanup === 'function') {
            cleanup();
          }
        };
      }, [cb]);
    },
  };
});

jest.mock('./api');
jest.mock('../listings/discoveryApi');
const mockedChatApi = jest.mocked(chatApi);
const mockedDiscoveryApi = jest.mocked(discoveryApi);

const buyerUser = {
  id: 'buyer-1',
  name: 'Trần Mua Hàng',
  email: 'buyer@student.edu.vn',
  studentId: '22120001',
  role: 'member' as const,
  roles: ['MEMBER'],
  emailVerified: true,
  profileApproved: true,
  accountStatus: 'HOAT_DONG',
};

const sellerUser = {
  id: 'seller-1',
  name: 'Nguyễn Bán Hàng',
  email: 'seller@student.edu.vn',
  studentId: '22120002',
  role: 'member' as const,
  roles: ['MEMBER'],
  emailVerified: true,
  profileApproved: true,
  accountStatus: 'HOAT_DONG',
};

function makeSampleDetail(overrides: Partial<ConversationDetail> = {}): ConversationDetail {
  return {
    id: 'conv-1',
    currentUserId: buyerUser.id,
    listing: {
      id: 'listing-1',
      title: 'Bàn học gấp gọn KTX Khu B',
      description: 'Bàn gỗ chắc chắn, còn mới 95%',
      price: 150000,
      seller: sellerUser.name,
      sellerId: sellerUser.id,
      listingType: 'BAN_LE',
      status: 'CONG_KHAI',
    },
    listingId: 'listing-1',
    listingTitle: 'Bàn học gấp gọn KTX Khu B',
    listingPrice: 150000,
    listingType: 'BAN_LE',
    listingStatus: 'CONG_KHAI',
    buyer: { id: buyerUser.id, name: buyerUser.name },
    buyerId: buyerUser.id,
    buyerName: buyerUser.name,
    seller: { id: sellerUser.id, name: sellerUser.name },
    sellerId: sellerUser.id,
    sellerName: sellerUser.name,
    counterpartyId: sellerUser.id,
    counterpartyName: sellerUser.name,
    counterpartyStatus: 'HOAT_DONG',
    counterpartyRestricted: false,
    agreedPrice: null,
    agreedOfferId: null,
    pendingOfferId: null,
    pendingOfferPrice: null,
    pendingOfferSenderId: null,
    reservationNotice: null,
    canSendMessage: true,
    canMakeOffer: true,
    restrictionReason: null,
    messages: [],
    version: 1,
    createdAt: '2026-11-26T04:00:00Z',
    updatedAt: '2026-11-26T04:00:00Z',
    ...overrides,
  };
}

function makeSampleSummary(overrides: Partial<ConversationSummary> = {}): ConversationSummary {
  const detail = makeSampleDetail();
  return {
    id: detail.id,
    listing: detail.listing,
    listingId: detail.listingId,
    listingTitle: detail.listingTitle,
    listingPrice: detail.listingPrice,
    listingType: detail.listingType,
    listingStatus: detail.listingStatus,
    buyer: detail.buyer,
    buyerId: detail.buyerId,
    buyerName: detail.buyerName,
    seller: detail.seller,
    sellerId: detail.sellerId,
    sellerName: detail.sellerName,
    counterpartyId: detail.counterpartyId,
    counterpartyName: detail.counterpartyName,
    counterpartyStatus: detail.counterpartyStatus,
    counterpartyRestricted: detail.counterpartyRestricted,
    agreedPrice: detail.agreedPrice,
    pendingOfferId: detail.pendingOfferId,
    pendingOfferPrice: detail.pendingOfferPrice,
    pendingOfferSenderId: detail.pendingOfferSenderId,
    lastMessage: null,
    canSendMessage: detail.canSendMessage,
    canMakeOffer: detail.canMakeOffer,
    restrictionReason: detail.restrictionReason,
    version: detail.version,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
    ...overrides,
  };
}

function makeTextMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    conversationId: 'conv-1',
    sequenceNumber: 1,
    conversationVersion: null,
    senderId: buyerUser.id,
    senderName: buyerUser.name,
    type: 'VAN_BAN',
    messageType: 'VAN_BAN',
    content: 'Bàn còn không bạn? Hẹn ở cổng Khu B lúc 17h nhé?',
    offeredPrice: null,
    offerStatus: null,
    responseAction: null,
    responseNote: null,
    respondedById: null,
    parentOfferId: null,
    clientMessageId: 'cmsg-fixed-1',
    canRespond: false,
    createdAt: '2026-11-26T04:01:00Z',
    updatedAt: '2026-11-26T04:01:00Z',
    respondedAt: null,
    ...overrides,
  };
}

function makeOfferMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'offer-1',
    conversationId: 'conv-1',
    sequenceNumber: 2,
    conversationVersion: null,
    senderId: buyerUser.id,
    senderName: buyerUser.name,
    type: 'DE_NGHI_GIA',
    messageType: 'DE_NGHI_GIA',
    content: 'Mình qua lấy tận nơi, để mình 120k nhé',
    offeredPrice: 120000,
    offerStatus: 'CHO_PHAN_HOI',
    responseAction: null,
    responseNote: null,
    respondedById: null,
    parentOfferId: null,
    clientMessageId: 'offer-cmsg-1',
    canRespond: false,
    createdAt: '2026-11-26T04:02:00Z',
    updatedAt: '2026-11-26T04:02:00Z',
    respondedAt: null,
    ...overrides,
  };
}

function makeSampleListingDetail(overrides: Partial<ListingDetail> = {}): ListingDetail {
  return {
    id: 'listing-1',
    title: 'Bàn học gấp gọn KTX Khu B',
    description: 'Bàn gỗ chắc chắn',
    condition: 'Mới 95%',
    priceVnd: 150000,
    listingType: 'BAN_LE',
    isCombo: false,
    isFree: false,
    status: 'CONG_KHAI',
    categoryId: 'DO_GIA_DUNG',
    categoryName: 'Đồ gia dụng',
    courseCode: null,
    courseName: null,
    author: null,
    locationCode: 'KTX_KHU_B',
    locationName: 'KTX Khu B',
    locationText: 'Sảnh nhà B1',
    latitude: 10.8824,
    longitude: 106.7825,
    distanceKm: null,
    thumbnailUrl: null,
    images: [],
    itemCount: 1,
    seller: {
      id: sellerUser.id,
      displayName: sellerUser.name,
      reputationScore: 110,
      averageRating: 4.9,
      reviewCount: 4,
    },
    hasUnavailableItems: false,
    publishedAt: '2026-11-26T03:00:00Z',
    expiresAt: '2026-12-26T03:00:00Z',
    renewalReminderDue: false,
    renewalCount: 0,
    createdAt: '2026-11-26T03:00:00Z',
    updatedAt: '2026-11-26T03:00:00Z',
    version: 1,
    category: { id: 'DO_GIA_DUNG', name: 'Đồ gia dụng', parentId: null, description: null },
    items: [
      {
        id: 'item-1',
        name: 'Bàn học gấp gọn',
        condition: 'Mới 95%',
        status: 'KHA_DUNG',
        images: [],
      },
    ],
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
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
  focusCleanup = undefined;
  for (const key of Object.keys(mockRouteParams)) {
    delete mockRouteParams[key];
  }
  useSession.setState({
    token: 'buyer-token',
    user: buyerUser,
    loading: false,
    restriction: null,
    restrictionDismissed: false,
  });
  useChat.getState().reset();
  useDiscovery.getState().reset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('TC-01: ListingScreen & ConversationsScreen (Mở hội thoại, chặn tự nhắn tin, hộp thư cá nhân)', () => {
  test('opens or creates conversation from ListingScreen and navigates to Chat', async () => {
    const detail = makeSampleDetail();
    const listingDetail = makeSampleListingDetail();
    mockedDiscoveryApi.fetchListingDetail.mockResolvedValue(listingDetail);
    mockedChatApi.openOrCreateConversation.mockResolvedValue(detail);
    mockRouteParams.id = listingDetail.id;
    mockRouteParams.listing = listingDetail;

    render(<ListingScreen />);

    expect(await screen.findByTestId('message-button')).toBeTruthy();
    expect(screen.getByTestId('make-offer-button')).toBeTruthy();

    fireEvent.press(screen.getByTestId('message-button'));

    await waitFor(() => {
      expect(mockedChatApi.openOrCreateConversation).toHaveBeenCalledWith('listing-1');
      expect(mockNavigate).toHaveBeenCalledWith('Chat', {
        conversationId: 'conv-1',
        autoOpenOffer: false,
      });
      expect(screen.getByTestId('make-offer-button').props.accessibilityState.disabled).toBe(false);
    });

    fireEvent.press(screen.getByTestId('make-offer-button'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('Chat', {
        conversationId: 'conv-1',
        autoOpenOffer: true,
      });
    });
  });

  test('shows restriction or pending activation notice and disables chat/negotiate buttons on ListingScreen', async () => {
    const listingDetail = makeSampleListingDetail();
    mockedDiscoveryApi.fetchListingDetail.mockResolvedValue(listingDetail);
    mockRouteParams.id = listingDetail.id;
    mockRouteParams.listing = listingDetail;

    // 1. Pending activation account (no MEMBER role, not BI_KHOA)
    useSession.setState({
      token: 'pending-token',
      user: {
        ...buyerUser,
        roles: [],
        profileApproved: false,
        accountStatus: 'CHO_KICH_HOAT',
      },
      restriction: null,
      restrictionDismissed: false,
    });

    const { rerender } = render(<ListingScreen />);

    expect(
      await screen.findByText(
        'Tài khoản cần được xác minh và ở trạng thái hoạt động để thực hiện giao dịch.',
      ),
    ).toBeTruthy();
    expect(screen.getByTestId('message-button').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId('make-offer-button').props.accessibilityState.disabled).toBe(true);

    // 2. Locked BI_KHOA account shows RestrictedAccountNotice
    act(() => {
      useSession.setState({
        token: 'locked-token',
        user: {
          ...buyerUser,
          roles: [],
          accountStatus: 'BI_KHOA',
        },
        restriction: {
          accountStatus: 'BI_KHOA',
          lockType: 'KHOA_TAM_THOI',
          reason: 'Vi phạm quy định giao dịch',
          lockedUntil: '2026-12-02T10:00:00Z',
          appealable: false,
          reputationScore: 40,
          message: 'Tài khoản đang bị khóa tạm thời.',
        },
        restrictionDismissed: false,
      });
    });

    rerender(<ListingScreen />);

    expect(screen.getByTestId('restricted-account-notice')).toBeTruthy();
    expect(screen.getByTestId('message-button').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId('make-offer-button').props.accessibilityState.disabled).toBe(true);
  });

  test('hides chat and negotiate buttons when user views their own listing', async () => {
    useSession.setState({ token: 'seller-token', user: sellerUser });
    const ownerListing = makeSampleListingDetail({
      viewer: {
        isOwner: true,
        canEdit: true,
        canWithdraw: true,
        canDelete: true,
        canPublish: false,
        canRenew: false,
        canMakeOffer: false,
        canReserve: false,
        canMessage: false,
      },
    });
    mockedDiscoveryApi.fetchListingDetail.mockResolvedValue(ownerListing);
    mockRouteParams.id = ownerListing.id;
    mockRouteParams.listing = ownerListing;

    render(<ListingScreen />);

    expect(await screen.findByTestId('owner-edit-button')).toBeTruthy();
    expect(screen.queryByTestId('message-button')).toBeNull();
    expect(screen.queryByTestId('make-offer-button')).toBeNull();
  });

  test('hides negotiate button on free giveaway listing (CHO_TANG / 0 VND)', async () => {
    const freeListing = makeSampleListingDetail({
      id: 'listing-free',
      title: 'Tặng giáo trình Giải tích 1',
      description: '',
      priceVnd: 0,
      listingType: 'CHO_TANG',
      isFree: true,
      viewer: {
        isOwner: false,
        canEdit: false,
        canWithdraw: false,
        canDelete: false,
        canPublish: false,
        canRenew: false,
        canMakeOffer: false,
        canReserve: true,
        canMessage: true,
      },
    });
    mockedDiscoveryApi.fetchListingDetail.mockResolvedValue(freeListing);
    mockRouteParams.id = freeListing.id;
    mockRouteParams.listing = freeListing;

    render(<ListingScreen />);

    expect(await screen.findByTestId('message-button')).toBeTruthy();
    expect(screen.queryByTestId('make-offer-button')).toBeNull();
    expect(screen.getByText('Miễn phí (0đ)')).toBeTruthy();
  });

  test('renders ConversationsScreen with simultaneous agreed & pending badges, restricted counterparty, deleted listing notice, and navigates to Chat', async () => {
    const conv1 = makeSampleSummary({
      id: 'conv-1',
      agreedPrice: 140000,
      pendingOfferPrice: 135000,
      lastMessage: makeTextMessage({ content: 'Chốt 140k tại cổng Khu B nhé' }),
    });
    const convDeletedListing = makeSampleSummary({
      id: 'conv-2',
      counterpartyName: 'Lê Minh',
      counterpartyStatus: 'HAN_CHE',
      counterpartyRestricted: true,
      listing: null,
      listingId: null,
      listingTitle: null,
      listingPrice: null,
      pendingOfferPrice: 90000,
      lastMessage: null,
    });
    mockedChatApi.fetchConversations.mockResolvedValue([conv1, convDeletedListing]);

    render(<ConversationsScreen />);

    expect(await screen.findByText('Nguyễn Bán Hàng')).toBeTruthy();
    expect(screen.getByText('Bàn học gấp gọn KTX Khu B')).toBeTruthy();
    expect(screen.getByText(/Giá thỏa thuận: 140[.,]000 ₫/)).toBeTruthy();
    expect(screen.getByText(/Đề nghị đang chờ: 135[.,]000 ₫/)).toBeTruthy();
    expect(screen.getByText(/Chốt 140k tại cổng Khu B nhé/)).toBeTruthy();

    expect(screen.getByText('Lê Minh')).toBeTruthy();
    expect(screen.getByText('Tài khoản hạn chế')).toBeTruthy();
    expect(screen.getByText('Tin đăng đã bị gỡ')).toBeTruthy();
    expect(screen.getByText(/Đề nghị đang chờ: 90[.,]000 ₫/)).toBeTruthy();

    fireEvent.press(screen.getByTestId('conversation-item-conv-1'));
    expect(mockNavigate).toHaveBeenCalledWith('Chat', { conversationId: 'conv-1' });
  });
});

describe('TC-02: Gửi tin nhắn văn bản & Thử gửi lại giữ nguyên clientMessageId', () => {
  test('keeps failed message bubble on network error and retries with the exact same clientMessageId without duplicate bubble', async () => {
    mockRouteParams.conversationId = 'conv-1';
    mockedChatApi.fetchConversationDetail.mockResolvedValue(makeSampleDetail());

    const networkErr = new Error('Lỗi kết nối mạng tạm thời.');
    mockedChatApi.sendChatMessage
      .mockRejectedValueOnce(networkErr)
      .mockImplementationOnce(async (_convId, input) =>
        makeTextMessage({
          id: 'msg-delivered-1',
          conversationVersion: 2,
          content: input.content,
          clientMessageId: input.clientMessageId,
        }),
      );

    render(<ChatScreen />);
    await waitFor(() => expect(mockedChatApi.fetchConversationDetail).toHaveBeenCalledWith('conv-1'));

    fireEvent.changeText(
      screen.getByTestId('chat-message-input'),
      'Bàn còn mới không bạn? Chiều 17h mình ghé xem nhé.',
    );
    fireEvent.press(screen.getByTestId('chat-send-button'));

    await waitFor(() => {
      expect(mockedChatApi.sendChatMessage).toHaveBeenCalledTimes(1);
    });

    const firstCallInput = mockedChatApi.sendChatMessage.mock.calls[0][1];
    expect(firstCallInput.clientMessageId).toBeTruthy();

    // Pending bubble is in failed state with "Thử gửi lại" button
    const retryBtn = await screen.findByTestId(`retry-message-${firstCallInput.clientMessageId}`);
    expect(retryBtn).toBeTruthy();
    expect(useChat.getState().pendingMessagesByConversation['conv-1']).toHaveLength(1);

    // Retry sending
    fireEvent.press(retryBtn);

    await waitFor(() => {
      expect(mockedChatApi.sendChatMessage).toHaveBeenCalledTimes(2);
    });

    const secondCallInput = mockedChatApi.sendChatMessage.mock.calls[1][1];
    expect(secondCallInput.clientMessageId).toBe(firstCallInput.clientMessageId);
    expect(secondCallInput.content).toBe('Bàn còn mới không bạn? Chiều 17h mình ghé xem nhé.');

    // Pending bubble removed and delivered message bubble shown
    await waitFor(() => {
      expect(useChat.getState().pendingMessagesByConversation['conv-1']).toHaveLength(0);
      expect(screen.getByTestId('message-bubble-msg-delivered-1')).toBeTruthy();
    });
  });

  test('blocks text message longer than 2000 characters without clearing chat-message-input', async () => {
    mockRouteParams.conversationId = 'conv-1';
    mockedChatApi.fetchConversationDetail.mockResolvedValue(makeSampleDetail());

    render(<ChatScreen />);
    await waitFor(() => expect(mockedChatApi.fetchConversationDetail).toHaveBeenCalledWith('conv-1'));

    const longText = 'a'.repeat(2001);
    const input = screen.getByTestId('chat-message-input');
    fireEvent.changeText(input, longText);
    fireEvent.press(screen.getByTestId('chat-send-button'));

    expect(
      await screen.findByText('Nội dung tin nhắn không được vượt quá 2000 ký tự.'),
    ).toBeTruthy();
    expect(mockedChatApi.sendChatMessage).not.toHaveBeenCalled();
    expect(screen.getByTestId('chat-message-input').props.value).toBe(longText);
  });
});

describe('TC-03 & TC-04: Thương lượng giá (Validate, Đề nghị, ACCEPT, REJECT, COUNTER, Tin CHO_TANG)', () => {
  test('validates offer price on client (<= 0, formatted/decimal/negative, > listingPrice) before calling API and submits valid offer without note', async () => {
    mockRouteParams.conversationId = 'conv-1';
    mockRouteParams.autoOpenOffer = true;
    mockedChatApi.fetchConversationDetail.mockResolvedValue(makeSampleDetail());

    render(<ChatScreen />);
    // autoOpenOffer opens the offer form automatically once detail loads
    expect(await screen.findByTestId('offer-form-box')).toBeTruthy();

    const invalidFormatError =
      'Mức giá đề nghị phải là số nguyên VND hợp lệ (chỉ nhập chữ số, không dùng dấu chấm hoặc dấu phẩy).';

    // 1. Price <= 0
    fireEvent.changeText(screen.getByTestId('offer-price-input'), '0');
    fireEvent.press(screen.getByTestId('submit-offer-button'));
    expect(await screen.findByText('Mức giá đề nghị phải lớn hơn 0 ₫.')).toBeTruthy();
    expect(mockedChatApi.createPriceOffer).not.toHaveBeenCalled();

    // 2. Dot-formatted "120.000" must NOT be parsed as 120 VND
    for (const invalidRaw of ['120.000', '120,000', '-5000', '12.5']) {
      fireEvent.changeText(screen.getByTestId('offer-price-input'), invalidRaw);
      fireEvent.press(screen.getByTestId('submit-offer-button'));
      expect(await screen.findByText(invalidFormatError)).toBeTruthy();
      expect(mockedChatApi.createPriceOffer).not.toHaveBeenCalled();
    }

    // 3. Price > listingPrice (150,000)
    fireEvent.changeText(screen.getByTestId('offer-price-input'), '160000');
    fireEvent.press(screen.getByTestId('submit-offer-button'));
    expect(
      await screen.findByText(/Mức giá đề nghị không được cao hơn giá niêm yết/),
    ).toBeTruthy();
    expect(mockedChatApi.createPriceOffer).not.toHaveBeenCalled();

    // 4. Valid offer (120,000 <= 150,000) without note -> backend returns content: ""
    const pendingOffer = makeOfferMessage({ offeredPrice: 120000, content: '' });
    mockedChatApi.createPriceOffer.mockResolvedValueOnce(
      makeSampleDetail({
        version: 2,
        pendingOfferId: pendingOffer.id,
        pendingOfferPrice: 120000,
        pendingOfferSenderId: buyerUser.id,
        messages: [pendingOffer],
      }),
    );

    fireEvent.changeText(screen.getByTestId('offer-price-input'), '120000');
    fireEvent.press(screen.getByTestId('submit-offer-button'));

    await waitFor(() => {
      expect(mockedChatApi.createPriceOffer).toHaveBeenCalledWith(
        'conv-1',
        expect.objectContaining({
          offeredPrice: 120000,
          note: undefined,
        }),
      );
      expect(screen.getByTestId('offer-card-offer-1')).toBeTruthy();
      expect(screen.queryByTestId('offer-content-offer-1')).toBeNull();
      expect(screen.getByText('Đang chờ phản hồi')).toBeTruthy();
    });
  });

  test('seller responds to pending offer with COUNTER, REJECT (with responseNote), and ACCEPT (shows reservationNotice)', async () => {
    useSession.setState({ token: 'seller-token', user: sellerUser });
    mockRouteParams.conversationId = 'conv-1';

    const buyerOffer = makeOfferMessage({
      id: 'offer-buyer-1',
      senderId: buyerUser.id,
      senderName: buyerUser.name,
      offeredPrice: 130000,
      offerStatus: 'CHO_PHAN_HOI',
      canRespond: true,
    });

    mockedChatApi.fetchConversationDetail.mockResolvedValue(
      makeSampleDetail({
        currentUserId: sellerUser.id,
        counterpartyId: buyerUser.id,
        counterpartyName: buyerUser.name,
        pendingOfferId: buyerOffer.id,
        pendingOfferPrice: 130000,
        pendingOfferSenderId: buyerUser.id,
        messages: [buyerOffer],
        version: 2,
      }),
    );

    render(<ChatScreen />);
    expect(await screen.findByTestId('offer-actions-offer-buyer-1')).toBeTruthy();

    // 1. Seller clicks "Đề xuất lại giá" and validates counter price (both formatted "140.000" and > listingPrice)
    fireEvent.press(screen.getByTestId('toggle-counter-offer-offer-buyer-1'));
    fireEvent.changeText(screen.getByTestId('counter-price-input-offer-buyer-1'), '140.000');
    fireEvent.press(screen.getByTestId('submit-counter-offer-offer-buyer-1'));
    expect(
      await screen.findByText(
        'Mức giá đề nghị phải là số nguyên VND hợp lệ (chỉ nhập chữ số, không dùng dấu chấm hoặc dấu phẩy).',
      ),
    ).toBeTruthy();
    expect(mockedChatApi.respondToPriceOffer).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByTestId('counter-price-input-offer-buyer-1'), '200000');
    fireEvent.press(screen.getByTestId('submit-counter-offer-offer-buyer-1'));
    expect(
      await screen.findByText(/Mức giá đề nghị không được cao hơn giá niêm yết/),
    ).toBeTruthy();
    expect(mockedChatApi.respondToPriceOffer).not.toHaveBeenCalled();

    // 2. Seller submits valid COUNTER (140,000) without note -> backend returns content: "" and responseAction: null on new offer
    const supersededOffer = {
      ...buyerOffer,
      offerStatus: 'DA_THAY_THE' as const,
      responseAction: 'COUNTER' as const,
      canRespond: false,
    };
    const counterOffer = makeOfferMessage({
      id: 'offer-counter-2',
      sequenceNumber: 3,
      senderId: sellerUser.id,
      senderName: sellerUser.name,
      offeredPrice: 140000,
      content: '',
      offerStatus: 'CHO_PHAN_HOI',
      responseAction: null,
      parentOfferId: buyerOffer.id,
      canRespond: false,
    });

    mockedChatApi.respondToPriceOffer.mockResolvedValueOnce(
      makeSampleDetail({
        currentUserId: sellerUser.id,
        pendingOfferId: counterOffer.id,
        pendingOfferPrice: 140000,
        pendingOfferSenderId: sellerUser.id,
        messages: [supersededOffer, counterOffer],
        version: 3,
      }),
    );

    fireEvent.changeText(screen.getByTestId('counter-price-input-offer-buyer-1'), '140000');
    fireEvent.press(screen.getByTestId('submit-counter-offer-offer-buyer-1'));

    await waitFor(() => {
      expect(mockedChatApi.respondToPriceOffer).toHaveBeenCalledWith(
        'conv-1',
        'offer-buyer-1',
        expect.objectContaining({
          action: 'COUNTER',
          counterPrice: 140000,
          note: undefined,
        }),
      );
      expect(screen.getByText('Đã thay thế')).toBeTruthy();
      expect(screen.getByTestId('offer-card-offer-counter-2')).toBeTruthy();
      expect(screen.queryByTestId('offer-content-offer-counter-2')).toBeNull();
    });

    // 3. Buyer sends another offer and seller clicks REJECT with responseNote
    const buyerOfferReject = makeOfferMessage({
      id: 'offer-buyer-reject',
      sequenceNumber: 4,
      senderId: buyerUser.id,
      senderName: buyerUser.name,
      offeredPrice: 100000,
      offerStatus: 'CHO_PHAN_HOI',
      canRespond: true,
    });
    act(() => {
      useChat.setState((state) => ({
        detailsById: {
          ...state.detailsById,
          'conv-1': makeSampleDetail({
            currentUserId: sellerUser.id,
            pendingOfferId: buyerOfferReject.id,
            pendingOfferPrice: 100000,
            pendingOfferSenderId: buyerUser.id,
            messages: [buyerOfferReject],
            version: 4,
          }),
        },
      }));
    });

    const rejectedOffer = {
      ...buyerOfferReject,
      offerStatus: 'DA_TU_CHOI' as const,
      responseAction: 'REJECT' as const,
      responseNote: 'Giá này thấp quá bạn ơi',
      canRespond: false,
    };
    mockedChatApi.respondToPriceOffer.mockResolvedValueOnce(
      makeSampleDetail({
        currentUserId: sellerUser.id,
        pendingOfferId: null,
        pendingOfferPrice: null,
        pendingOfferSenderId: null,
        messages: [rejectedOffer],
        version: 5,
      }),
    );

    fireEvent.changeText(
      await screen.findByTestId('offer-response-note-input-offer-buyer-reject'),
      'Giá này thấp quá bạn ơi',
    );
    fireEvent.press(screen.getByTestId('reject-offer-offer-buyer-reject'));

    await waitFor(() => {
      expect(mockedChatApi.respondToPriceOffer).toHaveBeenCalledWith(
        'conv-1',
        'offer-buyer-reject',
        expect.objectContaining({
          action: 'REJECT',
          note: 'Giá này thấp quá bạn ơi',
        }),
      );
      expect(screen.getByText('Đã từ chối')).toBeTruthy();
      expect(screen.getByTestId('offer-response-note-offer-buyer-reject')).toBeTruthy();
      expect(screen.getByText('Ghi chú phản hồi: Giá này thấp quá bạn ơi')).toBeTruthy();
    });

    // 4. Buyer sends a new offer and seller clicks ACCEPT -> shows reservationNotice
    const buyerOffer3 = makeOfferMessage({
      id: 'offer-buyer-3',
      sequenceNumber: 5,
      senderId: buyerUser.id,
      senderName: buyerUser.name,
      offeredPrice: 140000,
      offerStatus: 'CHO_PHAN_HOI',
      canRespond: true,
    });
    act(() => {
      useChat.setState((state) => ({
        detailsById: {
          ...state.detailsById,
          'conv-1': makeSampleDetail({
            currentUserId: sellerUser.id,
            messages: [buyerOffer3],
            version: 6,
          }),
        },
      }));
    });

    const acceptedOffer = {
      ...buyerOffer3,
      offerStatus: 'DA_DONG_Y' as const,
      responseAction: 'ACCEPT' as const,
      responseNote: 'Chốt giá 140k',
      canRespond: false,
    };
    mockedChatApi.respondToPriceOffer.mockResolvedValueOnce(
      makeSampleDetail({
        currentUserId: sellerUser.id,
        agreedPrice: 140000,
        agreedOfferId: acceptedOffer.id,
        reservationNotice:
          'Đã ghi nhận mức giá thỏa thuận. Lưu ý: Đồng ý giá chưa phải là giữ chỗ hàng, bạn cần gửi yêu cầu giữ chỗ để chính thức giữ đồ.',
        messages: [acceptedOffer],
        version: 7,
      }),
    );

    fireEvent.press(await screen.findByTestId('accept-offer-offer-buyer-3'));

    await waitFor(() => {
      expect(screen.getByTestId('reservation-notice-banner')).toBeTruthy();
      expect(
        screen.getByText(/Đồng ý giá chưa phải là giữ chỗ hàng, bạn cần gửi yêu cầu giữ chỗ/),
      ).toBeTruthy();
      expect(screen.getByTestId('agreed-price-banner')).toBeTruthy();
      expect(screen.getByText('Đã đồng ý giá')).toBeTruthy();
    });
  });

  test('disables price offer composer on free giveaway listing (CHO_TANG) while keeping normal text messaging enabled', async () => {
    mockRouteParams.conversationId = 'conv-free';
    mockedChatApi.fetchConversationDetail.mockResolvedValue(
      makeSampleDetail({
        id: 'conv-free',
        listingType: 'CHO_TANG',
        listingPrice: 0,
        canSendMessage: true,
        canMakeOffer: false,
        restrictionReason: 'FREE_LISTING_NO_NEGOTIATION',
      }),
    );

    render(<ChatScreen />);

    expect(await screen.findByTestId('chat-restriction-banner')).toBeTruthy();
    expect(
      screen.getByText(/Tin đăng cho tặng miễn phí \(0đ\) không hỗ trợ thương lượng giá/),
    ).toBeTruthy();
    expect(screen.queryByTestId('offer-composer-section')).toBeNull();
    expect(screen.getByTestId('chat-send-button').props.accessibilityState.disabled).toBe(false);
  });
});

describe('TC-05 & Ràng buộc đồng bộ: Lỗi 409 tự refetch, 403 COUNTERPARTY_RESTRICTED không xóa session, version guard, session guard, polling 5s', () => {
  test('automatically refetches conversation detail on 409 conflict (OFFER_NOT_PENDING / LISTING_NOT_AVAILABLE)', async () => {
    useSession.setState({ token: 'seller-token', user: sellerUser });
    mockRouteParams.conversationId = 'conv-1';

    const buyerOffer = makeOfferMessage({
      id: 'offer-buyer-1',
      senderId: buyerUser.id,
      senderName: buyerUser.name,
      offeredPrice: 120000,
      offerStatus: 'CHO_PHAN_HOI',
      canRespond: true,
    });

    mockedChatApi.fetchConversationDetail
      .mockResolvedValueOnce(
        makeSampleDetail({
          currentUserId: sellerUser.id,
          messages: [buyerOffer],
          version: 1,
        }),
      )
      .mockResolvedValueOnce(
        makeSampleDetail({
          currentUserId: sellerUser.id,
          listingStatus: 'DA_RUT',
          canSendMessage: false,
          canMakeOffer: false,
          restrictionReason: 'LISTING_NOT_AVAILABLE',
          messages: [{ ...buyerOffer, canRespond: false }],
          version: 2,
        }),
      );

    const conflictErr = new Error('Tin đăng không còn ở trạng thái công khai.') as Error & {
      status?: number;
      code?: string;
    };
    conflictErr.status = 409;
    conflictErr.code = 'LISTING_NOT_AVAILABLE';
    mockedChatApi.respondToPriceOffer.mockRejectedValueOnce(conflictErr);

    render(<ChatScreen />);
    const acceptBtn = await screen.findByTestId('accept-offer-offer-buyer-1');
    fireEvent.press(acceptBtn);

    await waitFor(() => {
      expect(mockedChatApi.fetchConversationDetail).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId('chat-restriction-banner')).toBeTruthy();
      expect(screen.getByTestId('chat-send-button').props.accessibilityState.disabled).toBe(true);
    });
  });

  test('locks messaging on 403 COUNTERPARTY_RESTRICTED without clearing current user session, marks failed bubble non-retryable and dismissible', async () => {
    mockRouteParams.conversationId = 'conv-1';
    mockedChatApi.fetchConversationDetail.mockResolvedValue(makeSampleDetail());

    const cpRestrictedErr = new Error(
      'Tài khoản của đối phương hiện đang bị khóa hoặc hạn chế giao dịch.',
    ) as Error & { status?: number; code?: string };
    cpRestrictedErr.status = 403;
    cpRestrictedErr.code = 'COUNTERPARTY_RESTRICTED';
    mockedChatApi.sendChatMessage.mockRejectedValueOnce(cpRestrictedErr);

    render(<ChatScreen />);
    await waitFor(() => expect(mockedChatApi.fetchConversationDetail).toHaveBeenCalled());

    fireEvent.changeText(screen.getByTestId('chat-message-input'), 'Alo bạn ơi');
    fireEvent.press(screen.getByTestId('chat-send-button'));

    await waitFor(() => {
      expect(screen.getByTestId('chat-restriction-banner')).toBeTruthy();
      expect(screen.getByTestId('chat-send-button').props.accessibilityState.disabled).toBe(true);
    });

    // Session of the caller must remain intact
    expect(useSession.getState().token).toBe('buyer-token');
    expect(useSession.getState().user?.id).toBe(buyerUser.id);
    expect(useSession.getState().restriction).toBeNull();

    // Failed 403 pending bubble must be non-retryable (hide Retry, keep Dismiss)
    const pendingList = useChat.getState().pendingMessagesByConversation['conv-1'];
    expect(pendingList).toHaveLength(1);
    expect(pendingList[0].retryable).toBe(false);
    const failedClientId = pendingList[0].clientMessageId;
    expect(screen.queryByTestId(`retry-message-${failedClientId}`)).toBeNull();

    const dismissBtn = screen.getByTestId(`dismiss-message-${failedClientId}`);
    fireEvent.press(dismissBtn);

    await waitFor(() => {
      expect(useChat.getState().pendingMessagesByConversation['conv-1']).toHaveLength(0);
      expect(screen.queryByTestId(`pending-message-${failedClientId}`)).toBeNull();
    });
  });

  test('preserves newly sent message when concurrent 5s poll returns same version without it, and supports dismissing 409 failed bubble', async () => {
    const msg1 = makeTextMessage({
      id: 'msg-1',
      sequenceNumber: 1,
      content: 'Tin nhắn đầu tiên',
      clientMessageId: 'cmsg-1',
      createdAt: '2026-11-26T04:01:00Z',
    });
    const msg2 = makeTextMessage({
      id: 'msg-2',
      sequenceNumber: 2,
      conversationVersion: 2,
      content: 'Tin nhắn vừa gửi',
      clientMessageId: 'cmsg-2',
      createdAt: '2026-11-26T04:02:00Z',
    });

    mockedChatApi.fetchConversationDetail.mockResolvedValueOnce(
      makeSampleDetail({
        id: 'conv-1',
        version: 1,
        messages: [msg1],
      }),
    );
    await useChat.getState().loadConversationDetail('conv-1');

    mockedChatApi.sendChatMessage.mockResolvedValueOnce(msg2);
    await useChat.getState().sendMessage('conv-1', 'Tin nhắn vừa gửi', 'cmsg-2');
    expect(useChat.getState().detailsById['conv-1'].version).toBe(2);
    expect(useChat.getState().detailsById['conv-1'].messages.map((m) => m.id)).toEqual([
      'msg-1',
      'msg-2',
    ]);

    // Overlapping poll returns same version 2 with only [msg1] -> must merge and keep msg2
    mockedChatApi.fetchConversationDetail.mockResolvedValueOnce(
      makeSampleDetail({
        id: 'conv-1',
        version: 2,
        messages: [msg1],
      }),
    );
    await useChat.getState().loadConversationDetail('conv-1', { silent: true });
    expect(useChat.getState().detailsById['conv-1'].messages.map((m) => m.id)).toEqual([
      'msg-1',
      'msg-2',
    ]);

    // 409 conflict on sendMessage marks pending bubble non-retryable and dismissPendingMessage clears it
    const conflictErr = new Error('Tin đăng không còn công khai.') as Error & {
      status?: number;
      code?: string;
    };
    conflictErr.status = 409;
    conflictErr.code = 'LISTING_NOT_AVAILABLE';
    mockedChatApi.sendChatMessage.mockRejectedValueOnce(conflictErr);
    mockedChatApi.fetchConversationDetail.mockResolvedValueOnce(
      makeSampleDetail({
        id: 'conv-1',
        version: 3,
        canSendMessage: false,
        canMakeOffer: false,
        restrictionReason: 'LISTING_NOT_AVAILABLE',
        messages: [msg1, msg2],
      }),
    );

    await expect(useChat.getState().sendMessage('conv-1', 'Thử gửi lúc 409', 'cmsg-409')).rejects.toThrow(
      'Tin đăng không còn công khai.',
    );
    const pendingAfter409 = useChat.getState().pendingMessagesByConversation['conv-1'];
    expect(pendingAfter409).toHaveLength(1);
    expect(pendingAfter409[0].retryable).toBe(false);

    useChat.getState().dismissPendingMessage('conv-1', 'cmsg-409');
    expect(useChat.getState().pendingMessagesByConversation['conv-1']).toHaveLength(0);
  });

  test('renders RestrictedAccountNotice and disables messaging/offers on ChatScreen when caller is locked mid-session', async () => {
    mockRouteParams.conversationId = 'conv-1';
    mockedChatApi.fetchConversationDetail.mockResolvedValue(makeSampleDetail());

    render(<ChatScreen />);
    await waitFor(() => expect(screen.getByTestId('open-offer-form-button')).toBeTruthy());

    act(() => {
      useSession.setState({
        token: 'buyer-token',
        user: {
          ...buyerUser,
          roles: [],
          accountStatus: 'BI_KHOA',
        },
        restriction: {
          accountStatus: 'BI_KHOA',
          lockType: 'KHOA_TAM_THOI',
          reason: 'Vi phạm trong phiên giao dịch',
          lockedUntil: '2026-12-03T10:00:00Z',
          appealable: false,
          reputationScore: 45,
          message: 'Tài khoản bị khóa tạm thời giữa phiên.',
        },
        restrictionDismissed: false,
      });
    });

    expect(await screen.findByTestId('restricted-account-notice')).toBeTruthy();
    expect(screen.getByTestId('chat-send-button').props.accessibilityState.disabled).toBe(true);
    expect(screen.queryByTestId('offer-composer-section')).toBeNull();
  });

  test('version guard prevents stale response with lower version from overwriting newer conversation snapshot', async () => {
    const newerDetail = makeSampleDetail({
      id: 'conv-1',
      version: 5,
      agreedPrice: 135000,
    });
    const staleDetail = makeSampleDetail({
      id: 'conv-1',
      version: 3,
      agreedPrice: null,
    });

    mockedChatApi.fetchConversationDetail.mockResolvedValueOnce(newerDetail);
    await useChat.getState().loadConversationDetail('conv-1');
    expect(useChat.getState().detailsById['conv-1'].version).toBe(5);
    expect(useChat.getState().detailsById['conv-1'].agreedPrice).toBe(135000);

    // Late arrival with version 3 must be ignored
    mockedChatApi.fetchConversationDetail.mockResolvedValueOnce(staleDetail);
    await useChat.getState().loadConversationDetail('conv-1');
    expect(useChat.getState().detailsById['conv-1'].version).toBe(5);
    expect(useChat.getState().detailsById['conv-1'].agreedPrice).toBe(135000);
  });

  test('session generation / userId guard clears cache on logout or account switch and ignores late responses', async () => {
    let resolveInFlight!: (value: ConversationDetail) => void;
    const inFlightPromise = new Promise<ConversationDetail>((resolve) => {
      resolveInFlight = resolve;
    });
    mockedChatApi.fetchConversationDetail.mockReturnValueOnce(inFlightPromise);

    const loadTask = useChat.getState().loadConversationDetail('conv-1');

    // User switches account while request is in flight
    useSession.setState({ token: 'seller-token', user: sellerUser });
    expect(useChat.getState().detailsById).toEqual({});
    expect(useChat.getState().conversations).toEqual([]);

    // Late response for buyerUser resolves
    resolveInFlight(makeSampleDetail({ id: 'conv-1', currentUserId: buyerUser.id }));
    await loadTask;

    // Must not pollute sellerUser's store
    expect(useChat.getState().detailsById['conv-1']).toBeUndefined();
  });

  test('polls every 5s when focused & active, prevents overlapping requests (in-flight guard), preserves data on error, and stops on blur/background', async () => {
    jest.useFakeTimers();
    let appStateListener: ((state: AppStateStatus) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateListener = listener;
      return { remove: jest.fn() } as any;
    });

    const initialSummary = makeSampleSummary({ id: 'conv-1', counterpartyName: 'Nguyễn Bán Hàng' });
    mockedChatApi.fetchConversations.mockResolvedValueOnce([initialSummary]);

    render(<ConversationsScreen />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockedChatApi.fetchConversations).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Nguyễn Bán Hàng')).toBeTruthy();

    // 1. Slow request still in flight when 5s timer fires -> in-flight guard blocks duplicate call
    let resolveSlowPoll!: (value: ConversationSummary[]) => void;
    mockedChatApi.fetchConversations.mockReturnValueOnce(
      new Promise<ConversationSummary[]>((resolve) => {
        resolveSlowPoll = resolve;
      }),
    );

    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });
    expect(mockedChatApi.fetchConversations).toHaveBeenCalledTimes(2);

    // Another 5s passes while request #2 is still in flight -> must not trigger request #3
    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });
    expect(mockedChatApi.fetchConversations).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveSlowPoll([initialSummary]);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // 2. Transient poll error preserves existing conversations and shows error banner
    mockedChatApi.fetchConversations.mockRejectedValueOnce(new Error('Mất kết nối máy chủ'));
    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockedChatApi.fetchConversations).toHaveBeenCalledTimes(3);
    expect(screen.getByText('Nguyễn Bán Hàng')).toBeTruthy();
    expect(screen.getByText('Mất kết nối máy chủ')).toBeTruthy();

    // 3. App goes to background -> polling pauses
    act(() => {
      appStateListener?.('background');
    });
    await act(async () => {
      jest.advanceTimersByTime(10000);
    });
    expect(mockedChatApi.fetchConversations).toHaveBeenCalledTimes(3);

    // 4. Screen blurs -> polling stops completely
    act(() => {
      focusCleanup?.();
    });
    await act(async () => {
      jest.advanceTimersByTime(10000);
    });
    expect(mockedChatApi.fetchConversations).toHaveBeenCalledTimes(3);
  });
});

function expectedLocalTime(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())} ${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
}

describe('P2-03 V2 [P2] Mobile polish: note >1000 validation, conversationId form reset, timestamps, auto-scroll, inbox role & updated time', () => {
  test('blocks offer note > 1000 characters in handleCreateOffer and handleRespondOffer without clearing input or calling API', async () => {
    // 1. handleCreateOffer note > 1000
    mockRouteParams.conversationId = 'conv-1';
    mockRouteParams.autoOpenOffer = true;
    mockedChatApi.fetchConversationDetail.mockResolvedValueOnce(makeSampleDetail());

    const { unmount } = render(<ChatScreen />);
    expect(await screen.findByTestId('offer-form-box')).toBeTruthy();

    const longOfferNote = 'g'.repeat(1001);
    fireEvent.changeText(screen.getByTestId('offer-price-input'), '120000');
    fireEvent.changeText(screen.getByTestId('offer-note-input'), longOfferNote);
    fireEvent.press(screen.getByTestId('submit-offer-button'));

    expect(
      await screen.findByText('Ghi chú kèm đề nghị giá không được vượt quá 1000 ký tự.'),
    ).toBeTruthy();
    expect(mockedChatApi.createPriceOffer).not.toHaveBeenCalled();
    expect(screen.getByTestId('offer-note-input').props.value).toBe(longOfferNote);

    unmount();

    // 2. handleRespondOffer note > 1000 (ACCEPT, REJECT, COUNTER)
    useSession.setState({ token: 'seller-token', user: sellerUser });
    useChat.getState().reset();
    mockRouteParams.conversationId = 'conv-1';
    mockRouteParams.autoOpenOffer = false;

    const pendingBuyerOffer = makeOfferMessage({
      id: 'offer-long-note-1',
      senderId: buyerUser.id,
      senderName: buyerUser.name,
      offeredPrice: 125000,
      offerStatus: 'CHO_PHAN_HOI',
      canRespond: true,
    });
    mockedChatApi.fetchConversationDetail.mockResolvedValueOnce(
      makeSampleDetail({
        currentUserId: sellerUser.id,
        counterpartyId: buyerUser.id,
        counterpartyName: buyerUser.name,
        pendingOfferId: pendingBuyerOffer.id,
        pendingOfferPrice: 125000,
        pendingOfferSenderId: buyerUser.id,
        messages: [pendingBuyerOffer],
      }),
    );

    render(<ChatScreen />);
    const responseNoteInput = await screen.findByTestId(
      'offer-response-note-input-offer-long-note-1',
    );
    const longResponseNote = 'r'.repeat(1001);
    fireEvent.changeText(responseNoteInput, longResponseNote);

    fireEvent.press(screen.getByTestId('accept-offer-offer-long-note-1'));
    expect(
      await screen.findByText('Ghi chú phản hồi đề nghị giá không được vượt quá 1000 ký tự.'),
    ).toBeTruthy();
    expect(mockedChatApi.respondToPriceOffer).not.toHaveBeenCalled();
    expect(
      screen.getByTestId('offer-response-note-input-offer-long-note-1').props.value,
    ).toBe(longResponseNote);

    // Also verified on COUNTER action with valid counter price
    fireEvent.press(screen.getByTestId('toggle-counter-offer-offer-long-note-1'));
    fireEvent.changeText(screen.getByTestId('counter-price-input-offer-long-note-1'), '135000');
    fireEvent.press(screen.getByTestId('submit-counter-offer-offer-long-note-1'));
    expect(
      await screen.findByText('Ghi chú phản hồi đề nghị giá không được vượt quá 1000 ký tự.'),
    ).toBeTruthy();
    expect(mockedChatApi.respondToPriceOffer).not.toHaveBeenCalled();
    expect(
      screen.getByTestId('offer-response-note-input-offer-long-note-1').props.value,
    ).toBe(longResponseNote);
  });

  test('resets all local form state and localError when conversationId changes on the same mounted ChatScreen instance', async () => {
    useSession.setState({ token: 'seller-token', user: sellerUser });
    mockRouteParams.conversationId = 'conv-1';
    mockRouteParams.autoOpenOffer = false;

    const offerConv1 = makeOfferMessage({
      id: 'offer-c1',
      conversationId: 'conv-1',
      senderId: buyerUser.id,
      senderName: buyerUser.name,
      offeredPrice: 120000,
      offerStatus: 'CHO_PHAN_HOI',
      canRespond: true,
    });
    const offerConv2 = makeOfferMessage({
      id: 'offer-c2',
      conversationId: 'conv-2',
      senderId: buyerUser.id,
      senderName: buyerUser.name,
      offeredPrice: 110000,
      offerStatus: 'CHO_PHAN_HOI',
      canRespond: true,
    });

    mockedChatApi.fetchConversationDetail.mockImplementation(async (convId) => {
      if (convId === 'conv-2') {
        return makeSampleDetail({
          id: 'conv-2',
          currentUserId: sellerUser.id,
          counterpartyId: buyerUser.id,
          counterpartyName: 'Khách Conv 2',
          listingTitle: 'Quạt mini KTX',
          messages: [offerConv2],
        });
      }
      if (convId === 'conv-3') {
        return makeSampleDetail({
          id: 'conv-3',
          currentUserId: sellerUser.id,
          counterpartyId: buyerUser.id,
          counterpartyName: 'Khách Conv 3',
          listingTitle: 'Đèn bàn LED',
          messages: [],
        });
      }
      return makeSampleDetail({
        id: 'conv-1',
        currentUserId: sellerUser.id,
        counterpartyId: buyerUser.id,
        counterpartyName: buyerUser.name,
        messages: [offerConv1],
      });
    });

    const { rerender } = render(<ChatScreen />);
    expect(await screen.findByTestId('offer-actions-offer-c1')).toBeTruthy();

    // Populate every local input and trigger localError on conv-1
    fireEvent.changeText(screen.getByTestId('chat-message-input'), 'Tin nhắn nháp conv-1');
    fireEvent.press(screen.getByTestId('open-offer-form-button'));
    fireEvent.changeText(screen.getByTestId('offer-price-input'), '0');
    fireEvent.changeText(screen.getByTestId('offer-note-input'), 'Ghi chú nháp conv-1');
    fireEvent.press(screen.getByTestId('toggle-counter-offer-offer-c1'));
    fireEvent.changeText(screen.getByTestId('counter-price-input-offer-c1'), '135000');
    fireEvent.changeText(screen.getByTestId('offer-response-note-input-offer-c1'), 'Phản hồi nháp conv-1');
    fireEvent.press(screen.getByTestId('submit-offer-button'));

    expect(await screen.findByText('Mức giá đề nghị phải lớn hơn 0 ₫.')).toBeTruthy();

    // Switch conversationId while keeping the same mounted ChatScreen instance
    mockRouteParams.conversationId = 'conv-2';
    mockRouteParams.autoOpenOffer = false;
    rerender(<ChatScreen />);

    expect(await screen.findByTestId('offer-actions-offer-c2')).toBeTruthy();
    expect(screen.getByTestId('chat-message-input').props.value).toBe('');
    expect(screen.queryByTestId('offer-form-box')).toBeNull();
    expect(screen.queryByText('Mức giá đề nghị phải lớn hơn 0 ₫.')).toBeNull();
    expect(screen.queryByTestId('counter-offer-form-offer-c2')).toBeNull();
    expect(screen.getByTestId('offer-response-note-input-offer-c2').props.value).toBe('');

    // Re-open offer form and counter form on conv-2 to confirm cleared inputs
    fireEvent.press(screen.getByTestId('open-offer-form-button'));
    expect(screen.getByTestId('offer-price-input').props.value).toBe('');
    expect(screen.getByTestId('offer-note-input').props.value).toBe('');

    fireEvent.press(screen.getByTestId('toggle-counter-offer-offer-c2'));
    expect(screen.getByTestId('counter-price-input-offer-c2').props.value).toBe('');

    // Switch to conv-3 with autoOpenOffer=true -> autoOpenedOfferRef reset allows auto-opening
    mockRouteParams.conversationId = 'conv-3';
    mockRouteParams.autoOpenOffer = true;
    rerender(<ChatScreen />);

    expect(await screen.findByTestId('offer-form-box')).toBeTruthy();
  });

  test('renders createdAt/respondedAt timestamps on ChatScreen and safely calls FlatList.scrollToEnd on initial load and new messages', async () => {
    const scrollToEndSpy = jest
      .spyOn(FlatList.prototype, 'scrollToEnd')
      .mockImplementation(() => {});

    try {
      mockRouteParams.conversationId = 'conv-1';
      const msgCreatedAt = '2026-11-26T04:05:00Z';
      const offerCreatedAt = '2026-11-26T04:10:00Z';
      const offerRespondedAt = '2026-11-26T04:25:00Z';
      const pendingOfferCreatedAt = '2026-11-26T04:30:00Z';

      const textMsg = makeTextMessage({
        id: 'msg-ts-1',
        sequenceNumber: 1,
        createdAt: msgCreatedAt,
      });
      const acceptedOffer = makeOfferMessage({
        id: 'offer-ts-1',
        sequenceNumber: 2,
        offerStatus: 'DA_DONG_Y',
        responseAction: 'ACCEPT',
        createdAt: offerCreatedAt,
        respondedAt: offerRespondedAt,
      });
      const pendingOffer = makeOfferMessage({
        id: 'offer-ts-2',
        sequenceNumber: 3,
        offerStatus: 'CHO_PHAN_HOI',
        createdAt: pendingOfferCreatedAt,
        respondedAt: null,
      });

      mockedChatApi.fetchConversationDetail.mockResolvedValue(
        makeSampleDetail({
          version: 2,
          messages: [textMsg, acceptedOffer, pendingOffer],
        }),
      );

      render(<ChatScreen />);

      expect(await screen.findByTestId('message-time-msg-ts-1')).toBeTruthy();
      expect(screen.getByTestId('message-time-msg-ts-1').props.children).toBe(
        expectedLocalTime(msgCreatedAt),
      );

      expect(screen.getByTestId('offer-time-offer-ts-1').props.children).toBe(
        expectedLocalTime(offerCreatedAt),
      );
      expect(screen.getByTestId('offer-responded-time-offer-ts-1').props.children).toEqual([
        'Phản hồi: ',
        expectedLocalTime(offerRespondedAt),
      ]);

      expect(screen.getByTestId('offer-time-offer-ts-2').props.children).toBe(
        expectedLocalTime(pendingOfferCreatedAt),
      );
      expect(screen.queryByTestId('offer-responded-time-offer-ts-2')).toBeNull();

      // Auto-scrolled on initial non-empty load
      await waitFor(() => {
        expect(scrollToEndSpy).toHaveBeenCalledTimes(1);
        expect(scrollToEndSpy).toHaveBeenCalledWith({ animated: true });
      });

      // Sending a new message adds pending item -> timeline length grows -> scrollToEnd called again
      const deliveredNewMsg = makeTextMessage({
        id: 'msg-ts-4',
        sequenceNumber: 4,
        conversationVersion: 3,
        content: 'Hẹn 17h ở cổng Khu B nhé',
        createdAt: '2026-11-26T04:35:00Z',
      });
      mockedChatApi.sendChatMessage.mockResolvedValueOnce(deliveredNewMsg);

      fireEvent.changeText(screen.getByTestId('chat-message-input'), 'Hẹn 17h ở cổng Khu B nhé');
      fireEvent.press(screen.getByTestId('chat-send-button'));

      await waitFor(() => {
        expect(screen.getByTestId('message-bubble-msg-ts-4')).toBeTruthy();
        expect(scrollToEndSpy).toHaveBeenCalledTimes(2);
      });
    } finally {
      scrollToEndSpy.mockRestore();
    }
  });

  test('renders role badges (Vai trò: Mua / Vai trò: Bán) and updated timestamps on ConversationsScreen', async () => {
    const lastMsgIso = '2026-11-26T06:15:00Z';
    const updatedOnlyIso = '2026-11-26T05:45:00Z';

    const buyConv = makeSampleSummary({
      id: 'conv-buy',
      buyerId: buyerUser.id,
      buyerName: buyerUser.name,
      sellerId: sellerUser.id,
      sellerName: sellerUser.name,
      counterpartyId: sellerUser.id,
      counterpartyName: sellerUser.name,
      updatedAt: '2026-11-26T04:00:00Z',
      lastMessage: makeTextMessage({
        id: 'msg-buy-1',
        conversationId: 'conv-buy',
        content: 'Còn bàn không bạn?',
        createdAt: lastMsgIso,
      }),
    });

    const sellConv = makeSampleSummary({
      id: 'conv-sell',
      buyerId: 'other-buyer-2',
      buyerName: 'Phạm Người Mua',
      sellerId: buyerUser.id,
      sellerName: buyerUser.name,
      counterpartyId: 'other-buyer-2',
      counterpartyName: 'Phạm Người Mua',
      updatedAt: updatedOnlyIso,
      lastMessage: null,
    });

    mockedChatApi.fetchConversations.mockResolvedValueOnce([buyConv, sellConv]);

    render(<ConversationsScreen />);

    expect(await screen.findByTestId('conversation-role-conv-buy')).toBeTruthy();
    expect(screen.getByText('Vai trò: Mua')).toBeTruthy();
    expect(screen.getByTestId('conversation-time-conv-buy').props.children).toBe(
      expectedLocalTime(lastMsgIso),
    );

    expect(screen.getByTestId('conversation-role-conv-sell')).toBeTruthy();
    expect(screen.getByText('Vai trò: Bán')).toBeTruthy();
    expect(screen.getByTestId('conversation-time-conv-sell').props.children).toBe(
      expectedLocalTime(updatedOnlyIso),
    );
  });
});

describe('P2-03 V12 Review Fixes: draft clientMessageId retry, double-tap refs, stale lock guard, 404 stop-polling, GIU_CHO sync', () => {
  test('retrying createOffer and respondToOffer(COUNTER) after network error reuses exact clientMessageId and clears after success or 4xx', async () => {
    // 1. createOffer: network error preserves clientMessageId on retry, then clears on success & non-retryable 4xx
    mockedChatApi.createPriceOffer
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce(makeSampleDetail({ version: 2 }))
      .mockResolvedValueOnce(makeSampleDetail({ version: 3 }))
      .mockRejectedValueOnce(
        new ApiError(409, 'Tin đăng không còn công khai.', 'LISTING_NOT_AVAILABLE'),
      )
      .mockResolvedValueOnce(makeSampleDetail({ version: 4 }));
    mockedChatApi.fetchConversationDetail.mockResolvedValue(makeSampleDetail({ version: 4 }));

    await expect(
      useChat.getState().createOffer('conv-1', { offeredPrice: 120000, note: 'Giữ giúp mình' }),
    ).rejects.toThrow('Network request failed');

    await useChat
      .getState()
      .createOffer('conv-1', { offeredPrice: 120000, note: '  Giữ giúp mình  ' });

    const offerId1 = mockedChatApi.createPriceOffer.mock.calls[0][1].clientMessageId;
    const offerId2 = mockedChatApi.createPriceOffer.mock.calls[1][1].clientMessageId;
    expect(offerId1).toBeTruthy();
    expect(offerId2).toBe(offerId1);

    // After success, the next identical offer draft gets a fresh clientMessageId
    await useChat
      .getState()
      .createOffer('conv-1', { offeredPrice: 120000, note: 'Giữ giúp mình' });
    const offerId3 = mockedChatApi.createPriceOffer.mock.calls[2][1].clientMessageId;
    expect(offerId3).toBeTruthy();
    expect(offerId3).not.toBe(offerId1);

    // Non-retryable 409 error clears the draft clientMessageId so the next attempt rotates it
    await expect(
      useChat.getState().createOffer('conv-1', { offeredPrice: 120000, note: 'Giữ giúp mình' }),
    ).rejects.toThrow('Tin đăng không còn công khai.');
    const offerId4 = mockedChatApi.createPriceOffer.mock.calls[3][1].clientMessageId;

    await useChat
      .getState()
      .createOffer('conv-1', { offeredPrice: 120000, note: 'Giữ giúp mình' });
    const offerId5 = mockedChatApi.createPriceOffer.mock.calls[4][1].clientMessageId;
    expect(offerId5).toBeTruthy();
    expect(offerId5).not.toBe(offerId4);

    // 2. respondToOffer('COUNTER'): network error preserves clientMessageId on retry, then clears on success & 4xx
    mockedChatApi.respondToPriceOffer
      .mockRejectedValueOnce(new Error('Request timeout'))
      .mockResolvedValueOnce(makeSampleDetail({ version: 5 }))
      .mockResolvedValueOnce(makeSampleDetail({ version: 6 }))
      .mockRejectedValueOnce(new ApiError(400, 'Giá đề xuất không hợp lệ.', 'INVALID_OFFER_PRICE'))
      .mockResolvedValueOnce(makeSampleDetail({ version: 7 }));

    await expect(
      useChat.getState().respondToOffer('conv-1', 'offer-1', {
        action: 'COUNTER',
        counterPrice: 135000,
        note: 'Bớt 15k nhé',
      }),
    ).rejects.toThrow('Request timeout');

    await useChat.getState().respondToOffer('conv-1', 'offer-1', {
      action: 'COUNTER',
      counterPrice: 135000,
      note: ' Bớt 15k nhé ',
    });

    const counterId1 = mockedChatApi.respondToPriceOffer.mock.calls[0][2].clientMessageId;
    const counterId2 = mockedChatApi.respondToPriceOffer.mock.calls[1][2].clientMessageId;
    expect(counterId1).toBeTruthy();
    expect(counterId2).toBe(counterId1);

    // After success, new COUNTER gets a fresh clientMessageId
    await useChat.getState().respondToOffer('conv-1', 'offer-1', {
      action: 'COUNTER',
      counterPrice: 135000,
      note: 'Bớt 15k nhé',
    });
    const counterId3 = mockedChatApi.respondToPriceOffer.mock.calls[2][2].clientMessageId;
    expect(counterId3).toBeTruthy();
    expect(counterId3).not.toBe(counterId1);

    // Non-retryable 400 error clears draft key
    await expect(
      useChat.getState().respondToOffer('conv-1', 'offer-1', {
        action: 'COUNTER',
        counterPrice: 135000,
        note: 'Bớt 15k nhé',
      }),
    ).rejects.toThrow('Giá đề xuất không hợp lệ.');
    const counterId4 = mockedChatApi.respondToPriceOffer.mock.calls[3][2].clientMessageId;

    await useChat.getState().respondToOffer('conv-1', 'offer-1', {
      action: 'COUNTER',
      counterPrice: 135000,
      note: 'Bớt 15k nhé',
    });
    const counterId5 = mockedChatApi.respondToPriceOffer.mock.calls[4][2].clientMessageId;
    expect(counterId5).toBeTruthy();
    expect(counterId5).not.toBe(counterId4);
  });

  test('stale same-version poll response does not overwrite COUNTERPARTY_RESTRICTED lock in detail or conversation list', async () => {
    const pendingOffer = makeOfferMessage({
      id: 'offer-lock-1',
      senderId: sellerUser.id,
      senderName: sellerUser.name,
      offerStatus: 'CHO_PHAN_HOI',
      canRespond: true,
    });

    mockedChatApi.fetchConversationDetail.mockResolvedValueOnce(
      makeSampleDetail({
        id: 'conv-1',
        version: 2,
        canSendMessage: true,
        canMakeOffer: true,
        restrictionReason: null,
        counterpartyStatus: 'HOAT_DONG',
        counterpartyRestricted: false,
        messages: [pendingOffer],
      }),
    );
    await useChat.getState().loadConversationDetail('conv-1');

    // Trigger 403 COUNTERPARTY_RESTRICTED -> locks detail & summary locally at version 2
    mockedChatApi.sendChatMessage.mockRejectedValueOnce(
      new ApiError(
        403,
        'Tài khoản của đối phương hiện đang bị khóa hoặc hạn chế giao dịch.',
        'COUNTERPARTY_RESTRICTED',
      ),
    );
    await expect(useChat.getState().sendMessage('conv-1', 'Alo')).rejects.toThrow(
      'Tài khoản của đối phương hiện đang bị khóa hoặc hạn chế giao dịch.',
    );

    expect(useChat.getState().detailsById['conv-1'].restrictionReason).toBe(
      'COUNTERPARTY_RESTRICTED',
    );
    expect(useChat.getState().detailsById['conv-1'].messages[0].canRespond).toBe(false);

    // Overlapping stale poll returns same version 2 without restriction -> lock must stay preserved
    mockedChatApi.fetchConversationDetail.mockResolvedValueOnce(
      makeSampleDetail({
        id: 'conv-1',
        version: 2,
        canSendMessage: true,
        canMakeOffer: true,
        restrictionReason: null,
        counterpartyStatus: 'HOAT_DONG',
        counterpartyRestricted: false,
        messages: [pendingOffer],
      }),
    );
    await useChat.getState().loadConversationDetail('conv-1', { silent: true });

    const lockedDetail = useChat.getState().detailsById['conv-1'];
    expect(lockedDetail.canSendMessage).toBe(false);
    expect(lockedDetail.canMakeOffer).toBe(false);
    expect(lockedDetail.restrictionReason).toBe('COUNTERPARTY_RESTRICTED');
    expect(lockedDetail.counterpartyStatus).toBe('HAN_CHE');
    expect(lockedDetail.counterpartyRestricted).toBe(true);
    expect(lockedDetail.messages[0].canRespond).toBe(false);

    const lockedSummaryFromDetail = useChat.getState().conversations.find((c) => c.id === 'conv-1');
    expect(lockedSummaryFromDetail?.restrictionReason).toBe('COUNTERPARTY_RESTRICTED');
    expect(lockedSummaryFromDetail?.canSendMessage).toBe(false);
    expect(lockedSummaryFromDetail?.canMakeOffer).toBe(false);

    // Stale same-version list poll also must not unlock the summary
    mockedChatApi.fetchConversations.mockResolvedValueOnce([
      makeSampleSummary({
        id: 'conv-1',
        version: 2,
        canSendMessage: true,
        canMakeOffer: true,
        restrictionReason: null,
        counterpartyStatus: 'HOAT_DONG',
        counterpartyRestricted: false,
        lastMessage: pendingOffer,
      }),
    ]);
    await useChat.getState().loadConversations({ silent: true });

    const lockedSummaryFromList = useChat.getState().conversations.find((c) => c.id === 'conv-1');
    expect(lockedSummaryFromList?.restrictionReason).toBe('COUNTERPARTY_RESTRICTED');
    expect(lockedSummaryFromList?.canSendMessage).toBe(false);
    expect(lockedSummaryFromList?.canMakeOffer).toBe(false);
    expect(lockedSummaryFromList?.counterpartyStatus).toBe('HAN_CHE');
    expect(lockedSummaryFromList?.counterpartyRestricted).toBe(true);
    expect(lockedSummaryFromList?.lastMessage?.canRespond).toBe(false);
  });

  test('ChatScreen stops 5s polling immediately when getConversation returns 404 CONVERSATION_NOT_FOUND', async () => {
    jest.useFakeTimers();
    mockRouteParams.conversationId = 'conv-missing';
    mockedChatApi.fetchConversationDetail.mockRejectedValue(
      new ApiError(404, 'Không tìm thấy cuộc hội thoại.', 'CONVERSATION_NOT_FOUND'),
    );

    render(<ChatScreen />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockedChatApi.fetchConversationDetail).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(15000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockedChatApi.fetchConversationDetail).toHaveBeenCalledTimes(1);
  });

  test('ChatScreen synchronous ref guards prevent same-frame double-tap duplicate API requests', async () => {
    useSession.setState({ token: 'seller-token', user: sellerUser });
    mockRouteParams.conversationId = 'conv-1';

    const buyerOffer = makeOfferMessage({
      id: 'offer-dbl-1',
      senderId: buyerUser.id,
      senderName: buyerUser.name,
      offeredPrice: 120000,
      offerStatus: 'CHO_PHAN_HOI',
      canRespond: true,
    });
    mockedChatApi.fetchConversationDetail.mockResolvedValue(
      makeSampleDetail({
        currentUserId: sellerUser.id,
        messages: [buyerOffer],
        version: 1,
      }),
    );

    let resolveMsg!: (v: ChatMessage) => void;
    let resolveOffer!: (v: ConversationDetail) => void;
    let resolveRespond!: (v: ConversationDetail) => void;

    mockedChatApi.sendChatMessage.mockReturnValue(
      new Promise<ChatMessage>((r) => {
        resolveMsg = r;
      }),
    );
    mockedChatApi.createPriceOffer.mockReturnValue(
      new Promise<ConversationDetail>((r) => {
        resolveOffer = r;
      }),
    );
    mockedChatApi.respondToPriceOffer.mockReturnValue(
      new Promise<ConversationDetail>((r) => {
        resolveRespond = r;
      }),
    );

    render(<ChatScreen />);
    expect(await screen.findByTestId('accept-offer-offer-dbl-1')).toBeTruthy();

    // 1. Double-tap send text in the same frame
    fireEvent.changeText(screen.getByTestId('chat-message-input'), 'Tin nhắn không gửi đúp');
    const sendBtn = screen.getByTestId('chat-send-button');
    fireEvent.press(sendBtn);
    fireEvent.press(sendBtn);
    expect(mockedChatApi.sendChatMessage).toHaveBeenCalledTimes(1);

    // 2. Double-tap create offer in the same frame
    fireEvent.press(screen.getByTestId('open-offer-form-button'));
    fireEvent.changeText(screen.getByTestId('offer-price-input'), '130000');
    const submitOfferBtn = screen.getByTestId('submit-offer-button');
    fireEvent.press(submitOfferBtn);
    fireEvent.press(submitOfferBtn);
    expect(mockedChatApi.createPriceOffer).toHaveBeenCalledTimes(1);

    // 3. Double-tap respond offer in the same frame
    const acceptBtn = screen.getByTestId('accept-offer-offer-dbl-1');
    fireEvent.press(acceptBtn);
    fireEvent.press(acceptBtn);
    expect(mockedChatApi.respondToPriceOffer).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveMsg(makeTextMessage({ id: 'msg-dbl-ok', conversationVersion: 2 }));
      resolveOffer(makeSampleDetail({ currentUserId: sellerUser.id, version: 3 }));
      resolveRespond(makeSampleDetail({ currentUserId: sellerUser.id, version: 4 }));
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  test('GIU_CHO rule sync: keeps text messaging enabled while disabling price negotiation on ChatScreen', async () => {
    mockRouteParams.conversationId = 'conv-reserved';
    mockedChatApi.fetchConversationDetail.mockResolvedValue(
      makeSampleDetail({
        id: 'conv-reserved',
        listingStatus: 'GIU_CHO',
        canSendMessage: true,
        canMakeOffer: false,
        restrictionReason: 'LISTING_NOT_AVAILABLE',
      }),
    );

    render(<ChatScreen />);

    expect(await screen.findByTestId('chat-restriction-banner')).toBeTruthy();
    expect(
      screen.getByText(
        'Tin đăng đang được giữ chỗ nên tạm khóa thương lượng giá. Bạn vẫn có thể nhắn tin trao đổi thông thường.',
      ),
    ).toBeTruthy();
    expect(screen.queryByTestId('offer-composer-section')).toBeNull();
    expect(screen.getByTestId('chat-send-button').props.accessibilityState.disabled).toBe(false);
  });
});

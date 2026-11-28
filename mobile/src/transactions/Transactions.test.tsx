import React from 'react';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, Animated, ScrollView, StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { api, ApiError, attachment } from '../api/client';
import { useSession, type User } from '../auth/session';
import * as imagePicker from '../media/imagePicker';
import type { RootStack } from '../navigation';
import TransactionsScreen from '../screens/TransactionsScreen';
import TransactionDetailScreen from '../screens/TransactionDetailScreen';
import MyListingsScreen from '../screens/MyListingsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import { useSellerListings } from '../listings/sellerStore';
import {
  OtpCodeInput,
  SkeletonBox,
  Toast,
  TransactionDetailSkeleton,
  TransactionListSkeleton,
  TransactionStepper,
} from '../components/ui';
import { CountdownPill } from '../components/transactions/CountdownPill';
import { TransactionTimeline } from '../components/transactions/TransactionTimeline';
import { HandoverPhotoUploader } from '../components/transactions/HandoverPhotoUploader';
import { HandoverProofCard } from '../components/transactions/HandoverProofCard';
import { CancelConsentCard } from '../components/transactions/CancelConsentCard';
import {
  fetchHandoverPhotoDataUri,
  normalizeHandoverAttachmentPath,
} from './api';
import { useTransactions } from './store';
import {
  computeClockOffsetMs,
  computeRemainingSeconds,
  formatCountdownMmSs,
  formatEscalationCountdown,
  formatFileSize,
  formatMimeShort,
  formatOtpDisplay,
  formatRelativeTime,
  mapTimelineActionLabel,
  mapTransactionStatusLabel,
} from './types';

jest.mock('../api/client', () => {
  const actual = jest.requireActual<typeof import('../api/client')>('../api/client');
  const mockApi = jest.fn();
  return {
    ...actual,
    api: mockApi,
    apiMultipart: jest.fn(async (path: string, buildFormData: () => FormData | Promise<FormData>) =>
      mockApi(path, { method: 'POST', body: await buildFormData() }),
    ),
    attachment: jest.fn(),
  };
});

jest.mock('../media/imagePicker', () => {
  const actual = jest.requireActual<typeof import('../media/imagePicker')>('../media/imagePicker');
  return {
    ...actual,
    takePhotoWithCamera: jest.fn(),
    pickImagesFromLibrary: jest.fn(),
  };
});

const mockedApi = jest.mocked(api);
const mockedAttachment = jest.mocked(attachment);
const mockedCamera = jest.mocked(imagePicker.takePhotoWithCamera);
const mockedLibrary = jest.mocked(imagePicker.pickImagesFromLibrary);

const Stack = createNativeStackNavigator<RootStack>();

const ACTIVE_USER: User = {
  id: 'u-me',
  name: 'Nguyễn Minh',
  email: 'minh@uit.edu.vn',
  studentId: '22520101',
  role: 'member',
  roles: ['MEMBER'],
  emailVerified: true,
  profileApproved: true,
  accountStatus: 'HOAT_DONG',
};

const LOCKED_USER: User = {
  ...ACTIVE_USER,
  roles: [],
  accountStatus: 'BI_KHOA',
  restriction: {
    accountStatus: 'BI_KHOA',
    lockType: 'KHOA_TAM_THOI',
    reason: 'Vi phạm quy định giao dịch',
    lockedUntil: '2026-12-10T00:00:00Z',
    appealable: false,
    reputationScore: 45,
    message: 'Tài khoản của bạn đang bị khóa tạm thời.',
  },
};

function makeRawDetail(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 9 * 60 * 1000).toISOString();
  const escalateAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  return {
    id: 'tx-100',
    version: 3,
    serverNow: now.toISOString(),
    status: 'CHO_XAC_NHAN',
    viewerRole: 'BUYER',
    agreedPriceVnd: 150000,
    isFree: false,
    appointmentAt: '2026-11-28T09:00:00Z',
    appointmentLocation: 'Sảnh B4 KTX Khu A',
    deliveryStartedAt: '2026-11-28T08:30:00Z',
    deliveredAt: now.toISOString(),
    autoEscalateAt: escalateAt,
    completedAt: null,
    cancelledAt: null,
    escalationReason: null,
    escalatedAt: null,
    listing: {
      id: 'lst-1',
      title: 'Giáo trình Nhập môn Công nghệ Phần mềm',
      thumbnailUrl: '/api/v1/media/11111111-1111-1111-1111-111111111111',
      isCombo: false,
      isFree: false,
      status: 'GIU_CHO',
    },
    items: [
      {
        id: 'item-1',
        name: 'Giáo trình SE100 (bản in mới)',
        condition: 'Mới 95%, không gạch bút chì',
        status: 'DANG_GIU',
        thumbnailUrl: null,
      },
    ],
    counterparty: {
      id: 'u-other',
      displayName: 'Trần Anh Khoa',
      reputationScore: 124,
    },
    handoverProof: {
      photoId: 'ph-1',
      photoUrl: '/api/v1/transactions/tx-100/handover-photo',
      photos: [
        {
          id: 'ph-1',
          url: '/api/v1/transactions/tx-100/handover-photos/ph-1',
          contentType: 'image/jpeg',
          sizeBytes: 98000,
          uploadedAt: now.toISOString(),
        },
      ],
      uploadedAt: now.toISOString(),
      note: 'Đã giao tận tay tại sảnh B4',
      contentType: 'image/jpeg',
    },
    otp: {
      id: 'otp-1',
      status: 'ACTIVE',
      issuedAt: now.toISOString(),
      expiresAt,
      remainingSeconds: 540,
      attemptsUsed: 0,
      maxAttempts: 5,
      remainingAttempts: 5,
      inAppCode: '482915',
    },
    cancellationRequest: null,
    actions: {
      canReportDelivered: false,
      canVerifyOtp: true,
      canReissueOtp: true,
      canRequestCancel: true,
      canRespondCancel: false,
      canViewHandoverPhoto: true,
    },
    timeline: [
      {
        id: 'ev-1',
        action: 'DELIVERY_STARTED',
        fromStatus: 'GIU_CHO',
        toStatus: 'DANG_GIAO',
        actorRole: 'SELLER',
        note: null,
        createdAt: '2026-11-28T08:30:00Z',
      },
      {
        id: 'ev-2',
        action: 'HANDOVER_REPORTED',
        fromStatus: 'DANG_GIAO',
        toStatus: 'CHO_XAC_NHAN',
        actorRole: 'SELLER',
        note: 'Đã giao tận tay tại sảnh B4',
        createdAt: now.toISOString(),
      },
    ],
    ...overrides,
  };
}

function makeRawListItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tx-100',
    listingId: 'lst-1',
    listingTitle: 'Giáo trình Nhập môn Công nghệ Phần mềm',
    listingThumbnailUrl: null,
    isCombo: false,
    isFree: false,
    itemCount: 1,
    agreedPriceVnd: 150000,
    status: 'CHO_XAC_NHAN',
    viewerRole: 'BUYER',
    counterparty: { id: 'u-other', displayName: 'Trần Anh Khoa', reputationScore: 124 },
    appointmentAt: '2026-11-28T09:00:00Z',
    appointmentLocation: 'Sảnh B4 KTX Khu A',
    deliveredAt: '2026-11-28T09:05:00Z',
    completedAt: null,
    cancelledAt: null,
    hasPendingCancelRequest: false,
    needsViewerAction: true,
    escalationReason: null,
    updatedAt: '2026-11-28T09:05:00Z',
    version: 3,
    ...overrides,
  };
}

const StubListings = () => <View testID="stub-listings" />;
const StubLogin = () => <View testID="stub-login" />;
const StubCreate = () => <View testID="stub-create" />;
const StubEdit = () => <View testID="stub-edit" />;
const StubListing = () => <View testID="stub-listing" />;
const StubSettings = () => <View testID="stub-settings" />;
const StubInventory = () => <View testID="stub-inv" />;

function renderDetail(id = 'tx-100') {
  return render(
    <NavigationContainer>
      <Stack.Navigator initialRouteName="TransactionDetail">
        <Stack.Screen
          name="TransactionDetail"
          component={TransactionDetailScreen}
          initialParams={{ id }}
        />
        <Stack.Screen name="Transactions" component={TransactionsScreen} />
        <Stack.Screen name="MyListings" component={MyListingsScreen} />
        <Stack.Screen name="Listing" component={StubListing} />
      </Stack.Navigator>
    </NavigationContainer>,
  );
}

function renderTransactionsStack(initialRoute: 'Transactions' | 'Profile' | 'MyListings' = 'Transactions') {
  return render(
    <NavigationContainer>
      <Stack.Navigator initialRouteName={initialRoute}>
        <Stack.Screen name="Transactions" component={TransactionsScreen} />
        <Stack.Screen name="TransactionDetail" component={TransactionDetailScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="MyListings" component={MyListingsScreen} />
        <Stack.Screen name="Listings" component={StubListings} />
        <Stack.Screen name="Login" component={StubLogin} />
        <Stack.Screen name="CreateListing" component={StubCreate} />
        <Stack.Screen name="EditListing" component={StubEdit} />
        <Stack.Screen name="Listing" component={StubListing} />
        <Stack.Screen name="Settings" component={StubSettings} />
        <Stack.Screen name="InventoryList" component={StubInventory} />
      </Stack.Navigator>
    </NavigationContainer>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedApi.mockReset();
  mockedAttachment.mockReset();
  mockedCamera.mockReset();
  mockedLibrary.mockReset();
  useTransactions.getState().reset();
  useSellerListings.getState().reset();
  useSession.setState({
    token: 'valid-token',
    user: ACTIVE_USER,
    loading: false,
    restriction: null,
    restrictionDismissed: false,
  });
  mockedAttachment.mockResolvedValue({
    type: 'image/jpeg',
    bytes: new Uint8Array([255, 216, 255, 224]).buffer,
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('P3-02 helpers, formatters and private proof path security (NFR-01)', () => {
  test('normalizes auth-gated proof URLs safely and blocks public media or traversal paths', async () => {
    expect(normalizeHandoverAttachmentPath('/api/v1/transactions/tx-100/handover-photo')).toBe(
      '/transactions/tx-100/handover-photo',
    );
    expect(
      normalizeHandoverAttachmentPath('/api/v1/transactions/tx-100/handover-photos/ph-1'),
    ).toBe('/transactions/tx-100/handover-photos/ph-1');
    expect(normalizeHandoverAttachmentPath('/api/v1/media/11111111-1111-1111-1111-111111111111')).toBeNull();
    expect(normalizeHandoverAttachmentPath('/api/v1/transactions/../../etc/passwd')).toBeNull();

    const dataUri = await fetchHandoverPhotoDataUri('/api/v1/transactions/tx-100/handover-photo');
    expect(mockedAttachment).toHaveBeenCalledWith('/transactions/tx-100/handover-photo');
    expect(dataUri).toMatch(/^data:image\/jpeg;base64,/);
  });

  test('formats statuses, timeline actions, code display, and server-synced countdown without raw enums', () => {
    expect(mapTransactionStatusLabel('CHO_XAC_NHAN')).toBe('Chờ xác nhận');
    expect(mapTransactionStatusLabel('CHO_XU_LY')).toBe('Chờ kiểm duyệt');
    expect(mapTransactionStatusLabel('HOAN_TAT')).toBe('Đã hoàn tất');
    expect(mapTransactionStatusLabel('RAW_UNKNOWN')).toBe('Không xác định');

    expect(mapTimelineActionLabel('HANDOVER_REPORTED')).toBe('Đã báo giao');
    expect(mapTimelineActionLabel('REPORT_DELIVERED')).toBe('Đã báo giao');
    expect(mapTimelineActionLabel('DELIVERY_REPORTED')).toBe('Đã báo giao');
    expect(mapTimelineActionLabel('COMPLETED_BY_OTP')).toBe('Đã hoàn tất giao dịch');
    expect(mapTimelineActionLabel('AUTO_ESCALATED_OVERDUE_24H')).toBe(
      'Chuyển kiểm duyệt sau 24 giờ',
    );
    expect(mapTimelineActionLabel('UNKNOWN_ACTION_CODE')).toBe('Cập nhật giao dịch');

    expect(formatOtpDisplay('482915')).toBe('482 · 915');
    expect(formatCountdownMmSs(599)).toBe('09:59');
    expect(formatCountdownMmSs(0)).toBe('00:00');

    const nowMs = Date.parse('2026-11-28T01:00:00Z');
    const offset = computeClockOffsetMs('2026-11-28T01:00:10Z', nowMs);
    expect(offset).toBe(10000);
    expect(computeRemainingSeconds('2026-11-28T01:02:10Z', offset, nowMs)).toBe(120);
  });
});

describe('UC-27 Seller Handover Flow (photo validation, camera/library upload, 0đ gift)', () => {
  test('validates required handover photo (E1), uploads camera photo for 0đ giveaway (A2), and transitions to waiting card without exposing OTP', async () => {
    const sellerDelivering = makeRawDetail({
      status: 'DANG_GIAO',
      viewerRole: 'SELLER',
      agreedPriceVnd: 0,
      isFree: true,
      deliveredAt: null,
      autoEscalateAt: null,
      handoverProof: null,
      otp: null,
      actions: {
        canReportDelivered: true,
        canVerifyOtp: false,
        canReissueOtp: false,
        canRequestCancel: false,
        canRespondCancel: false,
        canViewHandoverPhoto: false,
      },
    });
    const sellerWaiting = makeRawDetail({
      status: 'CHO_XAC_NHAN',
      viewerRole: 'SELLER',
      agreedPriceVnd: 0,
      isFree: true,
      otp: {
        id: 'otp-2',
        status: 'ACTIVE',
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        remainingSeconds: 600,
        attemptsUsed: 0,
        maxAttempts: 5,
        remainingAttempts: 5,
        inAppCode: null,
      },
      actions: {
        canReportDelivered: false,
        canVerifyOtp: false,
        canReissueOtp: false,
        canRequestCancel: true,
        canRespondCancel: false,
        canViewHandoverPhoto: true,
      },
    });

    mockedApi
      .mockResolvedValueOnce(sellerDelivering)
      .mockResolvedValueOnce(sellerWaiting);
    mockedCamera.mockResolvedValueOnce({
      uri: 'file:///handover-desk.jpg',
      fileName: 'handover-desk.jpg',
      mimeType: 'image/jpeg',
      fileSize: 102400,
    });

    renderDetail('tx-100');

    expect(await screen.findByTestId('seller-handover-workbench')).toBeTruthy();
    expect(screen.getByTestId('tx-agreed-price').props.children).toBe('Miễn phí (0đ)');

    // E1: Missing photo shows inline error and does NOT call backend
    fireEvent.press(screen.getByTestId('report-delivered-btn'));
    expect(await screen.findByTestId('handover-photo-error')).toBeTruthy();
    expect(mockedApi).toHaveBeenCalledTimes(1);

    // Pick photo via camera and fill note
    fireEvent.press(screen.getByTestId('handover-take-photo'));
    expect(await screen.findByTestId('handover-photo-preview')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('handover-note-input'), 'Đã tặng đèn học tại sảnh A');

    // Submit opens confirmation sheet -> confirm calls POST /transactions/tx-100/deliver
    fireEvent.press(screen.getByTestId('report-delivered-btn'));
    expect(await screen.findByTestId('report-delivered-confirm-sheet')).toBeTruthy();
    fireEvent.press(screen.getByTestId('report-delivered-confirm-btn'));

    expect(await screen.findByTestId('seller-waiting-telemetry')).toBeTruthy();
    expect(screen.getByTestId('seller-24h-escalation-notice')).toBeTruthy();
    // Seller MUST NEVER see Buyer's private OTP box or verify input
    expect(screen.queryByTestId('buyer-inapp-otp-card')).toBeNull();
    expect(screen.queryByTestId('handover-otp-input')).toBeNull();
    expect(mockedApi).toHaveBeenCalledWith(
      '/transactions/tx-100/deliver',
      expect.objectContaining({ method: 'POST', body: expect.any(FormData) }),
    );
  });
});

describe('UC-27 Buyer Proof Inspection & 6-Digit OTP Completion (E3, E4, E5, NFR-01, NFR-03)', () => {
  test('loads private proof photo with retry + lightbox 2x zoom, handles wrong OTP (E3) -> 5/5 lockout (E4) -> reissue -> valid completion receipt', async () => {
    const buyerDetail = makeRawDetail();
    const reissuedDetail = makeRawDetail({
      version: 4,
      otp: {
        id: 'otp-fresh',
        status: 'ACTIVE',
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        remainingSeconds: 600,
        attemptsUsed: 0,
        maxAttempts: 5,
        remainingAttempts: 5,
        inAppCode: '654321',
      },
    });
    const completedDetail = makeRawDetail({
      version: 5,
      status: 'HOAN_TAT',
      completedAt: '2026-11-28T09:15:00Z',
      items: [
        {
          id: 'item-1',
          name: 'Giáo trình SE100 (bản in mới)',
          condition: 'Mới 95%, không gạch bút chì',
          status: 'DA_CHUYEN_GIAO',
          thumbnailUrl: null,
        },
      ],
      otp: {
        id: 'otp-fresh',
        status: 'USED',
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 9 * 60 * 1000).toISOString(),
        remainingSeconds: 0,
        attemptsUsed: 0,
        maxAttempts: 5,
        remainingAttempts: 5,
        inAppCode: null,
      },
      actions: {
        canReportDelivered: false,
        canVerifyOtp: false,
        canReissueOtp: false,
        canRequestCancel: false,
        canRespondCancel: false,
        canViewHandoverPhoto: true,
      },
    });

    // Simulate photo failure first, then success on retry
    mockedAttachment
      .mockRejectedValueOnce(new Error('Mạng không ổn định.'))
      .mockResolvedValueOnce({
        type: 'image/jpeg',
        bytes: new Uint8Array([255, 216, 255, 224]).buffer,
      });

    mockedApi
      .mockResolvedValueOnce(buyerDetail) // initial GET
      .mockRejectedValueOnce(
        new ApiError(400, 'Mã không đúng, còn 4/5 lượt.', 'OTP_INVALID', {
          attemptsUsed: 1,
          maxAttempts: 5,
          remainingAttempts: 4,
          locked: false,
        }),
      ) // 1st wrong OTP (E3)
      .mockRejectedValueOnce(
        new ApiError(409, 'Bạn đã nhập sai mã quá 5/5 lần cho phép.', 'OTP_ATTEMPTS_EXCEEDED', {
          attemptsUsed: 5,
          maxAttempts: 5,
          remainingAttempts: 0,
          locked: true,
        }),
      ) // 5th wrong OTP lockout (E4)
      .mockResolvedValueOnce(reissuedDetail) // POST /otp/reissue
      .mockResolvedValueOnce(completedDetail); // POST /complete

    renderDetail('tx-100');

    // Proof photo error -> retry -> opens lightbox -> toggles 1x/2x zoom
    expect(await screen.findByTestId('handover-proof-error')).toBeTruthy();
    expect(screen.getByTestId('handover-privacy-badge')).toBeTruthy();
    fireEvent.press(screen.getByTestId('handover-proof-retry'));
    expect(await screen.findByTestId('handover-proof-image')).toBeTruthy();

    fireEvent.press(screen.getByTestId('handover-proof-zoom-trigger'));
    expect(await screen.findByTestId('handover-proof-lightbox')).toBeTruthy();
    expect(screen.getByText('1x')).toBeTruthy();
    fireEvent.press(screen.getByTestId('proof-zoom-toggle'));
    expect(screen.getByText('2x')).toBeTruthy();
    fireEvent.press(screen.getByTestId('proof-lightbox-close'));

    // Compact 1-row inline code strip: visible, selectable, eye toggle, no bloated copy button
    const codeNode = screen.getByTestId('buyer-inapp-otp-code');
    expect(codeNode.props.children).toBe('482 · 915');
    expect(codeNode.props.selectable).toBe(true);
    expect(screen.queryByTestId('copy-inapp-otp-btn')).toBeNull();
    fireEvent.press(screen.getByTestId('toggle-inapp-otp-visibility'));
    expect(screen.getByTestId('buyer-inapp-otp-code').props.children).toBe('••• · •••');

    // E3: Paste wrong 6-digit code -> updates remaining attempts to 4/5
    fireEvent.changeText(screen.getByTestId('handover-otp-input'), '111111');
    fireEvent.press(screen.getByTestId('otp-confirm-submit-btn'));
    expect(await screen.findByText('Mã không đúng, còn 4/5 lượt.')).toBeTruthy();
    expect(screen.getByText('Còn 4/5 lượt')).toBeTruthy();

    // E4: 5th failed attempt locks OTP input & surfaces reissue button
    fireEvent.changeText(screen.getByTestId('handover-otp-input'), '222222');
    fireEvent.press(screen.getByTestId('otp-confirm-submit-btn'));
    expect(await screen.findByTestId('otp-exhausted-banner')).toBeTruthy();
    expect(screen.getByTestId('handover-otp-input').props.editable).toBe(false);

    // Reissue fresh OTP (654321)
    fireEvent.press(screen.getByTestId('otp-reissue-btn'));
    await waitFor(() =>
      expect(screen.getByTestId('buyer-inapp-otp-code').props.children).toBe('654 · 321'),
    );

    // Enter valid 6-digit OTP -> completes transaction -> renders Sage settlement receipt
    fireEvent.changeText(screen.getByTestId('handover-otp-input'), '654321');
    fireEvent.press(screen.getByTestId('otp-confirm-submit-btn'));
    expect(await screen.findByTestId('transaction-completed-receipt')).toBeTruthy();
    expect(screen.getByTestId('completed-review-cta')).toBeTruthy();
    expect(screen.getByText('Đã chuyển giao')).toBeTruthy();
  });

  test('locks OTP boxes on 10-minute expiry (E5) without cancelling hold and allows reissue', async () => {
    const expiredDetail = makeRawDetail({
      otp: {
        id: 'otp-exp',
        status: 'EXPIRED',
        issuedAt: '2026-11-28T00:00:00Z',
        expiresAt: '2026-11-28T00:10:00Z',
        remainingSeconds: 0,
        attemptsUsed: 1,
        maxAttempts: 5,
        remainingAttempts: 4,
        inAppCode: null,
      },
      actions: {
        canReportDelivered: false,
        canVerifyOtp: false,
        canReissueOtp: true,
        canRequestCancel: true,
        canRespondCancel: false,
        canViewHandoverPhoto: true,
      },
    });
    mockedApi.mockResolvedValueOnce(expiredDetail);

    renderDetail('tx-100');

    expect(await screen.findByTestId('otp-expired-banner')).toBeTruthy();
    expect(screen.getByTestId('handover-otp-input').props.editable).toBe(false);
    expect(screen.queryByTestId('buyer-inapp-otp-card')).toBeNull();
    expect(screen.getByTestId('otp-reissue-btn')).toBeTruthy();
  });
});

describe('UC-28 Post-Delivery Cancellation & Mutual Consent Workflow', () => {
  test('requester validates OTHER note, submits cancel reason, and sees waiting card without duplicate trigger (E3)', async () => {
    const initialDetail = makeRawDetail();
    const pendingCancelDetail = makeRawDetail({
      version: 4,
      cancellationRequest: {
        id: 'cr-1',
        status: 'CHO_XAC_NHAN',
        requestedByRole: 'BUYER',
        isViewerRequester: true,
        reasonCode: 'ITEM_NOT_AS_DESCRIBED',
        reasonLabel: 'Sản phẩm không đúng mô tả',
        reasonNote: 'Màn hình bị trầy góc trái',
        requestedAt: '2026-11-28T09:10:00Z',
        respondedAt: null,
        responseNote: null,
      },
      actions: {
        canReportDelivered: false,
        canVerifyOtp: true,
        canReissueOtp: true,
        canRequestCancel: false,
        canRespondCancel: false,
        canViewHandoverPhoto: true,
      },
    });

    mockedApi
      .mockResolvedValueOnce(initialDetail)
      .mockResolvedValueOnce(pendingCancelDetail);

    renderDetail('tx-100');

    fireEvent.press(await screen.findByTestId('open-cancel-request-btn'));
    expect(await screen.findByTestId('cancel-mutual-warning')).toBeTruthy();

    // Selecting OTHER without >=3-char note triggers validation error (matches backend >= 3 chars)
    fireEvent.press(screen.getByTestId('cancel-reason-chip-OTHER'));
    fireEvent.changeText(screen.getByTestId('cancel-reason-note-input'), 'ab');
    fireEvent.press(screen.getByTestId('cancel-submit-btn'));
    expect(
      await screen.findByText('Vui lòng nhập ít nhất 3 ký tự cho lý do khác.'),
    ).toBeTruthy();

    // Switch to ITEM_NOT_AS_DESCRIBED + note -> submit
    fireEvent.press(screen.getByTestId('cancel-reason-chip-ITEM_NOT_AS_DESCRIBED'));
    fireEvent.changeText(
      screen.getByTestId('cancel-reason-note-input'),
      'Màn hình bị trầy góc trái',
    );
    fireEvent.press(screen.getByTestId('cancel-submit-btn'));

    expect(await screen.findByTestId('cancel-waiting-card')).toBeTruthy();
    // Duplicate cancel trigger hidden (E3)
    expect(screen.queryByTestId('open-cancel-request-btn')).toBeNull();
    expect(mockedApi).toHaveBeenCalledWith(
      '/transactions/tx-100/cancel-requests',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          reasonCode: 'ITEM_NOT_AS_DESCRIBED',
          reasonNote: 'Màn hình bị trầy góc trái',
          version: 3,
        }),
      }),
    );
  });

  test('counterparty sees high-stakes decision card and AGREE moves transaction to HUY cancellation receipt (A1)', async () => {
    const sellerPendingConsent = makeRawDetail({
      viewerRole: 'SELLER',
      otp: {
        id: 'otp-1',
        status: 'ACTIVE',
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 8 * 60 * 1000).toISOString(),
        remainingSeconds: 480,
        attemptsUsed: 0,
        maxAttempts: 5,
        remainingAttempts: 5,
        inAppCode: null,
      },
      cancellationRequest: {
        id: 'cr-9',
        status: 'CHO_XAC_NHAN',
        requestedByRole: 'BUYER',
        isViewerRequester: false,
        reasonCode: 'MUTUAL_AGREEMENT',
        reasonLabel: 'Hai bên thống nhất hủy',
        reasonNote: 'Đã thống nhất trả lại ngay tại sảnh',
        requestedAt: '2026-11-28T09:12:00Z',
        respondedAt: null,
        responseNote: null,
      },
      actions: {
        canReportDelivered: false,
        canVerifyOtp: false,
        canReissueOtp: false,
        canRequestCancel: false,
        canRespondCancel: true,
        canViewHandoverPhoto: true,
      },
    });
    const cancelledDetail = makeRawDetail({
      version: 4,
      status: 'HUY',
      viewerRole: 'SELLER',
      cancelledAt: '2026-11-28T09:15:00Z',
      otp: null,
      cancellationRequest: {
        ...(sellerPendingConsent.cancellationRequest as Record<string, unknown>),
        status: 'DONG_Y',
        respondedAt: '2026-11-28T09:15:00Z',
        responseNote: 'Đồng ý hủy',
      },
      actions: {
        canReportDelivered: false,
        canVerifyOtp: false,
        canReissueOtp: false,
        canRequestCancel: false,
        canRespondCancel: false,
        canViewHandoverPhoto: true,
      },
    });

    mockedApi
      .mockResolvedValueOnce(sellerPendingConsent)
      .mockResolvedValueOnce(cancelledDetail);

    renderDetail('tx-100');

    expect(await screen.findByTestId('cancel-consent-card')).toBeTruthy();
    fireEvent.press(screen.getByTestId('cancel-agree-btn'));
    expect(await screen.findByTestId('cancel-decision-sheet')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('cancel-decision-note-input'), 'Đồng ý hủy');
    fireEvent.press(screen.getByTestId('cancel-decision-confirm'));

    expect(await screen.findByTestId('transaction-cancelled-receipt')).toBeTruthy();
    expect(mockedApi).toHaveBeenCalledWith(
      '/transactions/tx-100/cancel-requests/cr-9/respond',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          decision: 'AGREE',
          responseNote: 'Đồng ý hủy',
          version: 3,
        }),
      }),
    );
  });

  test('counterparty REJECT moves to CHO_XU_LY with TU_CHOI card, keeps needsViewerAction=false, and allows switching TU_CHOI -> AGREE (UC-29 Alt 4)', async () => {
    const sellerPendingConsent = makeRawDetail({
      viewerRole: 'SELLER',
      otp: null,
      cancellationRequest: {
        id: 'cr-10',
        status: 'CHO_XAC_NHAN',
        requestedByRole: 'BUYER',
        isViewerRequester: false,
        reasonCode: 'DEFECT_AT_HANDOVER',
        reasonLabel: 'Phát sinh lỗi khi kiểm tra trực tiếp',
        reasonNote: null,
        requestedAt: '2026-11-28T09:12:00Z',
        respondedAt: null,
        responseNote: null,
      },
      actions: {
        canReportDelivered: false,
        canVerifyOtp: false,
        canReissueOtp: false,
        canRequestCancel: false,
        canRespondCancel: true,
        canViewHandoverPhoto: true,
      },
    });
    const disputedDetail = makeRawDetail({
      version: 4,
      status: 'CHO_XU_LY',
      viewerRole: 'SELLER',
      escalationReason: 'CANCEL_DISPUTE',
      otp: null,
      cancellationRequest: {
        ...(sellerPendingConsent.cancellationRequest as Record<string, unknown>),
        status: 'TU_CHOI',
        respondedAt: '2026-11-28T09:16:00Z',
        responseNote: 'Đồ còn hoạt động tốt như ảnh bàn giao',
      },
      actions: {
        canReportDelivered: false,
        canVerifyOtp: false,
        canReissueOtp: false,
        canRequestCancel: false,
        canRespondCancel: true,
        canViewHandoverPhoto: true,
      },
    });
    const lateAgreedDetail = makeRawDetail({
      version: 5,
      status: 'HUY',
      viewerRole: 'SELLER',
      cancelledAt: '2026-11-28T09:20:00Z',
      otp: null,
      cancellationRequest: {
        ...(sellerPendingConsent.cancellationRequest as Record<string, unknown>),
        status: 'DONG_Y',
        respondedAt: '2026-11-28T09:20:00Z',
        responseNote: 'Thống nhất đồng ý hủy sau trao đổi lại',
      },
      actions: {
        canReportDelivered: false,
        canVerifyOtp: false,
        canReissueOtp: false,
        canRequestCancel: false,
        canRespondCancel: false,
        canViewHandoverPhoto: true,
      },
    });

    // Seed summary item in store to verify needsViewerAction becomes false on TU_CHOI even when canRespondCancel=true
    useTransactions.setState({
      items: [
        {
          id: 'tx-100',
          listingId: 'lst-1',
          listingTitle: 'Giáo trình Nhập môn Công nghệ Phần mềm',
          listingThumbnailUrl: null,
          isCombo: false,
          isFree: false,
          itemCount: 1,
          agreedPriceVnd: 150000,
          status: 'CHO_XAC_NHAN',
          viewerRole: 'SELLER',
          counterparty: { id: 'u-other', displayName: 'Trần Anh Khoa', reputationScore: 124 },
          appointmentAt: null,
          appointmentLocation: null,
          deliveredAt: null,
          autoEscalateAt: null,
          completedAt: null,
          cancelledAt: null,
          hasPendingCancelRequest: true,
          needsViewerAction: true,
          escalationReason: null,
          updatedAt: null,
          version: 3,
        },
      ],
    });

    mockedApi
      .mockResolvedValueOnce(sellerPendingConsent)
      .mockResolvedValueOnce(disputedDetail)
      .mockResolvedValueOnce(lateAgreedDetail);

    renderDetail('tx-100');

    fireEvent.press(await screen.findByTestId('cancel-reject-btn'));
    fireEvent.changeText(
      await screen.findByTestId('cancel-decision-note-input'),
      'Đồ còn hoạt động tốt như ảnh bàn giao',
    );
    fireEvent.press(screen.getByTestId('cancel-decision-confirm'));

    expect(await screen.findByTestId('transaction-escalated-section')).toBeTruthy();
    expect(screen.getByTestId('cancel-rejected-card')).toBeTruthy();
    expect(useTransactions.getState().items[0]?.needsViewerAction).toBe(false);

    // UC-29 Alt 4: Counterparty switches TU_CHOI -> AGREE via hoisted confirmation sheet
    fireEvent.press(screen.getByTestId('cancel-agree-btn'));
    expect(await screen.findByTestId('cancel-decision-sheet')).toBeTruthy();
    fireEvent.changeText(
      screen.getByTestId('cancel-decision-note-input'),
      'Thống nhất đồng ý hủy sau trao đổi lại',
    );
    fireEvent.press(screen.getByTestId('cancel-decision-confirm'));

    expect(await screen.findByTestId('transaction-cancelled-receipt')).toBeTruthy();
    expect(mockedApi).toHaveBeenLastCalledWith(
      '/transactions/tx-100/cancel-requests/cr-10/respond',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          decision: 'AGREE',
          responseNote: 'Thống nhất đồng ý hủy sau trao đổi lại',
          version: 4,
        }),
      }),
    );
  });
});

describe('Resilience, BI_KHOA read-only, 409 conflict, reduce-motion & entry points', () => {
  test('surfaces 409 VERSION_CONFLICT banner and reloads latest transaction state', async () => {
    const initial = makeRawDetail();
    const fresh = makeRawDetail({ version: 5, status: 'CHO_XU_LY', escalationReason: 'OVERDUE_24H' });

    mockedApi
      .mockResolvedValueOnce(initial)
      .mockRejectedValueOnce(new ApiError(409, 'Phiên bản giao dịch đã cũ.', 'VERSION_CONFLICT'))
      .mockResolvedValueOnce(fresh);

    renderDetail('tx-100');

    expect(await screen.findByTestId('handover-otp-input')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('handover-otp-input'), '482915');
    fireEvent.press(screen.getByTestId('otp-confirm-submit-btn'));

    expect(await screen.findByTestId('transaction-version-conflict-banner')).toBeTruthy();
    fireEvent.press(screen.getByTestId('transaction-conflict-reload-btn'));
    expect(await screen.findByTestId('transaction-escalated-section')).toBeTruthy();
  });

  test('renders BI_KHOA account in read-only mode with RestrictedAccountNotice and expands Zero-PII timeline', async () => {
    useSession.setState({
      token: 'locked-token',
      user: LOCKED_USER,
      restriction: LOCKED_USER.restriction ?? null,
    });
    mockedApi.mockResolvedValueOnce(
      makeRawDetail({
        otp: {
          id: 'otp-1',
          status: 'ACTIVE',
          issuedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 8 * 60 * 1000).toISOString(),
          remainingSeconds: 480,
          attemptsUsed: 0,
          maxAttempts: 5,
          remainingAttempts: 5,
          inAppCode: null,
        },
        actions: {
          canReportDelivered: false,
          canVerifyOtp: false,
          canReissueOtp: false,
          canRequestCancel: false,
          canRespondCancel: false,
          canViewHandoverPhoto: true,
        },
        timeline: [
          {
            id: 'ev-0',
            action: 'RESERVATION_ACCEPTED',
            fromStatus: 'YEU_CAU',
            toStatus: 'GIU_CHO',
            actorRole: 'SELLER',
            note: null,
            createdAt: '2026-11-28T08:00:00Z',
          },
          {
            id: 'ev-1',
            action: 'DELIVERY_STARTED',
            fromStatus: 'GIU_CHO',
            toStatus: 'DANG_GIAO',
            actorRole: 'SELLER',
            note: null,
            createdAt: '2026-11-28T08:30:00Z',
          },
          {
            id: 'ev-2',
            action: 'HANDOVER_REPORTED',
            fromStatus: 'DANG_GIAO',
            toStatus: 'CHO_XAC_NHAN',
            actorRole: 'SELLER',
            note: 'Đã giao tận tay tại sảnh B4',
            createdAt: '2026-11-28T09:00:00Z',
          },
        ],
      }),
    );

    renderDetail('tx-100');

    expect(await screen.findByTestId('restricted-account-notice')).toBeTruthy();
    expect(screen.queryByTestId('open-cancel-request-btn')).toBeNull();
    expect(screen.getByTestId('transaction-timeline')).toBeTruthy();
    expect(screen.queryByText('Chấp nhận giữ chỗ')).toBeNull();
    fireEvent.press(screen.getByTestId('transaction-timeline-toggle'));
    expect(screen.getByText('Chấp nhận giữ chỗ')).toBeTruthy();
    expect(screen.getByText('Bắt đầu giao hàng')).toBeTruthy();
  });

  test('OtpCodeInput and TransactionStepper respect reduce-motion preference', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const timingSpy = jest.spyOn(Animated, 'timing');

    const { rerender } = render(
      <>
        <TransactionStepper status="DANG_GIAO" />
        <OtpCodeInput value="" onChange={() => {}} status="idle" />
      </>,
    );

    await waitFor(() => expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalled());
    timingSpy.mockClear();

    rerender(
      <>
        <TransactionStepper status="CHO_XAC_NHAN" />
        <OtpCodeInput value="123456" onChange={() => {}} status="error" errorShakeKey={1} />
      </>,
    );

    expect(screen.getByTestId('tx-stepper')).toBeTruthy();
    expect(timingSpy).not.toHaveBeenCalled();
  });

  test('TransactionsScreen filters by role/status and opens TransactionDetail; Profile & MyListings navigate smoothly', async () => {
    mockedApi.mockImplementation((async (path: string) => {
      if (path.startsWith('/transactions/tx-100')) return makeRawDetail();
      if (path.startsWith('/transactions')) {
        return {
          items: [makeRawListItem()],
          pendingActionCount: 1,
          page: 0,
          size: 20,
          totalElements: 1,
          totalPages: 1,
        };
      }
      if (path === '/profile/me') {
        return {
          id: 'u-me',
          name: 'Nguyễn Minh',
          studentId: '22520101',
          email: 'minh@uit.edu.vn',
          phone: null,
          school: 'UIT',
          campus: 'Thủ Đức',
          major: 'KTPM',
          cohort: 'K17',
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
      if (path === '/auth/me') return ACTIVE_USER;
      if (path === '/listings/quota') {
        return { reputationScore: 120, activeCount: 1, limit: 10, remaining: 9, canPublish: true };
      }
      if (path.startsWith('/listings/mine')) {
        return {
          items: [
            {
              id: 'lst-reserved',
              title: 'Bàn học gấp gọn KTX',
              description: 'Còn mới',
              priceVnd: 120000,
              status: 'GIU_CHO',
              images: [],
              itemCount: 1,
              seller: { id: 'u-me', displayName: 'Nguyễn Minh', reputationScore: 120 },
              version: 2,
              activeTransactionId: 'tx-100',
            },
          ],
          quota: { reputationScore: 120, activeCount: 1, limit: 10, remaining: 9, canPublish: true },
          page: 0,
          size: 20,
          totalElements: 1,
          totalPages: 1,
        };
      }
      return [];
    }) as never);

    // 1. Entry from ProfileScreen -> TransactionsScreen -> filter -> TransactionDetailScreen
    const profileTree = renderTransactionsStack('Profile');
    const txShortcut = await profileTree.findByTestId('profile-shortcut-transactions');
    fireEvent.press(txShortcut);

    expect(await profileTree.findByTestId('transactions-screen')).toBeTruthy();
    expect(await profileTree.findByTestId('transaction-row-tx-100')).toBeTruthy();

    fireEvent.press(profileTree.getByTestId('tx-role-SELLER'));
    await waitFor(() =>
      expect(mockedApi).toHaveBeenCalledWith(expect.stringContaining('role=SELLER')),
    );

    fireEvent.press(profileTree.getByTestId('transaction-row-tx-100'));
    expect(await profileTree.findByTestId('transaction-detail-screen')).toBeTruthy();
    profileTree.unmount();

    // 2. Entry from MyListingsScreen GIU_CHO card -> direct TransactionDetailScreen deep-link
    const listingsTree = renderTransactionsStack('MyListings');
    const handoverBtn = await listingsTree.findByTestId('my-listing-handover-lst-reserved');
    fireEvent.press(handoverBtn);
    expect(await listingsTree.findByTestId('transaction-detail-screen')).toBeTruthy();
    listingsTree.unmount();

    // Verify library picker mock stays clean
    expect(mockedLibrary).not.toHaveBeenCalled();
  });

  test('guards against double-submit on OTP completion (NFR-03) and supports multi-photo combo handover switching', async () => {
    let resolveComplete!: (value: unknown) => void;
    const pendingComplete = new Promise((resolve) => {
      resolveComplete = resolve;
    });

    const multiPhotoDetail = makeRawDetail({
      handoverProof: {
        photoId: 'ph-1',
        photoUrl: '/api/v1/transactions/tx-100/handover-photo',
        photos: [
          {
            id: 'ph-1',
            url: '/api/v1/transactions/tx-100/handover-photos/ph-1',
            contentType: 'image/jpeg',
            sizeBytes: 98000,
            uploadedAt: new Date().toISOString(),
          },
          {
            id: 'ph-2',
            url: '/api/v1/transactions/tx-100/handover-photos/ph-2',
            contentType: 'image/png',
            sizeBytes: 82000,
            uploadedAt: new Date().toISOString(),
          },
        ],
        uploadedAt: new Date().toISOString(),
        note: 'Đủ 2 món combo',
        contentType: 'image/jpeg',
      },
    });
    const completedDetail = makeRawDetail({
      version: 4,
      status: 'HOAN_TAT',
      completedAt: '2026-11-28T09:20:00Z',
      otp: null,
      actions: {
        canReportDelivered: false,
        canVerifyOtp: false,
        canReissueOtp: false,
        canRequestCancel: false,
        canRespondCancel: false,
        canViewHandoverPhoto: true,
      },
    });

    mockedApi
      .mockResolvedValueOnce(multiPhotoDetail)
      .mockImplementationOnce(() => pendingComplete as Promise<never>);

    renderDetail('tx-100');

    expect(await screen.findByTestId('handover-proof-image')).toBeTruthy();
    // Switch to 2nd combo proof photo and verify auth-gated attachment call
    fireEvent.press(screen.getByTestId('handover-proof-switch-1'));
    await waitFor(() =>
      expect(mockedAttachment).toHaveBeenCalledWith('/transactions/tx-100/handover-photos/ph-2'),
    );

    // Rapid double-tap on OTP confirm triggers exactly ONE POST /complete (NFR-03)
    fireEvent.changeText(screen.getByTestId('handover-otp-input'), '482915');
    fireEvent.press(screen.getByTestId('otp-confirm-submit-btn'));
    fireEvent.press(screen.getByTestId('otp-confirm-submit-btn'));

    const completeCalls = mockedApi.mock.calls.filter(([path]) => path === '/transactions/tx-100/complete');
    expect(completeCalls).toHaveLength(1);

    await act(async () => {
      resolveComplete(completedDetail);
    });
    expect(await screen.findByTestId('transaction-completed-receipt')).toBeTruthy();
  });

  test('classifies 409 OTP_EXPIRED (locked=true) as EXPIRED rather than EXHAUSTED, and auto-reloads receipt on OTP_ALREADY_USED', async () => {
    const activeDetail = makeRawDetail();
    const completedDetail = makeRawDetail({
      version: 5,
      status: 'HOAN_TAT',
      completedAt: '2026-11-28T09:25:00Z',
      otp: null,
      actions: {
        canReportDelivered: false,
        canVerifyOtp: false,
        canReissueOtp: false,
        canRequestCancel: false,
        canRespondCancel: false,
        canViewHandoverPhoto: true,
      },
    });

    // 1. 409 OTP_EXPIRED with locked: true & remainingAttempts: 5 -> must render otp-expired-banner (NOT otp-exhausted-banner)
    mockedApi
      .mockResolvedValueOnce(activeDetail)
      .mockRejectedValueOnce(
        new ApiError(409, 'Mã xác nhận đã hết hạn sau 10 phút.', 'OTP_EXPIRED', {
          attemptsUsed: 0,
          maxAttempts: 5,
          remainingAttempts: 5,
          locked: true,
        }),
      );

    const expiredTree = renderDetail('tx-100');
    fireEvent.changeText(await expiredTree.findByTestId('handover-otp-input'), '482915');
    fireEvent.press(expiredTree.getByTestId('otp-confirm-submit-btn'));
    expect(await expiredTree.findByTestId('otp-expired-banner')).toBeTruthy();
    expect(expiredTree.queryByTestId('otp-exhausted-banner')).toBeNull();
    expiredTree.unmount();

    // 2. 409 OTP_ALREADY_USED -> automatically calls loadDetail and renders HOAN_TAT receipt
    useTransactions.getState().reset();
    mockedApi.mockReset();
    mockedApi
      .mockResolvedValueOnce(activeDetail)
      .mockRejectedValueOnce(
        new ApiError(409, 'Mã đã được sử dụng.', 'OTP_ALREADY_USED', {
          locked: true,
        }),
      )
      .mockResolvedValueOnce(completedDetail);

    const usedTree = renderDetail('tx-100');
    fireEvent.changeText(await usedTree.findByTestId('handover-otp-input'), '482915');
    fireEvent.press(usedTree.getByTestId('otp-confirm-submit-btn'));
    expect(await usedTree.findByTestId('transaction-completed-receipt')).toBeTruthy();
    usedTree.unmount();
  });

  test('BI_KHOA user sees read-only Giao dịch của tôi shortcut on ProfileScreen without calling quota and opens TransactionsScreen', async () => {
    useSession.setState({
      token: 'locked-token',
      user: LOCKED_USER,
      restriction: LOCKED_USER.restriction ?? null,
    });
    mockedApi.mockImplementation((async (path: string) => {
      if (path === '/profile/me') {
        return {
          id: 'u-me',
          name: 'Nguyễn Minh',
          studentId: '22520101',
          email: 'minh@uit.edu.vn',
          phone: null,
          school: 'UIT',
          campus: 'Thủ Đức',
          major: 'KTPM',
          cohort: 'K17',
          studyStatus: 'DANG_HOC',
          reputation: 45,
          emailVerified: true,
          profileApproved: true,
          profileStatus: 'DA_DUYET',
          rejectReason: null,
          pendingUpdate: false,
          hasStudentCard: false,
          accountStatus: 'BI_KHOA',
        };
      }
      if (path === '/auth/me') return LOCKED_USER;
      if (path.startsWith('/transactions')) {
        return {
          items: [makeRawListItem()],
          pendingActionCount: 0,
          page: 0,
          size: 20,
          totalElements: 1,
          totalPages: 1,
        };
      }
      return [];
    }) as never);

    const tree = renderTransactionsStack('Profile');
    const lockedShortcut = await tree.findByTestId('profile-locked-shortcut-transactions');
    expect(mockedApi).not.toHaveBeenCalledWith('/listings/quota');

    fireEvent.press(lockedShortcut);
    expect(await tree.findByTestId('transactions-screen')).toBeTruthy();
    expect(await tree.findByTestId('restricted-account-notice')).toBeTruthy();
    expect(await tree.findByTestId('transaction-row-tx-100')).toBeTruthy();
    tree.unmount();
  });
});

describe('Wave-2 Editorial Craft, Usability & Edge-Case Upgrades', () => {
  test('formats Wave-2 helpers (file size, MIME, escalation countdown, relative time, OTP_LOCKED_MAX_ATTEMPTS)', () => {
    expect(formatFileSize(98304)).toBe('96 KB');
    expect(formatFileSize(1572864)).toBe('1.5 MB');
    expect(formatFileSize(0)).toBe('');
    expect(formatMimeShort('image/jpeg')).toBe('JPEG');
    expect(formatMimeShort('image/png')).toBe('PNG');
    expect(formatMimeShort('image/webp')).toBe('WebP');
    expect(formatEscalationCountdown(23 * 3600 + 48 * 60)).toBe('23g 48p');
    expect(formatEscalationCountdown(45 * 60)).toBe('45p');
    expect(formatEscalationCountdown(25)).toBe('< 1p');
    const baseMs = Date.parse('2026-11-28T10:00:00Z');
    expect(formatRelativeTime('2026-11-28T09:59:30Z', baseMs)).toBe('Vừa xong');
    expect(formatRelativeTime('2026-11-28T09:48:00Z', baseMs)).toBe('12 phút trước');
    expect(formatRelativeTime('2026-11-28T07:00:00Z', baseMs)).toBe('3 giờ trước');
    expect(mapTimelineActionLabel('OTP_LOCKED_MAX_ATTEMPTS')).toBe('Nhập sai mã 5 lần');
  });

  test('CountdownPill fires onExpired immediately when initial <= 0, renders draining progressbar, and respects reduce-motion alongside Toast & Skeleton', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const timingSpy = jest.spyOn(Animated, 'timing');
    const onExpired = jest.fn();
    const onDismiss = jest.fn();

    const futureIso = new Date(Date.now() + 300_000).toISOString();
    const expiredIso = new Date(Date.now() - 5000).toISOString();

    const { rerender } = render(
      <>
        <CountdownPill expiresAt={futureIso} ttlSeconds={600} showProgressBar onExpired={onExpired} />
        <Toast visible={false} message="" tone="success" onDismiss={onDismiss} />
        <SkeletonBox width={100} height={16} />
        <TransactionListSkeleton rows={2} />
        <TransactionDetailSkeleton />
      </>,
    );

    await waitFor(() => expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalled());
    timingSpy.mockClear();

    rerender(
      <>
        <CountdownPill expiresAt={expiredIso} ttlSeconds={600} showProgressBar onExpired={onExpired} />
        <Toast triggerKey={1} visible message="Đã lưu thao tác" tone="success" onDismiss={onDismiss} />
        <SkeletonBox width={100} height={16} />
        <TransactionListSkeleton rows={2} />
        <TransactionDetailSkeleton />
      </>,
    );

    // Repeat showToast via triggerKey without remounting MUST still preserve reduceMotion=true (0 Animated.timing)
    rerender(
      <>
        <CountdownPill expiresAt={expiredIso} ttlSeconds={600} showProgressBar onExpired={onExpired} />
        <Toast triggerKey={2} visible message="Cập nhật lần 2" tone="info" onDismiss={onDismiss} />
        <SkeletonBox width={100} height={16} />
        <TransactionListSkeleton rows={2} />
        <TransactionDetailSkeleton />
      </>,
    );

    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(screen.getByText('00:00 · Hết hạn')).toBeTruthy();
    expect(screen.getByTestId('otp-countdown-bar').props.accessibilityRole).toBe('progressbar');
    expect(screen.getByTestId('transactions-loading-skeleton')).toBeTruthy();
    expect(screen.getByTestId('transaction-detail-loading')).toBeTruthy();

    fireEvent.press(screen.getByTestId('editorial-toast-dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(timingSpy).not.toHaveBeenCalled();
  });

  test('TransactionsScreen supports inline search (q param + clear), live tab counts, combo/free badges, and MyListingsScreen badge without extra calls', async () => {
    mockedApi.mockImplementation((async (path: string) => {
      if (path.startsWith('/transactions')) {
        return {
          items: [
            makeRawListItem({
              id: 'tx-combo',
              listingTitle: 'Combo 2 giáo trình SE100 & CTDL',
              isCombo: true,
              isFree: true,
              itemCount: 2,
              agreedPriceVnd: 0,
              status: 'DANG_GIAO',
              viewerRole: 'SELLER',
              needsViewerAction: true,
            }),
          ],
          pendingActionCount: 2,
          counts: {
            all: 5,
            actionRequired: 2,
            yeuCau: 0,
            giuCho: 0,
            dangGiao: 1,
            choXacNhan: 1,
            choXuLy: 0,
            hoanTat: 2,
            huy: 1,
          },
          page: 0,
          size: 20,
          totalElements: 25,
          totalPages: 2,
        };
      }
      if (path.startsWith('/listings/mine')) {
        return {
          items: [],
          quota: { reputationScore: 120, activeCount: 0, limit: 10, remaining: 10, canPublish: true },
          page: 0,
          size: 20,
          totalElements: 0,
          totalPages: 0,
        };
      }
      return [];
    }) as never);

    const tree = renderTransactionsStack('Transactions');
    expect(await tree.findByTestId('transaction-row-tx-combo')).toBeTruthy();
    expect(tree.getByTestId('transaction-combo-tx-combo')).toBeTruthy();
    expect(tree.getByTestId('tx-status-ACTION_REQUIRED').props.accessibilityLabel).toBe(
      'Cần xử lý (2)',
    );
    expect(tree.getByTestId('tx-status-HOAN_TAT').props.accessibilityLabel).toBe('Hoàn tất (2)');

    // Search via q query param keeps pagination ("Tải thêm giao dịch") visible when totalPages > 1
    const searchInput = tree.getByTestId('transactions-search-input');
    fireEvent.changeText(searchInput, 'SE100');
    fireEvent(searchInput, 'submitEditing');
    await waitFor(() =>
      expect(mockedApi).toHaveBeenCalledWith(expect.stringContaining('q=SE100')),
    );
    expect(tree.getByTestId('transactions-load-more')).toBeTruthy();
    fireEvent.press(tree.getByTestId('transactions-load-more'));
    await waitFor(() =>
      expect(mockedApi).toHaveBeenCalledWith(expect.stringContaining('q=SE100&page=1')),
    );
    fireEvent.press(tree.getByTestId('transactions-search-clear'));
    await waitFor(() => expect(searchInput.props.value).toBe(''));
    tree.unmount();

    // MyListingsScreen reflects pendingActionCount from store with zero /transactions fetch
    mockedApi.mockClear();
    const myTree = renderTransactionsStack('MyListings');
    expect(await myTree.findByTestId('my-listings-transactions-badge')).toBeTruthy();
    expect(mockedApi).not.toHaveBeenCalledWith(expect.stringContaining('/transactions'));
    myTree.unmount();
  });

  test('Buyer uses combo checklist + one-tap Điền mã (without auto-submit) + lightbox Prev/Next navigation', async () => {
    const comboDetail = makeRawDetail({
      listing: {
        id: 'lst-combo',
        title: 'Combo đèn bàn + kệ sách KTX',
        thumbnailUrl: null,
        isCombo: true,
        isFree: false,
        status: 'GIU_CHO',
      },
      items: [
        { id: 'item-1', name: 'Đèn bàn LED Rạng Đông', condition: 'Mới 95%', status: 'DANG_GIU', thumbnailUrl: null },
        { id: 'item-2', name: 'Kệ sách gỗ mini', condition: 'Mới 90%', status: 'DANG_GIU', thumbnailUrl: null },
      ],
      handoverProof: {
        photoId: 'ph-1',
        photoUrl: '/api/v1/transactions/tx-100/handover-photo',
        photos: [
          {
            id: 'ph-1',
            url: '/api/v1/transactions/tx-100/handover-photos/ph-1',
            contentType: 'image/jpeg',
            sizeBytes: 98304,
            uploadedAt: '2026-11-28T09:05:00Z',
          },
          {
            id: 'ph-2',
            url: '/api/v1/transactions/tx-100/handover-photos/ph-2',
            contentType: 'image/png',
            sizeBytes: 122880,
            uploadedAt: '2026-11-28T09:05:30Z',
          },
        ],
        uploadedAt: '2026-11-28T09:05:00Z',
        note: 'Đủ 2 món tại sảnh B4',
        contentType: 'image/jpeg',
      },
      otp: {
        id: 'otp-3',
        status: 'ACTIVE',
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 8 * 60 * 1000).toISOString(),
        remainingSeconds: 480,
        ttlSeconds: 600,
        reissueCount: 2,
        attemptsUsed: 1,
        maxAttempts: 5,
        remainingAttempts: 4,
        inAppCode: '739104',
      },
    });
    mockedApi.mockResolvedValueOnce(comboDetail);

    renderDetail('tx-100');

    expect(await screen.findByTestId('buyer-otp-workbench')).toBeTruthy();
    expect(screen.getByTestId('otp-reissue-count-badge')).toBeTruthy();
    expect(screen.getByTestId('otp-attempt-dots', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId('otp-countdown-bar')).toBeTruthy();

    // Practical dorm combo inspection checklist
    expect(screen.getByText('Đã kiểm tra 0/2 món')).toBeTruthy();
    fireEvent.press(screen.getByTestId('tx-item-item-1'));
    expect(screen.getByText('Đã kiểm tra 1/2 món')).toBeTruthy();
    fireEvent.press(screen.getByTestId('item-checklist-check-all'));
    expect(screen.getByText('Đã kiểm tra 2/2 món')).toBeTruthy();

    // One-tap Điền mã populates input and shows toast WITHOUT auto-submitting POST /complete
    fireEvent.press(screen.getByTestId('autofill-inapp-otp-btn'));
    expect(screen.getByTestId('handover-otp-input').props.value).toBe('739104');
    expect(screen.getByTestId('transaction-action-success')).toBeTruthy();
    expect(mockedApi).toHaveBeenCalledTimes(1);

    // Multi-photo Lightbox Prev/Next navigation + metadata footer
    expect(await screen.findByTestId('handover-proof-image')).toBeTruthy();
    fireEvent.press(screen.getByTestId('handover-proof-zoom-trigger'));
    expect(await screen.findByTestId('handover-proof-lightbox')).toBeTruthy();
    expect(screen.getByTestId('proof-lightbox-counter').props.children).toEqual([1, ' / ', 2]);
    expect(screen.getByTestId('proof-lightbox-metadata')).toBeTruthy();

    fireEvent.press(screen.getByTestId('proof-lightbox-next'));
    await waitFor(() =>
      expect(mockedAttachment).toHaveBeenCalledWith('/transactions/tx-100/handover-photos/ph-2'),
    );
    expect(screen.getByTestId('proof-lightbox-counter').props.children).toEqual([2, ' / ', 2]);
    fireEvent.press(screen.getByTestId('proof-lightbox-prev'));
    expect(screen.getByTestId('proof-lightbox-counter').props.children).toEqual([1, ' / ', 2]);
  });

  test('Seller promotes photo to cover, sees live 24h escalation countdown, and refreshes status with 1 tap', async () => {
    const sellerDelivering = makeRawDetail({
      status: 'DANG_GIAO',
      viewerRole: 'SELLER',
      handoverProof: null,
      otp: null,
      autoEscalateAt: null,
      actions: {
        canReportDelivered: true,
        canVerifyOtp: false,
        canReissueOtp: false,
        canRequestCancel: false,
        canRespondCancel: false,
        canViewHandoverPhoto: false,
      },
    });
    const sellerWaiting = makeRawDetail({
      version: 4,
      status: 'CHO_XAC_NHAN',
      viewerRole: 'SELLER',
      autoEscalateRemainingSeconds: 23 * 3600 + 42 * 60,
      otp: {
        id: 'otp-9',
        status: 'ACTIVE',
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 9 * 60 * 1000).toISOString(),
        remainingSeconds: 540,
        ttlSeconds: 600,
        reissueCount: 0,
        attemptsUsed: 0,
        maxAttempts: 5,
        remainingAttempts: 5,
        inAppCode: null,
      },
      actions: {
        canReportDelivered: false,
        canVerifyOtp: false,
        canReissueOtp: false,
        canRequestCancel: true,
        canRespondCancel: false,
        canViewHandoverPhoto: true,
      },
    });
    const sellerCompleted = makeRawDetail({
      version: 5,
      status: 'HOAN_TAT',
      viewerRole: 'SELLER',
      completedAt: '2026-11-28T09:20:00Z',
      seller: { id: 'u-me', displayName: 'Nguyễn Minh', reputationScore: 120 },
      buyer: { id: 'u-other', displayName: 'Trần Anh Khoa', reputationScore: 124 },
      otp: null,
      actions: {
        canReportDelivered: false,
        canVerifyOtp: false,
        canReissueOtp: false,
        canRequestCancel: false,
        canRespondCancel: false,
        canViewHandoverPhoto: true,
      },
    });

    mockedApi
      .mockResolvedValueOnce(sellerDelivering)
      .mockResolvedValueOnce(sellerWaiting)
      .mockResolvedValueOnce(sellerCompleted);
    mockedLibrary.mockResolvedValueOnce([
      { uri: 'file:///p1.jpg', fileName: 'p1.jpg', mimeType: 'image/jpeg', fileSize: 81920 },
      { uri: 'file:///p2.jpg', fileName: 'p2.jpg', mimeType: 'image/jpeg', fileSize: 163840 },
    ]);

    renderDetail('tx-100');
    expect(await screen.findByTestId('seller-handover-workbench')).toBeTruthy();

    // Pick 2 photos -> active photo is index 1 -> promote to cover -> becomes index 0 with Ảnh chính badge
    fireEvent.press(screen.getByTestId('handover-pick-library'));
    expect(await screen.findByTestId('handover-photo-preview')).toBeTruthy();
    expect(screen.getByTestId('handover-photo-size')).toBeTruthy();
    fireEvent.press(screen.getByTestId('handover-promote-cover'));
    expect(screen.getByTestId('handover-cover-badge')).toBeTruthy();

    // Submit delivered -> waiting screen shows live 24h escalation countdown
    fireEvent.press(screen.getByTestId('report-delivered-btn'));
    fireEvent.press(await screen.findByTestId('report-delivered-confirm-btn'));
    expect(await screen.findByTestId('seller-waiting-telemetry')).toBeTruthy();
    expect(screen.getByTestId('seller-24h-countdown-text').props.children).toContain('23g 42p');

    // 1-tap Cập nhật trạng thái transitions immediately to HOAN_TAT receipt
    fireEvent.press(screen.getByTestId('seller-refresh-status-btn'));
    expect(await screen.findByTestId('transaction-completed-receipt')).toBeTruthy();
  });

  test('SENIOR_ADMIN read-only view displays both seller & buyer Zero-PII rows and OTP_LOCKED_MAX_ATTEMPTS timeline', async () => {
    const adminDetail = makeRawDetail({
      status: 'CHO_XU_LY',
      viewerRole: 'SENIOR_ADMIN',
      escalationReason: 'CANCEL_DISPUTE',
      seller: { id: 'u-seller', displayName: 'Lê Hoàng An', reputationScore: 132 },
      buyer: { id: 'u-buyer', displayName: 'Phạm Quốc Bình', reputationScore: 108 },
      otp: {
        id: 'otp-locked',
        status: 'EXHAUSTED',
        issuedAt: '2026-11-28T09:00:00Z',
        expiresAt: '2026-11-28T09:10:00Z',
        remainingSeconds: 0,
        ttlSeconds: 600,
        reissueCount: 1,
        attemptsUsed: 5,
        maxAttempts: 5,
        remainingAttempts: 0,
        inAppCode: null,
      },
      actions: {
        canReportDelivered: false,
        canVerifyOtp: false,
        canReissueOtp: false,
        canRequestCancel: false,
        canRespondCancel: false,
        canViewHandoverPhoto: true,
      },
      timeline: [
        {
          id: 'ev-lock',
          action: 'OTP_LOCKED_MAX_ATTEMPTS',
          fromStatus: 'CHO_XAC_NHAN',
          toStatus: 'CHO_XAC_NHAN',
          actorRole: 'BUYER',
          note: 'Nhập sai mã xác nhận đủ 5/5 lần.',
          createdAt: '2026-11-28T09:07:00Z',
        },
      ],
    });
    mockedApi.mockResolvedValueOnce(adminDetail);

    renderDetail('tx-100');

    expect(await screen.findByTestId('tx-moderator-parties')).toBeTruthy();
    expect(screen.getByTestId('tx-seller-party')).toBeTruthy();
    expect(screen.getByTestId('tx-buyer-party')).toBeTruthy();
    expect(screen.getByText('Quản trị')).toBeTruthy();
    expect(screen.getByText('Lê Hoàng An')).toBeTruthy();
    expect(screen.getByText('Phạm Quốc Bình')).toBeTruthy();
    expect(screen.queryByTestId('buyer-otp-workbench')).toBeNull();
    expect(screen.queryByTestId('seller-waiting-telemetry')).toBeNull();
    expect(screen.queryByTestId('open-cancel-request-btn')).toBeNull();
    expect(screen.getByText('Nhập sai mã 5 lần')).toBeTruthy();
  });

  test('Seller expired OTP with varying serverNow timestamps NEVER triggers an infinite reload loop (P0 regression)', async () => {
    const expiredAt = new Date(Date.now() - 60_000).toISOString();
    const baseSellerOtp = {
      id: 'otp-exp-seller',
      issuedAt: new Date(Date.now() - 11 * 60_000).toISOString(),
      expiresAt: expiredAt,
      remainingSeconds: 0,
      ttlSeconds: 600,
      reissueCount: 0,
      attemptsUsed: 0,
      maxAttempts: 5,
      remainingAttempts: 5,
      inAppCode: null,
    };

    // 1. Server initially returns ACTIVE past expiresAt, then EXPIRED with shifted serverNow (+250ms jitter)
    mockedApi
      .mockResolvedValueOnce(
        makeRawDetail({
          viewerRole: 'SELLER',
          status: 'CHO_XAC_NHAN',
          serverNow: new Date(Date.now()).toISOString(),
          otp: { ...baseSellerOtp, status: 'ACTIVE' },
          actions: {
            canReportDelivered: false,
            canVerifyOtp: false,
            canReissueOtp: true,
            canRequestCancel: true,
            canRespondCancel: false,
            canViewHandoverPhoto: true,
          },
        }),
      )
      .mockResolvedValueOnce(
        makeRawDetail({
          viewerRole: 'SELLER',
          status: 'CHO_XAC_NHAN',
          serverNow: new Date(Date.now() + 250).toISOString(),
          otp: { ...baseSellerOtp, status: 'EXPIRED' },
          actions: {
            canReportDelivered: false,
            canVerifyOtp: false,
            canReissueOtp: true,
            canRequestCancel: true,
            canRespondCancel: false,
            canViewHandoverPhoto: true,
          },
        }),
      );

    const tree = renderDetail('tx-100');
    expect(await tree.findByTestId('seller-waiting-telemetry')).toBeTruthy();
    await waitFor(() => expect(mockedApi).toHaveBeenCalledTimes(2));

    // Allow microtasks/effects to settle — must stay strictly at 2 (1 initial GET + at most 1 expiry sync)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    expect(mockedApi).toHaveBeenCalledTimes(2);
    expect(tree.getByText('00:00 · Hết hạn')).toBeTruthy();
    tree.unmount();

    // 2. Server already returns EXPIRED on initial load -> 0 extra reload calls (strictly 1 GET)
    useTransactions.getState().reset();
    mockedApi.mockReset();
    mockedApi.mockResolvedValueOnce(
      makeRawDetail({
        viewerRole: 'SELLER',
        status: 'CHO_XAC_NHAN',
        serverNow: new Date(Date.now() + 500).toISOString(),
        otp: { ...baseSellerOtp, status: 'EXPIRED' },
        actions: {
          canReportDelivered: false,
          canVerifyOtp: false,
          canReissueOtp: true,
          canRequestCancel: true,
          canRespondCancel: false,
          canViewHandoverPhoto: true,
        },
      }),
    );

    const alreadyExpiredTree = renderDetail('tx-100');
    expect(await alreadyExpiredTree.findByTestId('seller-waiting-telemetry')).toBeTruthy();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    expect(mockedApi).toHaveBeenCalledTimes(1);
    alreadyExpiredTree.unmount();
  });

  test('compact inline code strip exposes selectable code, eye toggle, and 1-tap Điền nhanh without bloated Copy button', async () => {
    mockedApi.mockResolvedValueOnce(makeRawDetail());
    const tree = renderDetail('tx-100');

    expect(await tree.findByTestId('buyer-inapp-otp-card')).toBeTruthy();
    expect(tree.queryByTestId('copy-inapp-otp-btn')).toBeNull();
    expect(tree.queryByText('Sao chép')).toBeNull();

    const codeText = tree.getByTestId('buyer-inapp-otp-code');
    expect(codeText.props.selectable).toBe(true);
    expect(codeText.props.children).toBe('482 · 915');

    fireEvent.press(tree.getByTestId('toggle-inapp-otp-visibility'));
    expect(tree.getByTestId('buyer-inapp-otp-code').props.children).toBe('••• · •••');

    fireEvent.press(tree.getByTestId('autofill-inapp-otp-btn'));
    expect(tree.getByTestId('handover-otp-input').props.value).toBe('482915');
    expect(mockedApi).toHaveBeenCalledTimes(1);
    tree.unmount();
  });
});

describe('Wave-3 Live Android 15 Bug-Fix & Visual Polish Regressions', () => {
  test('emits immediate danger Toast and scrolls to top when reportDelivered fails after BottomSheet closes', async () => {
    const scrollSpy = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => {});
    const sellerDelivering = makeRawDetail({
      status: 'DANG_GIAO',
      viewerRole: 'SELLER',
      handoverProof: null,
      otp: null,
      actions: {
        canReportDelivered: true,
        canVerifyOtp: false,
        canReissueOtp: false,
        canRequestCancel: false,
        canRespondCancel: false,
        canViewHandoverPhoto: false,
      },
    });

    mockedApi
      .mockResolvedValueOnce(sellerDelivering)
      .mockRejectedValueOnce(new Error('Lỗi mạng khi tải ảnh bàn giao'));
    mockedCamera.mockResolvedValueOnce({
      uri: 'file:///handover-fail.jpg',
      fileName: 'handover-fail.jpg',
      mimeType: 'image/jpeg',
      fileSize: 64000,
    });

    renderDetail('tx-100');
    expect(await screen.findByTestId('seller-handover-workbench')).toBeTruthy();

    fireEvent.press(screen.getByTestId('handover-take-photo'));
    expect(await screen.findByTestId('handover-photo-preview')).toBeTruthy();
    fireEvent.press(screen.getByTestId('report-delivered-btn'));
    fireEvent.press(await screen.findByTestId('report-delivered-confirm-btn'));

    expect(await screen.findByTestId('transaction-action-error')).toBeTruthy();
    const toast = screen.getByTestId('transaction-action-success');
    expect(toast.props.accessibilityRole).toBe('alert');
    expect(scrollSpy).toHaveBeenCalledWith(expect.objectContaining({ y: 0 }));
  });

  test('auto-scrolls to top on HOAN_TAT completion and cancel request transitions', async () => {
    const scrollSpy = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => {});
    const buyerDetail = makeRawDetail();
    const completedDetail = makeRawDetail({
      version: 4,
      status: 'HOAN_TAT',
      completedAt: '2026-11-28T09:15:00Z',
      otp: null,
      actions: {
        canReportDelivered: false,
        canVerifyOtp: false,
        canReissueOtp: false,
        canRequestCancel: false,
        canRespondCancel: false,
        canViewHandoverPhoto: true,
      },
    });

    mockedApi
      .mockResolvedValueOnce(buyerDetail)
      .mockResolvedValueOnce(completedDetail);

    const completeTree = renderDetail('tx-100');
    fireEvent.changeText(await completeTree.findByTestId('handover-otp-input'), '482915');
    scrollSpy.mockClear();
    fireEvent.press(completeTree.getByTestId('otp-confirm-submit-btn'));
    expect(await completeTree.findByTestId('transaction-completed-receipt')).toBeTruthy();
    expect(scrollSpy).toHaveBeenCalledWith(expect.objectContaining({ y: 0 }));
    completeTree.unmount();

    // Cancel request transition also auto-scrolls to top to reveal requester waiting card
    useTransactions.getState().reset();
    mockedApi.mockReset();
    scrollSpy.mockClear();
    const pendingCancelDetail = makeRawDetail({
      version: 4,
      cancellationRequest: {
        id: 'cr-scroll',
        status: 'CHO_XAC_NHAN',
        requestedByRole: 'BUYER',
        isViewerRequester: true,
        reasonCode: 'MUTUAL_AGREEMENT',
        reasonLabel: 'Hai bên thống nhất hủy',
        reasonNote: null,
        requestedAt: '2026-11-28T09:15:00Z',
        respondedAt: null,
        responseNote: null,
      },
      actions: {
        canReportDelivered: false,
        canVerifyOtp: true,
        canReissueOtp: true,
        canRequestCancel: false,
        canRespondCancel: false,
        canViewHandoverPhoto: true,
      },
    });
    mockedApi
      .mockResolvedValueOnce(buyerDetail)
      .mockResolvedValueOnce(pendingCancelDetail);

    const cancelTree = renderDetail('tx-100');
    fireEvent.press(await cancelTree.findByTestId('open-cancel-request-btn'));
    fireEvent.press(await cancelTree.findByTestId('cancel-reason-chip-MUTUAL_AGREEMENT'));
    fireEvent.press(cancelTree.getByTestId('cancel-submit-btn'));
    expect(await cancelTree.findByTestId('cancel-waiting-card')).toBeTruthy();
    expect(scrollSpy).toHaveBeenCalledWith(expect.objectContaining({ y: 0 }));
    cancelTree.unmount();
  });

  test('TransactionTimeline hides Xem tất cả toggle when events.length <= 2 and shows it when > 2', () => {
    const twoEvents = [
      {
        id: 'e1',
        action: 'DELIVERY_STARTED',
        fromStatus: 'GIU_CHO' as const,
        toStatus: 'DANG_GIAO' as const,
        actorRole: 'SELLER' as const,
        note: null,
        createdAt: '2026-11-28T08:30:00Z',
      },
      {
        id: 'e2',
        action: 'CANCEL_REJECTED',
        fromStatus: 'CHO_XAC_NHAN' as const,
        toStatus: 'CHO_XU_LY' as const,
        actorRole: 'SELLER' as const,
        note: null,
        createdAt: '2026-11-28T09:00:00Z',
      },
    ];

    const { rerender } = render(<TransactionTimeline events={twoEvents} />);
    expect(screen.queryByTestId('transaction-timeline-toggle')).toBeNull();
    expect(screen.queryByText('Xem tất cả')).toBeNull();
    expect(screen.getByText('Từ chối yêu cầu hủy')).toBeTruthy();

    rerender(
      <TransactionTimeline
        events={[
          {
            id: 'e0',
            action: 'RESERVATION_APPROVED',
            fromStatus: 'YEU_CAU' as const,
            toStatus: 'GIU_CHO' as const,
            actorRole: 'SELLER' as const,
            note: null,
            createdAt: '2026-11-28T08:00:00Z',
          },
          ...twoEvents,
        ]}
      />,
    );
    expect(screen.getByTestId('transaction-timeline-toggle')).toBeTruthy();
    expect(screen.getByText('Xem tất cả')).toBeTruthy();
  });

  test('TransactionStepper reports Xem xét accessibilityLabel in CHO_XU_LY without KDV/OTP jargon', () => {
    render(<TransactionStepper status="CHO_XU_LY" hasHandoverProof />);
    expect(screen.getByTestId('tx-stepper').props.accessibilityLabel).toBe(
      'Tiến trình giao dịch: Xem xét',
    );
    expect(screen.queryByText(/KDV/i)).toBeNull();
    expect(screen.queryByText(/OTP/i)).toBeNull();
  });

  test('TransactionsScreen places CHO_XU_LY before HOAN_TAT/HUY and scopes header urgent pill to counts.actionRequired', async () => {
    mockedApi.mockResolvedValueOnce({
      items: [],
      pendingActionCount: 3, // Global count across all roles
      counts: {
        all: 2,
        actionRequired: 0, // Role-scoped Buyer count = 0
        yeuCau: 0,
        giuCho: 0,
        dangGiao: 0,
        choXacNhan: 0,
        choXuLy: 1,
        hoanTat: 1,
        huy: 0,
      },
      page: 0,
      size: 20,
      totalElements: 0,
      totalPages: 0,
    });

    const tree = renderTransactionsStack('Transactions');
    expect(await tree.findByTestId('transactions-status-tabs')).toBeTruthy();

    // Header pill must respect role-scoped counts.actionRequired (0 -> hidden, NOT global 3)
    expect(tree.queryByTestId('transactions-pending-badge')).toBeNull();

    // Tab order: CHO_XU_LY MUST precede HOAN_TAT and HUY
    const tabs = tree.getAllByRole('tab');
    const tabIds = tabs.map((node) => node.props.testID);
    const choXuLyIdx = tabIds.indexOf('tx-status-CHO_XU_LY');
    const hoanTatIdx = tabIds.indexOf('tx-status-HOAN_TAT');
    const huyIdx = tabIds.indexOf('tx-status-HUY');
    expect(choXuLyIdx).toBeGreaterThan(-1);
    expect(choXuLyIdx).toBeLessThan(hoanTatIdx);
    expect(hoanTatIdx).toBeLessThan(huyIdx);
    tree.unmount();
  });

  test('MyListingsScreen suppresses redundant unavailable-items banner on GIU_CHO card with activeTransactionId and bumps handover CTA height', async () => {
    mockedApi.mockImplementation((async (path: string) => {
      if (path.startsWith('/listings/mine')) {
        return {
          items: [
            {
              id: 'lst-held-own',
              title: 'Combo 2 giáo trình SE100',
              description: 'Đang giao',
              priceVnd: 80000,
              status: 'GIU_CHO',
              images: [],
              itemCount: 2,
              hasUnavailableItems: true,
              seller: { id: 'u-me', displayName: 'Nguyễn Minh', reputationScore: 120 },
              version: 2,
              activeTransactionId: 'tx-own-1',
            },
            {
              id: 'lst-completed-own',
              title: 'Đèn bàn học KTX đã giao',
              description: 'Hoàn tất',
              priceVnd: 50000,
              status: 'KET_THUC',
              images: [],
              itemCount: 1,
              hasUnavailableItems: true,
              seller: { id: 'u-me', displayName: 'Nguyễn Minh', reputationScore: 120 },
              version: 3,
            },
          ],
          quota: { reputationScore: 120, activeCount: 1, limit: 10, remaining: 9, canPublish: true },
          page: 0,
          size: 20,
          totalElements: 2,
          totalPages: 1,
        };
      }
      return [];
    }) as never);

    const tree = renderTransactionsStack('MyListings');
    const handoverBtn = await tree.findByTestId('my-listing-handover-lst-held-own');
    expect(tree.queryByTestId('unavailable-items-lst-held-own')).toBeNull();
    expect(tree.queryByTestId('unavailable-items-lst-completed-own')).toBeNull();
    expect(tree.getByTestId('locked-badge-lst-held-own')).toBeTruthy();
    expect(handoverBtn.props.hitSlop).toBe(6);
    const flattened = StyleSheet.flatten(handoverBtn.props.style);
    expect(flattened.minHeight).toBeGreaterThanOrEqual(40);
    tree.unmount();
  });

  test('TransactionsScreen pending-cancel cue distinguishes Seller responder/requester and avoids misleading Buyer', async () => {
    mockedApi.mockResolvedValueOnce({
      items: [
        makeRawListItem({
          id: 'tx-buyer-cancel',
          viewerRole: 'BUYER',
          status: 'CHO_XAC_NHAN',
          hasPendingCancelRequest: true,
          needsViewerAction: true,
        }),
        makeRawListItem({
          id: 'tx-seller-respond',
          viewerRole: 'SELLER',
          status: 'CHO_XAC_NHAN',
          hasPendingCancelRequest: true,
          needsViewerAction: true,
        }),
        makeRawListItem({
          id: 'tx-seller-wait',
          viewerRole: 'SELLER',
          status: 'CHO_XAC_NHAN',
          hasPendingCancelRequest: true,
          needsViewerAction: false,
        }),
      ],
      pendingActionCount: 2,
      page: 0,
      size: 20,
      totalElements: 3,
      totalPages: 1,
    });

    const tree = renderTransactionsStack('Transactions');
    expect(await tree.findByTestId('transaction-cue-tx-buyer-cancel')).toBeTruthy();
    expect(tree.getByText('Có yêu cầu hủy đang chờ xác nhận')).toBeTruthy();
    expect(tree.getByText('Có yêu cầu hủy chờ bạn phản hồi')).toBeTruthy();
    expect(tree.getByText('Đã gửi yêu cầu hủy · Chờ phản hồi')).toBeTruthy();
    tree.unmount();
  });

  test('HandoverPhotoUploader overlay pills and CancelConsentCard proof link include generous hitSlop={8}', () => {
    const tree = render(
      <>
        <HandoverPhotoUploader
          photos={[
            { uri: 'file:///p1.jpg', fileName: 'p1.jpg', mimeType: 'image/jpeg', fileSize: 12000 },
            { uri: 'file:///p2.jpg', fileName: 'p2.jpg', mimeType: 'image/jpeg', fileSize: 14000 },
          ]}
          onChange={() => {}}
        />
        <CancelConsentCard
          request={{
            id: 'cr-hit',
            status: 'CHO_XAC_NHAN',
            requestedByRole: 'BUYER',
            isViewerRequester: false,
            reasonCode: 'ITEM_NOT_AS_DESCRIBED',
            reasonLabel: 'Sản phẩm không đúng mô tả',
            reasonNote: null,
            requestedAt: '2026-11-28T09:10:00Z',
            respondedAt: null,
            responseNote: null,
          }}
          canRespond
          hasHandoverProof
          onInspectProof={() => {}}
          onRespond={async () => {}}
        />
      </>,
    );

    // Select 2nd thumbnail so promote-cover overlay pill also renders
    fireEvent.press(tree.getByTestId('handover-thumb-1'));
    expect(tree.getByTestId('handover-promote-cover').props.hitSlop).toBe(8);
    expect(tree.getByTestId('handover-replace-photo').props.hitSlop).toBe(8);
    expect(tree.getByTestId('handover-remove-photo-1').props.hitSlop).toBe(8);
    expect(tree.getByTestId('cancel-inspect-proof-btn').props.hitSlop).toBe(8);
    tree.unmount();
  });
});

function collectAllRenderedText(node: unknown, out: string[] = []): string[] {
  if (node == null) return out;
  if (typeof node === 'string' || typeof node === 'number') {
    const str = String(node).trim();
    if (str) out.push(str);
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectAllRenderedText(child, out);
    return out;
  }
  if (typeof node === 'object') {
    const rec = node as { props?: Record<string, unknown>; children?: unknown[] };
    if (rec.props) {
      if (typeof rec.props.accessibilityLabel === 'string') {
        out.push(rec.props.accessibilityLabel);
      }
      if (typeof rec.props.placeholder === 'string') {
        out.push(rec.props.placeholder);
      }
    }
    if (Array.isArray(rec.children)) {
      for (const child of rec.children) collectAllRenderedText(child, out);
    }
  }
  return out;
}

const FORBIDDEN_UI_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: 'spec ID (UC-/FR-/NFR-/P#-##)', regex: /\b(?:UC|FR|NFR|P\d)-\d+\b/i },
  { name: 'internal acronym KDV', regex: /\bKDV\b/i },
  { name: 'technical OTP jargon', regex: /\bOTP\b/i },
  { name: 'OOAD/dev term actor/user', regex: /\b(?:actor|user)\b/i },
  { name: 'redundant Vai trò: prefix', regex: /Vai trò:/i },
  { name: 'redundant 6 số / 6 chữ số', regex: /6 (?:chữ )?số/i },
  { name: 'redundant vô hiệu mã cũ', regex: /vô hiệu mã cũ/i },
  { name: 'legalistic payment disclaimer', regex: /chứng từ thanh toán|không chứng minh thanh toán/i },
  { name: 'awkward personal role phrasing', regex: /(?:Bạn|Tôi)\s+(?:bán|mua)/i },
];

function assertZeroUiJargon(treeJson: unknown, scenarioName: string) {
  const texts = collectAllRenderedText(treeJson);
  const violations: string[] = [];
  for (const text of texts) {
    for (const rule of FORBIDDEN_UI_PATTERNS) {
      if (rule.regex.test(text)) {
        violations.push(`[${scenarioName}] ${rule.name} leaked in: "${text}"`);
      }
    }
  }
  expect(violations).toEqual([]);
}

describe('Wave-4 Copy Purification & Zero-Jargon UI Regressions', () => {
  test('renders ZERO UC-/FR-/NFR-/KDV/OTP/Vai trò:/6 số leaks across all P3-02 states, sheets, and screens', async () => {
    // 1. Buyer CHO_XAC_NHAN + Cancel Request Sheet
    mockedApi.mockResolvedValueOnce(makeRawDetail());
    const buyerTree = renderDetail('tx-100');
    expect(await buyerTree.findByTestId('buyer-otp-workbench')).toBeTruthy();
    expect(buyerTree.getByText('Đơn mua')).toBeTruthy();
    expect(buyerTree.getByText('Xác nhận nhận hàng')).toBeTruthy();
    expect(buyerTree.getByText('Điền nhanh')).toBeTruthy();
    expect(buyerTree.getByText('Gửi lại mã')).toBeTruthy();
    expect(buyerTree.getByText('Riêng tư')).toBeTruthy();
    assertZeroUiJargon(buyerTree.toJSON(), 'Buyer CHO_XAC_NHAN');

    fireEvent.press(buyerTree.getByTestId('open-cancel-request-btn'));
    expect(await buyerTree.findByTestId('cancel-request-sheet')).toBeTruthy();
    assertZeroUiJargon(buyerTree.toJSON(), 'CancelRequestSheet');
    buyerTree.unmount();

    // 2. Seller DANG_GIAO + Deliver Confirmation Sheet
    useTransactions.getState().reset();
    mockedApi.mockResolvedValueOnce(
      makeRawDetail({
        status: 'DANG_GIAO',
        viewerRole: 'SELLER',
        handoverProof: null,
        otp: null,
        actions: {
          canReportDelivered: true,
          canVerifyOtp: false,
          canReissueOtp: false,
          canRequestCancel: false,
          canRespondCancel: false,
          canViewHandoverPhoto: false,
        },
      }),
    );
    mockedCamera.mockResolvedValueOnce({
      uri: 'file:///clean.jpg',
      fileName: 'clean.jpg',
      mimeType: 'image/jpeg',
      fileSize: 51200,
    });
    const sellerDeliverTree = renderDetail('tx-100');
    expect(await sellerDeliverTree.findByTestId('seller-handover-workbench')).toBeTruthy();
    expect(sellerDeliverTree.getByText('Đơn bán')).toBeTruthy();
    assertZeroUiJargon(sellerDeliverTree.toJSON(), 'Seller DANG_GIAO');
    fireEvent.press(sellerDeliverTree.getByTestId('handover-take-photo'));
    expect(await sellerDeliverTree.findByTestId('handover-photo-preview')).toBeTruthy();
    fireEvent.press(sellerDeliverTree.getByTestId('report-delivered-btn'));
    expect(await sellerDeliverTree.findByTestId('report-delivered-confirm-sheet')).toBeTruthy();
    assertZeroUiJargon(sellerDeliverTree.toJSON(), 'Seller Deliver Confirm Sheet');
    sellerDeliverTree.unmount();

    // 3. Seller CHO_XAC_NHAN + Counterparty CancelConsentCard + Reject Decision Sheet (Image 1 regression!)
    useTransactions.getState().reset();
    mockedApi.mockResolvedValueOnce(
      makeRawDetail({
        viewerRole: 'SELLER',
        status: 'CHO_XAC_NHAN',
        autoEscalateRemainingSeconds: 23 * 3600 + 45 * 60,
        otp: {
          id: 'otp-s1',
          status: 'ACTIVE',
          issuedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 8 * 60 * 1000).toISOString(),
          remainingSeconds: 480,
          attemptsUsed: 0,
          maxAttempts: 5,
          remainingAttempts: 5,
          inAppCode: null,
        },
        cancellationRequest: {
          id: 'cr-pure',
          status: 'CHO_XAC_NHAN',
          requestedByRole: 'BUYER',
          isViewerRequester: false,
          reasonCode: 'DEFECT_AT_HANDOVER',
          reasonLabel: 'Phát hiện lỗi khi nhận hàng',
          reasonNote: null,
          requestedAt: '2026-11-28T09:12:00Z',
          respondedAt: null,
          responseNote: null,
        },
        actions: {
          canReportDelivered: false,
          canVerifyOtp: false,
          canReissueOtp: true,
          canRequestCancel: false,
          canRespondCancel: true,
          canViewHandoverPhoto: true,
        },
      }),
    );
    const sellerWaitTree = renderDetail('tx-100');
    expect(await sellerWaitTree.findByTestId('cancel-consent-card')).toBeTruthy();
    expect(sellerWaitTree.getByText('Làm mới')).toBeTruthy();
    assertZeroUiJargon(sellerWaitTree.toJSON(), 'Seller Waiting + CancelConsentCard');

    fireEvent.press(sellerWaitTree.getByTestId('cancel-reject-btn'));
    expect(await sellerWaitTree.findByTestId('cancel-decision-sheet')).toBeTruthy();
    assertZeroUiJargon(sellerWaitTree.toJSON(), 'CancelDecisionSheet REJECT');
    sellerWaitTree.unmount();

    // 4. CHO_XU_LY + TU_CHOI card
    useTransactions.getState().reset();
    mockedApi.mockResolvedValueOnce(
      makeRawDetail({
        status: 'CHO_XU_LY',
        viewerRole: 'SELLER',
        escalationReason: 'CANCEL_DISPUTE',
        otp: null,
        cancellationRequest: {
          id: 'cr-rej',
          status: 'TU_CHOI',
          requestedByRole: 'BUYER',
          isViewerRequester: false,
          reasonCode: 'ITEM_NOT_AS_DESCRIBED',
          reasonLabel: 'Sản phẩm không đúng mô tả',
          reasonNote: null,
          requestedAt: '2026-11-28T09:10:00Z',
          respondedAt: '2026-11-28T09:15:00Z',
          responseNote: 'Đúng mô tả',
        },
        actions: {
          canReportDelivered: false,
          canVerifyOtp: false,
          canReissueOtp: false,
          canRequestCancel: false,
          canRespondCancel: true,
          canViewHandoverPhoto: true,
        },
      }),
    );
    const escalatedTree = renderDetail('tx-100');
    expect(await escalatedTree.findByTestId('transaction-escalated-section')).toBeTruthy();
    assertZeroUiJargon(escalatedTree.toJSON(), 'CHO_XU_LY + TU_CHOI');
    escalatedTree.unmount();

    // 5. HOAN_TAT Receipt + TransactionsScreen
    useTransactions.getState().reset();
    mockedApi.mockResolvedValueOnce(
      makeRawDetail({
        status: 'HOAN_TAT',
        viewerRole: 'BUYER',
        completedAt: '2026-11-28T09:20:00Z',
        otp: null,
        actions: {
          canReportDelivered: false,
          canVerifyOtp: false,
          canReissueOtp: false,
          canRequestCancel: false,
          canRespondCancel: false,
          canViewHandoverPhoto: true,
        },
      }),
    );
    const doneTree = renderDetail('tx-100');
    expect(await doneTree.findByTestId('transaction-completed-receipt')).toBeTruthy();
    expect(doneTree.getByText('Đánh giá người bán')).toBeTruthy();
    assertZeroUiJargon(doneTree.toJSON(), 'HOAN_TAT Receipt');
    doneTree.unmount();

    // 6. TransactionsScreen list + cues
    useTransactions.getState().reset();
    mockedApi.mockResolvedValueOnce({
      items: [
        makeRawListItem({ id: 'tx-1', status: 'CHO_XAC_NHAN', viewerRole: 'BUYER' }),
        makeRawListItem({ id: 'tx-2', status: 'CHO_XU_LY', viewerRole: 'MODERATOR', escalationReason: 'OVERDUE_24H' }),
      ],
      pendingActionCount: 1,
      page: 0,
      size: 20,
      totalElements: 2,
      totalPages: 1,
    });
    const listTree = renderTransactionsStack('Transactions');
    expect(await listTree.findByTestId('transaction-row-tx-1')).toBeTruthy();
    expect(listTree.getByText('Đơn bán')).toBeTruthy();
    expect(listTree.getAllByText('Đơn mua').length).toBeGreaterThanOrEqual(2);
    assertZeroUiJargon(listTree.toJSON(), 'TransactionsScreen');
    listTree.unmount();
  });
});

describe('PR #38 Review Hardening — HandoverProofCard race, unmount & cache reset', () => {
  test('ignores stale rejection when switching photos, stays safe on unmount, and resets cache when proof changes', async () => {
    let rejectPhoto1!: (err: Error) => void;
    let resolvePhoto2!: (val: { type: string; bytes: ArrayBuffer }) => void;

    mockedAttachment.mockImplementation((path: string) => {
      if (path.endsWith('/ph-1')) {
        return new Promise((_, reject) => {
          rejectPhoto1 = reject;
        });
      }
      if (path.endsWith('/ph-2')) {
        return new Promise((resolve) => {
          resolvePhoto2 = resolve;
        });
      }
      if (path.endsWith('/ph-tx2')) {
        return Promise.resolve({ type: 'image/png', bytes: new Uint8Array([1, 2, 3]).buffer });
      }
      return Promise.resolve(null);
    });

    const proofTx1 = {
      photoId: 'ph-1',
      photoUrl: '/api/v1/transactions/tx-100/handover-photo',
      photos: [
        {
          id: 'ph-1',
          url: '/api/v1/transactions/tx-100/handover-photos/ph-1',
          contentType: 'image/jpeg',
          sizeBytes: 12000,
          uploadedAt: '2026-11-28T09:00:00Z',
        },
        {
          id: 'ph-2',
          url: '/api/v1/transactions/tx-100/handover-photos/ph-2',
          contentType: 'image/jpeg',
          sizeBytes: 14000,
          uploadedAt: '2026-11-28T09:00:00Z',
        },
      ],
      uploadedAt: '2026-11-28T09:00:00Z',
      note: 'Ảnh tx1',
      contentType: 'image/jpeg',
    };

    const card = render(<HandoverProofCard proof={proofTx1} canViewPhoto />);
    await waitFor(() => expect(mockedAttachment).toHaveBeenCalledWith('/transactions/tx-100/handover-photos/ph-1'));

    // Switch immediately to Photo 2 while Photo 1 is still in flight
    fireEvent.press(card.getByTestId('handover-proof-switch-1'));
    await waitFor(() => expect(mockedAttachment).toHaveBeenCalledWith('/transactions/tx-100/handover-photos/ph-2'));

    // Resolve Photo 2 first, then reject stale Photo 1 -> Photo 2 MUST stay rendered with ZERO error banner!
    await act(async () => {
      resolvePhoto2({ type: 'image/jpeg', bytes: new Uint8Array([0xff, 0xd8, 0xff]).buffer });
    });
    expect(await card.findByTestId('handover-proof-image')).toBeTruthy();

    await act(async () => {
      rejectPhoto1(new Error('Network glitch on photo 1'));
    });
    expect(card.queryByTestId('handover-proof-error')).toBeNull();
    expect(card.getByTestId('handover-proof-image')).toBeTruthy();

    // Switching proof.photoUrl to another transaction resets dataUris cache and fetches the new proof cleanly
    const proofTx2 = {
      photoId: 'ph-tx2',
      photoUrl: '/api/v1/transactions/tx-200/handover-photo',
      photos: [
        {
          id: 'ph-tx2',
          url: '/api/v1/transactions/tx-200/handover-photos/ph-tx2',
          contentType: 'image/png',
          sizeBytes: 9000,
          uploadedAt: '2026-11-28T09:05:00Z',
        },
      ],
      uploadedAt: '2026-11-28T09:05:00Z',
      note: 'Ảnh tx2',
      contentType: 'image/png',
    };
    card.rerender(<HandoverProofCard proof={proofTx2} canViewPhoto />);
    await waitFor(() => expect(mockedAttachment).toHaveBeenCalledWith('/transactions/tx-200/handover-photos/ph-tx2'));
    expect(await card.findByTestId('handover-proof-image')).toBeTruthy();

    // Unmounting mid-flight stays completely safe with zero errors
    let rejectAfterUnmount!: (err: Error) => void;
    mockedAttachment.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectAfterUnmount = reject;
        }),
    );
    const unmountProof = {
      ...proofTx2,
      photoUrl: '/api/v1/transactions/tx-300/handover-photo',
      photos: [{ ...proofTx2.photos[0], id: 'ph-tx3', url: '/api/v1/transactions/tx-300/handover-photos/ph-tx3' }],
    };
    const tempCard = render(<HandoverProofCard proof={unmountProof} canViewPhoto />);
    await waitFor(() => expect(mockedAttachment).toHaveBeenCalledWith('/transactions/tx-300/handover-photos/ph-tx3'));
    tempCard.unmount();
    await act(async () => {
      rejectAfterUnmount(new Error('Late error after unmount'));
    });
  });
});

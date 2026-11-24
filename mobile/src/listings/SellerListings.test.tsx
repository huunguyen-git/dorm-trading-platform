import React from 'react';
import { Alert } from 'react-native';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { RestrictedAccountError } from '../api/client';
import { useSession, type AccountRestriction } from '../auth/session';
import * as inventoryApi from '../inventory/api';
import type { InventoryItem } from '../inventory/types';
import * as imagePicker from '../media/imagePicker';
import { useDiscovery } from './discoveryStore';
import * as sellerApi from './sellerApi';
import { useSellerListings } from './sellerStore';
import type {
  CategoryTreeNode,
  ListingCategory,
  ListingDetail,
  ListingQuota,
  ListingSummary,
  LocationZone,
} from './types';
import CreateListingScreen from '../screens/CreateListingScreen';
import EditListingScreen from '../screens/EditListingScreen';
import MyListingsScreen from '../screens/MyListingsScreen';
import InventoryPickerSection from '../components/InventoryPickerSection';

jest.setTimeout(15000);

const mockNavigate = jest.fn();
const mockReplace = jest.fn();
const mockGoBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);
const focusListeners = new Set<() => void>();
const mockAddListener = jest.fn((event: string, cb: () => void) => {
  if (event === 'focus') {
    focusListeners.add(cb);
  }
  return () => {
    focusListeners.delete(cb);
  };
});
let mockThrowOnUseNavigation = false;
const mockRouteParams: Record<string, unknown> = {};

function emitFocusEvent() {
  act(() => {
    for (const listener of Array.from(focusListeners)) {
      listener();
    }
  });
}

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual<Record<string, unknown>>('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => {
      if (mockThrowOnUseNavigation) {
        throw new Error('Couldn\'t find a navigation object.');
      }
      return {
        navigate: mockNavigate,
        replace: mockReplace,
        goBack: mockGoBack,
        canGoBack: mockCanGoBack,
        addListener: mockAddListener,
      };
    },
    useRoute: () => ({
      params: mockRouteParams,
    }),
    useFocusEffect: (cb: () => void | (() => void)) => {
      const reactLib = require('react');
      reactLib.useEffect(() => cb(), [cb]);
    },
  };
});

jest.mock('../inventory/api');
jest.mock('../media/imagePicker', () => {
  const actual = jest.requireActual<typeof import('../media/imagePicker')>('../media/imagePicker');
  return {
    ...actual,
    pickImagesFromLibrary: jest.fn(),
    takePhotoWithCamera: jest.fn(),
    uploadListingImages: jest.fn(),
  };
});
jest.mock('./sellerApi', () => {
  const actual = jest.requireActual<typeof import('./sellerApi')>('./sellerApi');
  return {
    ...actual,
    fetchListingQuota: jest.fn(),
    fetchMyListings: jest.fn(),
    fetchSellerListingDetail: jest.fn(),
    fetchReferenceData: jest.fn(),
    createListing: jest.fn(),
    updateListing: jest.fn(),
    publishListing: jest.fn(),
    withdrawListing: jest.fn(),
    renewListing: jest.fn(),
    deleteListing: jest.fn(),
  };
});

const mockedInventoryApi = jest.mocked(inventoryApi);
const mockedImagePicker = jest.mocked(imagePicker);
const mockedSellerApi = jest.mocked(sellerApi);

const sampleQuota: ListingQuota = {
  reputationScore: 105,
  activeCount: 1,
  limit: 5,
  remaining: 4,
  canPublish: true,
  highTierThreshold: 120,
  standardLimit: 5,
  highTierLimit: 10,
};

const sampleCategories: ListingCategory[] = [
  { id: 'GIAO_TRINH', name: 'Giáo trình', parentId: null, description: null },
  { id: 'GT_DAI_CUONG', name: 'Giáo trình Đại cương', parentId: 'GIAO_TRINH', description: null },
  { id: 'DO_GIA_DUNG', name: 'Đồ gia dụng', parentId: null, description: null },
];

const sampleCategoryTree: CategoryTreeNode[] = [
  {
    id: 'GIAO_TRINH',
    name: 'Giáo trình',
    parentId: null,
    description: null,
    children: [
      {
        id: 'GT_DAI_CUONG',
        name: 'Giáo trình Đại cương',
        parentId: 'GIAO_TRINH',
        description: null,
        children: [],
      },
    ],
  },
  {
    id: 'DO_GIA_DUNG',
    name: 'Đồ gia dụng',
    parentId: null,
    description: null,
    children: [],
  },
];

const sampleLocations: LocationZone[] = [
  { code: 'KTX_KHU_A', name: 'KTX Khu A', group: 'KTX', latitude: 10.8782, longitude: 106.8063 },
  { code: 'UIT', name: 'Trường ĐH CNTT (UIT)', group: 'TRUONG', latitude: 10.87, longitude: 106.8031 },
];

const sampleInventory: InventoryItem[] = [
  {
    id: 'item-1',
    ten: 'Giáo trình Nhập môn CNPM',
    tinhTrang: 'Mới 95%, không ghi chú',
    hinhAnh: ['https://example.com/item1.jpg'],
    trangThai: 'KHA_DUNG',
    linkedListingCount: 0,
    canEdit: true,
    canDelete: true,
    version: 1,
  },
  {
    id: 'item-2',
    ten: 'Đèn bàn học chống cận',
    tinhTrang: 'Hoạt động tốt, đủ cáp',
    hinhAnh: ['https://example.com/item2.jpg'],
    trangThai: 'KHA_DUNG',
    linkedListingCount: 1,
    canEdit: false,
    canDelete: false,
    version: 1,
  },
  {
    id: 'item-3',
    ten: 'Nồi cơm điện mini',
    tinhTrang: 'Đang giữ chỗ giao dịch',
    hinhAnh: ['https://example.com/item3.jpg'],
    trangThai: 'DANG_GIU',
    linkedListingCount: 1,
    canEdit: false,
    canDelete: false,
    version: 2,
  },
  {
    id: 'item-4',
    ten: 'Quạt để bàn',
    tinhTrang: 'Đã bàn giao',
    hinhAnh: [],
    trangThai: 'DA_CHUYEN_GIAO',
    linkedListingCount: 1,
    canEdit: false,
    canDelete: false,
    version: 3,
  },
];

function makeListingSummary(overrides: Partial<ListingSummary> = {}): ListingSummary {
  return {
    id: 'tin-1',
    title: 'Giáo trình SE100 bản mới',
    description: 'Sách còn rất mới, không viết vẽ.',
    condition: 'Mới 95%',
    priceVnd: 120000,
    listingType: 'BAN_LE',
    isCombo: false,
    isFree: false,
    status: 'CONG_KHAI',
    categoryId: 'GT_DAI_CUONG',
    categoryName: 'Giáo trình Đại cương',
    courseCode: 'SE100',
    courseName: 'Nhập môn CNPM',
    author: 'Nguyễn Văn A',
    locationCode: 'KTX_KHU_A',
    locationName: 'KTX Khu A',
    locationText: 'Sảnh tòa A1',
    latitude: 10.8782,
    longitude: 106.8063,
    distanceKm: null,
    thumbnailUrl: 'https://example.com/p1.jpg',
    images: ['https://example.com/p1.jpg'],
    itemCount: 1,
    seller: {
      id: 'u-1',
      displayName: 'Nguyễn An',
      reputationScore: 105,
      averageRating: 4.9,
      reviewCount: 6,
    },
    hasUnavailableItems: false,
    publishedAt: '2026-11-01T00:00:00Z',
    expiresAt: '2026-12-01T00:00:00Z',
    renewalReminderDue: false,
    renewalCount: 0,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
    version: 2,
    ...overrides,
  };
}

function makeListingDetail(overrides: Partial<ListingDetail> = {}): ListingDetail {
  const base = makeListingSummary(overrides);
  return {
    ...base,
    category: {
      id: base.categoryId ?? 'GT_DAI_CUONG',
      name: base.categoryName ?? 'Giáo trình Đại cương',
      parentId: 'GIAO_TRINH',
      description: null,
    },
    items: [
      {
        id: 'item-1',
        name: 'Giáo trình Nhập môn CNPM',
        condition: 'Mới 95%, không ghi chú',
        status: 'KHA_DUNG',
        images: ['https://example.com/item1.jpg'],
      },
    ],
    viewer: {
      isOwner: true,
      canEdit: base.status !== 'GIU_CHO' && base.status !== 'KET_THUC' && base.status !== 'AN',
      canWithdraw: base.status === 'CONG_KHAI' || base.status === 'CHO_DUYET',
      canDelete: base.status !== 'GIU_CHO' && base.status !== 'KET_THUC' && base.status !== 'AN',
      canPublish: base.status === 'NHAP' || base.status === 'DA_RUT',
      canRenew: base.status === 'CONG_KHAI' || base.status === 'HET_HAN',
      canMakeOffer: false,
      canReserve: false,
      canMessage: false,
    },
    pendingRequestCount: 0,
    closedAt: null,
    hiddenReason: null,
    ...overrides,
  };
}

function setActiveMemberSession() {
  useSession.setState({
    token: 'member-token',
    user: {
      id: 'u-1',
      name: 'Nguyễn An',
      email: 'an@gm.uit.edu.vn',
      studentId: '22520001',
      role: 'member',
      roles: ['MEMBER'],
      emailVerified: true,
      profileApproved: true,
      accountStatus: 'HOAT_DONG',
    },
    loading: false,
    restriction: null,
    restrictionDismissed: false,
  });
}

function setLockedSession() {
  const restriction: AccountRestriction = {
    accountStatus: 'BI_KHOA',
    lockType: 'KHOA_TAM_THOI',
    reason: 'Vi phạm quy định giao dịch',
    lockedUntil: '2026-12-10T10:00:00Z',
    appealable: true,
    reputationScore: 40,
    message: 'Tài khoản của bạn đang bị khóa tạm thời.',
  };
  useSession.setState({
    token: 'locked-token',
    user: {
      id: 'u-locked',
      name: 'Trần B',
      email: 'locked@gm.uit.edu.vn',
      studentId: '22520999',
      role: 'member',
      roles: [],
      emailVerified: true,
      profileApproved: true,
      accountStatus: 'BI_KHOA',
      restriction,
    },
    loading: false,
    restriction,
    restrictionDismissed: false,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockThrowOnUseNavigation = false;
  focusListeners.clear();
  mockNavigate.mockReset();
  mockReplace.mockReset();
  mockGoBack.mockReset();
  mockCanGoBack.mockReset();
  mockCanGoBack.mockReturnValue(true);
  mockedInventoryApi.fetchInventoryItems.mockReset();
  mockedImagePicker.pickImagesFromLibrary.mockReset();
  mockedImagePicker.takePhotoWithCamera.mockReset();
  mockedImagePicker.uploadListingImages.mockReset();
  mockedSellerApi.fetchListingQuota.mockReset();
  mockedSellerApi.fetchMyListings.mockReset();
  mockedSellerApi.fetchSellerListingDetail.mockReset();
  mockedSellerApi.fetchReferenceData.mockReset();
  mockedSellerApi.createListing.mockReset();
  mockedSellerApi.updateListing.mockReset();
  mockedSellerApi.publishListing.mockReset();
  mockedSellerApi.withdrawListing.mockReset();
  mockedSellerApi.renewListing.mockReset();
  mockedSellerApi.deleteListing.mockReset();
  for (const key of Object.keys(mockRouteParams)) {
    delete mockRouteParams[key];
  }

  setActiveMemberSession();
  useSellerListings.getState().reset();
  useDiscovery.getState().reset();

  mockedInventoryApi.fetchInventoryItems.mockResolvedValue([...sampleInventory]);
  mockedSellerApi.fetchListingQuota.mockResolvedValue({ ...sampleQuota });
  mockedSellerApi.fetchReferenceData.mockResolvedValue({
    categories: [...sampleCategories],
    categoryTree: [...sampleCategoryTree],
    locations: [...sampleLocations],
  });
});

describe('Seller Store: Session Isolation & RestrictedAccountError', () => {
  test('resets seller store on logout and user switch', () => {
    useSellerListings.setState({
      myListings: [makeListingSummary()],
      quota: sampleQuota,
      categories: sampleCategories,
      locations: sampleLocations,
      error: 'Old error',
    });

    useSession.setState({ token: null, user: null });
    expect(useSellerListings.getState().myListings).toEqual([]);
    expect(useSellerListings.getState().quota).toBeNull();
    expect(useSellerListings.getState().categories).toEqual([]);
    expect(useSellerListings.getState().error).toBeNull();

    useSellerListings.setState({ myListings: [makeListingSummary()], quota: sampleQuota });
    useSession.setState({
      token: 'token-u2',
      user: {
        id: 'u-2',
        name: 'Người dùng 2',
        email: 'u2@gm.uit.edu.vn',
        studentId: '22520002',
        role: 'member',
        roles: ['MEMBER'],
        emailVerified: true,
        profileApproved: true,
        accountStatus: 'HOAT_DONG',
      },
    });
    expect(useSellerListings.getState().myListings).toEqual([]);
    expect(useSellerListings.getState().quota).toBeNull();
  });

  test('handles RestrictedAccountError without duplicating store error', async () => {
    const restriction: AccountRestriction = {
      accountStatus: 'BI_KHOA',
      lockType: 'KHOA_TAM_THOI',
      reason: 'Bị khóa',
      lockedUntil: null,
      appealable: true,
      reputationScore: 45,
      message: 'Tài khoản bị hạn chế.',
    };
    mockedSellerApi.fetchMyListings.mockRejectedValueOnce(
      new RestrictedAccountError(restriction.message, restriction),
    );

    await expect(useSellerListings.getState().loadMyListings()).rejects.toThrow(
      RestrictedAccountError,
    );
    expect(useSellerListings.getState().error).toBeNull();
    expect(useSession.getState().restriction?.reason).toBe('Bị khóa');
  });

  test('marks discovery store stale after create, update, publish, withdraw, renew, and remove', async () => {
    const baseDetail = makeListingDetail({ id: 'tin-sync-1', status: 'CONG_KHAI', version: 1 });
    const mutationRes = { listing: baseDetail, quota: sampleQuota };
    mockedSellerApi.createListing.mockResolvedValueOnce(mutationRes);
    mockedSellerApi.updateListing.mockResolvedValueOnce(mutationRes);
    mockedSellerApi.publishListing.mockResolvedValueOnce(mutationRes);
    mockedSellerApi.withdrawListing.mockResolvedValueOnce(mutationRes);
    mockedSellerApi.renewListing.mockResolvedValueOnce(mutationRes);
    mockedSellerApi.deleteListing.mockResolvedValueOnce(undefined);

    expect(useDiscovery.getState().stale).toBe(false);
    expect(useDiscovery.getState().staleVersion).toBe(0);

    await useSellerListings.getState().create({
      action: 'PUBLISH',
      title: 'Test',
      description: 'Desc',
      priceVnd: 10000,
      categoryId: 'DO_GIA_DUNG',
      images: ['https://example.com/1.jpg'],
      itemIds: ['item-1'],
    });
    expect(useDiscovery.getState().stale).toBe(true);
    expect(useDiscovery.getState().staleVersion).toBe(1);

    await useSellerListings.getState().update('tin-sync-1', {
      action: 'KEEP',
      title: 'Updated',
      description: 'Desc',
      priceVnd: 20000,
      categoryId: 'DO_GIA_DUNG',
      images: ['https://example.com/1.jpg'],
      itemIds: ['item-1'],
      version: 1,
    });
    expect(useDiscovery.getState().staleVersion).toBe(2);

    await useSellerListings.getState().publish('tin-sync-1', 2);
    expect(useDiscovery.getState().staleVersion).toBe(3);

    await useSellerListings.getState().withdraw('tin-sync-1', 3);
    expect(useDiscovery.getState().staleVersion).toBe(4);

    await useSellerListings.getState().renew('tin-sync-1', 4);
    expect(useDiscovery.getState().staleVersion).toBe(5);

    await useSellerListings.getState().remove('tin-sync-1', 5);
    expect(useDiscovery.getState().staleVersion).toBe(6);
    expect(useDiscovery.getState().stale).toBe(true);
  });
});

describe('UC-10: CreateListingScreen', () => {
  test('creates & publishes single textbook listing with photo upload from library and auto-filled zone coordinates', async () => {
    mockedImagePicker.pickImagesFromLibrary.mockResolvedValueOnce([
      {
        uri: 'file:///se100-cover.jpg',
        fileName: 'se100-cover.jpg',
        mimeType: 'image/jpeg',
        fileSize: 45000,
      },
    ]);
    mockedImagePicker.uploadListingImages.mockResolvedValueOnce([
      {
        id: 'media-1',
        url: 'https://cdn.dorm.vn/media/media-1.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 45000,
      },
    ]);
    mockedSellerApi.createListing.mockResolvedValueOnce({
      listing: makeListingDetail({ id: 'tin-created-1' }),
      quota: { ...sampleQuota, activeCount: 2, remaining: 3 },
    });

    render(<CreateListingScreen />);

    // Wait for inventory, quota, and reference data
    expect(await screen.findByText('Đang mở/giữ chỗ: 1 / 5 tin')).toBeTruthy();
    expect(await screen.findByTestId('inventory-picker-item-item-1')).toBeTruthy();

    // Unavailable items are disabled with clear lock reasons
    expect(
      screen.getByTestId('inventory-picker-item-item-3').props.accessibilityState.disabled,
    ).toBe(true);
    expect(
      screen.getByTestId('inventory-picker-item-item-4').props.accessibilityState.disabled,
    ).toBe(true);
    expect(screen.getByText(/Đang được giữ chỗ trong một giao dịch khác/)).toBeTruthy();

    // Select item-1
    fireEvent.press(screen.getByTestId('inventory-picker-item-item-1'));
    expect(screen.getByText('Đã chọn 1 món · Tin đơn')).toBeTruthy();

    // Select child textbook category -> auto-highlights textbook fields
    fireEvent.press(screen.getByTestId('category-chip-GT_DAI_CUONG'));
    expect(screen.getByTestId('textbook-recommended-badge')).toBeTruthy();
    expect(screen.getByTestId('selected-category-path').props.children).toBe(
      'Giáo trình › Giáo trình Đại cương',
    );

    // Fill textbook & listing fields
    fireEvent.changeText(screen.getByTestId('listing-title-input'), 'Giáo trình SE100 bản mới');
    fireEvent.changeText(screen.getByTestId('listing-course-code-input'), 'se100');
    fireEvent.changeText(screen.getByTestId('listing-course-name-input'), 'Nhập môn CNPM');
    fireEvent.changeText(screen.getByTestId('listing-author-input'), 'Nguyễn Văn A');
    fireEvent.changeText(screen.getByTestId('listing-condition-input'), 'Mới 95%, không ghi chú');
    fireEvent.changeText(screen.getByTestId('listing-price-input'), '120000');
    fireEvent.press(screen.getByTestId('location-chip-KTX_KHU_A'));
    fireEvent.changeText(screen.getByTestId('listing-location-text-input'), 'Sảnh tòa A1');
    fireEvent.changeText(
      screen.getByTestId('listing-description-input'),
      'Sách học kỳ vừa rồi, giao trực tiếp tại KTX Khu A.',
    );

    // Pick & upload photo from library
    fireEvent.press(screen.getByTestId('listing-pick-library-btn'));
    expect(await screen.findByText('1/5 ảnh thực tế')).toBeTruthy();
    expect(screen.getByTestId('listing-image-cover-badge')).toBeTruthy();

    // Publish listing
    fireEvent.press(screen.getByTestId('submit-publish-listing'));

    await waitFor(() => {
      expect(mockedSellerApi.createListing).toHaveBeenCalledWith({
        action: 'PUBLISH',
        title: 'Giáo trình SE100 bản mới',
        description: 'Sách học kỳ vừa rồi, giao trực tiếp tại KTX Khu A.',
        condition: 'Mới 95%, không ghi chú',
        priceVnd: 120000,
        categoryId: 'GT_DAI_CUONG',
        locationCode: 'KTX_KHU_A',
        locationText: 'Sảnh tòa A1',
        latitude: 10.8782,
        longitude: 106.8063,
        courseCode: 'SE100',
        courseName: 'Nhập môn CNPM',
        author: 'Nguyễn Văn A',
        images: ['https://cdn.dorm.vn/media/media-1.jpg'],
        itemIds: ['item-1'],
      });
      expect(mockReplace).toHaveBeenCalledWith('MyListings');
    });
  });

  test('supports combo (2+ items), free 0đ toggle, camera photo, URL photo, and reorder', async () => {
    mockedImagePicker.takePhotoWithCamera.mockResolvedValueOnce({
      uri: 'file:///cam-1.jpg',
      fileName: 'cam-1.jpg',
      mimeType: 'image/jpeg',
      fileSize: 22000,
    });
    mockedImagePicker.uploadListingImages.mockResolvedValueOnce([
      {
        id: 'media-cam',
        url: 'https://cdn.dorm.vn/media/cam-1.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 22000,
      },
    ]);
    mockedSellerApi.createListing.mockResolvedValueOnce({
      listing: makeListingDetail({ id: 'tin-combo', isCombo: true, isFree: true, priceVnd: 0 }),
      quota: { ...sampleQuota, activeCount: 2, remaining: 3 },
    });

    render(<CreateListingScreen />);
    expect(await screen.findByTestId('inventory-picker-item-item-1')).toBeTruthy();

    // Switch to combo mode and select 2 items
    fireEvent.press(screen.getByTestId('listing-mode-combo'));
    fireEvent.press(screen.getByTestId('inventory-picker-item-item-1'));
    fireEvent.press(screen.getByTestId('inventory-picker-item-item-2'));
    expect(screen.getByText('Đã chọn 2 món · Combo')).toBeTruthy();

    // Toggle free 0đ
    fireEvent.press(screen.getByTestId('listing-free-toggle'));
    expect(screen.getByTestId('free-price-banner')).toBeTruthy();
    expect(screen.getByTestId('listing-price-input').props.value).toBe('0');

    // Fill required fields
    fireEvent.changeText(screen.getByTestId('listing-title-input'), 'Combo sách + đèn học tặng bạn');
    fireEvent.press(screen.getByTestId('category-chip-DO_GIA_DUNG'));
    fireEvent.changeText(screen.getByTestId('listing-condition-input'), 'Đều hoạt động tốt');
    fireEvent.press(screen.getByTestId('location-chip-UIT'));
    fireEvent.changeText(screen.getByTestId('listing-description-input'), 'Tặng trọn bộ cho tân sinh viên.');

    // Take photo with camera
    fireEvent.press(screen.getByTestId('listing-take-photo-btn'));
    expect(await screen.findByText('1/5 ảnh thực tế')).toBeTruthy();

    // Add second photo via collapsible URL input, then move it left to become cover
    fireEvent.press(screen.getByTestId('listing-toggle-url-input'));
    fireEvent.changeText(
      screen.getByTestId('listing-image-url-input'),
      'https://cdn.dorm.vn/media/url-2.png',
    );
    fireEvent.press(screen.getByTestId('listing-add-url-btn'));
    expect(screen.getByText('2/5 ảnh thực tế')).toBeTruthy();

    fireEvent.press(screen.getByTestId('listing-image-move-left-1'));

    fireEvent.press(screen.getByTestId('submit-publish-listing'));

    await waitFor(() => {
      expect(mockedSellerApi.createListing).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PUBLISH',
          priceVnd: 0,
          itemIds: ['item-1', 'item-2'],
          images: [
            'https://cdn.dorm.vn/media/url-2.png',
            'https://cdn.dorm.vn/media/cam-1.jpg',
          ],
        }),
      );
    });
  });

  test('saves draft with partial fields and handles quota exhausted (5/5) fallback to draft', async () => {
    mockedSellerApi.fetchListingQuota.mockResolvedValueOnce({
      ...sampleQuota,
      activeCount: 5,
      remaining: 0,
      canPublish: false,
    });
    mockedSellerApi.createListing.mockResolvedValueOnce({
      listing: makeListingDetail({ id: 'tin-draft-1', status: 'NHAP' }),
      quota: { ...sampleQuota, activeCount: 5, remaining: 0, canPublish: false },
    });

    render(<CreateListingScreen />);

    expect(await screen.findByTestId('quota-exhausted-banner')).toBeTruthy();
    expect(screen.getByTestId('submit-publish-listing').props.accessibilityState.disabled).toBe(
      true,
    );

    fireEvent.changeText(screen.getByTestId('listing-title-input'), 'Bản nháp bàn học gấp');
    fireEvent.press(screen.getByTestId('submit-draft-listing'));

    await waitFor(() => {
      expect(mockedSellerApi.createListing).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DRAFT',
          title: 'Bản nháp bàn học gấp',
          images: [],
        }),
      );
      expect(mockReplace).toHaveBeenCalledWith('MyListings');
    });
  });

  test('offers one-tap draft fallback when server returns 409 QUOTA_EXCEEDED on publish', async () => {
    const quotaErr = Object.assign(new Error('Đã vượt hạn mức 5/5 tin công khai.'), {
      status: 409,
      code: 'QUOTA_EXCEEDED',
    });
    mockedSellerApi.createListing
      .mockRejectedValueOnce(quotaErr)
      .mockResolvedValueOnce({
        listing: makeListingDetail({ id: 'tin-fallback-draft', status: 'NHAP' }),
        quota: { ...sampleQuota, activeCount: 5, remaining: 0, canPublish: false },
      });

    render(<CreateListingScreen />);
    expect(await screen.findByTestId('inventory-picker-item-item-1')).toBeTruthy();

    fireEvent.press(screen.getByTestId('inventory-picker-item-item-1'));
    fireEvent.changeText(screen.getByTestId('listing-title-input'), 'Tin đụng hạn mức');
    fireEvent.press(screen.getByTestId('category-chip-DO_GIA_DUNG'));
    fireEvent.changeText(screen.getByTestId('listing-condition-input'), 'Còn tốt');
    fireEvent.changeText(screen.getByTestId('listing-price-input'), '50000');
    fireEvent.press(screen.getByTestId('location-chip-KTX_KHU_A'));
    fireEvent.changeText(screen.getByTestId('listing-description-input'), 'Mô tả đầy đủ');
    fireEvent.press(screen.getByTestId('listing-toggle-url-input'));
    fireEvent.changeText(
      screen.getByTestId('listing-image-url-input'),
      'https://example.com/photo.jpg',
    );
    fireEvent.press(screen.getByTestId('listing-add-url-btn'));

    fireEvent.press(screen.getByTestId('submit-publish-listing'));

    expect(await screen.findByTestId('quota-conflict-banner')).toBeTruthy();
    // Preserves form values
    expect(screen.getByTestId('listing-title-input').props.value).toBe('Tin đụng hạn mức');

    fireEvent.press(screen.getByTestId('fallback-save-draft-button'));
    await waitFor(() => {
      expect(mockedSellerApi.createListing).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          action: 'DRAFT',
          title: 'Tin đụng hạn mức',
          priceVnd: 50000,
        }),
      );
    });
  });

  test('shows validation errors, image upload errors, preselectedItemId, and empty inventory CTA', async () => {
    mockedInventoryApi.fetchInventoryItems.mockResolvedValueOnce([]);
    mockedImagePicker.pickImagesFromLibrary.mockRejectedValueOnce(
      new Error('Ứng dụng chưa có quyền truy cập thư viện ảnh.'),
    );

    render(<CreateListingScreen />);

    expect(await screen.findByTestId('inventory-picker-empty')).toBeTruthy();
    fireEvent.press(screen.getByTestId('go-to-inventory-cta'));
    expect(mockNavigate).toHaveBeenCalledWith('InventoryForm', { mode: 'create' });

    fireEvent.press(screen.getByTestId('listing-pick-library-btn'));
    expect(await screen.findByText('Ứng dụng chưa có quyền truy cập thư viện ảnh.')).toBeTruthy();

    fireEvent.press(screen.getByTestId('submit-publish-listing'));
    expect(
      await screen.findByText('Vui lòng chọn ít nhất 1 đồ vật khả dụng từ Kho đồ cá nhân.'),
    ).toBeTruthy();
    expect(screen.getByText('Vui lòng nhập tiêu đề tin đăng.')).toBeTruthy();
    expect(screen.getByText('Vui lòng chọn danh mục phù hợp.')).toBeTruthy();
    expect(screen.getByText('Vui lòng thêm ít nhất 1 ảnh thực tế để công khai tin.')).toBeTruthy();
  });

  test('auto-selects preselectedItemId route param and blocks restricted accounts', async () => {
    mockRouteParams.preselectedItemId = 'item-2';
    const { unmount } = render(<CreateListingScreen />);

    await waitFor(() => {
      expect(
        screen.getByTestId('inventory-picker-item-item-2').props.accessibilityState.checked,
      ).toBe(true);
    });
    unmount();

    setLockedSession();
    render(<CreateListingScreen />);
    expect(await screen.findByTestId('restricted-account-notice')).toBeTruthy();
    expect(screen.queryByTestId('listing-title-input')).toBeNull();
  });

  test('refreshes empty InventoryPickerSection automatically on focus and via manual refresh button', async () => {
    mockedInventoryApi.fetchInventoryItems
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([sampleInventory[0]]);

    const { unmount } = render(<CreateListingScreen />);
    expect(await screen.findByTestId('inventory-picker-empty')).toBeTruthy();
    expect(screen.getByTestId('inventory-picker-refresh-empty')).toBeTruthy();

    // Returning from InventoryForm triggers focus listener and loads newly added item
    emitFocusEvent();
    expect(await screen.findByTestId('inventory-picker-item-item-1')).toBeTruthy();
    unmount();

    // Manual "Tải lại kho đồ" button inside empty-inventory box also reloads items
    mockedInventoryApi.fetchInventoryItems
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([sampleInventory[1]]);

    render(<CreateListingScreen />);
    expect(await screen.findByTestId('inventory-picker-empty')).toBeTruthy();
    fireEvent.press(screen.getByTestId('inventory-picker-refresh-empty'));
    expect(await screen.findByTestId('inventory-picker-item-item-2')).toBeTruthy();
  });

  test('renders standalone InventoryPickerSection cleanly outside a NavigationContainer', async () => {
    mockThrowOnUseNavigation = true;
    mockedInventoryApi.fetchInventoryItems.mockResolvedValueOnce([sampleInventory[0]]);

    render(
      <InventoryPickerSection
        selectedItemIds={[]}
        onChangeSelectedItemIds={jest.fn()}
        mode="single"
        onChangeMode={jest.fn()}
        onNavigateToInventoryCreate={jest.fn()}
      />,
    );

    expect(await screen.findByTestId('inventory-picker-item-item-1')).toBeTruthy();
  });
});

describe('UC-17: EditListingScreen', () => {
  test('loads listing detail, shows pendingRequestCount notice, syncs items, and saves with optimistic version', async () => {
    mockRouteParams.id = 'tin-edit-1';
    mockedSellerApi.fetchSellerListingDetail.mockResolvedValueOnce(
      makeListingDetail({
        id: 'tin-edit-1',
        version: 3,
        pendingRequestCount: 2,
      }),
    );
    mockedSellerApi.updateListing.mockResolvedValueOnce({
      listing: makeListingDetail({ id: 'tin-edit-1', version: 4, title: 'Tiêu đề đã sửa' }),
      quota: sampleQuota,
    });

    render(<EditListingScreen />);

    expect(await screen.findByTestId('pending-requests-notice')).toBeTruthy();
    expect(screen.getByText('Đang có 2 yêu cầu mua chờ xử lý')).toBeTruthy();
    expect(
      screen.getByText(
        'Tin đang có 2 yêu cầu chờ xử lý; hệ thống ghi nhận sự kiện cập nhật để đồng bộ thông báo ở giai đoạn P2-04.',
      ),
    ).toBeTruthy();
    expect(await screen.findByTestId('inventory-picker-item-item-2')).toBeTruthy();

    // Expand to combo with item-2 and update title
    fireEvent.press(screen.getByTestId('listing-mode-combo'));
    fireEvent.press(screen.getByTestId('inventory-picker-item-item-2'));
    fireEvent.changeText(screen.getByTestId('listing-title-input'), 'Tiêu đề đã sửa');
    fireEvent.press(screen.getByTestId('submit-save-listing'));

    await waitFor(() => {
      expect(mockedSellerApi.updateListing).toHaveBeenCalledWith(
        'tin-edit-1',
        expect.objectContaining({
          action: 'KEEP',
          title: 'Tiêu đề đã sửa',
          itemIds: ['item-1', 'item-2'],
          version: 3,
        }),
      );
      expect(mockGoBack).toHaveBeenCalled();
    });
  });

  test('handles 409 VERSION_CONFLICT with reload CTA and supports publishing NHAP draft', async () => {
    mockRouteParams.id = 'tin-conflict';
    mockedSellerApi.fetchSellerListingDetail
      .mockResolvedValueOnce(makeListingDetail({ id: 'tin-conflict', status: 'NHAP', version: 1 }))
      .mockResolvedValueOnce(
        makeListingDetail({
          id: 'tin-conflict',
          status: 'NHAP',
          version: 2,
          title: 'Phiên bản mới nhất từ máy chủ',
        }),
      );

    const conflictErr = Object.assign(new Error('Phiên bản tin đăng đã thay đổi.'), {
      status: 409,
      code: 'VERSION_CONFLICT',
    });
    mockedSellerApi.updateListing
      .mockRejectedValueOnce(conflictErr)
      .mockResolvedValueOnce({
        listing: makeListingDetail({ id: 'tin-conflict', status: 'CONG_KHAI', version: 3 }),
        quota: { ...sampleQuota, activeCount: 2, remaining: 3 },
      });

    render(<EditListingScreen />);
    expect(await screen.findByTestId('submit-publish-draft-listing')).toBeTruthy();
    expect(await screen.findByTestId('inventory-picker-item-item-1')).toBeTruthy();

    fireEvent.press(screen.getByTestId('submit-save-listing'));
    expect(await screen.findByTestId('version-conflict-banner')).toBeTruthy();

    // Reload latest version from server
    fireEvent.press(screen.getByTestId('reload-conflict-button'));
    expect(
      await screen.findByDisplayValue('Phiên bản mới nhất từ máy chủ'),
    ).toBeTruthy();

    // Publish draft immediately using refreshed version 2
    fireEvent.press(screen.getByTestId('submit-publish-draft-listing'));
    await waitFor(() => {
      expect(mockedSellerApi.updateListing).toHaveBeenLastCalledWith(
        'tin-conflict',
        expect.objectContaining({
          action: 'PUBLISH',
          version: 2,
        }),
      );
    });
  });

  test('blocks editing with read-only banner when listing is GIU_CHO', async () => {
    mockRouteParams.id = 'tin-reserved';
    mockedSellerApi.fetchSellerListingDetail.mockResolvedValueOnce(
      makeListingDetail({ id: 'tin-reserved', status: 'GIU_CHO' }),
    );

    render(<EditListingScreen />);

    expect(await screen.findByTestId('listing-readonly-banner')).toBeTruthy();
    expect(screen.getByText(/đang được giữ chỗ trong một giao dịch/)).toBeTruthy();
    expect(screen.getByTestId('listing-title-input').props.editable).toBe(false);
    expect(screen.getByTestId('submit-save-listing').props.accessibilityState.disabled).toBe(true);
  });

  test('allows unchecking an already-selected unavailable item to resolve ITEM_STATUS_CONFLICT', async () => {
    mockRouteParams.id = 'tin-combo-conflict';
    mockedSellerApi.fetchSellerListingDetail.mockResolvedValueOnce(
      makeListingDetail({
        id: 'tin-combo-conflict',
        status: 'CONG_KHAI',
        isCombo: true,
        itemCount: 2,
        version: 4,
        items: [
          {
            id: 'item-1',
            name: 'Giáo trình Nhập môn CNPM',
            condition: 'Mới 95%',
            status: 'KHA_DUNG',
            images: ['https://example.com/item1.jpg'],
          },
          {
            id: 'item-3',
            name: 'Nồi cơm điện mini',
            condition: 'Đang giữ chỗ giao dịch',
            status: 'DANG_GIU',
            images: ['https://example.com/item3.jpg'],
          },
        ],
      }),
    );
    mockedSellerApi.updateListing.mockResolvedValueOnce({
      listing: makeListingDetail({ id: 'tin-combo-conflict', version: 5, isCombo: false, itemCount: 1 }),
      quota: sampleQuota,
    });

    render(<EditListingScreen />);

    const conflictedItem = await screen.findByTestId('inventory-picker-item-item-3');
    expect(conflictedItem.props.accessibilityState.checked).toBe(true);
    expect(conflictedItem.props.accessibilityState.disabled).toBe(false);
    expect(screen.getByText('Đồ vật không còn khả dụng — chạm để bỏ chọn')).toBeTruthy();

    // Uncheck the unavailable item; once unchecked, it becomes disabled so it cannot be re-selected
    fireEvent.press(conflictedItem);
    expect(screen.getByTestId('inventory-picker-item-item-3').props.accessibilityState.checked).toBe(
      false,
    );
    expect(
      screen.getByTestId('inventory-picker-item-item-3').props.accessibilityState.disabled,
    ).toBe(true);

    // Switch back to single mode and save cleanly without item-3
    fireEvent.press(screen.getByTestId('listing-mode-single'));
    fireEvent.press(screen.getByTestId('submit-save-listing'));

    await waitFor(() => {
      expect(mockedSellerApi.updateListing).toHaveBeenCalledWith(
        'tin-combo-conflict',
        expect.objectContaining({
          action: 'KEEP',
          itemIds: ['item-1'],
          version: 4,
        }),
      );
    });
  });

  test('shows tailored quota note without "Lưu nháp" promise when editing DA_RUT or HET_HAN with exhausted quota', async () => {
    const fullQuota: ListingQuota = {
      ...sampleQuota,
      activeCount: 5,
      remaining: 0,
      canPublish: false,
    };
    mockRouteParams.id = 'tin-withdrawn';
    mockedSellerApi.fetchListingQuota.mockResolvedValueOnce(fullQuota);
    mockedSellerApi.fetchSellerListingDetail.mockResolvedValueOnce(
      makeListingDetail({ id: 'tin-withdrawn', status: 'DA_RUT', version: 2 }),
    );

    const { unmount } = render(<EditListingScreen />);
    expect(await screen.findByTestId('quota-exhausted-note')).toBeTruthy();
    expect(screen.queryByTestId('quota-exhausted-banner')).toBeNull();
    expect(screen.queryByText(/Lưu nháp/)).toBeNull();
    expect(screen.getByTestId('submit-save-listing').props.accessibilityState.disabled).toBe(false);
    unmount();

    mockRouteParams.id = 'tin-expired';
    mockedSellerApi.fetchListingQuota.mockResolvedValueOnce(fullQuota);
    mockedSellerApi.fetchSellerListingDetail.mockResolvedValueOnce(
      makeListingDetail({ id: 'tin-expired', status: 'HET_HAN', version: 3 }),
    );

    render(<EditListingScreen />);
    expect(await screen.findByTestId('quota-exhausted-note')).toBeTruthy();
    expect(screen.queryByTestId('quota-exhausted-banner')).toBeNull();
    expect(screen.queryByText(/Lưu nháp/)).toBeNull();
  });
});

describe('UC-18 & FR-13: MyListingsScreen', () => {
  const pubListing = makeListingSummary({
    id: 'tin-pub',
    title: 'Giáo trình Giải tích 1',
    status: 'CONG_KHAI',
    version: 2,
  });
  const expiringListing = makeListingSummary({
    id: 'tin-expiring',
    title: 'Đèn bàn LED sắp hết hạn',
    status: 'CONG_KHAI',
    renewalReminderDue: true,
    expiresAt: '2026-11-28T00:00:00Z',
    version: 4,
  });
  const draftListing = makeListingSummary({
    id: 'tin-draft',
    title: 'Combo đồ gia dụng nháp',
    status: 'NHAP',
    isCombo: true,
    isFree: true,
    priceVnd: 0,
    itemCount: 2,
    version: 1,
  });
  const reservedListing = makeListingSummary({
    id: 'tin-reserved',
    title: 'Bàn học đang giữ chỗ',
    status: 'GIU_CHO',
    version: 5,
  });

  test('renders quota summary, filters by status, shows GIU_CHO lock badge, and renews FR-13 reminder', async () => {
    mockedSellerApi.fetchMyListings
      .mockResolvedValueOnce({
        items: [pubListing, expiringListing, draftListing, reservedListing],
        page: 0,
        size: 20,
        totalElements: 4,
        totalPages: 1,
        quota: { ...sampleQuota, activeCount: 3, remaining: 2 },
      })
      .mockResolvedValueOnce({
        items: [draftListing],
        page: 0,
        size: 20,
        totalElements: 1,
        totalPages: 1,
        quota: { ...sampleQuota, activeCount: 3, remaining: 2 },
      });

    mockedSellerApi.renewListing.mockResolvedValueOnce({
      listing: makeListingDetail({
        ...expiringListing,
        renewalReminderDue: false,
        renewalCount: 1,
        version: 5,
      }),
      quota: { ...sampleQuota, activeCount: 3, remaining: 2 },
    });

    render(<MyListingsScreen />);

    expect(await screen.findByText('Đang mở/giữ chỗ: 3 / 5 tin')).toBeTruthy();
    expect(screen.getByTestId('locked-badge-tin-reserved')).toBeTruthy();
    expect(screen.queryByTestId('my-listing-edit-tin-reserved')).toBeNull();
    expect(screen.queryByTestId('my-listing-withdraw-tin-reserved')).toBeNull();
    expect(screen.queryByTestId('my-listing-delete-tin-reserved')).toBeNull();

    // FR-13 renewal reminder banner & renew CTA
    expect(screen.getByTestId('renewal-banner-tin-expiring')).toBeTruthy();
    fireEvent.press(screen.getByTestId('renew-banner-btn-tin-expiring'));

    await waitFor(() => {
      expect(mockedSellerApi.renewListing).toHaveBeenCalledWith('tin-expiring', 4);
      expect(
        screen.getByText('Đã gia hạn tin "Đèn bàn LED sắp hết hạn" thêm 30 ngày.'),
      ).toBeTruthy();
    });

    // Status filter pill
    fireEvent.press(screen.getByTestId('filter-status-NHAP'));
    await waitFor(() => {
      expect(mockedSellerApi.fetchMyListings).toHaveBeenLastCalledWith({
        status: 'NHAP',
        page: 0,
        size: 20,
      });
    });
  });

  test('confirms withdraw (releasing item & quota) and handles delete + 409 LISTING_HAS_TRANSACTIONS', async () => {
    mockedSellerApi.fetchMyListings.mockResolvedValueOnce({
      items: [pubListing, draftListing],
      page: 0,
      size: 20,
      totalElements: 2,
      totalPages: 1,
      quota: { ...sampleQuota, activeCount: 1, remaining: 4 },
    });

    mockedSellerApi.withdrawListing.mockResolvedValueOnce({
      listing: makeListingDetail({ ...pubListing, status: 'DA_RUT', version: 3 }),
      quota: { ...sampleQuota, activeCount: 0, remaining: 5 },
    });
    mockedSellerApi.deleteListing
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(
        Object.assign(
          new Error(
            'Tin đăng đã phát sinh lịch sử giao dịch nên không thể xóa vĩnh viễn. Vui lòng dùng chức năng "Rút tin".',
          ),
          { status: 409, code: 'LISTING_HAS_TRANSACTIONS' },
        ),
      );

    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      const destructive = buttons?.find((b) => b.style === 'destructive');
      destructive?.onPress?.();
    });

    try {
      render(<MyListingsScreen />);
      expect(await screen.findByTestId('my-listing-card-tin-pub')).toBeTruthy();

      // 1. Delete draft cleanly
      fireEvent.press(screen.getByTestId('my-listing-delete-tin-draft'));
      expect(alertSpy).toHaveBeenCalledWith(
        'Xác nhận xóa tin',
        expect.stringContaining('Combo đồ gia dụng nháp'),
        expect.any(Array),
      );
      await waitFor(() => {
        expect(mockedSellerApi.deleteListing).toHaveBeenCalledWith('tin-draft', 1);
      });

      // 2. Delete public listing with historical transactions -> 409 LISTING_HAS_TRANSACTIONS
      fireEvent.press(screen.getByTestId('my-listing-delete-tin-pub'));
      expect(
        await screen.findByText(/lịch sử giao dịch.*Rút tin/i),
      ).toBeTruthy();

      // 3. Withdraw public listing instead -> releases item link & restores quota
      fireEvent.press(screen.getByTestId('my-listing-withdraw-tin-pub'));
      expect(alertSpy).toHaveBeenCalledWith(
        'Xác nhận rút tin',
        expect.stringContaining('giải phóng liên kết'),
        expect.any(Array),
      );
      await waitFor(() => {
        expect(mockedSellerApi.withdrawListing).toHaveBeenCalledWith('tin-pub', 2);
        expect(screen.getByText('Đang mở/giữ chỗ: 0 / 5 tin')).toBeTruthy();
      });
    } finally {
      alertSpy.mockRestore();
    }
  });

  test('publishes draft listing and gates BI_KHOA restricted accounts cleanly', async () => {
    mockedSellerApi.fetchMyListings.mockResolvedValueOnce({
      items: [draftListing],
      page: 0,
      size: 20,
      totalElements: 1,
      totalPages: 1,
      quota: sampleQuota,
    });
    mockedSellerApi.publishListing.mockResolvedValueOnce({
      listing: makeListingDetail({ ...draftListing, status: 'CONG_KHAI', version: 2 }),
      quota: { ...sampleQuota, activeCount: 2, remaining: 3 },
    });

    const { unmount } = render(<MyListingsScreen />);
    const publishBtn = await screen.findByTestId('my-listing-publish-tin-draft');
    fireEvent.press(publishBtn);

    await waitFor(() => {
      expect(mockedSellerApi.publishListing).toHaveBeenCalledWith('tin-draft', 1);
      expect(screen.getByText('Đã công khai tin "Combo đồ gia dụng nháp".')).toBeTruthy();
    });
    unmount();

    // Restricted account gating
    mockedSellerApi.fetchMyListings.mockClear();
    setLockedSession();
    render(<MyListingsScreen />);

    expect(await screen.findByTestId('restricted-account-notice')).toBeTruthy();
    expect(mockedSellerApi.fetchMyListings).not.toHaveBeenCalled();
  });
});

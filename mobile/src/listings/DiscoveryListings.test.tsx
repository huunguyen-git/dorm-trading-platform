import React from 'react';
import { Alert } from 'react-native';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { api } from '../api/client';
import { useSession, type User } from '../auth/session';
import * as discoveryApi from './discoveryApi';
import { useDiscovery } from './discoveryStore';
import { useListings } from './store';
import type { CategoryTreeNode, ListingCategory, ListingDetail, ListingSummary, LocationZone } from './types';
import ListingsScreen from '../screens/ListingsScreen';
import ListingScreen from '../screens/ListingScreen';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockRouteParams: Record<string, unknown> = {};

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native') as Record<string, unknown>;
  return {
    ...actual,
    useNavigation: () => ({
      navigate: mockNavigate,
      goBack: mockGoBack,
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

const sampleCategories: ListingCategory[] = [
  { id: 'GIAO_TRINH', name: 'Giáo trình', parentId: null, description: 'Giáo trình đại học' },
  { id: 'GT_CNTT', name: 'GT CNTT', parentId: 'GIAO_TRINH', description: 'Giáo trình CNTT' },
  { id: 'GT_KINH_TE', name: 'GT Kinh tế', parentId: 'GIAO_TRINH', description: 'Giáo trình Kinh tế' },
  { id: 'DO_GIA_DUNG', name: 'Đồ gia dụng', parentId: null, description: 'Đồ dùng phòng trọ' },
];

const sampleCategoryTree: CategoryTreeNode[] = [
  {
    ...sampleCategories[0],
    children: [
      { ...sampleCategories[1], children: [] },
      { ...sampleCategories[2], children: [] },
    ],
  },
  { ...sampleCategories[3], children: [] },
];

const sampleLocations: LocationZone[] = [
  { code: 'KTX_KHU_A', name: 'KTX Khu A', group: 'KTX', latitude: 10.8782, longitude: 106.8063 },
  { code: 'UIT', name: 'ĐH CNTT (UIT)', group: 'TRUONG', latitude: 10.87, longitude: 106.8031 },
  { code: 'KTX_KHU_B', name: 'KTX Khu B', group: 'KTX', latitude: 10.8824, longitude: 106.7825 },
];

const sampleListing1: ListingSummary = {
  id: 'listing-1',
  title: 'Combo Giáo trình Nhập môn CNPM SE100 + Sổ ghi chú',
  description: 'Trọn bộ giáo trình bản in rõ nét, kèm slide tổng hợp ôn thi cuối kỳ.',
  condition: 'Mới 95%, không viết vẽ',
  priceVnd: 120000,
  listingType: 'BAN_COMBO',
  isCombo: true,
  isFree: false,
  status: 'CONG_KHAI',
  categoryId: 'GT_CNTT',
  categoryName: 'GT CNTT',
  courseCode: 'SE100',
  courseName: 'Phương pháp phát triển phần mềm hướng đối tượng',
  author: 'TS. Nguyễn Văn A',
  locationCode: 'KTX_KHU_A',
  locationName: 'KTX Khu A',
  locationText: 'Sảnh tòa A1, giao tối sau 18h',
  latitude: 10.8782,
  longitude: 106.8063,
  distanceKm: 1.2,
  thumbnailUrl: 'https://cdn.example.com/se100-1.jpg',
  images: [
    'https://cdn.example.com/se100-1.jpg',
    'https://cdn.example.com/se100-2.jpg',
    'https://cdn.example.com/se100-3.jpg',
  ],
  itemCount: 2,
  seller: {
    id: 'seller-1',
    displayName: 'Trần Lan Anh',
    reputationScore: 125,
    averageRating: 4.8,
    reviewCount: 12,
  },
  hasUnavailableItems: false,
  publishedAt: '2026-11-20T09:00:00Z',
  expiresAt: '2026-12-20T09:00:00Z',
  renewalReminderDue: false,
  renewalCount: 0,
  createdAt: '2026-11-20T09:00:00Z',
  updatedAt: '2026-11-20T09:00:00Z',
  version: 1,
};

const sampleListing2: ListingSummary = {
  id: 'listing-2',
  title: 'Tặng đèn bàn học LED chống cận',
  description: 'Chuyển phòng nên tặng lại cho bạn sinh viên cần dùng.',
  condition: 'Còn sáng tốt 3 chế độ',
  priceVnd: 0,
  listingType: 'CHO_TANG',
  isCombo: false,
  isFree: true,
  status: 'CONG_KHAI',
  categoryId: 'DO_GIA_DUNG',
  categoryName: 'Đồ gia dụng',
  courseCode: null,
  courseName: null,
  author: null,
  locationCode: 'UIT',
  locationName: 'ĐH CNTT (UIT)',
  locationText: 'Cổng trước tòa C',
  latitude: 10.87,
  longitude: 106.8031,
  distanceKm: 0.4,
  thumbnailUrl: 'https://cdn.example.com/lamp.jpg',
  images: ['https://cdn.example.com/lamp.jpg'],
  itemCount: 1,
  seller: {
    id: 'seller-2',
    displayName: 'Lê Hoàng Nam',
    reputationScore: 100,
    averageRating: null,
    reviewCount: 0,
  },
  hasUnavailableItems: false,
  publishedAt: '2026-11-21T10:00:00Z',
  expiresAt: '2026-12-21T10:00:00Z',
  renewalReminderDue: false,
  renewalCount: 0,
  createdAt: '2026-11-21T10:00:00Z',
  updatedAt: '2026-11-21T10:00:00Z',
  version: 1,
};

const sampleDetail1: ListingDetail = {
  ...sampleListing1,
  category: { id: 'GT_CNTT', name: 'GT CNTT', parentId: 'GIAO_TRINH', description: null },
  items: [
    {
      id: 'item-a',
      name: 'Giáo trình SE100 bản in 2025',
      condition: 'Mới 95%',
      status: 'KHA_DUNG',
      images: ['https://cdn.example.com/se100-1.jpg'],
    },
    {
      id: 'item-b',
      name: 'Sổ ghi chú sơ đồ UML',
      condition: 'Ghi chép sạch sẽ',
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
};

function setupDefaultApiMock(listingsResponse: unknown = {
  items: [sampleListing1, sampleListing2],
  page: 0,
  size: 20,
  totalElements: 2,
  totalPages: 1,
}) {
  mockedApi.mockImplementation(async (path: string) => {
    if (path === '/categories') {
      return { items: sampleCategories, tree: sampleCategoryTree };
    }
    if (path === '/locations') {
      return { items: sampleLocations };
    }
    if (path.startsWith('/listings/listing-1')) {
      return sampleDetail1;
    }
    if (path.startsWith('/listings')) {
      return listingsResponse;
    }
    return [];
  });
}

const initialLegacyLoad = useListings.getState().load;

beforeEach(() => {
  jest.clearAllMocks();
  for (const key of Object.keys(mockRouteParams)) {
    delete mockRouteParams[key];
  }
  useSession.setState({
    token: null,
    user: null,
    loading: false,
    restriction: null,
    restrictionDismissed: false,
  });
  useListings.setState({
    listings: [],
    loading: false,
    load: initialLegacyLoad,
  });
  useDiscovery.getState().reset();
});

describe('discoveryApi helpers', () => {
  test('buildListingSearchQuery serializes all valid filters and omits blank/invalid fields', () => {
    const query = discoveryApi.buildListingSearchQuery({
      q: '  SE100  ',
      categoryId: 'GT_CNTT',
      courseCode: 'SE100',
      minPrice: 10000,
      maxPrice: 150000,
      freeOnly: true,
      type: 'COMBO',
      locationCode: 'KTX_KHU_A',
      lat: 10.8782,
      lng: 106.8063,
      radiusKm: 1.5,
      sort: 'distance_asc',
      page: 1,
      size: 20,
    });

    expect(query).toContain('q=SE100');
    expect(query).toContain('categoryId=GT_CNTT');
    expect(query).toContain('courseCode=SE100');
    expect(query).toContain('minPrice=10000');
    expect(query).toContain('maxPrice=150000');
    expect(query).toContain('freeOnly=true');
    expect(query).toContain('type=COMBO');
    expect(discoveryApi.buildListingSearchQuery({ type: 'BAN_LE' })).toBe('?type=SINGLE');
    expect(discoveryApi.buildListingSearchQuery({ type: 'BAN_COMBO' })).toBe('?type=COMBO');
    expect(query).toContain('locationCode=KTX_KHU_A');
    expect(query).toContain('lat=10.8782');
    expect(query).toContain('lng=106.8063');
    expect(query).toContain('radiusKm=1.5');
    expect(query).toContain('sort=distance_asc');
    expect(query).toContain('page=1');
    expect(query).toContain('size=20');

    expect(discoveryApi.buildListingSearchQuery({ q: '   ', radiusKm: -2, freeOnly: false })).toBe('');
  });

  test('searchListings handles both paged object and bare array responses', async () => {
    mockedApi.mockResolvedValueOnce([sampleListing1]);
    const fromArray = await discoveryApi.searchListings({});
    expect(fromArray.items).toHaveLength(1);
    expect(fromArray.items[0].id).toBe('listing-1');
    expect(fromArray.totalElements).toBe(1);

    mockedApi.mockResolvedValueOnce({
      items: [sampleListing1, sampleListing2],
      page: 0,
      size: 2,
      totalElements: 5,
      totalPages: 3,
    });
    const fromPage = await discoveryApi.searchListings({ page: 0, size: 2 });
    expect(fromPage.items).toHaveLength(2);
    expect(fromPage.totalElements).toBe(5);
    expect(fromPage.totalPages).toBe(3);
  });

  test('fetchCategories and fetchLocations fail-soft on errors', async () => {
    mockedApi.mockRejectedValue(new Error('Network down'));
    await expect(discoveryApi.fetchCategories()).resolves.toEqual({ items: [], tree: [] });
    await expect(discoveryApi.fetchLocations()).resolves.toEqual([]);
  });
});

describe('UC-19 ListingsScreen (Discovery, Search, Filters, Pagination)', () => {
  test('loads and renders public listing cards with badges, price, distance, seller reputation, and total count', async () => {
    setupDefaultApiMock();
    useSession.setState({ token: 'member-jwt', user: activeMember, loading: false });

    render(<ListingsScreen />);

    expect(await screen.findByText('Tìm thấy 2 tin đăng')).toBeTruthy();
    expect(screen.getByText('Combo Giáo trình Nhập môn CNPM SE100 + Sổ ghi chú')).toBeTruthy();
    expect(screen.getByText('Combo · 2 món')).toBeTruthy();
    expect(screen.getByText('120.000đ')).toBeTruthy();
    expect(screen.getByText('SE100')).toBeTruthy();
    expect(screen.getByText('KTX Khu A · ~1.2 km')).toBeTruthy();
    expect(screen.getByText('⭐ 125đ')).toBeTruthy();

    expect(screen.getByText('Tặng đèn bàn học LED chống cận')).toBeTruthy();
    expect(screen.getByText('Tin đơn')).toBeTruthy();
    expect(screen.getByText('Miễn phí 0đ')).toBeTruthy();
    expect(screen.getByText('Miễn phí (0đ)')).toBeTruthy();

    // Active member quick navigation buttons
    expect(screen.getByRole('button', { name: 'Tin của tôi' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Kho đồ' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hồ sơ' })).toBeTruthy();

    fireEvent.press(screen.getByTestId('listing-card-listing-1'));
    expect(mockNavigate).toHaveBeenCalledWith('Listing', {
      id: 'listing-1',
      listing: expect.objectContaining({ id: 'listing-1' }),
    });
  });

  test('supports keyword search and hierarchical parent -> child category filtering', async () => {
    setupDefaultApiMock();

    render(<ListingsScreen />);
    await screen.findByText('Tìm thấy 2 tin đăng');

    // Keyword search
    fireEvent.changeText(screen.getByTestId('search-input'), 'SE100');
    fireEvent.press(screen.getByTestId('search-submit-button'));

    await waitFor(() => {
      expect(mockedApi).toHaveBeenCalledWith(expect.stringContaining('/listings?q=SE100'));
    });

    // Parent category -> expands children row -> select child category
    fireEvent.press(screen.getByTestId('category-chip-GIAO_TRINH'));
    await waitFor(() => {
      expect(mockedApi).toHaveBeenCalledWith(expect.stringContaining('categoryId=GIAO_TRINH'));
    });

    const childChip = await screen.findByTestId('category-chip-GT_CNTT');
    fireEvent.press(childChip);
    await waitFor(() => {
      expect(mockedApi).toHaveBeenCalledWith(expect.stringContaining('categoryId=GT_CNTT'));
    });
  });

  test('applies advanced filters: courseCode, maxPrice, type, ĐHQG-HCM zone + open radius, sort, and freeOnly', async () => {
    setupDefaultApiMock();

    render(<ListingsScreen />);
    await screen.findByText('Tìm thấy 2 tin đăng');

    // Open advanced panel
    fireEvent.press(screen.getByTestId('toggle-advanced-filters'));
    expect(screen.getByTestId('advanced-filter-panel')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('filter-course-code'), 'SE100');
    fireEvent.changeText(screen.getByTestId('filter-max-price'), '150000');
    fireEvent.press(screen.getByTestId('filter-type-combo'));
    fireEvent.press(screen.getByTestId('filter-location-KTX_KHU_A'));
    fireEvent.changeText(screen.getByTestId('filter-radius-km'), '1.5');
    fireEvent.press(screen.getByTestId('sort-distance_asc'));
    fireEvent.press(screen.getByTestId('apply-filters-button'));

    await waitFor(() => {
      const listingCalls = mockedApi.mock.calls
        .map((call) => String(call[0]))
        .filter((path) => path.startsWith('/listings?'));
      const latest = listingCalls[listingCalls.length - 1];
      expect(latest).toContain('courseCode=SE100');
      expect(latest).toContain('maxPrice=150000');
      expect(latest).toContain('type=COMBO');
      expect(latest).toContain('locationCode=KTX_KHU_A');
      expect(latest).toContain('lat=10.8782');
      expect(latest).toContain('lng=106.8063');
      expect(latest).toContain('radiusKm=1.5');
      expect(latest).toContain('sort=distance_asc');
    });

    // Active filter count badge visible
    expect(screen.getByTestId('active-filter-count-badge')).toBeTruthy();

    // Toggle free-only & price_asc sort
    fireEvent.press(screen.getByTestId('toggle-advanced-filters'));
    fireEvent.press(screen.getByTestId('filter-free-only'));
    fireEvent.press(screen.getByTestId('sort-price_asc'));
    fireEvent.press(screen.getByTestId('apply-filters-button'));

    await waitFor(() => {
      const listingCalls = mockedApi.mock.calls
        .map((call) => String(call[0]))
        .filter((path) => path.startsWith('/listings?'));
      const latest = listingCalls[listingCalls.length - 1];
      expect(latest).toContain('freeOnly=true');
      expect(latest).not.toContain('maxPrice=');
      expect(latest).toContain('sort=price_asc');
    });
  });

  test('renders filtered empty state with "Xóa bộ lọc" and resets back to unfiltered results (UC-19 Alt 1)', async () => {
    mockedApi.mockImplementation(async (path: string) => {
      if (path === '/categories') return { items: sampleCategories, tree: sampleCategoryTree };
      if (path === '/locations') return { items: sampleLocations };
      if (path.includes('q=KhongTonTai')) {
        return { items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 };
      }
      return { items: [sampleListing1], page: 0, size: 20, totalElements: 1, totalPages: 1 };
    });

    render(<ListingsScreen />);
    await screen.findByText('Tìm thấy 1 tin đăng');

    fireEvent.changeText(screen.getByTestId('search-input'), 'KhongTonTai');
    fireEvent.press(screen.getByTestId('search-submit-button'));

    expect(
      await screen.findByText('Không tìm thấy tin phù hợp. Thử nới lỏng bộ lọc.'),
    ).toBeTruthy();

    fireEvent.press(screen.getByTestId('empty-reset-filters-button'));

    expect(await screen.findByText('Combo Giáo trình Nhập môn CNPM SE100 + Sổ ghi chú')).toBeTruthy();
  });

  test('renders default empty state when no listings exist and no filters are active', async () => {
    setupDefaultApiMock({ items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 });

    render(<ListingsScreen />);

    expect(await screen.findByText('Chưa có tin đăng.')).toBeTruthy();
  });

  test('displays network error banner and recovers on retry button press (UC-19 E1)', async () => {
    let shouldFail = true;
    mockedApi.mockImplementation(async (path: string) => {
      if (path === '/categories') return { items: sampleCategories, tree: sampleCategoryTree };
      if (path === '/locations') return { items: sampleLocations };
      if (shouldFail) {
        throw new Error('Mất kết nối máy chủ.');
      }
      return { items: [sampleListing2], page: 0, size: 20, totalElements: 1, totalPages: 1 };
    });

    render(<ListingsScreen />);
    expect(await screen.findByText('Mất kết nối máy chủ.')).toBeTruthy();

    shouldFail = false;
    fireEvent.press(screen.getByTestId('listings-retry-button'));

    expect(await screen.findByText('Tặng đèn bàn học LED chống cận')).toBeTruthy();
  });

  test('supports pagination load more appending next page items', async () => {
    mockedApi.mockImplementation(async (path: string) => {
      if (path === '/categories') return { items: sampleCategories, tree: sampleCategoryTree };
      if (path === '/locations') return { items: sampleLocations };
      if (path.includes('page=1')) {
        return { items: [sampleListing2], page: 1, size: 1, totalElements: 2, totalPages: 2 };
      }
      return { items: [sampleListing1], page: 0, size: 1, totalElements: 2, totalPages: 2 };
    });

    render(<ListingsScreen />);
    expect(await screen.findByText('Combo Giáo trình Nhập môn CNPM SE100 + Sổ ghi chú')).toBeTruthy();

    const loadMoreBtn = screen.getByTestId('load-more-button');
    fireEvent.press(loadMoreBtn);

    expect(await screen.findByText('Tặng đèn bàn học LED chống cận')).toBeTruthy();
    expect(screen.queryByTestId('load-more-button')).toBeNull();
  });
});

describe('UC-20 ListingScreen (Rich Detail, Gallery, Trust Card, Role/State Alternatives)', () => {
  test('renders full detail, switches gallery photos, shows combo items, textbook metadata, and zero seller PII (NFR-01)', async () => {
    useDiscovery.setState({ categories: sampleCategories, categoryTree: sampleCategoryTree });
    mockRouteParams.id = 'listing-1';
    mockedApi.mockResolvedValueOnce({
      ...sampleDetail1,
      seller: {
        ...sampleDetail1.seller,
        // Verify even if unexpected PII fields existed on raw payload, normalizer strips them and UI never displays them
        email: 'secret-seller@uit.edu.vn',
        mssv: '22529999',
        phone: '0909123456',
      },
    });

    render(<ListingScreen />);

    expect(await screen.findByText('Combo Giáo trình Nhập môn CNPM SE100 + Sổ ghi chú')).toBeTruthy();
    expect(screen.getByText('120.000đ')).toBeTruthy();
    expect(screen.getByText('Combo (2 đồ vật)')).toBeTruthy();
    expect(screen.getByText('Danh mục: Giáo trình › GT CNTT')).toBeTruthy();

    // Gallery navigation (next + thumbnail)
    expect(screen.getByText('1/3')).toBeTruthy();
    fireEvent.press(screen.getByTestId('gallery-next'));
    expect(screen.getByText('2/3')).toBeTruthy();
    fireEvent.press(screen.getByTestId('gallery-thumb-2'));
    expect(screen.getByText('3/3')).toBeTruthy();
    fireEvent.press(screen.getByTestId('gallery-prev'));
    expect(screen.getByText('2/3')).toBeTruthy();

    // Textbook metadata
    expect(screen.getByText('Thông tin giáo trình')).toBeTruthy();
    expect(screen.getByText('Mã môn học: SE100')).toBeTruthy();
    expect(screen.getByText(/Phương pháp phát triển phần mềm/)).toBeTruthy();
    expect(screen.getByText('Tác giả: TS. Nguyễn Văn A')).toBeTruthy();

    // Component items list
    expect(screen.getByText('Đồ vật trong combo (2 món)')).toBeTruthy();
    expect(screen.getByText('Giáo trình SE100 bản in 2025')).toBeTruthy();
    expect(screen.getByText('Sổ ghi chú sơ đồ UML')).toBeTruthy();

    // Meeting location & Seller public trust card
    expect(screen.getByText('KTX Khu A')).toBeTruthy();
    expect(screen.getByText('Sảnh tòa A1, giao tối sau 18h')).toBeTruthy();
    expect(screen.getByText('Trần Lan Anh')).toBeTruthy();
    expect(screen.getByText('Điểm uy tín: 125')).toBeTruthy();
    expect(screen.getByText('4.8 ★ (12 đánh giá)')).toBeTruthy();

    // NFR-01: Zero PII rendered anywhere
    expect(screen.queryByText(/secret-seller@uit\.edu\.vn/)).toBeNull();
    expect(screen.queryByText(/22529999/)).toBeNull();
    expect(screen.queryByText(/0909123456/)).toBeNull();
  });

  test('UC-20 Alt 1: owner sees Edit and Manage My Listings buttons, hides buyer actions, and respects canEdit=false', async () => {
    useSession.setState({ token: 'seller-jwt', user: sellerUser, loading: false });
    mockRouteParams.id = 'listing-1';
    mockedApi.mockResolvedValueOnce({
      ...sampleDetail1,
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

    const { unmount } = render(<ListingScreen />);

    const editBtn = await screen.findByTestId('owner-edit-button');
    const manageBtn = screen.getByTestId('owner-manage-button');
    expect(editBtn.props.accessibilityState.disabled).toBe(false);
    expect(screen.queryByTestId('reserve-button')).toBeNull();
    expect(screen.queryByTestId('message-button')).toBeNull();
    expect(screen.queryByTestId('make-offer-button')).toBeNull();

    fireEvent.press(editBtn);
    expect(mockNavigate).toHaveBeenCalledWith('EditListing', { id: 'listing-1' });

    fireEvent.press(manageBtn);
    expect(mockNavigate).toHaveBeenCalledWith('MyListings');
    unmount();

    // Locked owner listing (canEdit = false)
    useDiscovery.getState().clearDetail();
    mockedApi.mockResolvedValueOnce({
      ...sampleDetail1,
      status: 'GIU_CHO',
      viewer: {
        isOwner: true,
        canEdit: false,
        canWithdraw: false,
        canDelete: false,
        canPublish: false,
        canRenew: false,
        canMakeOffer: false,
        canReserve: false,
        canMessage: false,
      },
    });

    render(<ListingScreen />);
    const lockedEditBtn = await screen.findByTestId('owner-edit-button');
    expect(lockedEditBtn.props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId('owner-status-banner')).toBeTruthy();
  });

  test('UC-20 Alt 2: GIU_CHO listing shows amber banner and disables Reserve CTA for non-owner', async () => {
    useSession.setState({ token: 'buyer-jwt', user: activeMember, loading: false });
    mockRouteParams.id = 'listing-1';
    mockedApi.mockResolvedValueOnce({
      ...sampleDetail1,
      status: 'GIU_CHO',
      viewer: {
        ...sampleDetail1.viewer,
        canReserve: false,
        canMakeOffer: false,
      },
    });

    render(<ListingScreen />);

    expect(await screen.findByTestId('reserved-banner')).toBeTruthy();
    expect(screen.getByText('Tin đang được giữ chỗ')).toBeTruthy();
    expect(screen.getByTestId('reserve-button').props.accessibilityState.disabled).toBe(true);
  });

  test('UC-20 Alt 3: free listing (0đ) hides Make Offer button while keeping Message and Reserve active for member', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    useSession.setState({ token: 'buyer-jwt', user: activeMember, loading: false });
    mockRouteParams.id = 'listing-2';
    mockedApi.mockResolvedValueOnce({
      ...sampleListing2,
      category: { id: 'DO_GIA_DUNG', name: 'Đồ gia dụng', parentId: null, description: null },
      items: [
        {
          id: 'item-lamp',
          name: 'Đèn bàn học LED',
          condition: 'Còn sáng tốt',
          status: 'KHA_DUNG',
          images: ['https://cdn.example.com/lamp.jpg'],
        },
      ],
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
      pendingRequestCount: 0,
      closedAt: null,
      hiddenReason: null,
    });

    render(<ListingScreen />);

    expect(await screen.findByText('Tặng đèn bàn học LED chống cận')).toBeTruthy();
    expect(screen.queryByTestId('make-offer-button')).toBeNull();
    expect(screen.getByTestId('message-button').props.accessibilityState.disabled).toBe(false);
    expect(screen.getByTestId('reserve-button').props.accessibilityState.disabled).toBe(false);
    expect(screen.getByText('Chưa có đánh giá')).toBeTruthy();

    fireEvent.press(screen.getByTestId('reserve-button'));
    expect(alertSpy).toHaveBeenCalledWith(
      'Tính năng sắp ra mắt',
      expect.stringContaining('P2-04'),
    );
    alertSpy.mockRestore();
  });

  test('UC-20 Alt 4: guest tapping Message, Make Offer, or Reserve redirects cleanly to Login', async () => {
    useSession.setState({ token: null, user: null, loading: false });
    mockRouteParams.id = 'listing-1';
    mockedApi.mockResolvedValueOnce(sampleDetail1);

    render(<ListingScreen />);
    await screen.findByText('Combo Giáo trình Nhập môn CNPM SE100 + Sổ ghi chú');

    fireEvent.press(screen.getByTestId('message-button'));
    fireEvent.press(screen.getByTestId('make-offer-button'));
    fireEvent.press(screen.getByTestId('reserve-button'));

    expect(mockNavigate).toHaveBeenNthCalledWith(1, 'Login');
    expect(mockNavigate).toHaveBeenNthCalledWith(2, 'Login');
    expect(mockNavigate).toHaveBeenNthCalledWith(3, 'Login');
  });

  test('renders unavailable-items warning banner and disables Reserve when hasUnavailableItems=true', async () => {
    useSession.setState({ token: 'buyer-jwt', user: activeMember, loading: false });
    mockRouteParams.id = 'listing-1';
    mockedApi.mockResolvedValueOnce({
      ...sampleDetail1,
      hasUnavailableItems: true,
      viewer: { ...sampleDetail1.viewer, canReserve: false },
    });

    render(<ListingScreen />);
    expect(await screen.findByTestId('unavailable-items-banner')).toBeTruthy();
    expect(
      screen.getByText('Một hoặc nhiều đồ vật trong tin hiện đang được giữ/chuyển giao ở tin khác'),
    ).toBeTruthy();
    expect(screen.getByTestId('reserve-button').props.accessibilityState.disabled).toBe(true);
  });

  test('UC-20 E1: handles 404 Not Found / Hidden gracefully and navigates back to Listings', async () => {
    mockRouteParams.id = 'missing-id';
    const notFoundErr = new Error('Không tìm thấy tin đăng.') as Error & {
      status?: number;
      code?: string;
    };
    notFoundErr.status = 404;
    notFoundErr.code = 'LISTING_NOT_FOUND';
    mockedApi.mockRejectedValueOnce(notFoundErr);

    render(<ListingScreen />);

    expect(await screen.findByTestId('listing-not-found')).toBeTruthy();
    expect(screen.getByText('Tin không tồn tại hoặc đã bị ẩn')).toBeTruthy();

    fireEvent.press(screen.getByTestId('back-to-search-button'));
    expect(mockNavigate).toHaveBeenCalledWith('Listings');
  });

  test('UC-20 E2: displays network error with Retry button and recovers', async () => {
    mockRouteParams.id = 'listing-1';
    mockedApi
      .mockRejectedValueOnce(new Error('Không thể kết nối máy chủ.'))
      .mockResolvedValueOnce(sampleDetail1);

    render(<ListingScreen />);

    expect(await screen.findByText('Không thể kết nối máy chủ.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('detail-retry-button'));

    expect(await screen.findByText('Combo Giáo trình Nhập môn CNPM SE100 + Sổ ghi chú')).toBeTruthy();
  });

  test('refreshes selectedDetail viewer context when user session logs in', async () => {
    mockedApi
      .mockResolvedValueOnce(sampleDetail1)
      .mockResolvedValueOnce({
        ...sampleDetail1,
        viewer: { ...sampleDetail1.viewer, isOwner: true, canEdit: true },
      });

    await useDiscovery.getState().loadDetail('listing-1');
    expect(useDiscovery.getState().selectedDetail?.viewer.isOwner).toBe(false);

    useSession.setState({ token: 'seller-jwt', user: sellerUser });

    await waitFor(() => {
      expect(useDiscovery.getState().selectedDetail?.viewer.isOwner).toBe(true);
    });
  });
});

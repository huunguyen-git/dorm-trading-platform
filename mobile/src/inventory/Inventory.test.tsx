import React from 'react';
import { Alert } from 'react-native';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useInventory } from './store';
import { useSession } from '../auth/session';
import InventoryListScreen from '../screens/InventoryListScreen';
import InventoryDetailScreen from '../screens/InventoryDetailScreen';
import InventoryFormScreen from '../screens/InventoryFormScreen';
import * as inventoryApi from './api';
import type { InventoryItem } from './types';
import { normalizeInventoryItem } from './types';

// Mock navigation
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockRouteParams: Record<string, any> = {};

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
    useFocusEffect: (cb: any) => {
      const React = require('react');
      React.useEffect(() => {
        cb();
      }, [cb]);
    },
  };
});

// Mock inventory API
jest.mock('./api');
const mockedApi = jest.mocked(inventoryApi);

const sampleItems: InventoryItem[] = [
  {
    id: 'item-1',
    ten: 'Bàn học gấp gọn',
    tinhTrang: 'Còn mới 95%, không trầy xước',
    hinhAnh: ['https://example.com/img1.jpg', 'https://example.com/img2.jpg'],
    trangThai: 'KHA_DUNG',
    linkedListingCount: 0,
    canEdit: true,
    canDelete: true,
    version: 1,
    linkedListings: [],
  },
  {
    id: 'item-2',
    ten: 'Đèn bàn học LED',
    tinhTrang: 'Hoạt động tốt 3 chế độ sáng',
    hinhAnh: ['https://example.com/img3.jpg'],
    trangThai: 'DANG_GIU',
    linkedListingCount: 1,
    canEdit: false,
    canDelete: false,
    version: 1,
    linkedListings: [{ id: 'tin-2', tieuDe: 'Thanh lý đèn bàn', trangThai: 'DANG_GIU' }],
  },
  {
    id: 'item-3',
    ten: 'Ghế xoay văn phòng',
    tinhTrang: 'Đã qua sử dụng, bánh xe trơn',
    hinhAnh: ['https://example.com/img4.jpg'],
    trangThai: 'DA_CHUYEN_GIAO',
    linkedListingCount: 1,
    canEdit: false,
    canDelete: false,
    version: 2,
    linkedListings: [{ id: 'tin-3', tieuDe: 'Ghế xoay', trangThai: 'HOAN_TAT' }],
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  for (const key of Object.keys(mockRouteParams)) {
    delete mockRouteParams[key];
  }

  useSession.setState({
    token: 'test-token',
    user: {
      id: 'u1',
      name: 'Nguyen Van A',
      email: 'a@dorm.vn',
      studentId: '123456',
      roles: ['MEMBER'],
      emailVerified: true,
      profileApproved: true,
      accountStatus: 'HOAT_DONG',
      role: 'member',
    },
    loading: false,
  });

  useInventory.setState({
    items: [...sampleItems],
    selectedItem: null,
    loading: false,
    error: null,
  });

  mockedApi.fetchInventoryItems.mockResolvedValue([...sampleItems]);
  mockedApi.fetchInventoryItem.mockImplementation(async (id: string) => {
    return sampleItems.find((i) => i.id === id) || sampleItems[0];
  });
});

describe('Domain Normalization & Unit Parsing', () => {
  test('normalizes raw backend response correctly (including fallback properties)', () => {
    const rawData = {
      id: 'item-backend-1',
      ten: 'Quạt máy senko',
      tinh_trang: 'Mới 90%',
      hinh_anh: ['http://img.com/1.jpg'],
      trang_thai: 'KHA_DUNG',
      linked_listing_count: 0,
      version: 3,
    };

    const normalized = normalizeInventoryItem(rawData);
    expect(normalized.id).toBe('item-backend-1');
    expect(normalized.ten).toBe('Quạt máy senko');
    expect(normalized.tinhTrang).toBe('Mới 90%');
    expect(normalized.hinhAnh).toEqual(['http://img.com/1.jpg']);
    expect(normalized.trangThai).toBe('KHA_DUNG');
    expect(normalized.canEdit).toBe(true);
    expect(normalized.canDelete).toBe(true);
    expect(normalized.version).toBe(3);
  });
});

describe('Screen: InventoryListScreen', () => {
  test('renders list of items with name, status badges, thumbnail, and linked listing counts', async () => {
    mockedApi.fetchInventoryItems.mockResolvedValue([...sampleItems]);

    render(<InventoryListScreen />);

    expect(await screen.findByText('Kho đồ cá nhân')).toBeTruthy();
    expect(screen.getByText('Bàn học gấp gọn')).toBeTruthy();
    expect(screen.getByText('Đèn bàn học LED')).toBeTruthy();
    expect(screen.getByText('Ghế xoay văn phòng')).toBeTruthy();

    // Badges
    expect(screen.getByText('Khả dụng')).toBeTruthy();
    expect(screen.getByText('Đang giữ')).toBeTruthy();
    expect(screen.getByText('Đã chuyển giao')).toBeTruthy();

    // Listing counts
    expect(screen.getByText('Chưa gắn tin đăng')).toBeTruthy();
    expect(screen.getAllByText('Đang gắn với 1 tin đăng').length).toBe(2);
  });

  test('displays empty state when inventory contains no items', async () => {
    useInventory.setState({ items: [], loading: false, error: null });
    mockedApi.fetchInventoryItems.mockResolvedValue([]);

    render(<InventoryListScreen />);

    expect(await screen.findByText('Kho đồ trống')).toBeTruthy();
    expect(
      screen.getByText('Bạn chưa có món đồ nào trong kho cá nhân. Hãy thêm đồ vật để sẵn sàng đăng tin thanh lý!'),
    ).toBeTruthy();

    const addNowBtn = screen.getByText('Thêm đồ vật ngay');
    fireEvent.press(addNowBtn);
    expect(mockNavigate).toHaveBeenCalledWith('InventoryForm', { mode: 'create' });
  });

  test('navigates to detail when "Chi tiết" button is pressed', async () => {
    render(<InventoryListScreen />);

    const detailBtn = screen.getByTestId('view-detail-item-1');
    fireEvent.press(detailBtn);

    expect(mockNavigate).toHaveBeenCalledWith('InventoryDetail', { id: 'item-1' });
  });

  test('navigates to edit form when item is KHA_DUNG and has 0 listings', async () => {
    render(<InventoryListScreen />);

    const editBtn = screen.getByTestId('edit-item-item-1');
    fireEvent.press(editBtn);

    expect(mockNavigate).toHaveBeenCalledWith('InventoryForm', {
      mode: 'edit',
      id: 'item-1',
      item: sampleItems[0],
    });
  });

  test('disables edit and delete buttons when item is not KHA_DUNG or linked to listing', async () => {
    render(<InventoryListScreen />);

    const editBtn = await screen.findByTestId('edit-item-item-2');
    const deleteBtn = screen.getByTestId('delete-item-item-2');

    expect(editBtn.props.accessibilityState.disabled).toBe(true);
    expect(deleteBtn.props.accessibilityState.disabled).toBe(true);

    fireEvent.press(editBtn);
    // Should not navigate
    expect(mockNavigate).not.toHaveBeenCalledWith('InventoryForm', expect.anything());
  });

  test('prompts confirmation on delete and calls deleteItem on confirm', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
      // Simulate user clicking 'Xóa'
      const confirmButton = buttons?.find((b) => b.text === 'Xóa');
      confirmButton?.onPress?.();
    });

    mockedApi.deleteInventoryItem.mockResolvedValue();

    render(<InventoryListScreen />);

    const deleteBtn = screen.getByTestId('delete-item-item-1');
    fireEvent.press(deleteBtn);

    expect(Alert.alert).toHaveBeenCalledWith(
      'Xác nhận xóa',
      expect.stringContaining('Bàn học gấp gọn'),
      expect.any(Array),
    );

    await waitFor(() => {
      expect(mockedApi.deleteInventoryItem).toHaveBeenCalledWith('item-1', 1);
    });
  });

  test('displays error banner if deletion is rejected due to active listing (409 conflict)', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
      const confirmButton = buttons?.find((b) => b.text === 'Xóa');
      confirmButton?.onPress?.();
    });

    mockedApi.deleteInventoryItem.mockRejectedValue(new Error('API 409: Item linked to listing'));

    render(<InventoryListScreen />);

    const deleteBtn = screen.getByTestId('delete-item-item-1');
    fireEvent.press(deleteBtn);

    expect(
      await screen.findByText('Không thể xóa đồ vật đang gắn với tin đăng hoặc đang xử lý giao dịch.'),
    ).toBeTruthy();
  });

  test('displays conflict error banner when API returns 409 error object without 409 in message', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
      const confirmButton = buttons?.find((b) => b.text === 'Xóa');
      confirmButton?.onPress?.();
    });

    const error = new Error('Đồ vật đã được liên kết với tin đăng') as any;
    error.status = 409;
    error.code = 'ITEM_LINKED_TO_LISTING';
    mockedApi.deleteInventoryItem.mockRejectedValue(error);

    render(<InventoryListScreen />);

    const deleteBtn = screen.getByTestId('delete-item-item-1');
    fireEvent.press(deleteBtn);

    expect(
      await screen.findByText('Không thể xóa đồ vật đang gắn với tin đăng hoặc đang xử lý giao dịch.'),
    ).toBeTruthy();
  });
});

describe('Screen: InventoryDetailScreen', () => {
  test('renders item details with images, condition, status, and linked listings', async () => {
    mockRouteParams.id = 'item-2';
    mockedApi.fetchInventoryItem.mockResolvedValue(sampleItems[1]);

    render(<InventoryDetailScreen />);

    expect(await screen.findByText('Đèn bàn học LED')).toBeTruthy();
    expect(screen.getByText('Hoạt động tốt 3 chế độ sáng')).toBeTruthy();
    expect(screen.getByText('Đang giữ')).toBeTruthy();
    expect(screen.getByText('Thanh lý đèn bàn')).toBeTruthy();
    expect(screen.getByText('Trạng thái: Đang giữ chỗ')).toBeTruthy();
  });

  test('blocks edit and delete button for item with status DANG_GIU', async () => {
    mockRouteParams.id = 'item-2';
    mockedApi.fetchInventoryItem.mockResolvedValue(sampleItems[1]);

    render(<InventoryDetailScreen />);

    const editBtn = await screen.findByTestId('detail-edit-button');
    const deleteBtn = screen.getByTestId('detail-delete-button');

    expect(editBtn.props.accessibilityState.disabled).toBe(true);
    expect(deleteBtn.props.accessibilityState.disabled).toBe(true);
  });

  test('deletes item passing current version and navigates back', async () => {
    mockRouteParams.id = 'item-1';
    mockedApi.fetchInventoryItem.mockResolvedValue(sampleItems[0]);
    mockedApi.deleteInventoryItem.mockResolvedValue(undefined);

    jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
      const confirmButton = buttons?.find((b) => b.text === 'Xóa');
      confirmButton?.onPress?.();
    });

    render(<InventoryDetailScreen />);

    const deleteBtn = await screen.findByTestId('detail-delete-button');
    fireEvent.press(deleteBtn);

    await waitFor(() => {
      expect(mockedApi.deleteInventoryItem).toHaveBeenCalledWith('item-1', 1);
      expect(mockGoBack).toHaveBeenCalled();
    });
  });
});

describe('Screen: InventoryFormScreen (Add & Edit)', () => {
  test('validates required fields: empty name, empty condition, missing image', async () => {
    mockRouteParams.mode = 'create';

    render(<InventoryFormScreen />);

    const submitBtn = screen.getByTestId('submit-inventory-form');

    // 1. Submit with empty name
    fireEvent.press(submitBtn);
    expect(await screen.findByText('Vui lòng nhập tên đồ vật.')).toBeTruthy();

    // 2. Fill name, submit with empty condition
    fireEvent.changeText(screen.getByTestId('input-item-name'), 'Nồi cơm mini');
    fireEvent.press(submitBtn);
    expect(await screen.findByText('Vui lòng nhập mô tả tình trạng đồ vật.')).toBeTruthy();

    // 3. Fill condition, submit with 0 images
    fireEvent.changeText(screen.getByTestId('input-item-condition'), 'Nấu cơm dẻo, dung tích 0.8L');
    fireEvent.press(submitBtn);
    expect(await screen.findByText('Vui lòng chọn ít nhất 1 ảnh thực tế.')).toBeTruthy();
  });

  test('supports adding 1 to 5 images and removes image correctly', async () => {
    mockRouteParams.mode = 'create';

    render(<InventoryFormScreen />);

    // Add image 1 by URL
    fireEvent.changeText(screen.getByTestId('input-image-url'), 'https://example.com/img1.jpg');
    fireEvent.press(screen.getByTestId('add-image-url-button'));
    expect(await screen.findByText('Ảnh thực tế (1/5)')).toBeTruthy();

    // Add image 2 by URL
    fireEvent.changeText(screen.getByTestId('input-image-url'), 'https://example.com/custom.jpg');
    fireEvent.press(screen.getByTestId('add-image-url-button'));
    expect(screen.getByText('Ảnh thực tế (2/5)')).toBeTruthy();

    // Remove first image
    const removeBtn = screen.getByTestId('remove-image-0');
    fireEvent.press(removeBtn);
    expect(screen.getByText('Ảnh thực tế (1/5)')).toBeTruthy();
  });

  test('submits create form successfully and navigates back', async () => {
    mockRouteParams.mode = 'create';
    mockedApi.createInventoryItem.mockResolvedValue({
      id: 'item-new',
      ten: 'Nồi cơm mini',
      tinhTrang: 'Nấu cơm dẻo',
      hinhAnh: ['https://example.com/rice.jpg'],
      trangThai: 'KHA_DUNG',
      linkedListingCount: 0,
      canEdit: true,
      canDelete: true,
    });

    render(<InventoryFormScreen />);

    fireEvent.changeText(screen.getByTestId('input-item-name'), 'Nồi cơm mini');
    fireEvent.changeText(screen.getByTestId('input-item-condition'), 'Nấu cơm dẻo');
    fireEvent.changeText(screen.getByTestId('input-image-url'), 'https://example.com/rice.jpg');
    fireEvent.press(screen.getByTestId('add-image-url-button'));

    fireEvent.press(screen.getByTestId('submit-inventory-form'));

    await waitFor(() => {
      expect(mockedApi.createInventoryItem).toHaveBeenCalledWith({
        ten: 'Nồi cơm mini',
        tinhTrang: 'Nấu cơm dẻo',
        hinhAnh: ['https://example.com/rice.jpg'],
      });
      expect(mockGoBack).toHaveBeenCalled();
    });
  });

  test('blocks edit mode when item is in DANG_GIU status or linked to listing', async () => {
    mockRouteParams.mode = 'edit';
    mockRouteParams.id = 'item-2';
    mockRouteParams.item = sampleItems[1]; // DANG_GIU

    render(<InventoryFormScreen />);

    expect(
      await screen.findByText('Đồ vật này đang nằm trong tin đăng hoặc không ở trạng thái khả dụng, không thể chỉnh sửa.'),
    ).toBeTruthy();

    const nameInput = screen.getByTestId('input-item-name');
    expect(nameInput.props.editable).toBe(false);

    const submitBtn = screen.getByTestId('submit-inventory-form');
    expect(submitBtn.props.accessibilityState.disabled).toBe(true);
  });

  test('handles 409 conflict error when updating item and displays error notice banner', async () => {
    mockRouteParams.mode = 'edit';
    mockRouteParams.id = 'item-1';
    mockRouteParams.item = sampleItems[0]; // KHA_DUNG

    mockedApi.updateInventoryItem.mockRejectedValue(
      new Error('API 409: Item is already reserved or linked to listing'),
    );

    render(<InventoryFormScreen />);

    fireEvent.changeText(screen.getByTestId('input-item-condition'), 'Cập nhật tình trạng mới');
    fireEvent.press(screen.getByTestId('submit-inventory-form'));

    expect(
      await screen.findByText('Xung đột dữ liệu hoặc đồ vật đã gắn vào tin đăng khác.'),
    ).toBeTruthy();
  });

  test('clears shared store error when cancelling form after an error', async () => {
    mockRouteParams.mode = 'create';
    mockedApi.createInventoryItem.mockRejectedValue(new Error('Dữ liệu không hợp lệ'));

    render(<InventoryFormScreen />);

    fireEvent.changeText(screen.getByTestId('input-item-name'), 'Đồ test');
    fireEvent.changeText(screen.getByTestId('input-item-condition'), 'Tình trạng');
    fireEvent.changeText(screen.getByTestId('input-image-url'), 'https://example.com/1.jpg');
    fireEvent.press(screen.getByTestId('add-image-url-button'));
    fireEvent.press(screen.getByTestId('submit-inventory-form'));

    expect(await screen.findByText('Dữ liệu không hợp lệ')).toBeTruthy();
    expect(useInventory.getState().error).toBe('Dữ liệu không hợp lệ');

    fireEvent.press(screen.getByTestId('cancel-inventory-form'));
    expect(useInventory.getState().error).toBeNull();
    expect(mockGoBack).toHaveBeenCalled();
  });
});

describe('Store: Sync & Session Isolation', () => {
  test('loadItem synchronizes updated item back into items list', async () => {
    const refreshedItem: InventoryItem = {
      ...sampleItems[0],
      ten: 'Bàn học đã cập nhật',
      version: 5,
    };
    mockedApi.fetchInventoryItem.mockResolvedValue(refreshedItem);

    await useInventory.getState().loadItem('item-1');

    const itemInList = useInventory.getState().items.find((i) => i.id === 'item-1');
    expect(itemInList?.ten).toBe('Bàn học đã cập nhật');
    expect(itemInList?.version).toBe(5);
    expect(useInventory.getState().selectedItem?.version).toBe(5);
  });

  test('resets inventory store when user logs out or switches account', () => {
    useInventory.setState({
      items: [...sampleItems],
      selectedItem: sampleItems[0],
      error: 'Old error',
    });

    useSession.setState({ token: null, user: null });

    expect(useInventory.getState().items).toEqual([]);
    expect(useInventory.getState().selectedItem).toBeNull();
    expect(useInventory.getState().error).toBeNull();

    useInventory.setState({ items: [...sampleItems], selectedItem: sampleItems[0] });
    useSession.setState({
      token: 'token-u2',
      user: {
        id: 'u2',
        name: 'User 2',
        email: 'u2@dorm.vn',
        studentId: '654321',
        roles: ['MEMBER'],
        emailVerified: true,
        profileApproved: true,
        accountStatus: 'HOAT_DONG',
        role: 'member',
      },
    });

    expect(useInventory.getState().items).toEqual([]);
    expect(useInventory.getState().selectedItem).toBeNull();
  });
});

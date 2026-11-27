import { create } from 'zustand';
import { useSession } from '../auth/session';
import * as inventoryApi from './api';
import type { CreateInventoryItemInput, InventoryItem, UpdateInventoryItemInput } from './types';

const GENERIC_SERVER_ERROR = 'Không thể kết nối máy chủ. Vui lòng thử lại.';

function sanitizeInventoryError(rawMessage: unknown, fallback: string): string {
  const trimmed = typeof rawMessage === 'string' ? rawMessage.trim() : '';
  if (!trimmed) return fallback;
  if (trimmed.startsWith('API ')) return GENERIC_SERVER_ERROR;
  return trimmed;
}

export interface InventoryState {
  items: InventoryItem[];
  selectedItem: InventoryItem | null;
  loading: boolean;
  error: string | null;
  loadItems: () => Promise<void>;
  loadItem: (id: string) => Promise<InventoryItem>;
  addItem: (input: CreateInventoryItemInput) => Promise<InventoryItem>;
  updateItem: (id: string, input: UpdateInventoryItemInput) => Promise<InventoryItem>;
  deleteItem: (id: string, version?: number) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

export const useInventory = create<InventoryState>((set, get) => ({
  items: [],
  selectedItem: null,
  loading: false,
  error: null,

  clearError: () => set({ error: null }),
  reset: () => set({ items: [], selectedItem: null, loading: false, error: null }),

  loadItems: async () => {
    set({ loading: true, error: null });
    try {
      const items = await inventoryApi.fetchInventoryItems();
      set({ items });
    } catch (err: any) {
      const message = sanitizeInventoryError(err?.message, 'Không thể tải danh sách kho đồ.');
      set({ error: message });
      throw new Error(message);
    } finally {
      set({ loading: false });
    }
  },

  loadItem: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const item = await inventoryApi.fetchInventoryItem(id);
      set({
        selectedItem: item,
        items: get().items.map((i) => (i.id === id ? item : i)),
      });
      return item;
    } catch (err: any) {
      const message = sanitizeInventoryError(err?.message, 'Không thể tải chi tiết đồ vật.');
      set({ error: message });
      throw new Error(message);
    } finally {
      set({ loading: false });
    }
  },

  addItem: async (input: CreateInventoryItemInput) => {
    set({ loading: true, error: null });
    try {
      const created = await inventoryApi.createInventoryItem(input);
      set({ items: [created, ...get().items] });
      return created;
    } catch (err: any) {
      const message = sanitizeInventoryError(err?.message, 'Không thể tạo đồ vật mới.');
      set({ error: message });
      throw new Error(message);
    } finally {
      set({ loading: false });
    }
  },

  updateItem: async (id: string, input: UpdateInventoryItemInput) => {
    const existing = get().items.find((i) => i.id === id);
    if (existing && (!existing.canEdit || existing.trangThai !== 'KHA_DUNG' || existing.linkedListingCount > 0)) {
      const message = 'Đồ vật đang gắn với tin đăng hoặc không ở trạng thái khả dụng, không thể chỉnh sửa.';
      set({ error: message });
      throw new Error(message);
    }

    set({ loading: true, error: null });
    const prevItems = get().items;
    try {
      const updated = await inventoryApi.updateInventoryItem(id, {
        ...input,
        version: input.version ?? existing?.version,
      });
      set({
        items: get().items.map((i) => (i.id === id ? updated : i)),
        selectedItem: get().selectedItem?.id === id ? updated : get().selectedItem,
      });
      return updated;
    } catch (err: any) {
      set({ items: prevItems });
      const rawMessage = err?.message || '';
      const isConflict = err?.status === 409 || err?.code === 'VERSION_CONFLICT' || err?.code === 'ITEM_LINKED_TO_LISTING' || err?.code === 'ITEM_STATUS_CONFLICT' || rawMessage.includes('409');
      const message = isConflict
        ? 'Xung đột dữ liệu hoặc đồ vật đã gắn vào tin đăng khác.'
        : sanitizeInventoryError(rawMessage, 'Không thể cập nhật đồ vật.');
      set({ error: message });
      throw new Error(message);
    } finally {
      set({ loading: false });
    }
  },

  deleteItem: async (id: string, version?: number) => {
    const existing = get().items.find((i) => i.id === id);
    if (existing && (!existing.canDelete || existing.trangThai !== 'KHA_DUNG' || existing.linkedListingCount > 0)) {
      const message = 'Không thể xóa đồ vật đang gắn với tin đăng hoặc không ở trạng thái khả dụng.';
      set({ error: message });
      throw new Error(message);
    }

    const effectiveVersion = version ?? existing?.version ?? (get().selectedItem?.id === id ? get().selectedItem?.version : undefined);
    set({ loading: true, error: null });
    const prevItems = get().items;
    set({ items: get().items.filter((i) => i.id !== id) });
    try {
      await inventoryApi.deleteInventoryItem(id, effectiveVersion);
      if (get().selectedItem?.id === id) {
        set({ selectedItem: null });
      }
    } catch (err: any) {
      set({ items: prevItems });
      const rawMessage = err?.message || '';
      const isConflict = err?.status === 409 || err?.code === 'VERSION_CONFLICT' || err?.code === 'ITEM_LINKED_TO_LISTING' || err?.code === 'ITEM_STATUS_CONFLICT' || rawMessage.includes('409');
      const message = isConflict
        ? 'Không thể xóa đồ vật đang gắn với tin đăng hoặc đang xử lý giao dịch.'
        : sanitizeInventoryError(rawMessage, 'Không thể xóa đồ vật.');
      set({ error: message });
      throw new Error(message);
    } finally {
      set({ loading: false });
    }
  },
}));

useSession.subscribe((state, prevState) => {
  const prevUserId = prevState.user?.id ?? null;
  const nextUserId = state.user?.id ?? null;
  if ((!state.token && prevState.token) || prevUserId !== nextUserId) {
    useInventory.getState().reset();
  }
});

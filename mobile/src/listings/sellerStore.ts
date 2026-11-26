import { create } from 'zustand';
import { useSession } from '../auth/session';
import { useDiscovery } from './discoveryStore';
import * as sellerApi from './sellerApi';
import type {
  CategoryTreeNode,
  CreateListingPayload,
  ListingCategory,
  ListingMutationResponse,
  ListingQuota,
  ListingStatus,
  ListingSummary,
  LocationZone,
  MyListingsPage,
  UpdateListingPayload,
} from './types';

export interface SellerListingsState {
  myListings: ListingSummary[];
  page: number;
  size: number;
  totalPages: number;
  totalElements: number;
  statusFilter: ListingStatus | '';
  quota: ListingQuota | null;
  categories: ListingCategory[];
  categoryTree: CategoryTreeNode[];
  locations: LocationZone[];
  loading: boolean;
  loadingReferences: boolean;
  submitting: boolean;
  error: string | null;
  setStatusFilter: (status: ListingStatus | '') => void;
  clearError: () => void;
  loadMyListings: (params?: {
    status?: ListingStatus | '';
    page?: number;
    size?: number;
  }) => Promise<MyListingsPage>;
  loadQuota: () => Promise<ListingQuota>;
  loadReferences: (force?: boolean) => Promise<void>;
  create: (payload: CreateListingPayload) => Promise<ListingMutationResponse>;
  update: (id: string, payload: UpdateListingPayload) => Promise<ListingMutationResponse>;
  publish: (id: string, version: number) => Promise<ListingMutationResponse>;
  withdraw: (id: string, version: number) => Promise<ListingMutationResponse>;
  renew: (id: string, version: number) => Promise<ListingMutationResponse>;
  remove: (id: string, version?: number) => Promise<void>;
  reset: () => void;
}

const INITIAL_STATE = {
  myListings: [] as ListingSummary[],
  page: 0,
  size: 20,
  totalPages: 0,
  totalElements: 0,
  statusFilter: '' as ListingStatus | '',
  quota: null as ListingQuota | null,
  categories: [] as ListingCategory[],
  categoryTree: [] as CategoryTreeNode[],
  locations: [] as LocationZone[],
  loading: false,
  loadingReferences: false,
  submitting: false,
  error: null as string | null,
};

function syncRestrictionIfNeeded(error: unknown): boolean {
  if (!sellerApi.isRestrictedError(error)) {
    return false;
  }
  if (!useSession.getState().restriction) {
    useSession.setState({
      restriction: error.restriction,
      restrictionDismissed: false,
    });
  }
  return true;
}

function mergeUpdatedListing(
  current: ListingSummary[],
  updated: ListingSummary,
  statusFilter: ListingStatus | '',
  prependIfMissing: boolean,
): ListingSummary[] {
  const matchesFilter = !statusFilter || updated.status === statusFilter;
  const exists = current.some((item) => item.id === updated.id);

  if (!matchesFilter) {
    return current.filter((item) => item.id !== updated.id);
  }
  if (exists) {
    return current.map((item) => (item.id === updated.id ? updated : item));
  }
  return prependIfMissing ? [updated, ...current] : current;
}

let myListingsRequestSeq = 0;

export const useSellerListings = create<SellerListingsState>((set, get) => ({
  ...INITIAL_STATE,

  setStatusFilter: (status) => set({ statusFilter: status }),
  clearError: () => set({ error: null }),
  reset: () => {
    myListingsRequestSeq += 1;
    sellerApi.clearReferenceDataCache();
    set({ ...INITIAL_STATE });
  },

  loadMyListings: async (params) => {
    const nextStatus = params?.status !== undefined ? params.status : get().statusFilter;
    const nextPage = params?.page ?? 0;
    const nextSize = params?.size ?? get().size;
    const requestId = ++myListingsRequestSeq;

    set({ loading: true, error: null, statusFilter: nextStatus });
    try {
      const response = await sellerApi.fetchMyListings({
        status: nextStatus,
        page: nextPage,
        size: nextSize,
      });
      if (requestId !== myListingsRequestSeq) {
        return response;
      }
      const existing = nextPage > 0 ? get().myListings : [];
      const mergedItems =
        nextPage > 0
          ? [
              ...existing,
              ...response.items.filter((item) => !existing.some((prev) => prev.id === item.id)),
            ]
          : response.items;

      set({
        myListings: mergedItems,
        page: response.page,
        size: response.size,
        totalPages: response.totalPages,
        totalElements: response.totalElements,
        quota: response.quota,
      });
      return response;
    } catch (err) {
      if (requestId !== myListingsRequestSeq) {
        throw err;
      }
      if (syncRestrictionIfNeeded(err)) {
        set({ error: null });
        throw err;
      }
      const parsed = sellerApi.extractApiError(err, 'Không thể tải danh sách tin của bạn.');
      set({ error: parsed.message });
      throw err;
    } finally {
      if (requestId === myListingsRequestSeq) {
        set({ loading: false });
      }
    }
  },

  loadQuota: async () => {
    try {
      const quota = await sellerApi.fetchListingQuota();
      set({ quota });
      return quota;
    } catch (err) {
      if (syncRestrictionIfNeeded(err)) {
        set({ error: null });
        throw err;
      }
      const parsed = sellerApi.extractApiError(err, 'Không thể tải hạn mức đăng tin.');
      set({ error: parsed.message });
      throw err;
    }
  },

  loadReferences: async (force = false) => {
    if (!force && get().categories.length > 0 && get().locations.length > 0) {
      return;
    }
    set({ loadingReferences: true });
    try {
      const data = await sellerApi.fetchReferenceData({ force });
      set({
        categories: data.categories,
        categoryTree: data.categoryTree,
        locations: data.locations,
      });
    } catch (err) {
      if (syncRestrictionIfNeeded(err)) {
        set({ error: null });
        throw err;
      }
      const parsed = sellerApi.extractApiError(err, 'Không thể tải danh mục và khu vực ĐHQG-HCM.');
      set({ error: parsed.message });
      throw err;
    } finally {
      set({ loadingReferences: false });
    }
  },

  create: async (payload) => {
    set({ submitting: true, error: null });
    try {
      const response = await sellerApi.createListing(payload);
      const { myListings, statusFilter, totalElements } = get();
      const nextList = mergeUpdatedListing(myListings, response.listing, statusFilter, true);
      const added = nextList.length > myListings.length;
      set({
        myListings: nextList,
        totalElements: added ? totalElements + 1 : totalElements,
        quota: response.quota,
      });
      useDiscovery.getState().markStale();
      return response;
    } catch (err) {
      if (syncRestrictionIfNeeded(err)) {
        set({ error: null });
        throw err;
      }
      const parsed = sellerApi.extractApiError(err, 'Không thể tạo tin đăng.');
      set({ error: parsed.message });
      throw err;
    } finally {
      set({ submitting: false });
    }
  },

  update: async (id, payload) => {
    set({ submitting: true, error: null });
    try {
      const response = await sellerApi.updateListing(id, payload);
      const { myListings, statusFilter, totalElements } = get();
      const nextList = mergeUpdatedListing(myListings, response.listing, statusFilter, false);
      const removed = nextList.length < myListings.length;
      set({
        myListings: nextList,
        totalElements: removed ? Math.max(0, totalElements - 1) : totalElements,
        quota: response.quota,
      });
      useDiscovery.getState().markStale();
      return response;
    } catch (err) {
      if (syncRestrictionIfNeeded(err)) {
        set({ error: null });
        throw err;
      }
      const parsed = sellerApi.extractApiError(err, 'Không thể cập nhật tin đăng.');
      set({ error: parsed.message });
      throw err;
    } finally {
      set({ submitting: false });
    }
  },

  publish: async (id, version) => {
    set({ submitting: true, error: null });
    try {
      const response = await sellerApi.publishListing(id, version);
      const { myListings, statusFilter, totalElements } = get();
      const nextList = mergeUpdatedListing(myListings, response.listing, statusFilter, false);
      const removed = nextList.length < myListings.length;
      set({
        myListings: nextList,
        totalElements: removed ? Math.max(0, totalElements - 1) : totalElements,
        quota: response.quota,
      });
      useDiscovery.getState().markStale();
      return response;
    } catch (err) {
      if (syncRestrictionIfNeeded(err)) {
        set({ error: null });
        throw err;
      }
      const parsed = sellerApi.extractApiError(err, 'Không thể công khai tin đăng.');
      set({ error: parsed.message });
      throw err;
    } finally {
      set({ submitting: false });
    }
  },

  withdraw: async (id, version) => {
    set({ submitting: true, error: null });
    try {
      const response = await sellerApi.withdrawListing(id, version);
      const { myListings, statusFilter, totalElements } = get();
      const nextList = mergeUpdatedListing(myListings, response.listing, statusFilter, false);
      const removed = nextList.length < myListings.length;
      set({
        myListings: nextList,
        totalElements: removed ? Math.max(0, totalElements - 1) : totalElements,
        quota: response.quota,
      });
      useDiscovery.getState().markStale();
      return response;
    } catch (err) {
      if (syncRestrictionIfNeeded(err)) {
        set({ error: null });
        throw err;
      }
      const parsed = sellerApi.extractApiError(err, 'Không thể rút tin đăng.');
      set({ error: parsed.message });
      throw err;
    } finally {
      set({ submitting: false });
    }
  },

  renew: async (id, version) => {
    set({ submitting: true, error: null });
    try {
      const response = await sellerApi.renewListing(id, version);
      const { myListings, statusFilter, totalElements } = get();
      const nextList = mergeUpdatedListing(myListings, response.listing, statusFilter, false);
      const removed = nextList.length < myListings.length;
      set({
        myListings: nextList,
        totalElements: removed ? Math.max(0, totalElements - 1) : totalElements,
        quota: response.quota,
      });
      useDiscovery.getState().markStale();
      return response;
    } catch (err) {
      if (syncRestrictionIfNeeded(err)) {
        set({ error: null });
        throw err;
      }
      const parsed = sellerApi.extractApiError(err, 'Không thể gia hạn tin đăng.');
      set({ error: parsed.message });
      throw err;
    } finally {
      set({ submitting: false });
    }
  },

  remove: async (id, version) => {
    set({ submitting: true, error: null });
    const target = get().myListings.find((item) => item.id === id);
    try {
      const effectiveVersion = version ?? target?.version;
      if (typeof effectiveVersion !== 'number' || !Number.isFinite(effectiveVersion)) {
        throw new Error('Thiếu thông tin phiên bản dữ liệu. Vui lòng làm mới danh sách rồi thử lại.');
      }
      await sellerApi.deleteListing(id, effectiveVersion);
      const { myListings, totalElements, quota } = get();
      const nextList = myListings.filter((item) => item.id !== id);
      const wasActiveCounted =
        target?.status === 'CONG_KHAI' ||
        target?.status === 'GIU_CHO' ||
        target?.status === 'CHO_DUYET';
      let nextQuota = quota;
      if (quota && wasActiveCounted) {
        const nextActive = Math.max(0, quota.activeCount - 1);
        const nextRemaining = Math.max(0, quota.limit - nextActive);
        nextQuota = {
          ...quota,
          activeCount: nextActive,
          remaining: nextRemaining,
          canPublish: nextActive < quota.limit,
        };
      }
      set({
        myListings: nextList,
        totalElements: nextList.length < myListings.length ? Math.max(0, totalElements - 1) : totalElements,
        quota: nextQuota,
      });
      useDiscovery.getState().markStale();
      if (!target) {
        void get().loadQuota().catch(() => {});
      }
    } catch (err) {
      if (syncRestrictionIfNeeded(err)) {
        set({ error: null });
        throw err;
      }
      const parsed = sellerApi.extractApiError(err, 'Không thể xóa tin đăng.');
      set({ error: parsed.message });
      throw err;
    } finally {
      set({ submitting: false });
    }
  },
}));

useSession.subscribe((state, prevState) => {
  const prevUserId = prevState.user?.id ?? null;
  const nextUserId = state.user?.id ?? null;
  if ((!state.token && prevState.token) || prevUserId !== nextUserId) {
    useSellerListings.getState().reset();
  }
});

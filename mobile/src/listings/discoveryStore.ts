import { create } from 'zustand';
import { RestrictedAccountError } from '../api/client';
import { useSession } from '../auth/session';
import * as discoveryApi from './discoveryApi';
import type { DiscoverySearchFilters } from './discoveryApi';
import type {
  CategoryTreeNode,
  ListingCategory,
  ListingDetail,
  ListingPage,
  ListingSummary,
  LocationZone,
} from './types';

export const DEFAULT_DISCOVERY_FILTERS: DiscoverySearchFilters = {
  sort: 'newest',
  page: 0,
  size: 20,
};

export function countActiveDiscoveryFilters(filters: DiscoverySearchFilters): number {
  let count = 0;
  if (filters.q?.trim()) count += 1;
  if (filters.categoryId?.trim()) count += 1;
  if (filters.courseCode?.trim()) count += 1;
  if (typeof filters.minPrice === 'number' && Number.isFinite(filters.minPrice)) count += 1;
  if (typeof filters.maxPrice === 'number' && Number.isFinite(filters.maxPrice)) count += 1;
  if (filters.freeOnly === true) count += 1;
  if (discoveryApi.normalizeSearchTypeParam(filters.type)) count += 1;
  if (filters.locationCode?.trim() || filters.location?.trim()) count += 1;
  if (typeof filters.radiusKm === 'number' && Number.isFinite(filters.radiusKm) && filters.radiusKm > 0) count += 1;
  if (filters.sort && filters.sort !== 'newest') count += 1;
  return count;
}

export function hasActiveDiscoveryFilters(filters: DiscoverySearchFilters): boolean {
  return countActiveDiscoveryFilters(filters) > 0;
}

function cleanFilters(next: DiscoverySearchFilters): DiscoverySearchFilters {
  const cleaned: DiscoverySearchFilters = {
    sort: next.sort ?? 'newest',
    page: typeof next.page === 'number' && next.page >= 0 ? next.page : 0,
    size: typeof next.size === 'number' && next.size > 0 ? next.size : 20,
  };

  if (next.q?.trim()) cleaned.q = next.q.trim();
  if (next.categoryId?.trim()) cleaned.categoryId = next.categoryId.trim();
  if (next.courseCode?.trim()) cleaned.courseCode = next.courseCode.trim();
  if (typeof next.minPrice === 'number' && Number.isFinite(next.minPrice) && next.minPrice >= 0) {
    cleaned.minPrice = Math.round(next.minPrice);
  }
  if (typeof next.maxPrice === 'number' && Number.isFinite(next.maxPrice) && next.maxPrice >= 0) {
    cleaned.maxPrice = Math.round(next.maxPrice);
  }
  if (next.freeOnly === true) {
    cleaned.freeOnly = true;
    delete cleaned.maxPrice;
    delete cleaned.minPrice;
  }
  const normalizedType = discoveryApi.normalizeSearchTypeParam(next.type);
  if (normalizedType) cleaned.type = normalizedType;
  if (next.locationCode?.trim()) cleaned.locationCode = next.locationCode.trim();
  if (next.location?.trim()) cleaned.location = next.location.trim();
  if (typeof next.lat === 'number' && Number.isFinite(next.lat)) cleaned.lat = next.lat;
  if (typeof next.lng === 'number' && Number.isFinite(next.lng)) cleaned.lng = next.lng;
  if (
    typeof next.radiusKm === 'number' &&
    Number.isFinite(next.radiusKm) &&
    next.radiusKm > 0 &&
    cleaned.lat !== undefined &&
    cleaned.lng !== undefined
  ) {
    cleaned.radiusKm = next.radiusKm;
  }
  if (cleaned.sort === 'distance_asc' && (cleaned.lat === undefined || cleaned.lng === undefined)) {
    cleaned.sort = 'newest';
  }
  return cleaned;
}

function syncRestrictedError(err: unknown): boolean {
  if (typeof RestrictedAccountError === 'function' && err instanceof RestrictedAccountError) {
    if (!useSession.getState().restriction) {
      useSession.setState({ restriction: err.restriction, restrictionDismissed: false });
    }
    return true;
  }
  return false;
}

export interface SearchOptions {
  resetPage?: boolean;
  refreshing?: boolean;
  filters?: DiscoverySearchFilters;
}

export interface DiscoveryState {
  items: ListingSummary[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  filters: DiscoverySearchFilters;
  categories: ListingCategory[];
  categoryTree: CategoryTreeNode[];
  locations: LocationZone[];
  referencesLoaded: boolean;
  hasLoadedOnce: boolean;
  loading: boolean;
  loadingMore: boolean;
  refreshing: boolean;
  error: string | null;
  selectedDetail: ListingDetail | null;
  detailLoading: boolean;
  detailError: string | null;
  detailNotFound: boolean;
  loadReferences: (force?: boolean) => Promise<void>;
  search: (options?: boolean | SearchOptions) => Promise<ListingPage | null>;
  loadMore: () => Promise<void>;
  setFilter: (partial: Partial<DiscoverySearchFilters>) => void;
  resetFilters: () => Promise<ListingPage | null>;
  loadDetail: (id: string) => Promise<ListingDetail | null>;
  clearDetail: () => void;
  reset: () => void;
}

let searchRequestSeq = 0;
let detailRequestSeq = 0;

export const useDiscovery = create<DiscoveryState>((set, get) => ({
  items: [],
  page: 0,
  size: 20,
  totalElements: 0,
  totalPages: 0,
  filters: { ...DEFAULT_DISCOVERY_FILTERS },
  categories: [],
  categoryTree: [],
  locations: [],
  referencesLoaded: false,
  hasLoadedOnce: false,
  loading: false,
  loadingMore: false,
  refreshing: false,
  error: null,
  selectedDetail: null,
  detailLoading: false,
  detailError: null,
  detailNotFound: false,

  loadReferences: async (force = false) => {
    if (!force && get().referencesLoaded) return;
    const [categoriesRes, locations] = await Promise.all([
      discoveryApi.fetchCategories(),
      discoveryApi.fetchLocations(),
    ]);
    set({
      categories: categoriesRes.items,
      categoryTree: categoriesRes.tree,
      locations,
      referencesLoaded: true,
    });
  },

  search: async (options = true) => {
    const normalizedOptions: SearchOptions =
      typeof options === 'boolean' ? { resetPage: options } : options;
    const resetPage = normalizedOptions.resetPage ?? true;
    const isRefreshing = normalizedOptions.refreshing ?? false;
    const baseFilters = normalizedOptions.filters ?? get().filters;
    const nextFilters = cleanFilters({
      ...baseFilters,
      page: resetPage ? 0 : (baseFilters.page ?? get().page),
      size: baseFilters.size ?? get().size ?? 20,
    });

    const requestId = ++searchRequestSeq;
    set({
      filters: nextFilters,
      loading: !isRefreshing,
      refreshing: isRefreshing,
      error: null,
    });

    try {
      const result = await discoveryApi.searchListings(nextFilters);
      if (requestId !== searchRequestSeq) return null;
      set({
        items: result.items,
        page: result.page,
        size: result.size || nextFilters.size || 20,
        totalElements: result.totalElements,
        totalPages: result.totalPages,
        hasLoadedOnce: true,
        error: null,
      });
      return result;
    } catch (err: unknown) {
      if (requestId !== searchRequestSeq) return null;
      if (syncRestrictedError(err)) {
        set({ error: null });
        return null;
      }
      const message =
        err instanceof Error && err.message.trim()
          ? err.message
          : 'Không thể tải danh sách tin đăng. Vui lòng thử lại.';
      set({ error: message });
      return null;
    } finally {
      if (requestId === searchRequestSeq) {
        set({ loading: false, refreshing: false });
      }
    }
  },

  loadMore: async () => {
    const state = get();
    if (state.loading || state.loadingMore || state.refreshing) return;
    if (state.page + 1 >= state.totalPages) return;

    const nextPage = state.page + 1;
    const nextFilters = cleanFilters({
      ...state.filters,
      page: nextPage,
      size: state.size || 20,
    });
    const requestId = searchRequestSeq;
    set({ loadingMore: true, error: null });

    try {
      const result = await discoveryApi.searchListings(nextFilters);
      if (requestId !== searchRequestSeq) return;
      const existingIds = new Set(get().items.map((item) => item.id));
      const appended = result.items.filter((item) => !existingIds.has(item.id));
      set({
        items: [...get().items, ...appended],
        page: result.page,
        size: result.size || nextFilters.size || 20,
        totalElements: result.totalElements,
        totalPages: result.totalPages,
        filters: nextFilters,
        error: null,
      });
    } catch (err: unknown) {
      if (requestId !== searchRequestSeq) return;
      if (syncRestrictedError(err)) return;
      const message =
        err instanceof Error && err.message.trim()
          ? err.message
          : 'Không thể tải thêm tin đăng. Vui lòng thử lại.';
      set({ error: message });
    } finally {
      if (requestId === searchRequestSeq) {
        set({ loadingMore: false });
      }
    }
  },

  setFilter: (partial) => {
    const current = get().filters;
    const merged: DiscoverySearchFilters = {
      ...current,
      ...partial,
      page: 0,
    };
    if ('locationCode' in partial && !partial.locationCode) {
      if (!('lat' in partial)) delete merged.lat;
      if (!('lng' in partial)) delete merged.lng;
      if (!('radiusKm' in partial)) delete merged.radiusKm;
    }
    set({ filters: cleanFilters(merged) });
  },

  resetFilters: async () => {
    const fresh = { ...DEFAULT_DISCOVERY_FILTERS };
    set({ filters: fresh });
    return get().search({ resetPage: true, filters: fresh });
  },

  loadDetail: async (id) => {
    const trimmed = id.trim();
    if (!trimmed) {
      set({ selectedDetail: null, detailLoading: false, detailError: null, detailNotFound: true });
      return null;
    }
    const requestId = ++detailRequestSeq;
    set({
      detailLoading: true,
      detailError: null,
      detailNotFound: false,
    });
    try {
      const detail = await discoveryApi.fetchListingDetail(trimmed);
      if (requestId !== detailRequestSeq) return null;
      set((state) => ({
        selectedDetail: detail,
        detailLoading: false,
        detailError: null,
        detailNotFound: false,
        items: state.items.map((item) => (item.id === detail.id ? { ...item, ...detail } : item)),
      }));
      return detail;
    } catch (err: unknown) {
      if (requestId !== detailRequestSeq) return null;
      if (discoveryApi.isListingNotFoundError(err)) {
        set({
          selectedDetail: null,
          detailLoading: false,
          detailError: null,
          detailNotFound: true,
        });
        return null;
      }
      if (syncRestrictedError(err)) {
        set({ detailLoading: false, detailError: null });
        return null;
      }
      const message =
        err instanceof Error && err.message.trim()
          ? err.message
          : 'Không thể tải chi tiết tin đăng. Vui lòng thử lại.';
      set({
        detailLoading: false,
        detailError: message,
        detailNotFound: false,
      });
      return null;
    }
  },

  clearDetail: () => {
    detailRequestSeq += 1;
    set({
      selectedDetail: null,
      detailLoading: false,
      detailError: null,
      detailNotFound: false,
    });
  },

  reset: () => {
    searchRequestSeq += 1;
    detailRequestSeq += 1;
    set({
      items: [],
      page: 0,
      size: 20,
      totalElements: 0,
      totalPages: 0,
      filters: { ...DEFAULT_DISCOVERY_FILTERS },
      categories: [],
      categoryTree: [],
      locations: [],
      referencesLoaded: false,
      hasLoadedOnce: false,
      loading: false,
      loadingMore: false,
      refreshing: false,
      error: null,
      selectedDetail: null,
      detailLoading: false,
      detailError: null,
      detailNotFound: false,
    });
  },
}));

useSession.subscribe((state, prevState) => {
  const prevToken = prevState.token ?? null;
  const nextToken = state.token ?? null;
  const prevUserId = prevState.user?.id ?? null;
  const nextUserId = state.user?.id ?? null;
  const prevStatus = prevState.user?.accountStatus ?? null;
  const nextStatus = state.user?.accountStatus ?? null;

  if (prevToken === nextToken && prevUserId === nextUserId && prevStatus === nextStatus) {
    return;
  }

  const discovery = useDiscovery.getState();
  if (discovery.selectedDetail?.id) {
    void discovery.loadDetail(discovery.selectedDetail.id);
  }
  if (discovery.hasLoadedOnce) {
    void discovery.search({ resetPage: true });
  }
});

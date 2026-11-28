import { create } from 'zustand';
import { useSession } from '../auth/session';
import { useDiscovery } from '../listings/discoveryStore';
import { isRestrictedError } from '../listings/sellerApi';
import * as reviewApi from './api';
import type {
  CreateReviewPayload,
  OrderReviewState,
  PublicReviewItem,
  ReviewMutationResponse,
  SellerReviewsResponse,
  UpdateReviewPayload,
} from './types';

export interface MyReceivedReviewsPreview {
  sellerId: string;
  averageRating: number | null;
  reviewCount: number;
  items: PublicReviewItem[];
}

interface ReviewsState {
  orderReviewByOrderId: Record<string, OrderReviewState>;
  orderReviewLoading: boolean;
  orderReviewError: string | null;
  submitting: boolean;

  sellerReviews: SellerReviewsResponse | null;
  sellerReviewsSellerId: string | null;
  sellerReviewsRatingFilter: number | null;
  sellerReviewsLoading: boolean;
  sellerReviewsRefreshing: boolean;
  sellerReviewsError: string | null;

  myReceivedReviews: MyReceivedReviewsPreview | null;

  loadOrderReview: (orderId: string) => Promise<OrderReviewState | null>;
  createReview: (
    orderId: string,
    payload: CreateReviewPayload,
  ) => Promise<ReviewMutationResponse>;
  editReview: (
    reviewId: string,
    orderId: string,
    payload: UpdateReviewPayload,
  ) => Promise<ReviewMutationResponse>;
  removeReview: (
    reviewId: string,
    orderId: string,
    expectedVersion?: number,
  ) => Promise<ReviewMutationResponse>;

  loadSellerReviews: (
    sellerId: string,
    opts?: { rating?: number | null; page?: number; size?: number; refresh?: boolean },
  ) => Promise<SellerReviewsResponse | null>;
  loadMyReceivedReviews: (userId: string) => Promise<void>;
  reset: () => void;
}

function markCatalogStale() {
  try {
    useDiscovery.getState().markStale();
  } catch {
    // ignore store sync error
  }
}

function mergeUniqueReviews(
  existing: PublicReviewItem[],
  incoming: PublicReviewItem[],
): PublicReviewItem[] {
  const seen = new Set<string>();
  const merged: PublicReviewItem[] = [];
  for (const item of existing) {
    if (!item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }
  for (const item of incoming) {
    if (!item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }
  return merged;
}

let orderReviewSeq = 0;
let sellerReviewsSeq = 0;
let myReceivedSeq = 0;
let sessionEpoch = 0;

export const useReviews = create<ReviewsState>((set, get) => ({
  orderReviewByOrderId: {},
  orderReviewLoading: false,
  orderReviewError: null,
  submitting: false,

  sellerReviews: null,
  sellerReviewsSellerId: null,
  sellerReviewsRatingFilter: null,
  sellerReviewsLoading: false,
  sellerReviewsRefreshing: false,
  sellerReviewsError: null,

  myReceivedReviews: null,

  loadOrderReview: async (orderId) => {
    const seq = ++orderReviewSeq;
    const epoch = sessionEpoch;
    set({ orderReviewLoading: true, orderReviewError: null });
    try {
      const state = await reviewApi.fetchOrderReviewState(orderId);
      if (seq !== orderReviewSeq || epoch !== sessionEpoch) return null;
      set((prev) => ({
        orderReviewByOrderId: { ...prev.orderReviewByOrderId, [orderId]: state },
        orderReviewLoading: false,
        orderReviewError: null,
      }));
      return state;
    } catch (err) {
      if (seq !== orderReviewSeq || epoch !== sessionEpoch) return null;
      if (isRestrictedError(err)) {
        set({ orderReviewLoading: false, orderReviewError: null });
        return null;
      }
      const parsed = reviewApi.extractReviewApiError(
        err,
        'Không thể tải thông tin đánh giá của giao dịch.',
      );
      set({ orderReviewLoading: false, orderReviewError: parsed.message });
      return null;
    }
  },

  createReview: async (orderId, payload) => {
    const epoch = sessionEpoch;
    set({ submitting: true });
    try {
      const res = await reviewApi.createOrderReview(orderId, payload);
      if (epoch === sessionEpoch) {
        orderReviewSeq += 1;
        set((prev) => ({
          orderReviewByOrderId: {
            ...prev.orderReviewByOrderId,
            [orderId]: res.orderReviewState,
          },
          orderReviewLoading: false,
          orderReviewError: null,
          submitting: false,
        }));
        markCatalogStale();
      }
      return res;
    } catch (err) {
      if (epoch === sessionEpoch) {
        set({ submitting: false });
      }
      throw err;
    }
  },

  editReview: async (reviewId, orderId, payload) => {
    const epoch = sessionEpoch;
    set({ submitting: true });
    try {
      const res = await reviewApi.updateReview(reviewId, payload);
      if (epoch === sessionEpoch) {
        orderReviewSeq += 1;
        set((prev) => ({
          orderReviewByOrderId: {
            ...prev.orderReviewByOrderId,
            [orderId]: res.orderReviewState,
          },
          orderReviewLoading: false,
          orderReviewError: null,
          submitting: false,
        }));
        markCatalogStale();
      }
      return res;
    } catch (err) {
      if (epoch === sessionEpoch) {
        set({ submitting: false });
      }
      throw err;
    }
  },

  removeReview: async (reviewId, orderId, expectedVersion) => {
    const epoch = sessionEpoch;
    set({ submitting: true });
    try {
      const res = await reviewApi.deleteReview(reviewId, expectedVersion);
      if (epoch === sessionEpoch) {
        orderReviewSeq += 1;
        set((prev) => ({
          orderReviewByOrderId: {
            ...prev.orderReviewByOrderId,
            [orderId]: res.orderReviewState,
          },
          orderReviewLoading: false,
          orderReviewError: null,
          submitting: false,
        }));
        markCatalogStale();
      }
      return res;
    } catch (err) {
      if (epoch === sessionEpoch) {
        set({ submitting: false });
      }
      throw err;
    }
  },

  loadSellerReviews: async (sellerId, opts) => {
    const state = get();
    const isSameSeller = state.sellerReviewsSellerId === sellerId;
    const rating =
      opts && 'rating' in opts
        ? (opts.rating ?? null)
        : isSameSeller
          ? state.sellerReviewsRatingFilter
          : null;
    const isFilterChanged = isSameSeller && rating !== state.sellerReviewsRatingFilter;
    const targetPage = opts?.page ?? 0;
    const size = opts?.size ?? 20;
    const isRefresh = Boolean(opts?.refresh);

    const seq = ++sellerReviewsSeq;
    const epoch = sessionEpoch;

    set((prev) => ({
      sellerReviewsSellerId: sellerId,
      sellerReviewsRatingFilter: rating,
      sellerReviewsLoading: !isRefresh,
      sellerReviewsRefreshing: isRefresh,
      sellerReviewsError: null,
      // Xóa item cũ ngay khi đổi người bán hoặc đổi bộ lọc sao để tránh lộ item bộ lọc cũ nếu yêu cầu mới lỗi.
      sellerReviews: !isSameSeller
        ? null
        : isFilterChanged && targetPage === 0 && prev.sellerReviews
          ? {
              ...prev.sellerReviews,
              items: [],
              page: 0,
              totalElements: 0,
              totalPages: 0,
            }
          : prev.sellerReviews,
    }));

    try {
      const res = await reviewApi.fetchSellerReviews(sellerId, {
        rating,
        page: targetPage,
        size,
      });
      if (seq !== sellerReviewsSeq || epoch !== sessionEpoch) return null;
      if (!res) {
        set({
          sellerReviewsLoading: false,
          sellerReviewsRefreshing: false,
          sellerReviewsError: 'Không tìm thấy dữ liệu đánh giá của người bán.',
        });
        return null;
      }
      set((prev) => {
        const mergedItems =
          targetPage > 0 && prev.sellerReviews && prev.sellerReviewsSellerId === sellerId
            ? mergeUniqueReviews(prev.sellerReviews.items, res.items)
            : mergeUniqueReviews([], res.items);
        return {
          sellerReviews: {
            ...res,
            items: mergedItems,
          },
          sellerReviewsLoading: false,
          sellerReviewsRefreshing: false,
          sellerReviewsError: null,
        };
      });
      return res;
    } catch (err) {
      if (seq !== sellerReviewsSeq || epoch !== sessionEpoch) return null;
      if (isRestrictedError(err)) {
        set({ sellerReviewsLoading: false, sellerReviewsRefreshing: false, sellerReviewsError: null });
        return null;
      }
      const parsed = reviewApi.extractReviewApiError(
        err,
        'Không thể tải danh sách đánh giá công khai.',
      );
      set({
        sellerReviewsLoading: false,
        sellerReviewsRefreshing: false,
        sellerReviewsError: parsed.message,
      });
      return null;
    }
  },

  loadMyReceivedReviews: async (userId) => {
    if (!userId) return;
    const seq = ++myReceivedSeq;
    const epoch = sessionEpoch;
    try {
      const res = await reviewApi.fetchSellerReviews(userId, { page: 0, size: 3 });
      if (seq !== myReceivedSeq || epoch !== sessionEpoch || !res) return;
      set({
        myReceivedReviews: {
          sellerId: userId,
          averageRating: res.seller.averageRating,
          reviewCount: res.seller.reviewCount,
          items: res.items.slice(0, 2),
        },
      });
    } catch {
      // Non-blocking secondary feed on ProfileScreen
    }
  },

  reset: () => {
    sessionEpoch += 1;
    orderReviewSeq += 1;
    sellerReviewsSeq += 1;
    myReceivedSeq += 1;
    reviewApi.clearReviewEvidenceCache();
    set({
      orderReviewByOrderId: {},
      orderReviewLoading: false,
      orderReviewError: null,
      submitting: false,
      sellerReviews: null,
      sellerReviewsSellerId: null,
      sellerReviewsRatingFilter: null,
      sellerReviewsLoading: false,
      sellerReviewsRefreshing: false,
      sellerReviewsError: null,
      myReceivedReviews: null,
    });
  },
}));

useSession.subscribe((state, prev) => {
  const tokenCleared = Boolean(prev.token && !state.token);
  const userSwitched = Boolean(
    prev.user?.id && state.user?.id && prev.user.id !== state.user.id,
  );
  if (tokenCleared || userSwitched) {
    useReviews.getState().reset();
  }
});

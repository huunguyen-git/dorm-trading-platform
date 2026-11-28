import { resolveReviewEvidenceUrl } from '../api/client';
import type { StatusTone } from '../components/ui';
import type { SellerPublicSummary } from '../listings/types';

export type ReviewStatus = 'CHO_XET' | 'CHAP_NHAN' | 'BI_BAC' | 'DA_GO' | 'DA_XOA';

export type ReviewLockReason =
  | 'ORDER_NOT_COMPLETED'
  | 'NOT_BUYER'
  | 'REVIEW_WINDOW_EXPIRED'
  | 'NO_REVIEW_BONUS_APPLIED'
  | 'REVIEW_MODERATED'
  | 'REVIEW_COMPLAINT_PENDING'
  | 'REVIEW_COMPLAINT_RESOLVED'
  | string;

export const MAX_REVIEW_EVIDENCE = 5;
export const MAX_REVIEW_COMMENT_LENGTH = 2000;
export const REVIEW_WINDOW_DAYS = 15;

export interface ReviewPartySummary {
  id: string;
  displayName: string;
  reputationScore: number;
}

export interface ReviewEvidenceItem {
  id: string;
  url: string;
  contentType: string;
  sizeBytes: number;
  originalFilename: string | null;
  createdAt: string | null;
}

export interface ReviewVersionItem {
  versionNo: number;
  rating: number;
  comment: string | null;
  status: ReviewStatus;
  scoreDeltaApplied: number;
  evidenceCount: number;
  evidenceIds: string[];
  reversedAt: string | null;
  createdAt: string | null;
}

export interface ReviewDetail {
  id: string;
  orderId: string;
  listingId: string;
  listingTitle: string;
  buyerId: string;
  buyerDisplayName: string;
  sellerId: string;
  sellerDisplayName: string;
  rating: number;
  comment: string | null;
  status: ReviewStatus;
  publiclyVisible: boolean;
  currentVersionNo: number;
  appliedScoreDelta: number;
  moderated: boolean;
  moderatedAt: string | null;
  complaintStatus: string | null;
  queueEnteredAt: string | null;
  publishedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
  version: number;
  evidence: ReviewEvidenceItem[];
  versions: ReviewVersionItem[];
}

export interface OrderReviewSummary {
  canReview: boolean;
  canEdit: boolean;
  canDelete: boolean;
  withinReviewWindow: boolean;
  reviewDeadlineAt: string | null;
  daysRemaining: number;
  noReviewBonusApplied: boolean;
  lockReason: ReviewLockReason | null;
  reviewId: string | null;
  rating: number | null;
  reviewStatus: ReviewStatus | null;
  reviewVersion: number | null;
  hasPendingModerationReview: boolean;
}

export interface OrderReviewState {
  orderId: string;
  listingId: string;
  listingTitle: string;
  orderStatus: string;
  seller: ReviewPartySummary;
  buyer: ReviewPartySummary;
  completedAt: string | null;
  reviewDeadlineAt: string | null;
  daysRemaining: number;
  withinReviewWindow: boolean;
  noReviewBonusApplied: boolean;
  noReviewBonusAppliedAt: string | null;
  canReview: boolean;
  canEdit: boolean;
  canDelete: boolean;
  lockReason: ReviewLockReason | null;
  lockMessage: string | null;
  hasPendingModerationReview: boolean;
  review: ReviewDetail | null;
}

export interface ReviewMutationResponse {
  review: ReviewDetail;
  orderReviewState: OrderReviewState;
  idempotentReplay: boolean;
}

/**
 * Công khai đánh giá người bán (NFR-01): tuyệt đối không có URL/ID bằng chứng và không có PII.
 */
export interface PublicReviewItem {
  id: string;
  orderId: string;
  listingId: string | null;
  listingTitle: string | null;
  buyerDisplayName: string;
  rating: number;
  comment: string | null;
  edited: boolean;
  publishedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export type StarDistribution = Record<'1' | '2' | '3' | '4' | '5', number>;

export interface SellerReviewsResponse {
  seller: SellerPublicSummary;
  starDistribution: StarDistribution;
  items: PublicReviewItem[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface CreateReviewPayload {
  rating: number;
  comment?: string | null;
  evidenceIds?: string[];
  idempotencyKey?: string;
}

export interface UpdateReviewPayload {
  rating: number;
  comment?: string | null;
  evidenceIds?: string[];
  expectedVersion: number;
}

export interface RatingMeta {
  stars: number;
  label: string;
  scoreDelta: number;
  requiresModeration: boolean;
  hint: string;
}

export const REVIEW_RATING_META: Record<number, RatingMeta> = {
  1: {
    stars: 1,
    label: 'Rất tệ',
    scoreDelta: -5,
    requiresModeration: true,
    hint: 'Đánh giá 1 sao ở trạng thái Chờ kiểm duyệt, chưa công khai và chỉ trừ 5 điểm uy tín sau khi được duyệt.',
  },
  2: {
    stars: 2,
    label: 'Không hài lòng',
    scoreDelta: -3,
    requiresModeration: true,
    hint: 'Đánh giá 2 sao ở trạng thái Chờ kiểm duyệt, chưa công khai và chỉ trừ 3 điểm uy tín sau khi được duyệt.',
  },
  3: {
    stars: 3,
    label: 'Bình thường',
    scoreDelta: -1,
    requiresModeration: true,
    hint: 'Đánh giá 3 sao ở trạng thái Chờ kiểm duyệt, chưa công khai và chỉ trừ 1 điểm uy tín sau khi được duyệt.',
  },
  4: {
    stars: 4,
    label: 'Hài lòng',
    scoreDelta: 0,
    requiresModeration: false,
    hint: 'Đánh giá 4 sao được công khai ngay trên hồ sơ người bán (không thay đổi điểm uy tín).',
  },
  5: {
    stars: 5,
    label: 'Rất hài lòng',
    scoreDelta: 2,
    requiresModeration: false,
    hint: 'Đánh giá 5 sao được công khai ngay và cộng +2 điểm uy tín cho người bán.',
  },
};

export const REVIEW_STATUS_META: Record<
  ReviewStatus,
  { label: string; tone: StatusTone; description: string }
> = {
  CHO_XET: {
    label: 'Chờ kiểm duyệt',
    tone: 'warning',
    description: 'Đánh giá 1–3 sao chưa công khai và chưa trừ điểm cho đến khi Kiểm duyệt viên xét duyệt.',
  },
  CHAP_NHAN: {
    label: 'Đã công khai',
    tone: 'success',
    description: 'Đánh giá đã được chấp nhận và hiển thị công khai trên hồ sơ người bán.',
  },
  BI_BAC: {
    label: 'Bị bác',
    tone: 'danger',
    description: 'Kiểm duyệt viên đã bác đánh giá này. Đánh giá không công khai và không trừ điểm.',
  },
  DA_GO: {
    label: 'Đã gỡ',
    tone: 'neutral',
    description: 'Đánh giá đã được gỡ theo kết quả xử lý khiếu nại.',
  },
  DA_XOA: {
    label: 'Đã xóa',
    tone: 'neutral',
    description: 'Người mua đã xóa đánh giá này.',
  },
};

export function isOrderWithinReviewWindow(
  completedAt?: string | null,
  nowMs: number = Date.now(),
): boolean {
  if (!completedAt || typeof completedAt !== 'string') return false;
  const completedMs = new Date(completedAt).getTime();
  if (Number.isNaN(completedMs)) return false;
  const windowMs = REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return nowMs < completedMs + windowMs;
}

export function formatDaysRemainingLabel(
  daysRemaining: number,
  withinReviewWindow: boolean,
): string {
  if (!withinReviewWindow) {
    return 'Đã hết hạn đánh giá 15 ngày';
  }
  const safeDays = Number.isFinite(daysRemaining) ? Math.max(0, Math.floor(daysRemaining)) : 0;
  if (safeDays <= 0) {
    return 'Còn dưới 1 ngày để đánh giá';
  }
  return `Còn ${safeDays} ngày để đánh giá`;
}

export function getReviewLockExplanation(
  lockReason: ReviewLockReason | null | undefined,
  lockMessage?: string | null,
): string {
  const cleanedMessage = typeof lockMessage === 'string' ? lockMessage.trim() : '';
  if (cleanedMessage) return cleanedMessage;

  switch (lockReason) {
    case 'REVIEW_WINDOW_EXPIRED':
      return 'Giao dịch đã quá thời hạn 15 ngày kể từ lúc hoàn tất nên không thể tạo hoặc chỉnh sửa đánh giá.';
    case 'NO_REVIEW_BONUS_APPLIED':
    case 'NO_REVIEW_BONUS_ALREADY_APPLIED':
      return 'Giao dịch đã quá hạn 15 ngày và hệ thống đã cộng +1 điểm uy tín không đánh giá cho người bán.';
    case 'REVIEW_MODERATED':
      return 'Đánh giá đã có quyết định xét duyệt từ Kiểm duyệt viên nên không thể chỉnh sửa hoặc xóa.';
    case 'REVIEW_COMPLAINT_PENDING':
      return 'Đánh giá đang trong quá trình xử lý khiếu nại nên tạm khóa chỉnh sửa và xóa.';
    case 'REVIEW_COMPLAINT_RESOLVED':
      return 'Đánh giá đã có kết quả giải quyết khiếu nại nên không thể chỉnh sửa hoặc xóa.';
    case 'NOT_BUYER':
      return 'Chỉ người mua của giao dịch mới có quyền gửi, chỉnh sửa hoặc xóa đánh giá.';
    case 'ORDER_NOT_COMPLETED':
      return 'Chỉ có thể đánh giá sau khi giao dịch chuyển sang trạng thái Hoàn tất.';
    default:
      return '';
  }
}

export function formatAppliedScoreDelta(delta: number, status: ReviewStatus): string {
  if (status === 'CHO_XET') {
    return 'Chưa trừ điểm · Chờ xét duyệt';
  }
  if (status === 'BI_BAC') {
    return 'Không trừ điểm (bị bác)';
  }
  if (status === 'DA_GO' || status === 'DA_XOA') {
    return 'Tác động điểm đã được hoàn lại';
  }
  if (delta > 0) {
    return `+${delta} điểm uy tín`;
  }
  if (delta < 0) {
    return `${delta} điểm uy tín`;
  }
  return '0 điểm uy tín';
}

export interface ReviewFormValidationInput {
  mode: 'create' | 'edit';
  rating: number | null;
  comment: string;
  evidenceIds: string[];
  original?: {
    rating: number;
    comment: string;
    evidenceIds: string[];
  };
}

export interface ReviewFormValidationResult {
  valid: boolean;
  ratingError?: string;
  commentError?: string;
  generalError?: string;
}

function canonicalIdSignature(ids: string[]): string {
  return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)))
    .sort()
    .join('|');
}

export function hasReviewFormChanges(
  current: { rating: number | null; comment: string; evidenceIds: string[] },
  original?: { rating: number; comment: string; evidenceIds: string[] },
): boolean {
  if (!original) return true;
  if (current.rating !== original.rating) return true;
  if (current.comment.trim() !== original.comment.trim()) return true;
  if (canonicalIdSignature(current.evidenceIds) !== canonicalIdSignature(original.evidenceIds)) {
    return true;
  }
  return false;
}

export function validateReviewFormInput(
  input: ReviewFormValidationInput,
): ReviewFormValidationResult {
  if (
    typeof input.rating !== 'number' ||
    !Number.isInteger(input.rating) ||
    input.rating < 1 ||
    input.rating > 5
  ) {
    return {
      valid: false,
      ratingError: 'Vui lòng chọn số sao từ 1 đến 5.',
    };
  }

  const trimmedComment = input.comment.trim();
  if (trimmedComment.length > MAX_REVIEW_COMMENT_LENGTH) {
    return {
      valid: false,
      commentError: `Nhận xét tối đa ${MAX_REVIEW_COMMENT_LENGTH} ký tự.`,
    };
  }

  const cleanEvidenceIds = input.evidenceIds.map((id) => id.trim()).filter(Boolean);
  if (cleanEvidenceIds.length > MAX_REVIEW_EVIDENCE) {
    return {
      valid: false,
      generalError: `Chỉ được đính kèm tối đa ${MAX_REVIEW_EVIDENCE} ảnh bằng chứng.`,
    };
  }

  if (input.rating <= 3 && trimmedComment.length === 0 && cleanEvidenceIds.length === 0) {
    return {
      valid: false,
      commentError: 'Đánh giá 1–3 sao bắt buộc nhập nhận xét hoặc đính kèm ít nhất 1 bằng chứng.',
    };
  }

  if (input.mode === 'edit' && input.original) {
    if (
      !hasReviewFormChanges(
        { rating: input.rating, comment: trimmedComment, evidenceIds: cleanEvidenceIds },
        input.original,
      )
    ) {
      return {
        valid: false,
        generalError: 'Bạn chưa thay đổi số sao, nhận xét hoặc bằng chứng nào để lưu.',
      };
    }
  }

  return { valid: true };
}

export function generateReviewIdempotencyKey(orderId: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return `mob-rev-${orderId.slice(0, 12)}-${ts}-${rand}`;
}

type RawRecord = Record<string, unknown>;

const VALID_REVIEW_STATUSES = new Set<ReviewStatus>([
  'CHO_XET',
  'CHAP_NHAN',
  'BI_BAC',
  'DA_GO',
  'DA_XOA',
]);

function asRecord(value: unknown): RawRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as RawRecord) : {};
}

function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function asNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 1) return true;
  if (value === 'false' || value === 0) return false;
  return fallback;
}

function normalizeReviewStatus(raw: unknown): ReviewStatus {
  const upper = asString(raw, 'CHAP_NHAN').toUpperCase() as ReviewStatus;
  return VALID_REVIEW_STATUSES.has(upper) ? upper : 'CHAP_NHAN';
}

function normalizePartySummary(raw: unknown): ReviewPartySummary {
  const rec = asRecord(raw);
  return {
    id: asString(rec.id),
    displayName: asString(rec.displayName ?? rec.name, 'Thành viên').trim() || 'Thành viên',
    reputationScore: asNumber(rec.reputationScore, 100),
  };
}

export function normalizeReviewEvidenceItem(raw: unknown): ReviewEvidenceItem {
  const rec = asRecord(raw);
  const id = asString(rec.id);
  const rawUrl = asString(rec.url) || (id ? `/api/v1/reviews/evidence/${id}` : '');
  return {
    id,
    url: resolveReviewEvidenceUrl(rawUrl),
    contentType: asString(rec.contentType, 'image/jpeg'),
    sizeBytes: Math.max(0, asNumber(rec.sizeBytes, 0)),
    originalFilename: asNullableString(rec.originalFilename),
    createdAt: asNullableString(rec.createdAt),
  };
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
}

function normalizeReviewVersionItem(raw: unknown): ReviewVersionItem {
  const rec = asRecord(raw);
  const evidenceIds = asStringArray(rec.evidenceIds);
  return {
    versionNo: Math.max(1, asNumber(rec.versionNo, 1)),
    rating: Math.max(1, Math.min(5, asNumber(rec.rating, 5))),
    comment: asNullableString(rec.comment),
    status: normalizeReviewStatus(rec.status),
    scoreDeltaApplied: asNumber(rec.scoreDeltaApplied, 0),
    evidenceCount: Math.max(0, asNumber(rec.evidenceCount, evidenceIds.length)),
    evidenceIds,
    reversedAt: asNullableString(rec.reversedAt),
    createdAt: asNullableString(rec.createdAt),
  };
}

export function normalizeReviewDetail(raw: unknown): ReviewDetail {
  const rec = asRecord(raw);
  const rawEvidence = Array.isArray(rec.evidence) ? rec.evidence : [];
  const rawVersions = Array.isArray(rec.versions) ? rec.versions : [];
  return {
    id: asString(rec.id),
    orderId: asString(rec.orderId),
    listingId: asString(rec.listingId),
    listingTitle: asString(rec.listingTitle),
    buyerId: asString(rec.buyerId),
    buyerDisplayName: asString(rec.buyerDisplayName, 'Người mua').trim() || 'Người mua',
    sellerId: asString(rec.sellerId),
    sellerDisplayName: asString(rec.sellerDisplayName, 'Người bán').trim() || 'Người bán',
    rating: Math.max(1, Math.min(5, asNumber(rec.rating, 5))),
    comment: asNullableString(rec.comment),
    status: normalizeReviewStatus(rec.status),
    publiclyVisible: asBoolean(rec.publiclyVisible, false),
    currentVersionNo: Math.max(1, asNumber(rec.currentVersionNo, 1)),
    appliedScoreDelta: asNumber(rec.appliedScoreDelta, 0),
    moderated: asBoolean(rec.moderated, false),
    moderatedAt: asNullableString(rec.moderatedAt),
    complaintStatus: asNullableString(rec.complaintStatus),
    queueEnteredAt: asNullableString(rec.queueEnteredAt),
    publishedAt: asNullableString(rec.publishedAt),
    createdAt: asNullableString(rec.createdAt),
    updatedAt: asNullableString(rec.updatedAt),
    deletedAt: asNullableString(rec.deletedAt),
    version: Math.max(0, asNumber(rec.version, 0)),
    evidence: rawEvidence.map(normalizeReviewEvidenceItem).filter((ev) => Boolean(ev.id)),
    versions: rawVersions.map(normalizeReviewVersionItem),
  };
}

export function normalizeOrderReviewState(raw: unknown): OrderReviewState {
  const rec = asRecord(raw);
  const rawReview = rec.review && typeof rec.review === 'object' ? normalizeReviewDetail(rec.review) : null;
  return {
    orderId: asString(rec.orderId),
    listingId: asString(rec.listingId),
    listingTitle: asString(rec.listingTitle),
    orderStatus: asString(rec.orderStatus, 'HOAN_TAT'),
    seller: normalizePartySummary(rec.seller),
    buyer: normalizePartySummary(rec.buyer),
    completedAt: asNullableString(rec.completedAt),
    reviewDeadlineAt: asNullableString(rec.reviewDeadlineAt),
    daysRemaining: Math.max(0, asNumber(rec.daysRemaining, 0)),
    withinReviewWindow: asBoolean(rec.withinReviewWindow, false),
    noReviewBonusApplied: asBoolean(rec.noReviewBonusApplied, false),
    noReviewBonusAppliedAt: asNullableString(rec.noReviewBonusAppliedAt),
    canReview: asBoolean(rec.canReview, false),
    canEdit: asBoolean(rec.canEdit, false),
    canDelete: asBoolean(rec.canDelete, false),
    lockReason: asNullableString(rec.lockReason),
    lockMessage: asNullableString(rec.lockMessage),
    hasPendingModerationReview: asBoolean(rec.hasPendingModerationReview, false),
    review: rawReview && rawReview.id ? rawReview : null,
  };
}

export function normalizeReviewMutationResponse(raw: unknown): ReviewMutationResponse {
  const rec = asRecord(raw);
  return {
    review: normalizeReviewDetail(rec.review),
    orderReviewState: normalizeOrderReviewState(rec.orderReviewState),
    idempotentReplay: asBoolean(rec.idempotentReplay, false),
  };
}

export function normalizePublicReviewItem(raw: unknown): PublicReviewItem {
  const rec = asRecord(raw);
  return {
    id: asString(rec.id),
    orderId: asString(rec.orderId),
    listingId: asNullableString(rec.listingId),
    listingTitle: asNullableString(rec.listingTitle),
    buyerDisplayName: asString(rec.buyerDisplayName, 'Thành viên').trim() || 'Thành viên',
    rating: Math.max(1, Math.min(5, asNumber(rec.rating, 5))),
    comment: asNullableString(rec.comment),
    edited: asBoolean(rec.edited, false),
    publishedAt: asNullableString(rec.publishedAt),
    createdAt: asNullableString(rec.createdAt),
    updatedAt: asNullableString(rec.updatedAt),
  };
}

export function normalizeSellerReviewsResponse(raw: unknown): SellerReviewsResponse | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const rec = raw as RawRecord;
  if (!rec.seller && !Array.isArray(rec.items)) {
    return null;
  }
  const rawSeller = asRecord(rec.seller);
  const rawDist = asRecord(rec.starDistribution);
  const items = Array.isArray(rec.items)
    ? rec.items.map(normalizePublicReviewItem).filter((item) => Boolean(item.id))
    : [];
  const page = Math.max(0, asNumber(rec.page, 0));
  const size = Math.max(1, asNumber(rec.size, items.length || 20));
  const totalElements = Math.max(0, asNumber(rec.totalElements, items.length));
  const totalPages = Math.max(
    0,
    asNumber(rec.totalPages, totalElements > 0 ? Math.ceil(totalElements / size) : 0),
  );

  return {
    seller: {
      id: asString(rawSeller.id),
      displayName: asString(rawSeller.displayName ?? rawSeller.name, 'Thành viên').trim() || 'Thành viên',
      reputationScore: asNumber(rawSeller.reputationScore, 100),
      averageRating: asNullableNumber(rawSeller.averageRating),
      reviewCount: Math.max(0, asNumber(rawSeller.reviewCount, totalElements)),
    },
    starDistribution: {
      '1': Math.max(0, asNumber(rawDist['1'], 0)),
      '2': Math.max(0, asNumber(rawDist['2'], 0)),
      '3': Math.max(0, asNumber(rawDist['3'], 0)),
      '4': Math.max(0, asNumber(rawDist['4'], 0)),
      '5': Math.max(0, asNumber(rawDist['5'], 0)),
    },
    items,
    page,
    size,
    totalElements,
    totalPages,
  };
}

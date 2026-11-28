export type ReviewStatus = 'CHO_XET' | 'CHAP_NHAN' | 'BI_BAC' | 'DA_GO' | 'DA_XOA';
export type ComplaintStatus = 'CHO_XU_LY' | 'DA_XU_LY' | 'DA_RUT';
export type ComplaintConclusion = 'CHAP_NHAN_KHIEU_NAI' | 'BAC_KHIEU_NAI' | null;

export interface ComplaintReason {
  code: string;
  label: string;
  description: string;
}

export interface UploadedReviewEvidence {
  id: string;
  localUri: string;
  originalFilename: string | null;
  contentType: string;
  sizeBytes: number;
}

export interface ReviewChatMessageOption {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  offeredPrice: number | null;
  sentAt: string;
}

export interface ReviewChatConversationOption {
  conversationId: string;
  listingId: string | null;
  listingTitle: string | null;
  counterpartyId: string;
  counterpartyName: string;
  messages: ReviewChatMessageOption[];
}

export interface ComplaintSummary {
  id: string;
  reviewId: string;
  reviewVersion: number;
  reasonCode: string | null;
  reasonLabel: string;
  description: string;
  status: ComplaintStatus;
  conclusion: ComplaintConclusion;
  moderationRationale: string | null;
  imageEvidenceCount: number;
  hasChatLog: boolean;
  supplementalStatus: 'CHO_BO_SUNG' | 'DA_BO_SUNG' | null;
  createdAt: string;
  resolvedAt: string | null;
  withdrawnAt: string | null;
  idempotentReplay: boolean;
}

export interface SupplementalRequestItem {
  id: string;
  caseType: string;
  caseId: string;
  recipientId: string;
  recipientRole: string;
  requestNote: string;
  responseNote: string | null;
  status: 'CHO_PHAN_HOI' | 'DA_PHAN_HOI';
  createdAt: string;
  respondedAt: string | null;
}

export interface SellerReceivedReview {
  reviewId: string;
  transactionId: string;
  listingId: string;
  listingTitle: string;
  buyerId: string;
  buyerName: string;
  stars: number;
  comment: string | null;
  status: ReviewStatus;
  version: number;
  editLocked: boolean;
  appliedScoreDelta: number | null;
  createdAt: string;
  publishedAt: string;
  complaintDeadline: string;
  daysRemainingToComplain: number;
  canComplain: boolean;
  complaint: ComplaintSummary | null;
  pendingSupplementalRequests: SupplementalRequestItem[];
}

export interface CreateComplaintPayload {
  reviewId: string;
  expectedReviewVersion?: number;
  reasonCode: string;
  description: string;
  evidenceIds: string[];
  chatConversationId?: string | null;
  chatMessageIds?: string[];
  attachChatLog?: boolean;
  clientRequestId: string;
}

export interface ReviewComplaintRouteParams {
  reviewId: string;
  reviewVersion?: number;
  listingTitle: string;
  buyerName: string;
  stars: number;
  comment?: string | null;
  daysRemaining: number;
}

export const MAX_COMPLAINT_DESCRIPTION_LENGTH = 2000;
export const MAX_COMPLAINT_IMAGES = 5;
export const MAX_COMPLAINT_CHAT_MESSAGES = 30;

export function generateComplaintRequestId(): string {
  return `cmp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function formatComplaintStatusLabel(
  status: ComplaintStatus,
  conclusion?: ComplaintConclusion,
): string {
  if (status === 'DA_RUT') return 'Đã rút khiếu nại';
  if (status === 'DA_XU_LY') {
    if (conclusion === 'CHAP_NHAN_KHIEU_NAI') return 'Đã xử lý · Chấp nhận khiếu nại';
    if (conclusion === 'BAC_KHIEU_NAI') return 'Đã xử lý · Bác khiếu nại';
    return 'Đã xử lý';
  }
  return 'Chờ xử lý';
}

export function formatReviewStatusLabel(status: ReviewStatus): string {
  switch (status) {
    case 'CHO_XET':
      return 'Chờ kiểm duyệt';
    case 'CHAP_NHAN':
      return 'Đang công khai';
    case 'BI_BAC':
      return 'Bị bác';
    case 'DA_GO':
      return 'Đã gỡ sau khiếu nại';
    case 'DA_XOA':
      return 'Đã xóa';
  }
}

export type ModerationCaseType = 'COMPLAINT' | 'LOW_STAR_REVIEW';

export interface Page<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
}

export interface ModerationQueueItem {
  caseType: ModerationCaseType;
  caseId: string;
  reviewId: string;
  transactionId: string;
  listingTitle: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
  stars: number;
  reviewStatus: string;
  complaintStatus: string | null;
  reasonLabel: string;
  supplementalStatus: string | null;
  submittedAt: string;
  resolvedAt: string | null;
  conclusion: string | null;
  priorReviewerWarning: boolean;
}

export interface AdminEvidenceItem {
  id: string;
  source: 'KHIEU_NAI_NGUOI_BAN' | 'DANH_GIA_NGUOI_MUA' | 'BO_SUNG';
  type: 'HINH_ANH' | 'NHAT_KY_CHAT';
  originalFilename: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  conversationId: string | null;
  createdAt: string;
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

export interface ModerationDecisionHistory {
  id: string;
  moderatorId: string;
  moderatorName: string;
  conclusion: string;
  rationale: string;
  scoreDelta: number | null;
  decidedAt: string;
}

export interface ModerationCaseDetail {
  caseType: ModerationCaseType;
  caseId: string;
  reviewId: string;
  reviewVersion: number;
  reviewStatus: string;
  stars: number;
  reviewComment: string | null;
  reviewSnapshotJson: string | null;
  appliedScoreDelta: number | null;
  reviewCreatedAt: string;
  reviewPublishedAt: string;
  transactionId: string;
  listingId: string;
  listingTitle: string;
  agreedPriceVnd: number;
  handoverProofRef: string | null;
  transactionCompletedAt: string | null;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
  sellerReputationScore: number;
  sellerAccountStatus: string;
  complaintStatus: string | null;
  complaintReasonCode: string | null;
  complaintReasonLabel: string | null;
  complaintDescription: string | null;
  complaintCreatedAt: string | null;
  complaintConclusion: string | null;
  complaintRationale: string | null;
  complaintVersion: number | null;
  supplementalStatus: string | null;
  canCurrentModeratorDecide: boolean;
  cannotDecideReason: string | null;
  singleModeratorOverride: boolean;
  evidences: AdminEvidenceItem[];
  supplementalRequests: SupplementalRequestItem[];
  decisions: ModerationDecisionHistory[];
}

export interface ModerationDecisionResponse {
  caseType: ModerationCaseType;
  caseId: string;
  reviewId: string;
  action: string;
  newReviewStatus: string;
  newComplaintStatus: string | null;
  scoreDelta: number | null;
  sellerScoreAfter: number | null;
  restrictionChange: string | null;
  singleModeratorOverride: boolean;
  decidedAt: string;
}

export interface ChatLogSnapshot {
  conversationId: string;
  listingId: string | null;
  capturedAt: string;
  messageCount: number;
  messages: Array<{
    id: string;
    senderId: string;
    senderName: string;
    content: string;
    offeredPrice: number | null;
    sentAt: string;
  }>;
}

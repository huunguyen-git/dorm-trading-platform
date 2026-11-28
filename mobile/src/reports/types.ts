export type ReportTargetType = 'NGUOI_DUNG' | 'TIN_DANG';

export type ReportStatus = 'CHO_XU_LY' | 'DANG_XU_LY' | 'DA_XU_LY';

export interface ReportCategory {
  code: string;
  targetType: ReportTargetType;
  name: string;
  description: string;
  displayOrder: number;
}

export interface UploadedReportEvidence {
  id: string;
  localUri: string;
  originalFilename: string | null;
  contentType: string;
  sizeBytes: number;
}

export interface ChatEvidenceMessage {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  offeredPrice: number | null;
  sentAt: string;
}

export interface ChatEvidenceConversation {
  conversationId: string;
  listingId: string | null;
  listingTitle: string | null;
  counterpartyId: string;
  counterpartyName: string;
  messages: ChatEvidenceMessage[];
}

export interface CreateReportPayload {
  targetType: ReportTargetType;
  targetId: string;
  categoryCode: string;
  description: string;
  evidenceIds: string[];
  chatConversationId?: string | null;
  chatMessageIds?: string[];
  attachChatLog?: boolean;
  clientRequestId: string;
}

export interface ReportSubmissionResult {
  id: string;
  groupId: string;
  groupReportCount: number;
  targetType: ReportTargetType;
  targetId: string;
  targetSummary: string;
  categoryCode: string;
  categoryName: string;
  description: string;
  status: ReportStatus;
  imageEvidenceCount: number;
  hasChatLog: boolean;
  createdAt: string;
  idempotentReplay: boolean;
}

export interface ReportRouteParams {
  targetType: ReportTargetType;
  targetId: string;
  targetTitle?: string;
  sellerName?: string;
  listingId?: string;
  listingTitle?: string;
  conversationId?: string;
}

export const MAX_REPORT_DESCRIPTION_LENGTH = 2000;
export const MAX_REPORT_IMAGES = 5;
export const MAX_REPORT_CHAT_MESSAGES = 30;

export function generateClientRequestId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `rpt-${Date.now()}-${rand}`;
}

export function formatReportStatusLabel(status: string): string {
  switch (status) {
    case 'DANG_XU_LY':
      return 'Đang xử lý';
    case 'DA_XU_LY':
      return 'Đã xử lý';
    default:
      return 'Chờ xử lý';
  }
}

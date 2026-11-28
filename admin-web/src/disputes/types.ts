export type DisputeEscalationReason = 'OVERDUE_24H' | 'CANCEL_DISPUTE';
export type DisputeReasonFilter = 'ALL' | DisputeEscalationReason;

export type DisputeQueueState = 'READY' | 'WAITING_EVIDENCE' | 'RESOLVED';
export type DisputeQueueStateFilter = 'ALL' | DisputeQueueState;

export type DisputeConclusion = 'HOAN_TAT' | 'HUY';
export type EvidenceTargetParty = 'BUYER' | 'SELLER' | 'BOTH';
export type PartyRole = 'BUYER' | 'SELLER';
export type TimelineActorRole = 'SELLER' | 'BUYER' | 'SYSTEM' | 'MODERATOR';
export type EvidenceRequestStatus = 'CHO_BO_SUNG' | 'DA_PHAN_HOI' | 'QUA_HAN' | 'DA_DONG';

export interface DisputeListingSummary {
  id: string;
  title: string;
  listedPriceVnd: number | null;
  isCombo: boolean;
  isFree: boolean;
  status: string;
  thumbnailUrl: string | null;
}

export interface DisputePartySummary {
  id: string;
  displayName: string;
  reputationScore: number;
}

export interface DisputeDecisionSummary {
  conclusion: DisputeConclusion;
  decidedByName: string;
  decidedAt: string;
}

export interface DisputeSummary {
  orderId: string;
  version: number;
  status: string;
  escalationReason: DisputeEscalationReason | null;
  escalatedAt: string | null;
  responseDeadlineAt: string | null;
  overdueSla: boolean;
  queueState: DisputeQueueState;
  listing: DisputeListingSummary;
  agreedPriceVnd: number | null;
  buyer: DisputePartySummary;
  seller: DisputePartySummary;
  reportedDeliveredAt: string | null;
  hasActiveEvidenceRequest: boolean;
  decisionSummary: DisputeDecisionSummary | null;
}

export interface DisputeQueueCounts {
  all: number;
  ready: number;
  waitingEvidence: number;
  resolved: number;
  overdue24h: number;
  cancelDispute: number;
}

export interface DisputePage {
  items: DisputeSummary[];
  counts: DisputeQueueCounts;
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface DisputeItem {
  id: string;
  name: string;
  condition: string | null;
  status: string;
  heldByThisOrder: boolean;
}

export interface DisputeHandoverPhoto {
  id: string;
  url: string;
  contentType: string | null;
  sizeBytes: number | null;
  uploadedAt: string | null;
}

export interface DisputeScheduleProposal {
  id: string;
  proposedByName: string;
  proposedTime: string | null;
  proposedLocation: string | null;
  note: string | null;
  status: string;
  respondedAt: string | null;
  rejectReason: string | null;
  createdAt: string;
}

export interface DisputeCancelRequest {
  id: string;
  requesterId: string;
  requesterRole: PartyRole;
  requesterName: string;
  reasonCode: string | null;
  reasonNote: string | null;
  status: string;
  responderName: string | null;
  responseNote: string | null;
  respondedAt: string | null;
  createdAt: string;
}

export interface DisputeEvidenceAttachment {
  id: string;
  url: string;
  originalFilename: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  uploadedAt: string | null;
}

export interface DisputeEvidenceResponse {
  id: string;
  senderId: string;
  senderRole: PartyRole;
  senderName: string;
  note: string;
  createdAt: string;
  attachments: DisputeEvidenceAttachment[];
}

export interface DisputeEvidenceRequest {
  id: string;
  targetParty: EvidenceTargetParty;
  instruction: string;
  dueAt: string;
  status: EvidenceRequestStatus;
  requestedByName: string;
  createdAt: string;
  respondedAt: string | null;
  responses: DisputeEvidenceResponse[];
}

export interface DisputeChatMessage {
  id: string;
  senderId: string;
  senderRole: PartyRole;
  senderName: string;
  content: string;
  proposedPriceVnd: number | null;
  sentAt: string;
}

export interface DisputeTimelineEntry {
  id: string;
  action: string;
  fromStatus: string | null;
  toStatus: string;
  actorRole: TimelineActorRole;
  note: string | null;
  createdAt: string;
}

export interface DisputeDecision {
  id: string;
  conclusion: DisputeConclusion;
  basis: string;
  decidedById: string;
  decidedByName: string;
  decidedAt: string;
  listingStatusAfter: string | null;
  listingHiddenReason: string | null;
}

export interface DisputeDetail extends DisputeSummary {
  items: DisputeItem[];
  meetingTime: string | null;
  meetingLocation: string | null;
  deliveryStartedAt: string | null;
  deliveryNote: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  reviewDeadlineAt: string | null;
  handoverPhotos: DisputeHandoverPhoto[];
  scheduleProposals: DisputeScheduleProposal[];
  cancelRequests: DisputeCancelRequest[];
  evidenceRequests: DisputeEvidenceRequest[];
  chatMessages: DisputeChatMessage[];
  timeline: DisputeTimelineEntry[];
  decision: DisputeDecision | null;
  decidable: boolean;
}

export interface DisputeQueueQuery {
  reason?: DisputeReasonFilter;
  queueState?: DisputeQueueStateFilter;
  q?: string;
  page?: number;
  size?: number;
}

export interface DisputeDecisionPayload {
  basis: string;
  expectedVersion: number;
}

export interface RequestEvidencePayload {
  targetParty: EvidenceTargetParty;
  instruction: string;
  dueInHours: number;
  expectedVersion: number;
}

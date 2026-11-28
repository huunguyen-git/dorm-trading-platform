import { api, attachment } from '../api/client';
import type {
  ChatLogSnapshot,
  ModerationCaseDetail,
  ModerationCaseType,
  ModerationDecisionResponse,
  ModerationQueueItem,
  Page,
} from './types';

const ROOT = '/admin/review-moderation';

export function fetchModerationQueue(
  type: 'ALL' | ModerationCaseType,
  status: 'PENDING' | 'PROCESSED',
  page = 0,
  size = 20,
  signal?: AbortSignal,
): Promise<Page<ModerationQueueItem>> {
  const qs = new URLSearchParams({
    type,
    status,
    page: String(page),
    size: String(size),
  });
  return api<Page<ModerationQueueItem>>(`${ROOT}/queue?${qs}`, { signal });
}

export function fetchCaseDetail(
  caseType: ModerationCaseType,
  caseId: string,
  signal?: AbortSignal,
): Promise<ModerationCaseDetail> {
  return api<ModerationCaseDetail>(
    `${ROOT}/cases/${encodeURIComponent(caseType)}/${encodeURIComponent(caseId)}`,
    { signal },
  );
}

export function decideLowStarReview(
  reviewId: string,
  payload: {
    action: 'APPROVE' | 'REJECT' | 'REQUEST_MORE_INFO';
    rationale: string;
    targetParty?: 'BUYER' | 'SELLER';
    expectedVersion?: number;
  },
): Promise<ModerationDecisionResponse> {
  return api<ModerationDecisionResponse>(`${ROOT}/reviews/${encodeURIComponent(reviewId)}/decide`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function decideComplaint(
  complaintId: string,
  payload: {
    action: 'UPHOLD' | 'DISMISS' | 'REQUEST_MORE_INFO';
    rationale: string;
    targetParty?: 'BUYER' | 'SELLER';
    expectedVersion?: number;
  },
): Promise<ModerationDecisionResponse> {
  return api<ModerationDecisionResponse>(
    `${ROOT}/complaints/${encodeURIComponent(complaintId)}/decide`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export function fetchImageEvidenceBlob(evidenceId: string): Promise<Blob | null> {
  return attachment(`${ROOT}/evidence/${encodeURIComponent(evidenceId)}`);
}

export function fetchChatEvidenceJson(evidenceId: string): Promise<ChatLogSnapshot> {
  return api<ChatLogSnapshot>(`${ROOT}/evidence/${encodeURIComponent(evidenceId)}`);
}

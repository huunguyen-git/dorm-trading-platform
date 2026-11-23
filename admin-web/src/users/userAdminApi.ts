import { api } from '../api/client';

export type StudentStatus = 'DANG_HOC' | 'DA_TOT_NGHIEP';
export type AccountStatus = 'CHO_KICH_HOAT' | 'HOAT_DONG' | 'BI_KHOA' | 'VO_HIEU_HOA';
export type RestrictionType = 'KHOA_TAM_THOI' | 'KHOA_VINH_VIEN';
export type LockRequestType = 'TEMPORARY' | 'PERMANENT';
export type TransactionRole = 'BUYER' | 'SELLER';

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface AdminUserSearchParams {
  q?: string;
  accountStatus?: AccountStatus | '';
  studentStatus?: StudentStatus | '';
  emailVerified?: boolean | '';
  profileApproved?: boolean | '';
  role?: string;
  minReputation?: number | '';
  maxReputation?: number | '';
  page?: number;
  size?: number;
}

export interface AdminUserSummary {
  id: string;
  fullName: string;
  email: string;
  studentId: string;
  phone: string | null;
  studentStatus: StudentStatus;
  accountStatus: AccountStatus;
  restrictionType: RestrictionType | null;
  lockedUntil: string | null;
  emailVerified: boolean;
  profileApproved: boolean;
  reputationScore: number;
  systemRoles: string[];
  createdAt: string;
}

export interface AdminUserDetail {
  id: string;
  fullName: string;
  email: string;
  studentId: string;
  phone: string | null;
  university: string | null;
  campus: string | null;
  major: string | null;
  cohort: string | null;
  studentStatus: StudentStatus;
  hasStudentCardFront: boolean;
  hasStudentCardBack: boolean;
  studentCardFront: string | null;
  studentCardBack: string | null;
  emailVerified: boolean;
  profileApproved: boolean;
  reputationScore: number;
  accountStatus: AccountStatus;
  restrictionType: RestrictionType | null;
  restrictionReason: string | null;
  lockedUntil: string | null;
  appealable: boolean;
  systemRoles: string[];
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface UpdateAdminUserIdentityPayload {
  fullName: string;
  studentId: string;
  phone: string | null;
  university: string | null;
  campus: string | null;
  major: string | null;
  cohort: string | null;
  studentStatus: StudentStatus;
  studentCardFront?: string | null;
  studentCardBack?: string | null;
  reason?: string | null;
  expectedVersion?: number;
}

export interface UserTransactionHistoryItem {
  transactionId: string;
  listingId: string;
  listingTitle: string;
  transactionRole: TransactionRole;
  counterpartyId: string;
  counterpartyName: string;
  counterpartyStudentId: string;
  agreedPrice: number;
  status: string;
  scheduledAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export type UserTransactionsPage = PaginatedResponse<UserTransactionHistoryItem>;

export interface ReputationHistoryItem {
  id: string;
  changeType: string;
  delta: number;
  scoreBefore: number;
  scoreAfter: number;
  reason: string;
  referenceSource: string;
  referenceId: string | null;
  actorId: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface ReputationHistoryPage extends PaginatedResponse<ReputationHistoryItem> {
  currentScore: number;
}

export interface ModerationLogItem {
  id: string;
  actionType: string;
  reason: string;
  previousStatus: string | null;
  newStatus: string | null;
  lockType: string | null;
  lockedUntil: string | null;
  appealable: boolean;
  actorId: string | null;
  actorName: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export type ModerationLogsPage = PaginatedResponse<ModerationLogItem>;

export interface LockUserPayload {
  lockType: LockRequestType;
  durationDays?: number;
  reason: string;
  appealable?: boolean;
  penaltyCode?: string;
  expectedVersion?: number;
}

export interface UnlockUserPayload {
  reason: string;
  expectedVersion?: number;
}

export function buildAdminUsersQuery(params: AdminUserSearchParams = {}): string {
  const search = new URLSearchParams();
  const trimmedQ = params.q?.trim();
  if (trimmedQ) search.set('q', trimmedQ);
  if (params.accountStatus) search.set('accountStatus', params.accountStatus);
  if (params.studentStatus) search.set('studentStatus', params.studentStatus);
  if (typeof params.emailVerified === 'boolean') search.set('emailVerified', String(params.emailVerified));
  if (typeof params.profileApproved === 'boolean') search.set('profileApproved', String(params.profileApproved));
  const trimmedRole = params.role?.trim();
  if (trimmedRole) search.set('role', trimmedRole);
  if (typeof params.minReputation === 'number' && !Number.isNaN(params.minReputation)) {
    search.set('minReputation', String(params.minReputation));
  }
  if (typeof params.maxReputation === 'number' && !Number.isNaN(params.maxReputation)) {
    search.set('maxReputation', String(params.maxReputation));
  }
  search.set('page', String(params.page ?? 0));
  search.set('size', String(params.size ?? 20));
  return search.toString();
}

function buildPageQuery(page = 0, size = 20): string {
  const search = new URLSearchParams();
  search.set('page', String(page));
  search.set('size', String(size));
  return search.toString();
}

export function listAdminUsers(params: AdminUserSearchParams = {}) {
  return api<PaginatedResponse<AdminUserSummary>>(`/admin/users?${buildAdminUsersQuery(params)}`);
}

export function getAdminUserDetail(userId: string) {
  return api<AdminUserDetail>(`/admin/users/${encodeURIComponent(userId)}`);
}

export function updateAdminUserIdentity(userId: string, payload: UpdateAdminUserIdentityPayload) {
  const body: UpdateAdminUserIdentityPayload = {
    fullName: payload.fullName,
    studentId: payload.studentId,
    phone: payload.phone,
    university: payload.university,
    campus: payload.campus,
    major: payload.major,
    cohort: payload.cohort,
    studentStatus: payload.studentStatus,
    ...(payload.studentCardFront !== undefined ? { studentCardFront: payload.studentCardFront } : {}),
    ...(payload.studentCardBack !== undefined ? { studentCardBack: payload.studentCardBack } : {}),
    ...(payload.reason !== undefined ? { reason: payload.reason } : {}),
    ...(typeof payload.expectedVersion === 'number' ? { expectedVersion: payload.expectedVersion } : {}),
  };
  return api<AdminUserDetail>(`/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function getAdminUserTransactions(userId: string, page = 0, size = 20) {
  return api<UserTransactionsPage>(`/admin/users/${encodeURIComponent(userId)}/transactions?${buildPageQuery(page, size)}`);
}

export function getAdminUserReputationHistory(userId: string, page = 0, size = 20) {
  return api<ReputationHistoryPage>(`/admin/users/${encodeURIComponent(userId)}/reputation-history?${buildPageQuery(page, size)}`);
}

export function getAdminUserModerationLogs(userId: string, page = 0, size = 20) {
  return api<ModerationLogsPage>(`/admin/users/${encodeURIComponent(userId)}/moderation-logs?${buildPageQuery(page, size)}`);
}

export function lockAdminUser(userId: string, payload: LockUserPayload) {
  const body: LockUserPayload = {
    lockType: payload.lockType,
    ...(typeof payload.durationDays === 'number' ? { durationDays: payload.durationDays } : {}),
    reason: payload.reason,
    ...(typeof payload.appealable === 'boolean' ? { appealable: payload.appealable } : {}),
    ...(payload.penaltyCode ? { penaltyCode: payload.penaltyCode } : {}),
    ...(typeof payload.expectedVersion === 'number' ? { expectedVersion: payload.expectedVersion } : {}),
  };
  return api<AdminUserDetail>(`/admin/users/${encodeURIComponent(userId)}/lock`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function unlockAdminUser(userId: string, payload: UnlockUserPayload) {
  const body: UnlockUserPayload = {
    reason: payload.reason,
    ...(typeof payload.expectedVersion === 'number' ? { expectedVersion: payload.expectedVersion } : {}),
  };
  return api<AdminUserDetail>(`/admin/users/${encodeURIComponent(userId)}/unlock`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export const userAdminApi = {
  listUsers: listAdminUsers,
  getUserDetail: getAdminUserDetail,
  updateIdentity: updateAdminUserIdentity,
  getTransactions: getAdminUserTransactions,
  getReputationHistory: getAdminUserReputationHistory,
  getModerationLogs: getAdminUserModerationLogs,
  lockUser: lockAdminUser,
  unlockUser: unlockAdminUser,
};

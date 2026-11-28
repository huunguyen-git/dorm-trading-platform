export const seniorApi = '/admin/senior';
export const reportsApi = '/admin/reports';
export const statisticsApi = '/admin/senior/statistics';
export const pageSize = 20;
export type Page<T> = { items: T[]; page: number; size: number; total: number };
export type Moderator = {
  assignmentId: string; userId: string; name: string; studentId: string;
  email: string; accountStatus: string; appointedAt: string;
};
export type Candidate = {
  userId: string; name: string; studentId: string; email: string;
  accountStatus: string; isModerator: boolean; emailVerified: boolean; profileApproved: boolean;
};
export type Penalty = {
  id: string; name: string; points: number; description: string;
  status: 'DANG_DUNG' | 'NGUNG_SU_DUNG'; version: number;
};
export type Audit = {
  id: string; actorId: string; actorName: string; action: string;
  resourceType: 'MODERATOR' | 'PENALTY'; resourceId: string;
  before: Record<string, unknown> | null; after: Record<string, unknown> | null;
  happenedAt: string;
};

export type DecisionSummary = {
  decisionId: string;
  conclusion: 'VI_PHAM' | 'KHONG_VI_PHAM' | 'KHONG_HOP_LE' | 'TRUNG';
  penaltyId: string | null;
  penaltyName: string | null;
  penaltyPoints: number | null;
  basis: string;
  originalDecisionId: string | null;
  moderatorId: string;
  moderatorName: string;
  decidedAt: string;
};

export type ReportGroup = {
  targetType: 'NGUOI_DUNG' | 'TIN_DANG';
  targetId: string;
  targetLabel: string;
  targetStatus: string;
  category: string;
  reportCount: number;
  latestReportAt: string;
  status: 'CHO_XU_LY' | 'DA_XU_LY';
  decisionId: string | null;
  decision: DecisionSummary | null;
};

export type ReportItem = {
  reportId: string;
  reporterId: string;
  reporterName: string;
  reporterStudentId: string;
  description: string;
  evidence: string[];
  createdAt: string;
  status: string;
};

export type ReportGroupDetail = {
  targetType: 'NGUOI_DUNG' | 'TIN_DANG';
  targetId: string;
  targetLabel: string;
  targetStatus: string;
  category: string;
  status: 'CHO_XU_LY' | 'DA_XU_LY';
  reports: ReportItem[];
  decision: DecisionSummary | null;
};

export type ActivePenalty = { id: string; name: string; points: number; description: string };

export type DuplicateCandidate = {
  decisionId: string;
  targetType: 'NGUOI_DUNG' | 'TIN_DANG';
  targetId: string;
  targetLabel: string;
  category: string;
  conclusion: string;
  decidedAt: string;
};

export type ResolveResult = {
  decisionId: string;
  conclusion: string;
  updatedReportCount: number;
  penaltyApplied: boolean;
  scoreAfter: number | null;
  accountStatusAfter: string | null;
  listingHidden: boolean;
};

export type SemesterOption = { code: string; label: string; from: string; to: string };

export type TopSubjectStat = {
  subjectCode: string;
  subjectName: string;
  exchangedCount: number;
  activeListingCount: number;
  searchCount: number;
};

export type TopSubjectsResponse = {
  period: SemesterOption;
  items: TopSubjectStat[];
  searchTrackingActive: boolean;
};

export type LowReputationUser = {
  userId: string;
  fullName: string;
  studentId: string;
  reputationScore: number;
  accountStatus: string;
  disputeCount: number;
  violationCount: number;
};

export type ShareItem = { code: string; name: string; count: number; percentage: number };

export type CategoryLocationCell = {
  categoryCode: string;
  categoryName: string;
  locationCode: string;
  locationName: string;
  count: number;
};

export type CategoryLocationResponse = {
  period: SemesterOption;
  totalCompleted: number;
  byCategory: ShareItem[];
  byLocation: ShareItem[];
  matrix: CategoryLocationCell[];
};

export type ZeroPriceResponse = {
  period: SemesterOption;
  totalCompleted: number;
  zeroPriceCount: number;
  paidCount: number;
  zeroPricePercentage: number;
  totalActiveListings: number;
  zeroPriceActiveListings: number;
};

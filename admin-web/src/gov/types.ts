export const seniorApi = '/admin/senior';
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

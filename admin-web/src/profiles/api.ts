import { api, attachment } from '../api/client';

export type PendingProfile = {
  id: string; name: string; studentId: string; email: string;
  kind: 'DANG_KY' | 'CAP_NHAT'; submittedAt: string; hasStudentCard: boolean;
};

export type Profile = {
  id: string; name: string; studentId: string; email: string; phone: string | null;
  school: string | null; campus: string | null; major: string | null; cohort: string | null;
  studyStatus: string | null; reputation: number; emailVerified: boolean; profileApproved: boolean;
  profileStatus: 'DA_DUYET' | 'CHO_DUYET' | 'BI_TU_CHOI'; rejectReason: string | null;
  pendingUpdate: boolean; hasStudentCard: boolean; accountStatus: string; version: number;
};

export const adminProfiles = {
  pending: (offset = 0, limit = 20) => api<PendingProfile[]>(`/admin/profiles/pending?offset=${offset}&limit=${limit}`),
  detail: (id: string) => api<Profile>(`/admin/profiles/${id}`),
  /** expectedVersion chặn quyết định trên bản hồ sơ đã cũ (UC-02 §3.3 bước 7). */
  approve: (id: string, expectedVersion: number) => api<void>(`/admin/profiles/${id}/approve?expectedVersion=${expectedVersion}`, { method: 'POST' }),
  reject: (id: string, reason: string, expectedVersion: number) => api<void>(`/admin/profiles/${id}/reject?expectedVersion=${expectedVersion}`, { method: 'POST', body: JSON.stringify({ reason }) }),
  /** Ảnh thẻ cần bearer token nên tải thành blob URL thay vì gắn thẳng vào src. */
  async cardUrl(id: string) {
    const file = await attachment(`/admin/profiles/${id}/student-card`);
    return file ? URL.createObjectURL(file) : null;
  },
};

export const kindLabel = (kind: PendingProfile['kind']) => (kind === 'CAP_NHAT' ? 'Cập nhật hồ sơ' : 'Đăng ký mới');
export const formatTime = (iso: string) => new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });

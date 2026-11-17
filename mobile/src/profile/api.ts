import { api, attachment, upload } from '../api/client';

export type Profile = {
  id: string; name: string; studentId: string; email: string; phone: string | null;
  school: string | null; campus: string | null; major: string | null; cohort: string | null;
  studyStatus: string | null; reputation: number; emailVerified: boolean; profileApproved: boolean;
  profileStatus: 'DA_DUYET' | 'CHO_DUYET' | 'BI_TU_CHOI'; rejectReason: string | null;
  pendingUpdate: boolean; hasStudentCard: boolean; accountStatus: string;
};

export type ProfileUpdate = Partial<Pick<Profile, 'name' | 'studentId' | 'phone' | 'school' | 'campus' | 'major' | 'cohort'>>;
export type Challenge = { challengeId: string; expiresIn: number; resendAfter: number; message: string };

export const profileApi = {
  me: () => api<Profile>('/profile/me'),
  update: (body: ProfileUpdate) => api<Profile>('/profile/me', { method: 'PATCH', body: JSON.stringify(body) }),
  uploadCard: (file: { uri: string; name: string; type: string }) => upload('/profile/me/student-card', file),
  changeEmail: (currentPassword: string, newEmail: string) =>
    api<Challenge>('/profile/email', { method: 'PATCH', body: JSON.stringify({ currentPassword, newEmail }) }),
  verifyEmail: (challengeId: string, code: string) =>
    api<void>('/profile/email/verify', { method: 'POST', body: JSON.stringify({ challengeId, code }) }),
  /** Ảnh thẻ cần Authorization nên tải qua client rồi đổi sang data URI để <Image> hiển thị. */
  async cardUri(ownerId: string) {
    const file = await attachment(`/profile/student-cards/${ownerId}`);
    if (!file) return null;
    let binary = '';
    new Uint8Array(file.bytes).forEach((byte) => { binary += String.fromCharCode(byte); });
    return `data:${file.type};base64,${globalThis.btoa(binary)}`;
  },
};

/** Nhãn trạng thái hồ sơ dùng chung cho màn hình hồ sơ. */
export function statusLabel(profile: Profile) {
  if (profile.profileStatus === 'BI_TU_CHOI') return { text: 'Hồ sơ bị từ chối', tone: 'danger' as const, note: profile.rejectReason ?? '' };
  if (profile.profileStatus === 'CHO_DUYET') return { text: profile.profileApproved ? 'Cập nhật chờ duyệt' : 'Hồ sơ chờ duyệt', tone: 'warn' as const, note: 'Kiểm duyệt viên sẽ xem ảnh thẻ và thông tin mới.' };
  return { text: 'Hồ sơ đã duyệt', tone: 'ok' as const, note: '' };
}

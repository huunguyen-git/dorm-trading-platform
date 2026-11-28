import type { Role } from '../auth/session';

export const rolePages: Record<Role, { path: string; label: string }[]> = {
  admin: [
    { path: 'overview', label: 'Tổng quan' },
    { path: 'profiles', label: 'Hồ sơ chờ duyệt' },
    { path: 'users', label: 'Người dùng' },
    { path: 'reviews', label: 'Kiểm duyệt đánh giá' },
    { path: 'transactions', label: 'Giao dịch' },
    { path: 'categories', label: 'Danh mục' },
    { path: 'moderators', label: 'Kiểm duyệt viên' },
    { path: 'penalties', label: 'Thang phạt' },
  ],
  moderator: [
    { path: 'overview', label: 'Tổng quan' },
    { path: 'profiles', label: 'Hồ sơ chờ duyệt' },
    { path: 'users', label: 'Người dùng' },
    { path: 'reviews', label: 'Kiểm duyệt đánh giá' },
    { path: 'listings', label: 'Tin đăng' },
    { path: 'reports', label: 'Báo cáo' },
  ],
  member: [
    { path: 'overview', label: 'Tổng quan' },
    { path: 'my-listings', label: 'Tin đăng của tôi' },
  ],
};

import type { Role } from '../auth/session';

export const rolePages: Record<Role, { path: string; label: string }[]> = {
  admin: [
    { path: 'overview', label: 'Tổng quan' },
    { path: 'users', label: 'Người dùng' },
    { path: 'transactions', label: 'Giao dịch' },
    { path: 'categories', label: 'Danh mục' },
  ],
  moderator: [
    { path: 'overview', label: 'Tổng quan' },
    { path: 'listings', label: 'Tin đăng' },
    { path: 'reports', label: 'Báo cáo' },
  ],
  seller: [
    { path: 'overview', label: 'Tổng quan' },
    { path: 'my-listings', label: 'Tin đăng của tôi' },
  ],
};

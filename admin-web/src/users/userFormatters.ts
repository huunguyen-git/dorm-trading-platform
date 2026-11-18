import type { AccountStatus, RestrictionType, StudentStatus, TransactionRole } from './userAdminApi';

const VALID_CARD_PATTERN =
  /^(https:\/\/[^\s]+|\/uploads\/[^\s]+|data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+)$/;

export function isValidStudentCardRef(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2_000_000) return false;
  return VALID_CARD_PATTERN.test(trimmed);
}

export function isPreviewableImageSrc(value: string | null | undefined): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  return (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('/uploads/') ||
    trimmed.startsWith('data:image/')
  );
}

export function getAccountStatusBadge(
  accountStatus: AccountStatus | string,
  restrictionType: RestrictionType | string | null,
): { label: string; className: string } {
  if (accountStatus === 'BI_KHOA') {
    if (restrictionType === 'KHOA_TAM_THOI') {
      return { label: 'Khóa tạm thời', className: 'status-badge status-badge-temp-lock' };
    }
    if (restrictionType === 'KHOA_VINH_VIEN') {
      return { label: 'Khóa vĩnh viễn', className: 'status-badge status-badge-perm-lock' };
    }
    return { label: 'Đang bị khóa', className: 'status-badge status-badge-temp-lock' };
  }
  if (accountStatus === 'HOAT_DONG') {
    return { label: 'Đang hoạt động', className: 'status-badge status-badge-active' };
  }
  if (accountStatus === 'CHO_KICH_HOAT') {
    return { label: 'Chờ kích hoạt', className: 'status-badge status-badge-pending' };
  }
  if (accountStatus === 'VO_HIEU_HOA') {
    return { label: 'Vô hiệu hóa', className: 'status-badge status-badge-disabled' };
  }
  return { label: accountStatus, className: 'status-badge' };
}

export function formatAccountStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  switch (status) {
    case 'CHO_KICH_HOAT':
      return 'Chờ kích hoạt';
    case 'HOAT_DONG':
      return 'Đang hoạt động';
    case 'BI_KHOA':
      return 'Đang bị khóa';
    case 'VO_HIEU_HOA':
      return 'Vô hiệu hóa';
    default:
      return status;
  }
}

export function formatStudentStatus(status: StudentStatus | string): string {
  if (status === 'DANG_HOC') return 'Đang học';
  if (status === 'DA_TOT_NGHIEP') return 'Đã tốt nghiệp';
  return status;
}

export function formatSystemRole(role: string): string {
  switch (role) {
    case 'SENIOR_ADMIN':
      return 'Quản trị viên cấp cao';
    case 'MODERATOR':
      return 'Kiểm duyệt viên';
    case 'MEMBER':
      return 'Thành viên';
    default:
      return role;
  }
}

export function formatTransactionRole(role: TransactionRole | string): string {
  if (role === 'BUYER') return 'Người mua';
  if (role === 'SELLER') return 'Người bán';
  return role;
}

export function formatTransactionStatus(status: string): string {
  switch (status) {
    case 'DANG_GIU_CHO':
      return 'Đang giữ chỗ';
    case 'DA_HEN_GIAO':
      return 'Đã hẹn giao';
    case 'DA_BAO_GIAO':
      return 'Đã báo giao';
    case 'HOAN_TAT':
      return 'Hoàn tất';
    case 'DA_HUY':
      return 'Đã hủy';
    case 'TRANH_CHAP':
      return 'Đang tranh chấp';
    default:
      return status;
  }
}

export function formatReputationChangeType(changeType: string): string {
  switch (changeType) {
    case 'KHOI_TAO_KICH_HOAT':
      return 'Khởi tạo khi kích hoạt';
    case 'XU_PHAT_THANG_PHAT':
      return 'Xử phạt theo thang phạt';
    case 'DIEU_CHINH_KIEM_DUYET':
      return 'Điều chỉnh kiểm duyệt';
    case 'DANH_GIA_GIAO_DICH':
      return 'Đánh giá giao dịch';
    case 'KHIEU_NAI_HOAN_DIEM':
      return 'Khiếu nại hoàn điểm';
    default:
      return changeType;
  }
}

export function formatModerationActionType(actionType: string): string {
  switch (actionType) {
    case 'UPDATE_IDENTITY':
      return 'Cập nhật hồ sơ định danh';
    case 'LOCK_TEMPORARY':
      return 'Khóa tạm thời';
    case 'LOCK_PERMANENT':
      return 'Khóa vĩnh viễn';
    case 'UNLOCK_MANUAL':
      return 'Mở khóa thủ công';
    case 'UNLOCK_EXPIRED_TEMP':
      return 'Tự mở khóa khi hết hạn';
    case 'THRESHOLD_LOCK_TEMPORARY':
      return 'Tự khóa tạm theo ngưỡng điểm';
    case 'THRESHOLD_LOCK_PERMANENT':
      return 'Tự khóa vĩnh viễn theo ngưỡng điểm';
    default:
      return actionType;
  }
}

export function formatVnd(amount: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(amount)} ₫`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

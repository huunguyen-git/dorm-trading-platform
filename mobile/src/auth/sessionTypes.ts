export type AccountRestriction = {
  accountStatus: string;
  lockType: string | null;
  reason: string | null;
  lockedUntil: string | null;
  appealable: boolean;
  reputationScore: number | null;
  message: string;
};

export type User = {
  id: string;
  name: string;
  email: string;
  studentId: string;
  role: 'admin' | 'moderator' | 'member';
  roles: string[];
  emailVerified: boolean;
  profileApproved: boolean;
  accountStatus: string;
  restriction?: AccountRestriction | null;
};

export type SessionState = {
  token: string | null;
  user: User | null;
  loading: boolean;
  restriction: AccountRestriction | null;
  restrictionDismissed: boolean;
  setSession: (token: string, user: User, refreshToken?: string) => Promise<void>;
  clearRestriction: () => void;
  restore: () => Promise<void>;
  logout: () => Promise<void>;
};

export type SessionStoreBridge = {
  getState: () => SessionState;
  setState: (partial: Partial<SessionState>) => void;
};

let sessionStoreBridge: SessionStoreBridge | null = null;

export function registerSessionStore(bridge: SessionStoreBridge): void {
  sessionStoreBridge = bridge;
}

export function getSessionStore(): SessionStoreBridge | null {
  return sessionStoreBridge;
}

export function resolveUserRestriction(user: User | null | undefined): AccountRestriction | null {
  if (!user) return null;
  if (user.restriction) {
    const raw = user.restriction as Partial<AccountRestriction>;
    const lockType = typeof raw.lockType === 'string' && raw.lockType.trim() ? raw.lockType : null;
    const defaultMessage =
      lockType === 'KHOA_VINH_VIEN'
        ? 'Tài khoản của bạn đang bị khóa vĩnh viễn. Các chức năng giao dịch đã bị vô hiệu hóa.'
        : lockType === 'KHOA_TAM_THOI'
          ? 'Tài khoản của bạn đang bị khóa tạm thời. Các chức năng giao dịch tạm thời bị giới hạn.'
          : 'Tài khoản của bạn đang bị hạn chế quyền thao tác.';
    return {
      accountStatus:
        typeof raw.accountStatus === 'string' && raw.accountStatus.trim()
          ? raw.accountStatus
          : user.accountStatus || 'BI_KHOA',
      lockType,
      reason: typeof raw.reason === 'string' && raw.reason.trim() ? raw.reason : null,
      lockedUntil:
        typeof raw.lockedUntil === 'string' && raw.lockedUntil.trim() ? raw.lockedUntil : null,
      appealable: typeof raw.appealable === 'boolean' ? raw.appealable : false,
      reputationScore:
        typeof raw.reputationScore === 'number' && Number.isFinite(raw.reputationScore)
          ? raw.reputationScore
          : null,
      message: typeof raw.message === 'string' && raw.message.trim() ? raw.message : defaultMessage,
    };
  }
  if (user.accountStatus === 'BI_KHOA') {
    return {
      accountStatus: 'BI_KHOA',
      lockType: null,
      reason: null,
      lockedUntil: null,
      appealable: false,
      reputationScore: null,
      message: 'Tài khoản của bạn đang bị khóa. Các chức năng thao tác hiện bị giới hạn theo quy định.',
    };
  }
  return null;
}

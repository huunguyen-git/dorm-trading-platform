import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import {
  getAdminUserDetail,
  getAdminUserModerationLogs,
  getAdminUserReputationHistory,
  getAdminUserTransactions,
  listAdminUsers,
  updateAdminUserIdentity,
  type AccountStatus,
  type AdminUserDetail,
  type AdminUserSearchParams,
  type AdminUserSummary,
  type ModerationLogsPage,
  type PaginatedResponse,
  type ReputationHistoryPage,
  type StudentStatus,
  type UserTransactionsPage,
} from './userAdminApi';
import {
  formatAccountStatusLabel,
  formatDateTime,
  formatModerationActionType,
  formatReputationChangeType,
  formatStudentStatus,
  formatSystemRole,
  formatTransactionRole,
  formatTransactionStatus,
  formatVnd,
  getAccountStatusBadge,
  isPreviewableImageSrc,
  isValidStudentCardRef,
} from './userFormatters';

const PAGE_SIZE = 20;

type DetailTab = 'identity' | 'transactions' | 'reputation' | 'logs';

interface FilterFormState {
  q: string;
  accountStatus: AccountStatus | '';
  studentStatus: StudentStatus | '';
  emailVerified: '' | 'true' | 'false';
  profileApproved: '' | 'true' | 'false';
  role: string;
  minReputation: string;
  maxReputation: string;
}

interface IdentityFormState {
  fullName: string;
  studentId: string;
  phone: string;
  university: string;
  campus: string;
  major: string;
  cohort: string;
  studentStatus: StudentStatus;
  studentCardFront: string;
  studentCardBack: string;
  reason: string;
}

const initialFilterState: FilterFormState = {
  q: '',
  accountStatus: '',
  studentStatus: '',
  emailVerified: '',
  profileApproved: '',
  role: '',
  minReputation: '',
  maxReputation: '',
};

function toSearchParams(filters: FilterFormState, page: number): AdminUserSearchParams {
  return {
    q: filters.q,
    accountStatus: filters.accountStatus,
    studentStatus: filters.studentStatus,
    emailVerified: filters.emailVerified === '' ? '' : filters.emailVerified === 'true',
    profileApproved: filters.profileApproved === '' ? '' : filters.profileApproved === 'true',
    role: filters.role,
    minReputation: filters.minReputation.trim() === '' ? '' : Number(filters.minReputation),
    maxReputation: filters.maxReputation.trim() === '' ? '' : Number(filters.maxReputation),
    page,
    size: PAGE_SIZE,
  };
}

function toIdentityForm(detail: AdminUserDetail): IdentityFormState {
  return {
    fullName: detail.fullName ?? '',
    studentId: detail.studentId ?? '',
    phone: detail.phone ?? '',
    university: detail.university ?? '',
    campus: detail.campus ?? '',
    major: detail.major ?? '',
    cohort: detail.cohort ?? '',
    studentStatus: detail.studentStatus,
    studentCardFront: detail.studentCardFront ?? '',
    studentCardBack: detail.studentCardBack ?? '',
    reason: '',
  };
}

function mergeSummaryFromDetail(summary: AdminUserSummary, detail: AdminUserDetail): AdminUserSummary {
  return {
    ...summary,
    fullName: detail.fullName,
    email: detail.email,
    studentId: detail.studentId,
    phone: detail.phone,
    studentStatus: detail.studentStatus,
    accountStatus: detail.accountStatus,
    restrictionType: detail.restrictionType,
    lockedUntil: detail.lockedUntil,
    emailVerified: detail.emailVerified,
    profileApproved: detail.profileApproved,
    reputationScore: detail.reputationScore,
    systemRoles: detail.systemRoles,
  };
}

function StudentCardDisplay({
  label,
  src,
  hasCard,
}: {
  label: string;
  src: string | null | undefined;
  hasCard: boolean;
}) {
  return (
    <div className="student-card-box">
      <strong>{label}</strong>
      {isPreviewableImageSrc(src) ? (
        <img src={src} alt={label} className="student-card-preview" />
      ) : hasCard ? (
        <span>Đã có ảnh thẻ</span>
      ) : (
        <span className="cell-sub">Chưa có ảnh thẻ</span>
      )}
    </div>
  );
}

export default function UsersManagementPage() {
  const { user: currentUser } = useAuth();

  const [draftFilters, setDraftFilters] = useState<FilterFormState>(initialFilterState);
  const [appliedFilters, setAppliedFilters] = useState<FilterFormState>(initialFilterState);
  const [filterError, setFilterError] = useState('');
  const [page, setPage] = useState(0);

  const [usersData, setUsersData] = useState<PaginatedResponse<AdminUserSummary> | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('identity');
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const [isEditingIdentity, setIsEditingIdentity] = useState(false);
  const [identityForm, setIdentityForm] = useState<IdentityFormState>({
    fullName: '',
    studentId: '',
    phone: '',
    university: '',
    campus: '',
    major: '',
    cohort: '',
    studentStatus: 'DANG_HOC',
    studentCardFront: '',
    studentCardBack: '',
    reason: '',
  });
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState('');
  const [editSuccess, setEditSuccess] = useState('');

  const [txPage, setTxPage] = useState(0);
  const [txData, setTxData] = useState<UserTransactionsPage | null>(null);
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState('');

  const [repPage, setRepPage] = useState(0);
  const [repData, setRepData] = useState<ReputationHistoryPage | null>(null);
  const [repLoading, setRepLoading] = useState(false);
  const [repError, setRepError] = useState('');

  const [logPage, setLogPage] = useState(0);
  const [logsData, setLogsData] = useState<ModerationLogsPage | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState('');
  const [logsRefreshKey, setLogsRefreshKey] = useState(0);

  const loadUsers = useCallback(async (filters: FilterFormState, targetPage: number) => {
    setListLoading(true);
    setListError('');
    try {
      const result = await listAdminUsers(toSearchParams(filters, targetPage));
      setUsersData(result);
    } catch (cause) {
      setListError((cause as Error).message || 'Không thể tải danh sách người dùng.');
    } finally {
      setListLoading(false);
    }
  }, []);

  const syncUserDetailIntoState = useCallback((loaded: AdminUserDetail) => {
    setDetail(loaded);
    setIdentityForm(toIdentityForm(loaded));
    setUsersData((prev) =>
      prev?.items
        ? {
            ...prev,
            items: prev.items.map((item) => (item.id === loaded.id ? mergeSummaryFromDetail(item, loaded) : item)),
          }
        : prev,
    );
  }, []);

  useEffect(() => {
    let active = true;
    setListLoading(true);
    setListError('');
    void listAdminUsers(toSearchParams(appliedFilters, page))
      .then((result) => {
        if (active) setUsersData(result);
      })
      .catch((cause: Error) => {
        if (active) setListError(cause.message || 'Không thể tải danh sách người dùng.');
      })
      .finally(() => {
        if (active) setListLoading(false);
      });
    return () => {
      active = false;
    };
  }, [appliedFilters, page]);

  useEffect(() => {
    if (!selectedUserId) {
      setDetail(null);
      setDetailError('');
      setIsEditingIdentity(false);
      return;
    }
    let active = true;
    setDetailLoading(true);
    setDetailError('');
    setIsEditingIdentity(false);
    setEditError('');
    setEditSuccess('');
    void getAdminUserDetail(selectedUserId)
      .then((loaded) => {
        if (!active) return;
        setDetail(loaded);
        setIdentityForm(toIdentityForm(loaded));
      })
      .catch((cause: Error) => {
        if (!active) return;
        setDetail(null);
        if (cause instanceof ApiError && cause.status === 404) {
          setDetailError('Không tìm thấy người dùng hoặc hồ sơ không tồn tại.');
        } else {
          setDetailError(cause.message || 'Không thể tải hồ sơ người dùng.');
        }
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedUserId]);

  useEffect(() => {
    if (!selectedUserId || activeTab !== 'transactions') return;
    let active = true;
    setTxLoading(true);
    setTxError('');
    void getAdminUserTransactions(selectedUserId, txPage, PAGE_SIZE)
      .then((result) => {
        if (active) setTxData(result);
      })
      .catch((cause: Error) => {
        if (active) setTxError(cause.message || 'Không thể tải lịch sử giao dịch.');
      })
      .finally(() => {
        if (active) setTxLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedUserId, activeTab, txPage]);

  useEffect(() => {
    if (!selectedUserId || activeTab !== 'reputation') return;
    let active = true;
    setRepLoading(true);
    setRepError('');
    void getAdminUserReputationHistory(selectedUserId, repPage, PAGE_SIZE)
      .then((result) => {
        if (active) setRepData(result);
      })
      .catch((cause: Error) => {
        if (active) setRepError(cause.message || 'Không thể tải lịch sử điểm uy tín.');
      })
      .finally(() => {
        if (active) setRepLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedUserId, activeTab, repPage]);

  useEffect(() => {
    if (!selectedUserId || activeTab !== 'logs') return;
    let active = true;
    setLogsLoading(true);
    setLogsError('');
    void getAdminUserModerationLogs(selectedUserId, logPage, PAGE_SIZE)
      .then((result) => {
        if (active) setLogsData(result);
      })
      .catch((cause: Error) => {
        if (active) setLogsError(cause.message || 'Không thể tải vết kiểm duyệt.');
      })
      .finally(() => {
        if (active) setLogsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedUserId, activeTab, logPage, logsRefreshKey]);

  function handleSearchSubmit(event: FormEvent) {
    event.preventDefault();
    setFilterError('');
    const minStr = draftFilters.minReputation.trim();
    const maxStr = draftFilters.maxReputation.trim();
    if (minStr !== '' && Number(minStr) < 0) {
      setFilterError('Điểm uy tín tối thiểu không được nhỏ hơn 0.');
      return;
    }
    if (maxStr !== '' && Number(maxStr) < 0) {
      setFilterError('Điểm uy tín tối đa không được nhỏ hơn 0.');
      return;
    }
    if (minStr !== '' && maxStr !== '' && Number(minStr) > Number(maxStr)) {
      setFilterError('Điểm uy tín tối thiểu không được lớn hơn điểm tối đa.');
      return;
    }
    if (page === 0 && JSON.stringify(draftFilters) === JSON.stringify(appliedFilters)) {
      void loadUsers(draftFilters, 0);
      return;
    }
    setPage(0);
    setAppliedFilters({ ...draftFilters });
  }

  function handleResetFilters() {
    setFilterError('');
    setDraftFilters(initialFilterState);
    if (page === 0 && JSON.stringify(appliedFilters) === JSON.stringify(initialFilterState)) {
      void loadUsers(initialFilterState, 0);
      return;
    }
    setPage(0);
    setAppliedFilters(initialFilterState);
  }

  function handleSelectUser(userId: string) {
    setActiveTab('identity');
    setIsEditingIdentity(false);
    setEditError('');
    setEditSuccess('');
    setTxPage(0);
    setRepPage(0);
    setLogPage(0);
    setTxData(null);
    setRepData(null);
    setLogsData(null);
    if (selectedUserId === userId) {
      setDetailLoading(true);
      setDetailError('');
      void getAdminUserDetail(userId)
        .then((loaded) => {
          setDetail(loaded);
          setIdentityForm(toIdentityForm(loaded));
        })
        .catch((cause: Error) => {
          setDetail(null);
          setDetailError(
            cause instanceof ApiError && cause.status === 404
              ? 'Không tìm thấy người dùng hoặc hồ sơ không tồn tại.'
              : cause.message,
          );
        })
        .finally(() => setDetailLoading(false));
      return;
    }
    setSelectedUserId(userId);
  }

  function handleOpenIdentityEdit() {
    if (!detail) return;
    setEditError('');
    setEditSuccess('');
    setIdentityForm(toIdentityForm(detail));
    setIsEditingIdentity(true);
  }

  function handleCancelIdentityEdit() {
    if (detail) {
      setIdentityForm(toIdentityForm(detail));
    }
    setEditError('');
    setIsEditingIdentity(false);
  }

  async function handleIdentitySubmit(event: FormEvent) {
    event.preventDefault();
    if (!detail) return;
    setEditError('');
    setEditSuccess('');

    const fullName = identityForm.fullName.trim();
    const studentId = identityForm.studentId.trim();
    const phone = identityForm.phone.trim();
    const university = identityForm.university.trim();
    const campus = identityForm.campus.trim();
    const major = identityForm.major.trim();
    const cohort = identityForm.cohort.trim();
    const studentCardFront = identityForm.studentCardFront.trim();
    const studentCardBack = identityForm.studentCardBack.trim();
    const reason = identityForm.reason.trim();

    if (!fullName) {
      setEditError('Vui lòng nhập họ và tên.');
      return;
    }
    if (fullName.length > 150) {
      setEditError('Họ và tên không được vượt quá 150 ký tự.');
      return;
    }
    if (!/^[A-Za-z0-9_-]{4,20}$/.test(studentId)) {
      setEditError('MSSV cần từ 4 đến 20 ký tự chữ, số, gạch ngang hoặc gạch dưới.');
      return;
    }
    if (phone && !/^[0-9+() -]{8,20}$/.test(phone)) {
      setEditError('Số điện thoại không hợp lệ (cần từ 8 đến 20 ký tự số).');
      return;
    }
    if (studentCardFront && !isValidStudentCardRef(studentCardFront)) {
      setEditError(
        'Ảnh thẻ sinh viên mặt trước không đáp ứng quy chuẩn (cần https://..., /uploads/... hoặc data:image/(jpeg|png|webp);base64,...).',
      );
      return;
    }
    if (studentCardBack && !isValidStudentCardRef(studentCardBack)) {
      setEditError(
        'Ảnh thẻ sinh viên mặt sau không đáp ứng quy chuẩn (cần https://..., /uploads/... hoặc data:image/(jpeg|png|webp);base64,...).',
      );
      return;
    }
    if (reason.length > 500) {
      setEditError('Ghi chú lý do cập nhật không được vượt quá 500 ký tự.');
      return;
    }

    const previousVersion = detail.version;
    setEditBusy(true);
    try {
      const updated = await updateAdminUserIdentity(detail.id, {
        fullName,
        studentId,
        phone: phone || null,
        university: university || null,
        campus: campus || null,
        major: major || null,
        cohort: cohort || null,
        studentStatus: identityForm.studentStatus,
        studentCardFront: studentCardFront || null,
        studentCardBack: studentCardBack || null,
        ...(reason ? { reason } : {}),
        expectedVersion: detail.version,
      });
      syncUserDetailIntoState(updated);
      setIsEditingIdentity(false);
      setLogsData(null);
      setLogsRefreshKey((value) => value + 1);
      setEditSuccess('Đã cập nhật thông tin định danh người dùng.');
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        try {
          const fresh = await getAdminUserDetail(detail.id);
          if (fresh && typeof fresh.id === 'string') {
            syncUserDetailIntoState(fresh);
            if (fresh.version !== previousVersion || fresh.accountStatus === 'VO_HIEU_HOA') {
              setIsEditingIdentity(false);
            }
          }
        } catch {
          // Keep original conflict error visible even if background reload fails
        }
        setEditError(`${cause.message} Đã tải lại trạng thái tài khoản mới nhất.`);
      } else {
        setEditError((cause as Error).message || 'Không thể cập nhật thông tin định danh.');
      }
    } finally {
      setEditBusy(false);
    }
  }

  const isTargetDeactivated = detail?.accountStatus === 'VO_HIEU_HOA';
  const cannotEditSeniorAdmin = Boolean(
    currentUser?.role === 'moderator' && (detail?.systemRoles ?? []).includes('SENIOR_ADMIN'),
  );
  const editGuardReason = isTargetDeactivated
    ? 'Tài khoản đã bị xóa/vô hiệu hóa, không thể chỉnh sửa hồ sơ.'
    : cannotEditSeniorAdmin
      ? 'Kiểm duyệt viên không được chỉnh sửa hồ sơ định danh của Quản trị viên cấp cao.'
      : '';

  return (
    <section className="page-content users-page">
      <header className="page-heading">
        <p className="eyebrow">QUẢN LÝ CỘNG ĐỒNG</p>
        <h1>Quản lý người dùng</h1>
        <p>Tra cứu hồ sơ thành viên, cập nhật thông tin định danh và theo dõi lịch sử hoạt động.</p>
      </header>

      <section className="users-card" aria-label="Bộ lọc người dùng">
        <form onSubmit={handleSearchSubmit} noValidate>
          <div className="filter-grid">
            <label className="filter-field filter-field-wide" htmlFor="filter-q">
              Từ khóa tìm kiếm
              <input
                id="filter-q"
                type="search"
                placeholder="Họ tên, email, MSSV hoặc SĐT"
                value={draftFilters.q}
                onChange={(e) => setDraftFilters({ ...draftFilters, q: e.target.value })}
              />
            </label>

            <label className="filter-field" htmlFor="filter-account-status">
              Trạng thái tài khoản
              <select
                id="filter-account-status"
                value={draftFilters.accountStatus}
                onChange={(e) =>
                  setDraftFilters({ ...draftFilters, accountStatus: e.target.value as AccountStatus | '' })
                }
              >
                <option value="">Tất cả trạng thái</option>
                <option value="CHO_KICH_HOAT">Chờ kích hoạt</option>
                <option value="HOAT_DONG">Đang hoạt động</option>
                <option value="BI_KHOA">Đang bị khóa</option>
                <option value="VO_HIEU_HOA">Vô hiệu hóa</option>
              </select>
            </label>

            <label className="filter-field" htmlFor="filter-student-status">
              Tình trạng học tập
              <select
                id="filter-student-status"
                value={draftFilters.studentStatus}
                onChange={(e) =>
                  setDraftFilters({ ...draftFilters, studentStatus: e.target.value as StudentStatus | '' })
                }
              >
                <option value="">Tất cả học tập</option>
                <option value="DANG_HOC">Đang học</option>
                <option value="DA_TOT_NGHIEP">Đã tốt nghiệp</option>
              </select>
            </label>

            <label className="filter-field" htmlFor="filter-email-verified">
              Xác minh email
              <select
                id="filter-email-verified"
                value={draftFilters.emailVerified}
                onChange={(e) =>
                  setDraftFilters({ ...draftFilters, emailVerified: e.target.value as '' | 'true' | 'false' })
                }
              >
                <option value="">Tất cả</option>
                <option value="true">Đã xác minh</option>
                <option value="false">Chưa xác minh</option>
              </select>
            </label>

            <label className="filter-field" htmlFor="filter-profile-approved">
              Duyệt hồ sơ
              <select
                id="filter-profile-approved"
                value={draftFilters.profileApproved}
                onChange={(e) =>
                  setDraftFilters({ ...draftFilters, profileApproved: e.target.value as '' | 'true' | 'false' })
                }
              >
                <option value="">Tất cả</option>
                <option value="true">Đã duyệt</option>
                <option value="false">Chờ duyệt</option>
              </select>
            </label>

            <label className="filter-field" htmlFor="filter-role">
              Vai trò hệ thống
              <select
                id="filter-role"
                value={draftFilters.role}
                onChange={(e) => setDraftFilters({ ...draftFilters, role: e.target.value })}
              >
                <option value="">Tất cả vai trò</option>
                <option value="MEMBER">Thành viên</option>
                <option value="MODERATOR">Kiểm duyệt viên</option>
                <option value="SENIOR_ADMIN">Quản trị viên cấp cao</option>
              </select>
            </label>

            <label className="filter-field" htmlFor="filter-min-reputation">
              Điểm uy tín tối thiểu
              <input
                id="filter-min-reputation"
                type="number"
                min={0}
                placeholder="Từ (VD: 30)"
                value={draftFilters.minReputation}
                onChange={(e) => setDraftFilters({ ...draftFilters, minReputation: e.target.value })}
              />
            </label>

            <label className="filter-field" htmlFor="filter-max-reputation">
              Điểm uy tín tối đa
              <input
                id="filter-max-reputation"
                type="number"
                min={0}
                placeholder="Đến (VD: 100)"
                value={draftFilters.maxReputation}
                onChange={(e) => setDraftFilters({ ...draftFilters, maxReputation: e.target.value })}
              />
            </label>
          </div>

          {filterError && (
            <p className="notice notice-error" role="alert" style={{ marginTop: 16 }}>
              {filterError}
            </p>
          )}

          <div className="filter-actions" style={{ marginTop: 16 }}>
            <button className="button button-primary button-compact" type="submit" disabled={listLoading}>
              Tìm kiếm
            </button>
            <button className="button button-compact" type="button" disabled={listLoading} onClick={handleResetFilters}>
              Đặt lại bộ lọc
            </button>
          </div>
        </form>
      </section>

      <section className="users-card" aria-label="Danh sách người dùng">
        <h2>Danh sách tài khoản</h2>

        {listError ? (
          <p className="notice notice-error" role="alert">
            {listError}
          </p>
        ) : listLoading ? (
          <p className="notice" role="status">
            Đang tải danh sách người dùng…
          </p>
        ) : !usersData?.items || usersData.items.length === 0 ? (
          <p className="notice" role="status">
            Không tìm thấy người dùng phù hợp với bộ lọc hiện tại.
          </p>
        ) : (
          <>
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Họ tên</th>
                    <th>Email</th>
                    <th>MSSV</th>
                    <th>Học tập</th>
                    <th>Điểm uy tín</th>
                    <th>Trạng thái tài khoản</th>
                    <th>Vai trò</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {usersData.items.map((item) => {
                    const statusBadge = getAccountStatusBadge(item.accountStatus, item.restrictionType);
                    const isSelected = item.id === selectedUserId;
                    return (
                      <tr key={item.id} className={isSelected ? 'row-selected' : undefined}>
                        <td>
                          <span className="cell-primary">{item.fullName}</span>
                          {item.phone && <span className="cell-sub">{item.phone}</span>}
                        </td>
                        <td>
                          <span>{item.email}</span>
                          <span className="cell-sub">
                            {item.emailVerified ? 'Email đã xác minh' : 'Chưa xác minh email'} ·{' '}
                            {item.profileApproved ? 'Đã duyệt hồ sơ' : 'Chờ duyệt hồ sơ'}
                          </span>
                        </td>
                        <td className="num-cell">{item.studentId}</td>
                        <td>{formatStudentStatus(item.studentStatus)}</td>
                        <td className="num-cell">{item.reputationScore}</td>
                        <td>
                          <span className={statusBadge.className}>{statusBadge.label}</span>
                          {item.accountStatus === 'BI_KHOA' && item.lockedUntil && (
                            <span className="cell-sub">Đến {formatDateTime(item.lockedUntil)}</span>
                          )}
                        </td>
                        <td>
                          <div className="badge-group">
                            {(item.systemRoles ?? []).length > 0 ? (
                              (item.systemRoles ?? []).map((role) => (
                                <span key={role} className="status-badge status-badge-role">
                                  {formatSystemRole(role)}
                                </span>
                              ))
                            ) : (
                              <span className="cell-sub">Chưa kích hoạt</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="button button-compact"
                            onClick={() => handleSelectUser(item.id)}
                          >
                            Chi tiết
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="pagination-bar">
              <span>
                Trang {usersData.page + 1} / {Math.max(1, usersData.totalPages)} · Tổng {usersData.totalElements} người
                dùng
              </span>
              <div className="pagination-actions">
                <button
                  type="button"
                  className="button button-compact"
                  disabled={usersData.page <= 0 || listLoading}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Trang trước
                </button>
                <button
                  type="button"
                  className="button button-compact"
                  disabled={usersData.page + 1 >= usersData.totalPages || listLoading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Trang sau
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {selectedUserId && (
        <section className="users-card" aria-label="Chi tiết người dùng">
          {detailLoading ? (
            <p className="notice" role="status">
              Đang tải chi tiết người dùng…
            </p>
          ) : detailError ? (
            <div style={{ display: 'grid', gap: 12 }}>
              <p className="notice notice-error" role="alert">
                {detailError}
              </p>
              <div>
                <button type="button" className="button button-compact" onClick={() => setSelectedUserId(null)}>
                  Đóng chi tiết
                </button>
              </div>
            </div>
          ) : detail ? (
            <>
              <header className="detail-header">
                <div className="detail-title">
                  <p className="eyebrow" style={{ marginBottom: 0 }}>
                    HỒ SƠ THÀNH VIÊN · {detail.studentId}
                  </p>
                  <h2>{detail.fullName}</h2>
                  <div className="badge-group">
                    <span className={getAccountStatusBadge(detail.accountStatus, detail.restrictionType).className}>
                      {getAccountStatusBadge(detail.accountStatus, detail.restrictionType).label}
                    </span>
                    <span className="status-badge">{formatStudentStatus(detail.studentStatus)}</span>
                    <span className="status-badge">Điểm uy tín: {detail.reputationScore}</span>
                    {(detail.systemRoles ?? []).map((role) => (
                      <span key={role} className="status-badge status-badge-role">
                        {formatSystemRole(role)}
                      </span>
                    ))}
                  </div>
                </div>
                <button type="button" className="button button-compact" onClick={() => setSelectedUserId(null)}>
                  Đóng chi tiết
                </button>
              </header>

              <div className="tab-list" role="tablist" aria-label="Các mục chi tiết người dùng">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'identity'}
                  className="tab-button"
                  onClick={() => setActiveTab('identity')}
                >
                  Hồ sơ định danh
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'transactions'}
                  className="tab-button"
                  onClick={() => setActiveTab('transactions')}
                >
                  Lịch sử giao dịch
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'reputation'}
                  className="tab-button"
                  onClick={() => setActiveTab('reputation')}
                >
                  Biến động điểm uy tín
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'logs'}
                  className="tab-button"
                  onClick={() => setActiveTab('logs')}
                >
                  Vết kiểm duyệt
                </button>
              </div>

              {activeTab === 'identity' && (
                <div role="tabpanel" aria-label="Hồ sơ định danh" className="detail-columns">
                  <section className="meta-card" aria-label="Thông tin định danh và thẻ sinh viên">
                    <h3>Thông tin tài khoản & thẻ sinh viên (UC-11)</h3>

                    <div className="student-card-grid">
                      <StudentCardDisplay
                        label="Thẻ sinh viên mặt trước"
                        src={detail.studentCardFront}
                        hasCard={detail.hasStudentCardFront}
                      />
                      <StudentCardDisplay
                        label="Thẻ sinh viên mặt sau"
                        src={detail.studentCardBack}
                        hasCard={detail.hasStudentCardBack}
                      />
                    </div>

                    <dl className="meta-list">
                      <div>
                        <dt>User ID</dt>
                        <dd>{detail.id}</dd>
                      </div>
                      <div>
                        <dt>Email đăng nhập</dt>
                        <dd>{detail.email}</dd>
                      </div>
                      <div>
                        <dt>Xác minh email</dt>
                        <dd>{detail.emailVerified ? 'Đã xác minh OTP' : 'Chưa xác minh'}</dd>
                      </div>
                      <div>
                        <dt>Duyệt hồ sơ kích hoạt</dt>
                        <dd>{detail.profileApproved ? 'Đã duyệt kích hoạt' : 'Chờ duyệt'}</dd>
                      </div>
                      <div>
                        <dt>Điểm uy tín hiện tại</dt>
                        <dd>{detail.reputationScore}</dd>
                      </div>
                      <div>
                        <dt>Ngày tạo hồ sơ</dt>
                        <dd>{formatDateTime(detail.createdAt)}</dd>
                      </div>
                      <div>
                        <dt>Cập nhật gần nhất</dt>
                        <dd>{formatDateTime(detail.updatedAt)}</dd>
                      </div>
                    </dl>
                  </section>

                  <section className="account-card" aria-label="Hồ sơ học tập và cập nhật định danh">
                    <p className="eyebrow">THÔNG TIN ĐỊNH DANH & HỌC TẬP (UC-11, UC-12)</p>

                    {!isEditingIdentity ? (
                      <div style={{ display: 'grid', gap: 16 }}>
                        <h3>Chi tiết hồ sơ hiện tại</h3>

                        {editSuccess && (
                          <p className="notice notice-success" role="status">
                            {editSuccess}
                          </p>
                        )}
                        {editError && (
                          <p className="notice notice-error" role="alert">
                            {editError}
                          </p>
                        )}
                        {editGuardReason && (
                          <p className="notice notice-error" role="note">
                            {editGuardReason}
                          </p>
                        )}

                        <dl className="meta-list">
                          <div>
                            <dt>Họ và tên</dt>
                            <dd>{detail.fullName}</dd>
                          </div>
                          <div>
                            <dt>Mã số sinh viên (MSSV)</dt>
                            <dd>{detail.studentId}</dd>
                          </div>
                          <div>
                            <dt>Số điện thoại</dt>
                            <dd>{detail.phone || '—'}</dd>
                          </div>
                          <div>
                            <dt>Tình trạng học tập</dt>
                            <dd>{formatStudentStatus(detail.studentStatus)}</dd>
                          </div>
                          <div>
                            <dt>Trường đại học</dt>
                            <dd>{detail.university || '—'}</dd>
                          </div>
                          <div>
                            <dt>Cơ sở học tập</dt>
                            <dd>{detail.campus || '—'}</dd>
                          </div>
                          <div>
                            <dt>Ngành học</dt>
                            <dd>{detail.major || '—'}</dd>
                          </div>
                          <div>
                            <dt>Khóa tuyển sinh</dt>
                            <dd>{detail.cohort || '—'}</dd>
                          </div>
                        </dl>

                        <div className="form-actions-inline">
                          <button
                            type="button"
                            className="button button-primary"
                            disabled={Boolean(editGuardReason)}
                            onClick={handleOpenIdentityEdit}
                          >
                            Sửa hồ sơ
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gap: 16 }}>
                        <h3>Chỉnh sửa thông tin định danh</h3>
                        <p className="form-help">Chuyển trạng thái Đã tốt nghiệp không khóa tài khoản.</p>

                        <form className="admin-form" onSubmit={(e) => void handleIdentitySubmit(e)} noValidate>
                          <div className="admin-form-grid">
                            <label htmlFor="identity-full-name">
                              Họ và tên *
                              <input
                                id="identity-full-name"
                                type="text"
                                value={identityForm.fullName}
                                disabled={editBusy}
                                onChange={(e) => setIdentityForm({ ...identityForm, fullName: e.target.value })}
                              />
                            </label>

                            <label htmlFor="identity-student-id">
                              Mã số sinh viên (MSSV) *
                              <input
                                id="identity-student-id"
                                type="text"
                                value={identityForm.studentId}
                                disabled={editBusy}
                                onChange={(e) => setIdentityForm({ ...identityForm, studentId: e.target.value })}
                              />
                            </label>

                            <label htmlFor="identity-phone">
                              Số điện thoại
                              <input
                                id="identity-phone"
                                type="tel"
                                value={identityForm.phone}
                                disabled={editBusy}
                                onChange={(e) => setIdentityForm({ ...identityForm, phone: e.target.value })}
                              />
                            </label>

                            <label htmlFor="identity-student-status">
                              Tình trạng học tập *
                              <select
                                id="identity-student-status"
                                value={identityForm.studentStatus}
                                disabled={editBusy}
                                onChange={(e) =>
                                  setIdentityForm({ ...identityForm, studentStatus: e.target.value as StudentStatus })
                                }
                              >
                                <option value="DANG_HOC">Đang học</option>
                                <option value="DA_TOT_NGHIEP">Đã tốt nghiệp</option>
                              </select>
                            </label>

                            <label htmlFor="identity-university">
                              Trường đại học
                              <input
                                id="identity-university"
                                type="text"
                                value={identityForm.university}
                                disabled={editBusy}
                                onChange={(e) => setIdentityForm({ ...identityForm, university: e.target.value })}
                              />
                            </label>

                            <label htmlFor="identity-campus">
                              Cơ sở học tập
                              <input
                                id="identity-campus"
                                type="text"
                                value={identityForm.campus}
                                disabled={editBusy}
                                onChange={(e) => setIdentityForm({ ...identityForm, campus: e.target.value })}
                              />
                            </label>

                            <label htmlFor="identity-major">
                              Ngành học
                              <input
                                id="identity-major"
                                type="text"
                                value={identityForm.major}
                                disabled={editBusy}
                                onChange={(e) => setIdentityForm({ ...identityForm, major: e.target.value })}
                              />
                            </label>

                            <label htmlFor="identity-cohort">
                              Khóa tuyển sinh
                              <input
                                id="identity-cohort"
                                type="text"
                                value={identityForm.cohort}
                                disabled={editBusy}
                                onChange={(e) => setIdentityForm({ ...identityForm, cohort: e.target.value })}
                              />
                            </label>

                            <label htmlFor="identity-card-front">
                              Ảnh thẻ sinh viên mặt trước
                              <input
                                id="identity-card-front"
                                type="text"
                                placeholder="https://... hoặc /uploads/..."
                                value={identityForm.studentCardFront}
                                disabled={editBusy}
                                onChange={(e) => setIdentityForm({ ...identityForm, studentCardFront: e.target.value })}
                              />
                            </label>

                            <label htmlFor="identity-card-back">
                              Ảnh thẻ sinh viên mặt sau
                              <input
                                id="identity-card-back"
                                type="text"
                                placeholder="https://... hoặc /uploads/..."
                                value={identityForm.studentCardBack}
                                disabled={editBusy}
                                onChange={(e) => setIdentityForm({ ...identityForm, studentCardBack: e.target.value })}
                              />
                            </label>

                            <label className="field-full" htmlFor="identity-reason">
                              Ghi chú lý do cập nhật (tùy chọn)
                              <textarea
                                id="identity-reason"
                                placeholder="Ghi rõ căn cứ đối chiếu thẻ sinh viên hoặc yêu cầu cập nhật (nếu có)..."
                                value={identityForm.reason}
                                disabled={editBusy}
                                onChange={(e) => setIdentityForm({ ...identityForm, reason: e.target.value })}
                              />
                            </label>
                          </div>

                          {editError && (
                            <p className="notice notice-error" role="alert">
                              {editError}
                            </p>
                          )}

                          <div className="form-actions-inline">
                            <button type="submit" className="button button-primary" disabled={editBusy}>
                              {editBusy ? 'Đang lưu thay đổi…' : 'Xác nhận lưu'}
                            </button>
                            <button
                              type="button"
                              className="button"
                              disabled={editBusy}
                              onClick={handleCancelIdentityEdit}
                            >
                              Hủy
                            </button>
                          </div>
                        </form>
                      </div>
                    )}
                  </section>
                </div>
              )}

              {activeTab === 'transactions' && (
                <div role="tabpanel" aria-label="Lịch sử giao dịch" style={{ display: 'grid', gap: 16 }}>
                  <p className="form-help">
                    Vai trò Người mua / Người bán được ghi nhận theo từng giao dịch (FR-03), độc lập với quyền hệ thống.
                  </p>
                  {txError ? (
                    <p className="notice notice-error" role="alert">
                      {txError}
                    </p>
                  ) : txLoading ? (
                    <p className="notice" role="status">
                      Đang tải lịch sử giao dịch…
                    </p>
                  ) : !txData?.items || txData.items.length === 0 ? (
                    <p className="notice" role="status">
                      Người dùng chưa có giao dịch nào.
                    </p>
                  ) : (
                    <>
                      <div className="table-wrap">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>Vai trò</th>
                              <th>Tin đăng</th>
                              <th>Đối tác</th>
                              <th>Giá thỏa thuận</th>
                              <th>Trạng thái</th>
                              <th>Thời điểm</th>
                            </tr>
                          </thead>
                          <tbody>
                            {txData.items.map((tx) => (
                              <tr key={tx.transactionId}>
                                <td>
                                  <span className="status-badge status-badge-role">
                                    {formatTransactionRole(tx.transactionRole)}
                                  </span>
                                </td>
                                <td>
                                  <span className="cell-primary">{tx.listingTitle}</span>
                                  <span className="cell-sub">Mã tin: {tx.listingId}</span>
                                </td>
                                <td>
                                  <span className="cell-primary">{tx.counterpartyName}</span>
                                  <span className="cell-sub">MSSV: {tx.counterpartyStudentId}</span>
                                </td>
                                <td className="num-cell">{formatVnd(tx.agreedPrice)}</td>
                                <td>
                                  <span className="status-badge">{formatTransactionStatus(tx.status)}</span>
                                </td>
                                <td>{formatDateTime(tx.completedAt ?? tx.scheduledAt ?? tx.createdAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="pagination-bar">
                        <span>
                          Trang {txData.page + 1} / {Math.max(1, txData.totalPages)} · Tổng {txData.totalElements} giao
                          dịch
                        </span>
                        <div className="pagination-actions">
                          <button
                            type="button"
                            className="button button-compact"
                            disabled={txData.page <= 0 || txLoading}
                            onClick={() => setTxPage((p) => Math.max(0, p - 1))}
                          >
                            Trang trước
                          </button>
                          <button
                            type="button"
                            className="button button-compact"
                            disabled={txData.page + 1 >= txData.totalPages || txLoading}
                            onClick={() => setTxPage((p) => p + 1)}
                          >
                            Trang sau
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeTab === 'reputation' && (
                <div role="tabpanel" aria-label="Biến động điểm uy tín" style={{ display: 'grid', gap: 16 }}>
                  <div className="meta-card">
                    <p className="eyebrow">TỔNG QUAN ĐIỂM UY TÍN (FR-03, FR-12)</p>
                    <h3>Điểm hiện tại: {repData ? repData.currentScore : detail.reputationScore}</h3>
                    <div className="threshold-grid">
                      <div className="threshold-item">
                        <strong>Điểm &gt; 50 (Khởi tạo: 100)</strong>
                        Tài khoản hoạt động bình thường theo quy định cộng đồng.
                      </div>
                      <div className="threshold-item">
                        <strong>30 &lt; điểm ≤ 50</strong>
                        Khóa tạm thời 14 ngày; hết hạn mở lại và giữ nguyên điểm cũ.
                      </div>
                      <div className="threshold-item">
                        <strong>Điểm ≤ 30 (gồm đúng 30)</strong>
                        Khóa vĩnh viễn có quyền khiếu nại tới Kiểm duyệt viên.
                      </div>
                    </div>
                  </div>

                  {repError ? (
                    <p className="notice notice-error" role="alert">
                      {repError}
                    </p>
                  ) : repLoading ? (
                    <p className="notice" role="status">
                      Đang tải sổ cái điểm uy tín…
                    </p>
                  ) : !repData?.items || repData.items.length === 0 ? (
                    <p className="notice" role="status">
                      Chưa có biến động điểm uy tín nào được ghi nhận.
                    </p>
                  ) : (
                    <>
                      <div className="table-wrap">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>Loại biến động</th>
                              <th>Trước → Sau</th>
                              <th>Thay đổi</th>
                              <th>Lý do</th>
                              <th>Nguồn tham chiếu</th>
                              <th>Thời điểm</th>
                            </tr>
                          </thead>
                          <tbody>
                            {repData.items.map((entry) => (
                              <tr key={entry.id}>
                                <td>
                                  <span className="cell-primary">{formatReputationChangeType(entry.changeType)}</span>
                                  <span className="cell-sub">{entry.changeType}</span>
                                </td>
                                <td className="num-cell">
                                  {entry.scoreBefore} → {entry.scoreAfter}
                                </td>
                                <td className="num-cell">
                                  <span className={entry.delta >= 0 ? 'delta-positive' : 'delta-negative'}>
                                    {entry.delta > 0 ? `+${entry.delta}` : String(entry.delta)}
                                  </span>
                                </td>
                                <td>{entry.reason}</td>
                                <td>
                                  <span className="cell-primary">{entry.referenceSource}</span>
                                  {entry.referenceId && <span className="cell-sub">Mã: {entry.referenceId}</span>}
                                  {entry.actorName && <span className="cell-sub">Thực hiện: {entry.actorName}</span>}
                                </td>
                                <td>{formatDateTime(entry.createdAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="pagination-bar">
                        <span>
                          Trang {repData.page + 1} / {Math.max(1, repData.totalPages)} · Tổng {repData.totalElements}{' '}
                          bản ghi
                        </span>
                        <div className="pagination-actions">
                          <button
                            type="button"
                            className="button button-compact"
                            disabled={repData.page <= 0 || repLoading}
                            onClick={() => setRepPage((p) => Math.max(0, p - 1))}
                          >
                            Trang trước
                          </button>
                          <button
                            type="button"
                            className="button button-compact"
                            disabled={repData.page + 1 >= repData.totalPages || repLoading}
                            onClick={() => setRepPage((p) => p + 1)}
                          >
                            Trang sau
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeTab === 'logs' && (
                <div role="tabpanel" aria-label="Vết kiểm duyệt" style={{ display: 'grid', gap: 16 }}>
                  {logsError ? (
                    <p className="notice notice-error" role="alert">
                      {logsError}
                    </p>
                  ) : logsLoading ? (
                    <p className="notice" role="status">
                      Đang tải nhật ký kiểm duyệt…
                    </p>
                  ) : !logsData?.items || logsData.items.length === 0 ? (
                    <p className="notice" role="status">
                      Chưa có nhật ký kiểm duyệt nào cho tài khoản này.
                    </p>
                  ) : (
                    <>
                      <div className="table-wrap">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>Hành động</th>
                              <th>Người thực hiện</th>
                              <th>Lý do</th>
                              <th>Trạng thái</th>
                              <th>Hạn khóa</th>
                              <th>Khiếu nại</th>
                              <th>Thời điểm</th>
                            </tr>
                          </thead>
                          <tbody>
                            {logsData.items.map((log) => (
                              <tr key={log.id}>
                                <td>
                                  <span className="cell-primary">{formatModerationActionType(log.actionType)}</span>
                                  <span className="cell-sub">{log.actionType}</span>
                                </td>
                                <td>{log.actorName ?? 'Hệ thống'}</td>
                                <td>{log.reason}</td>
                                <td>
                                  {formatAccountStatusLabel(log.previousStatus)} →{' '}
                                  {formatAccountStatusLabel(log.newStatus)}
                                </td>
                                <td>{formatDateTime(log.lockedUntil)}</td>
                                <td>
                                  {log.appealable ? (
                                    <span className="status-badge status-badge-pending">Có quyền khiếu nại</span>
                                  ) : (
                                    'Không'
                                  )}
                                </td>
                                <td>{formatDateTime(log.createdAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="pagination-bar">
                        <span>
                          Trang {logsData.page + 1} / {Math.max(1, logsData.totalPages)} · Tổng {logsData.totalElements}{' '}
                          nhật ký
                        </span>
                        <div className="pagination-actions">
                          <button
                            type="button"
                            className="button button-compact"
                            disabled={logsData.page <= 0 || logsLoading}
                            onClick={() => setLogPage((p) => Math.max(0, p - 1))}
                          >
                            Trang trước
                          </button>
                          <button
                            type="button"
                            className="button button-compact"
                            disabled={logsData.page + 1 >= logsData.totalPages || logsLoading}
                            onClick={() => setLogPage((p) => p + 1)}
                          >
                            Trang sau
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          ) : null}
        </section>
      )}
    </section>
  );
}

import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import type { User } from '../auth/session';
import {
  getAdminUserDetail,
  lockAdminUser,
  unlockAdminUser,
  type AdminUserDetail,
  type LockRequestType,
} from './userAdminApi';
import { formatDateTime, getAccountStatusBadge } from './userFormatters';

export interface UserRestrictionPanelProps {
  currentUser: User;
  detail: AdminUserDetail;
  onRestrictionChanged: (updated: AdminUserDetail) => void | Promise<void>;
  onConflictReload?: (userId: string) => void | Promise<void>;
}

type RestrictionFlowState = 'idle' | 'lock-input' | 'lock-confirm' | 'unlock-input' | 'unlock-confirm';

export default function UserRestrictionPanel({
  currentUser,
  detail,
  onRestrictionChanged,
  onConflictReload,
}: UserRestrictionPanelProps) {
  const [flowState, setFlowState] = useState<RestrictionFlowState>('idle');
  const [lockType, setLockType] = useState<LockRequestType>('TEMPORARY');
  const [durationDays, setDurationDays] = useState('14');
  const [lockReason, setLockReason] = useState('');
  const [estimatedLockedUntil, setEstimatedLockedUntil] = useState<string | null>(null);

  const [unlockReason, setUnlockReason] = useState('');

  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    setFlowState('idle');
    setLockType('TEMPORARY');
    setDurationDays('14');
    setLockReason('');
    setEstimatedLockedUntil(null);
    setUnlockReason('');
    setErrorMessage('');
    setSuccessMessage('');
  }, [detail.id]);

  const isDeactivated = detail.accountStatus === 'VO_HIEU_HOA';
  const isSelf = currentUser.id === detail.id;
  const targetRoles = detail.systemRoles ?? [];
  const isModeratorTargetingPeerOrAdmin =
    !isSelf &&
    currentUser.role === 'moderator' &&
    (targetRoles.includes('MODERATOR') || targetRoles.includes('SENIOR_ADMIN'));

  const guardMessage = isSelf
    ? 'Không thể tự khóa/mở khóa tài khoản của chính mình.'
    : isModeratorTargetingPeerOrAdmin
      ? 'Kiểm duyệt viên không được khóa/mở khóa Kiểm duyệt viên khác hoặc Quản trị viên cấp cao.'
      : isDeactivated
        ? 'Tài khoản đã bị xóa/vô hiệu hóa, không thể thực hiện khóa hoặc mở khóa.'
        : '';

  const controlsDisabled = Boolean(guardMessage) || busy;
  const isLocked = detail.accountStatus === 'BI_KHOA';
  const statusBadge = getAccountStatusBadge(detail.accountStatus, detail.restrictionType);
  const restoredStatusLabel =
    detail.emailVerified && detail.profileApproved ? 'Hoạt động' : 'Chờ kích hoạt';

  async function triggerConflictReload() {
    try {
      if (onConflictReload) {
        await onConflictReload(detail.id);
      } else {
        const fresh = await getAdminUserDetail(detail.id);
        if (fresh && typeof fresh.id === 'string') {
          await onRestrictionChanged(fresh);
        }
      }
    } catch {
      // Preserve conflict error alert even if background reload encounters an error
    }
  }

  function openLockFlow() {
    setErrorMessage('');
    setSuccessMessage('');
    setLockType('TEMPORARY');
    setDurationDays('14');
    setLockReason('');
    setEstimatedLockedUntil(null);
    setFlowState('lock-input');
  }

  function openUnlockFlow() {
    setErrorMessage('');
    setSuccessMessage('');
    setUnlockReason('');
    setFlowState('unlock-input');
  }

  function cancelFlow() {
    setFlowState('idle');
    setLockType('TEMPORARY');
    setDurationDays('14');
    setLockReason('');
    setEstimatedLockedUntil(null);
    setUnlockReason('');
    setErrorMessage('');
  }

  function handleLockContinue(event: FormEvent) {
    event.preventDefault();
    if (guardMessage) return;
    setErrorMessage('');
    setSuccessMessage('');

    const trimmedReason = lockReason.trim();
    if (lockType === 'TEMPORARY') {
      const num = Number(durationDays);
      if (durationDays.trim() === '' || !Number.isInteger(num) || num < 1 || num > 365) {
        setErrorMessage('Số ngày khóa tạm thời phải là số nguyên từ 1 đến 365 ngày.');
        return;
      }
      setEstimatedLockedUntil(new Date(Date.now() + num * 24 * 60 * 60 * 1000).toISOString());
    } else {
      setEstimatedLockedUntil(null);
    }

    if (!trimmedReason) {
      setErrorMessage('Vui lòng nhập lý do khóa tài khoản.');
      return;
    }
    if (trimmedReason.length > 1000) {
      setErrorMessage('Lý do khóa tài khoản không được vượt quá 1000 ký tự.');
      return;
    }

    setFlowState('lock-confirm');
  }

  async function handleLockConfirm() {
    if (guardMessage) return;
    setErrorMessage('');
    setSuccessMessage('');

    const trimmedReason = lockReason.trim();
    const parsedDuration = lockType === 'TEMPORARY' ? Number(durationDays) : undefined;

    setBusy(true);
    try {
      const updated = await lockAdminUser(detail.id, {
        lockType,
        ...(lockType === 'TEMPORARY' ? { durationDays: parsedDuration } : { appealable: true }),
        reason: trimmedReason,
        expectedVersion: detail.version,
      });
      setFlowState('idle');
      setLockReason('');
      setEstimatedLockedUntil(null);
      setSuccessMessage(
        lockType === 'PERMANENT'
          ? 'Đã khóa vĩnh viễn tài khoản (bảo lưu quyền khiếu nại).'
          : `Đã khóa tạm thời tài khoản trong ${parsedDuration} ngày.`,
      );
      await onRestrictionChanged(updated);
    } catch (cause) {
      setFlowState('idle');
      if (cause instanceof ApiError && cause.status === 409) {
        await triggerConflictReload();
        setErrorMessage(`${cause.message} Đã tự động tải lại thông tin tài khoản mới nhất.`);
      } else {
        setErrorMessage((cause as Error).message || 'Không thể khóa tài khoản.');
      }
    } finally {
      setBusy(false);
    }
  }

  function handleUnlockContinue(event: FormEvent) {
    event.preventDefault();
    if (guardMessage) return;
    setErrorMessage('');
    setSuccessMessage('');

    const trimmedReason = unlockReason.trim();
    if (!trimmedReason) {
      setErrorMessage('Vui lòng nhập lý do mở khóa tài khoản.');
      return;
    }
    if (trimmedReason.length > 1000) {
      setErrorMessage('Lý do mở khóa tài khoản không được vượt quá 1000 ký tự.');
      return;
    }

    setFlowState('unlock-confirm');
  }

  async function handleUnlockConfirm() {
    if (guardMessage) return;
    setErrorMessage('');
    setSuccessMessage('');

    const trimmedReason = unlockReason.trim();
    setBusy(true);
    try {
      const updated = await unlockAdminUser(detail.id, {
        reason: trimmedReason,
        expectedVersion: detail.version,
      });
      setFlowState('idle');
      setUnlockReason('');
      setSuccessMessage('Đã mở khóa tài khoản thành công.');
      await onRestrictionChanged(updated);
    } catch (cause) {
      setFlowState('idle');
      if (cause instanceof ApiError && cause.status === 409) {
        await triggerConflictReload();
        setErrorMessage(`${cause.message} Trạng thái đã thay đổi; đã tự động tải lại thông tin tài khoản.`);
      } else {
        setErrorMessage((cause as Error).message || 'Không thể mở khóa tài khoản.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="restriction-section" aria-label="Kiểm soát hạn chế tài khoản">
      <div className="restriction-banner-header">
        <div>
          <p className="eyebrow" style={{ marginBottom: 6 }}>
            QUẢN LÝ TRẠNG THÁI HẠN CHẾ (UC-13, UC-14)
          </p>
          <h3 style={{ margin: 0 }}>Khóa & mở khóa tài khoản</h3>
        </div>

        {flowState === 'idle' && (
          <div className="form-actions-inline">
            <button
              type="button"
              className="button button-danger button-compact"
              disabled={controlsDisabled}
              onClick={openLockFlow}
            >
              Khóa tài khoản
            </button>
            {isLocked && (
              <button
                type="button"
                className="button button-primary button-compact"
                disabled={controlsDisabled}
                onClick={openUnlockFlow}
              >
                Mở khóa tài khoản
              </button>
            )}
          </div>
        )}
      </div>

      {isLocked && (
        <div className="restriction-banner" aria-label="Trạng thái hạn chế hiện tại">
          <div className="restriction-banner-header">
            <h3>Quyết định khóa đang có hiệu lực</h3>
            <div className="badge-group">
              <span className={statusBadge.className}>{statusBadge.label}</span>
              {detail.appealable && (
                <span className="status-badge status-badge-appeal">Có quyền khiếu nại</span>
              )}
            </div>
          </div>
          <dl className="meta-list">
            <div>
              <dt>Hình thức hạn chế</dt>
              <dd>
                {detail.restrictionType === 'KHOA_VINH_VIEN'
                  ? 'Khóa vĩnh viễn (KHOA_VINH_VIEN)'
                  : detail.restrictionType === 'KHOA_TAM_THOI'
                    ? 'Khóa tạm thời (KHOA_TAM_THOI)'
                    : 'Đang bị khóa'}
              </dd>
            </div>
            <div>
              <dt>Hiệu lực khóa đến</dt>
              <dd>
                {detail.lockedUntil ? formatDateTime(detail.lockedUntil) : 'Không có mốc tự mở khóa (khóa vĩnh viễn)'}
              </dd>
            </div>
            <div>
              <dt>Điểm uy tín hiện tại</dt>
              <dd>{detail.reputationScore}</dd>
            </div>
            <div>
              <dt>Lý do hạn chế</dt>
              <dd>{detail.restrictionReason || 'Chưa ghi nhận lý do'}</dd>
            </div>
          </dl>
        </div>
      )}

      {guardMessage && (
        <p className="notice notice-error" role="note">
          {guardMessage}
        </p>
      )}
      {successMessage && (
        <p className="notice notice-success" role="status">
          {successMessage}
        </p>
      )}
      {flowState === 'idle' && errorMessage && (
        <p className="notice notice-error" role="alert">
          {errorMessage}
        </p>
      )}

      {(flowState === 'lock-input' || flowState === 'lock-confirm') && (
        <section className="account-card" aria-label="Biểu mẫu khóa tài khoản">
          <p className="eyebrow">ÁP DỤNG HẠN CHẾ (UC-13)</p>
          <h3>Khóa tài khoản</h3>
          <p className="form-help" style={{ marginBottom: 16 }}>
            Chọn hình thức khóa và nhập lý do cụ thể trước khi xác nhận áp dụng chế tài.
          </p>

          {flowState === 'lock-input' ? (
            <form className="admin-form" onSubmit={handleLockContinue} noValidate>
              <div className="radio-group" role="radiogroup" aria-label="Hình thức khóa tài khoản">
                <label className={`radio-option ${lockType === 'TEMPORARY' ? 'radio-option-active' : ''}`}>
                  <input
                    type="radio"
                    name="lock-type"
                    value="TEMPORARY"
                    checked={lockType === 'TEMPORARY'}
                    disabled={controlsDisabled}
                    onChange={() => setLockType('TEMPORARY')}
                  />
                  Khóa tạm thời
                </label>
                <label className={`radio-option ${lockType === 'PERMANENT' ? 'radio-option-active' : ''}`}>
                  <input
                    type="radio"
                    name="lock-type"
                    value="PERMANENT"
                    checked={lockType === 'PERMANENT'}
                    disabled={controlsDisabled}
                    onChange={() => setLockType('PERMANENT')}
                  />
                  Khóa vĩnh viễn
                </label>
              </div>

              {lockType === 'TEMPORARY' ? (
                <label htmlFor="lock-duration-days">
                  Số ngày khóa tạm thời (1–365 ngày) *
                  <input
                    id="lock-duration-days"
                    type="number"
                    min={1}
                    max={365}
                    value={durationDays}
                    disabled={controlsDisabled}
                    onChange={(e) => setDurationDays(e.target.value)}
                  />
                </label>
              ) : (
                <p className="notice">
                  Theo quy định FR-12, khóa vĩnh viễn không có mốc tự mở khóa và bảo lưu quyền gửi khiếu nại kèm bằng
                  chứng của thành viên.
                </p>
              )}

              <label htmlFor="lock-reason">
                Lý do khóa tài khoản *
                <textarea
                  id="lock-reason"
                  placeholder="Nêu rõ hành vi vi phạm và căn cứ xử lý..."
                  value={lockReason}
                  disabled={controlsDisabled}
                  onChange={(e) => setLockReason(e.target.value)}
                />
              </label>

              {errorMessage && (
                <p className="notice notice-error" role="alert">
                  {errorMessage}
                </p>
              )}

              <div className="form-actions-inline">
                <button type="submit" className="button button-danger" disabled={controlsDisabled}>
                  Tiếp tục
                </button>
                <button type="button" className="button" disabled={controlsDisabled} onClick={cancelFlow}>
                  Hủy
                </button>
              </div>
            </form>
          ) : (
            <div className="admin-form" aria-label="Xác nhận quyết định khóa">
              <div className="confirm-summary">
                <h4>Tóm tắt quyết định khóa tài khoản</h4>
                <dl className="meta-list">
                  <div>
                    <dt>Trạng thái đích</dt>
                    <dd>
                      {lockType === 'PERMANENT'
                        ? 'Bị khóa — Khóa vĩnh viễn'
                        : `Bị khóa — Khóa tạm thời (${durationDays} ngày)`}
                    </dd>
                  </div>
                  <div>
                    <dt>Mốc thời gian kết thúc khóa dự kiến</dt>
                    <dd>
                      {lockType === 'PERMANENT' ? (
                        <span>
                          Không có mốc tự mở khóa ·{' '}
                          <span className="status-badge status-badge-appeal">Có quyền khiếu nại</span>
                        </span>
                      ) : (
                        formatDateTime(estimatedLockedUntil)
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Lý do khóa</dt>
                    <dd>{lockReason.trim()}</dd>
                  </div>
                </dl>
              </div>

              {errorMessage && (
                <p className="notice notice-error" role="alert">
                  {errorMessage}
                </p>
              )}

              <div className="form-actions-inline">
                <button
                  type="button"
                  className="button button-danger"
                  disabled={controlsDisabled}
                  onClick={() => void handleLockConfirm()}
                >
                  {busy ? 'Đang khóa tài khoản…' : 'Xác nhận khóa'}
                </button>
                <button type="button" className="button" disabled={busy} onClick={cancelFlow}>
                  Hủy
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {(flowState === 'unlock-input' || flowState === 'unlock-confirm') && (
        <section className="account-card" aria-label="Biểu mẫu mở khóa tài khoản">
          <p className="eyebrow">KHÔI PHỤC TRUY CẬP (UC-14)</p>
          <h3>Mở khóa tài khoản</h3>
          <p className="form-help" style={{ marginBottom: 16 }}>
            Kết thúc hiệu lực quyết định khóa hiện hành; điểm uy tín hiện tại ({detail.reputationScore}) được giữ
            nguyên theo FR-12.
          </p>

          {flowState === 'unlock-input' ? (
            <form className="admin-form" onSubmit={handleUnlockContinue} noValidate>
              <label htmlFor="unlock-reason">
                Lý do mở khóa tài khoản *
                <textarea
                  id="unlock-reason"
                  placeholder="Ghi rõ kết quả xác minh khiếu nại hoặc căn cứ mở khóa..."
                  value={unlockReason}
                  disabled={controlsDisabled}
                  onChange={(e) => setUnlockReason(e.target.value)}
                />
              </label>

              {errorMessage && (
                <p className="notice notice-error" role="alert">
                  {errorMessage}
                </p>
              )}

              <div className="form-actions-inline">
                <button type="submit" className="button button-primary" disabled={controlsDisabled}>
                  Tiếp tục
                </button>
                <button type="button" className="button" disabled={controlsDisabled} onClick={cancelFlow}>
                  Hủy
                </button>
              </div>
            </form>
          ) : (
            <div className="admin-form" aria-label="Xác nhận quyết định mở khóa">
              <div className="confirm-summary">
                <h4>Xác nhận quyết định mở khóa tài khoản</h4>
                <dl className="meta-list">
                  <div>
                    <dt>Trạng thái quyền sẽ khôi phục</dt>
                    <dd>{restoredStatusLabel}</dd>
                  </div>
                  <div>
                    <dt>Điểm uy tín sau mở khóa</dt>
                    <dd>{detail.reputationScore} (giữ nguyên)</dd>
                  </div>
                  <div>
                    <dt>Lý do mở khóa</dt>
                    <dd>{unlockReason.trim()}</dd>
                  </div>
                </dl>
              </div>

              {errorMessage && (
                <p className="notice notice-error" role="alert">
                  {errorMessage}
                </p>
              )}

              <div className="form-actions-inline">
                <button
                  type="button"
                  className="button button-primary"
                  disabled={controlsDisabled}
                  onClick={() => void handleUnlockConfirm()}
                >
                  {busy ? 'Đang mở khóa…' : 'Xác nhận mở khóa'}
                </button>
                <button type="button" className="button" disabled={busy} onClick={cancelFlow}>
                  Hủy
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </section>
  );
}

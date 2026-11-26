import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { adminProfiles, type Profile } from '../profiles/api';

const MIN_REASON = 3;
const MAX_REASON = 1000;

export default function ProfileDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [cardUrl, setCardUrl] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reasonError, setReasonError] = useState('');
  // Tách khỏi `error` vì `load()` xóa `error` mỗi lần chạy và sẽ nuốt mất thông báo xung đột.
  const [stale, setStale] = useState('');

  const [refresh, setRefresh] = useState(0);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      // Server trả 409 ở bước quyết định nếu người khác đã xử lý; chi tiết luôn đọc được để trang không kẹt.
      const fresh = await adminProfiles.detail(id);
      setProfile(fresh);
      setCardUrl(fresh.hasStudentCard ? await adminProfiles.cardUrl(id) : null);
    } catch (cause) {
      const status = cause instanceof ApiError ? cause.status : 0;
      setError(status === 404 ? 'Hồ sơ không tồn tại.' : (cause as Error).message);
    } finally { setLoading(false); }
  }, [id, refresh]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { if (cardUrl) URL.revokeObjectURL(cardUrl); }, [cardUrl]);

  async function decide(action: 'approve' | 'reject') {
    if (!profile) return;
    setBusy(true); setError(''); setReasonError('');
    try {
      if (action === 'approve') await adminProfiles.approve(id);
      else {
        const trimmed = reason.trim();
        if (trimmed.length < MIN_REASON || trimmed.length > MAX_REASON) { setReasonError(`Lý do từ chối cần ${MIN_REASON}–${MAX_REASON} ký tự.`); return; }
        await adminProfiles.reject(id, trimmed);
      }
      navigate('/profiles', { replace: true, state: { done: action === 'approve' ? 'Đã chấp thuận hồ sơ.' : 'Đã từ chối hồ sơ và gửi email thông báo.' } });
    } catch (cause) {
      const status = cause instanceof ApiError ? cause.status : 0;
      if (status === 409) {
        setRejecting(false);
        setStale('Hồ sơ đã được người khác xử lý. Thông tin vừa được làm mới.');
        setRefresh((value) => value + 1);
      } else if (status === 400) setReasonError((cause as Error).message);
      else setError((cause as Error).message);
    } finally { setBusy(false); }
  }

  if (loading) return <section className="page-content"><p role="status">Đang tải hồ sơ…</p></section>;
  if (!profile) return <section className="page-content">
    <p className="notice notice-error" role="alert">{error || 'Không tìm thấy hồ sơ.'}</p>
    <button className="button" onClick={() => navigate('/profiles')}>Quay lại danh sách</button>
  </section>;

  const rows: [string, string | null][] = [
    ['Họ tên', profile.name], ['MSSV', profile.studentId], ['Email', profile.email], ['Số điện thoại', profile.phone],
    ['Trường', profile.school], ['Cơ sở', profile.campus], ['Ngành học', profile.major], ['Niên khóa', profile.cohort],
  ];
  // Hồ sơ đã xử lý (duyệt hoặc từ chối) không quyết định lại được, server sẽ trả 409.
  const decidable = profile.profileStatus === 'CHO_DUYET';
  return <section className="page-content profile-detail">
    <header className="page-heading"><h1>{profile.name}</h1></header>
    {stale && <p className="notice notice-error" role="alert">{stale}</p>}
    {error && <p className="notice notice-error" role="alert">{error}</p>}
    <div className="profile-detail-grid">
      <div className="account-card">
        <dl className="account-details">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Chưa cập nhật'}</dd></div>)}</dl>
        <p className="form-help">Điểm uy tín hiện tại {profile.reputation} · Trạng thái {profile.profileStatus}</p>
        {profile.rejectReason && <p className="notice">Lý do từ chối gần nhất: {profile.rejectReason}</p>}
      </div>
      <div className="account-card">
        <h2>Ảnh thẻ sinh viên</h2>
        {cardUrl ? <a className="card-link" href={cardUrl} target="_blank" rel="noreferrer">
          <img className="card-image" src={cardUrl} alt={`Ảnh thẻ của ${profile.name}`} />
          <span className="form-help">Mở ảnh ở kích thước đầy đủ</span>
        </a> : <p className="notice">Người dùng chưa tải ảnh thẻ.</p>}
        {rejecting ? <div className="reject-box">
          <label htmlFor="reject-reason">Lý do từ chối ({MIN_REASON}–{MAX_REASON} ký tự)
            <textarea id="reject-reason" rows={4} maxLength={MAX_REASON} value={reason} disabled={busy}
              aria-invalid={!!reasonError} aria-describedby={reasonError ? 'reject-reason-error' : undefined}
              onChange={(e) => { setReason(e.target.value); setReasonError(''); }} />
          </label>
          {reasonError && <p className="error" id="reject-reason-error" role="alert">{reasonError}</p>}
          <div className="form-options">
            <button className="button button-primary" data-testid="confirm-reject" disabled={busy} onClick={() => void decide('reject')}>{busy ? 'Đang gửi…' : 'Xác nhận từ chối'}</button>
            <button className="button" type="button" disabled={busy} onClick={() => { setRejecting(false); setReasonError(''); }}>Huỷ</button>
          </div>
        </div> : <>
          <button className="button button-primary" data-testid="approve" disabled={busy || !decidable} onClick={() => void decide('approve')}>{busy ? 'Đang xử lý…' : 'Chấp thuận'}</button>
          <button className="button" data-testid="reject" disabled={busy || !decidable} onClick={() => setRejecting(true)}>Từ chối</button>
        </>}
        {!decidable && <p className="notice">Hồ sơ này đã được xử lý nên không thể duyệt hay từ chối lại.</p>}
        <button className="button" disabled={busy} onClick={() => navigate('/profiles')}>Quay lại</button>
      </div>
    </div>
  </section>;
}

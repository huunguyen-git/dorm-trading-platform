import { useEffect, useState, type FormEvent } from 'react';
import { api as request } from '../api/client';
import { dateTime, Dialog, errorMessage, isConflict, LoadState, Pagination, usePage } from './shared';
import {
  pageSize,
  reportsApi,
  type ActivePenalty,
  type DuplicateCandidate,
  type ReportGroup,
  type ReportGroupDetail,
  type ResolveResult,
} from './types';

const TARGET_LABEL: Record<string, string> = {
  NGUOI_DUNG: 'Người dùng',
  TIN_DANG: 'Tin đăng',
};

const CONCLUSION_LABEL: Record<string, string> = {
  VI_PHAM: 'Vi phạm',
  KHONG_VI_PHAM: 'Không vi phạm',
  KHONG_HOP_LE: 'Không hợp lệ',
  TRUNG: 'Trùng',
};

export default function ReportsModerationPage() {
  const [status, setStatus] = useState<'CHO_XU_LY' | 'DA_XU_LY'>('CHO_XU_LY');
  const [targetType, setTargetType] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [tick, setTick] = useState(0);
  const [banner, setBanner] = useState('');
  const [selected, setSelected] = useState<ReportGroup | null>(null);
  const [detail, setDetail] = useState<ReportGroupDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const [penalties, setPenalties] = useState<ActivePenalty[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);
  const [conclusion, setConclusion] = useState<'VI_PHAM' | 'KHONG_VI_PHAM' | 'KHONG_HOP_LE' | 'TRUNG'>('VI_PHAM');
  const [penaltyId, setPenaltyId] = useState('');
  const [originalDecisionId, setOriginalDecisionId] = useState('');
  const [basis, setBasis] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const params = new URLSearchParams({
    status,
    page: String(page),
    size: String(pageSize),
  });
  if (targetType) params.set('targetType', targetType);
  if (q.trim()) params.set('q', q.trim());
  const state = usePage<ReportGroup>(`${reportsApi}/groups?${params.toString()}`, tick);

  useEffect(() => {
    setPage(0);
  }, [status, targetType, q]);

  async function openGroup(group: ReportGroup) {
    setSelected(group);
    setDetail(null);
    setDetailError('');
    setSubmitError('');
    setConclusion('VI_PHAM');
    setBasis('');
    setOriginalDecisionId('');
    setDetailLoading(true);
    try {
      const params = new URLSearchParams({
        targetType: group.targetType,
        targetId: group.targetId,
        category: group.category,
        status: group.status,
      });
      if (group.decisionId) params.set('decisionId', group.decisionId);
      const detailPromise = request<ReportGroupDetail>(`${reportsApi}/groups/detail?${params.toString()}`);
      if (group.status === 'CHO_XU_LY') {
        const [d, p, dup] = await Promise.all([
          detailPromise,
          request<ActivePenalty[]>(`${reportsApi}/penalties`),
          request<DuplicateCandidate[]>(`${reportsApi}/duplicate-candidates`),
        ]);
        setDetail(d);
        setPenalties(p);
        setPenaltyId(p[0]?.id ?? '');
        setDuplicates(dup);
        setOriginalDecisionId(dup[0]?.decisionId ?? '');
      } else {
        setDetail(await detailPromise);
      }
    } catch (e) {
      setDetailError(errorMessage(e));
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDialog() {
    if (submitting) return;
    setSelected(null);
    setDetail(null);
    setDetailError('');
    setSubmitError('');
  }

  async function handleResolve(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const result = await request<ResolveResult>(`${reportsApi}/groups/resolve`, {
        method: 'POST',
        body: JSON.stringify({
          targetType: selected.targetType,
          targetId: selected.targetId,
          category: selected.category,
          conclusion,
          penaltyId: conclusion === 'VI_PHAM' ? penaltyId : null,
          basis: basis.trim(),
          originalDecisionId: conclusion === 'TRUNG' ? originalDecisionId : null,
        }),
      });
      const notes = [`Đã xử lý ${result.updatedReportCount} báo cáo (${CONCLUSION_LABEL[result.conclusion] ?? result.conclusion}).`];
      if (result.penaltyApplied && result.scoreAfter !== null) {
        notes.push(`Điểm uy tín sau trừ: ${result.scoreAfter} (${result.accountStatusAfter ?? ''}).`);
      }
      if (result.listingHidden) {
        notes.push('Tin đăng vi phạm đã được ẩn.');
      }
      setBanner(notes.join(' '));
      setSelected(null);
      setDetail(null);
      setTick((t) => t + 1);
    } catch (err) {
      setSubmitError(errorMessage(err));
      if (isConflict(err)) {
        setTick((t) => t + 1);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="page-content">
      <header className="page-heading">
        <h1>Kiểm duyệt báo cáo</h1>
      </header>

      {banner && (
        <p className="notice" role="status">
          {banner}
        </p>
      )}

      <div className="toolbar">
        <div className="field">
          <label htmlFor="report-status">Trạng thái</label>
          <select
            id="report-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as 'CHO_XU_LY' | 'DA_XU_LY')}
          >
            <option value="CHO_XU_LY">Chờ xử lý</option>
            <option value="DA_XU_LY">Đã xử lý</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="report-target-type">Đối tượng</label>
          <select
            id="report-target-type"
            value={targetType}
            onChange={(e) => setTargetType(e.target.value)}
          >
            <option value="">Tất cả</option>
            <option value="TIN_DANG">Tin đăng</option>
            <option value="NGUOI_DUNG">Người dùng</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="report-search">Tìm kiếm</label>
          <input
            id="report-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tên, MSSV, tiêu đề hoặc danh mục…"
          />
        </div>
      </div>

      <LoadState
        loading={state.loading}
        error={state.error}
        empty={!state.loading && !state.error && (!state.data || state.data.items.length === 0)}
        emptyText="Không có nhóm báo cáo nào phù hợp."
        reload={() => setTick((t) => t + 1)}
      />

      {state.data && state.data.items.length > 0 && (
        <>
          <table className="data-table">
              <thead>
                <tr>
                  <th>Đối tượng</th>
                  <th>Danh mục vi phạm</th>
                  <th>Số báo cáo</th>
                  <th>Gần nhất</th>
                  <th>Kết luận</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {state.data.items.map((group) => (
                  <tr key={`${group.targetType}-${group.targetId}-${group.category}-${group.status}-${group.decisionId ?? 'pending'}`}>
                    <td>
                      <strong>{group.targetLabel}</strong>
                      <div>
                        <small>
                          {TARGET_LABEL[group.targetType] ?? group.targetType} · {group.targetStatus}
                        </small>
                      </div>
                    </td>
                    <td>{group.category}</td>
                    <td>{group.reportCount}</td>
                    <td>{dateTime(group.latestReportAt)}</td>
                    <td>
                      {group.decision
                        ? `${CONCLUSION_LABEL[group.decision.conclusion] ?? group.decision.conclusion}${
                            group.decision.penaltyName ? ` (${group.decision.penaltyName})` : ''
                          }`
                        : 'Chờ xử lý'}
                    </td>
                    <td>
                      <button type="button" className="button" onClick={() => void openGroup(group)}>
                        {group.status === 'CHO_XU_LY' ? 'Xem & xử lý' : 'Xem chi tiết'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
          </table>
          <Pagination
            page={page}
            data={state.data}
            loading={state.loading}
            onPage={setPage}
            label="Phân trang nhóm báo cáo"
          />
        </>
      )}

      {selected && (
        <Dialog
          title={`Nhóm báo cáo: ${selected.targetLabel}`}
          busy={submitting}
          onClose={closeDialog}
        >
          {detailLoading && (
            <p className="notice" role="status">
              Đang tải chi tiết báo cáo…
            </p>
          )}
          {detailError && (
            <p className="notice notice-error" role="alert">
              {detailError}
            </p>
          )}
          {detail && (
            <div className="stack">
              <p>
                <strong>Loại:</strong> {TARGET_LABEL[detail.targetType] ?? detail.targetType} ·{' '}
                <strong>Danh mục:</strong> {detail.category} ·{' '}
                <strong>Trạng thái đối tượng:</strong> {detail.targetStatus}
              </p>

              <h3>Danh sách báo cáo trong nhóm ({detail.reports.length})</h3>
              <ul className="report-items">
                {detail.reports.map((item) => (
                  <li key={item.reportId}>
                    <div>
                      <strong>
                        {item.reporterName} ({item.reporterStudentId})
                      </strong>{' '}
                      · <small>{dateTime(item.createdAt)}</small>
                    </div>
                    <p>{item.description}</p>
                    {item.evidence.length > 0 && (
                      <small>Bằng chứng: {item.evidence.join(', ')}</small>
                    )}
                  </li>
                ))}
              </ul>

              {detail.decision ? (
                <section className="decision-summary">
                  <h3>Quyết định đã ghi nhận</h3>
                  <p>
                    <strong>Kết luận:</strong>{' '}
                    {CONCLUSION_LABEL[detail.decision.conclusion] ?? detail.decision.conclusion}
                  </p>
                  {detail.decision.penaltyName && (
                    <p>
                      <strong>Mức phạt:</strong> {detail.decision.penaltyName} (-
                      {detail.decision.penaltyPoints} điểm)
                    </p>
                  )}
                  <p>
                    <strong>Căn cứ:</strong> {detail.decision.basis}
                  </p>
                  <p>
                    <strong>Người xử lý:</strong> {detail.decision.moderatorName} ·{' '}
                    {dateTime(detail.decision.decidedAt)}
                  </p>
                </section>
              ) : (
                <form className="stack" onSubmit={(e) => void handleResolve(e)}>
                  <h3>Ra quyết định xử lý nhóm</h3>
                  {submitError && (
                    <p className="notice notice-error" role="alert">
                      {submitError}
                    </p>
                  )}

                  <div className="field">
                    <label htmlFor="resolve-conclusion">Kết luận</label>
                    <select
                      id="resolve-conclusion"
                      value={conclusion}
                      onChange={(e) =>
                        setConclusion(
                          e.target.value as 'VI_PHAM' | 'KHONG_VI_PHAM' | 'KHONG_HOP_LE' | 'TRUNG',
                        )
                      }
                    >
                      <option value="VI_PHAM">Vi phạm</option>
                      <option value="KHONG_VI_PHAM">Không vi phạm</option>
                      <option value="KHONG_HOP_LE">Không hợp lệ</option>
                      <option value="TRUNG">Trùng</option>
                    </select>
                  </div>

                  {conclusion === 'VI_PHAM' && (
                    <div className="field">
                      <label htmlFor="resolve-penalty">Mức phạt</label>
                      <select
                        id="resolve-penalty"
                        value={penaltyId}
                        onChange={(e) => setPenaltyId(e.target.value)}
                        required
                      >
                        {penalties.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} (-{p.points} điểm)
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {conclusion === 'TRUNG' && (
                    <div className="field">
                      <label htmlFor="resolve-original">Quyết định gốc</label>
                      <select
                        id="resolve-original"
                        value={originalDecisionId}
                        onChange={(e) => setOriginalDecisionId(e.target.value)}
                        required
                      >
                        {duplicates.length === 0 ? (
                          <option value="">Chưa có quyết định gốc</option>
                        ) : (
                          duplicates.map((d) => (
                            <option key={d.decisionId} value={d.decisionId}>
                              {d.targetLabel} · {d.category} ({CONCLUSION_LABEL[d.conclusion] ?? d.conclusion})
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                  )}

                  <div className="field">
                    <label htmlFor="resolve-basis">
                      Căn cứ xử lý{conclusion === 'TRUNG' ? ' (tùy chọn)' : ''}
                    </label>
                    <textarea
                      id="resolve-basis"
                      rows={3}
                      maxLength={conclusion === 'VI_PHAM' ? 1000 : 2000}
                      value={basis}
                      onChange={(e) => setBasis(e.target.value)}
                      required={conclusion !== 'TRUNG'}
                      placeholder="Nhập căn cứ / lý do xử lý…"
                    />
                  </div>

                  <div className="actions">
                    <button type="button" className="button" onClick={closeDialog} disabled={submitting}>
                      Đóng
                    </button>
                    <button type="submit" className="button button-primary" disabled={submitting}>
                      {submitting ? 'Đang lưu…' : 'Xác nhận quyết định'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </Dialog>
      )}
    </section>
  );
}

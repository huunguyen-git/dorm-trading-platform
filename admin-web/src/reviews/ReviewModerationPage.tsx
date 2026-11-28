import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import {
  decideComplaint,
  decideLowStarReview,
  fetchCaseDetail,
  fetchChatEvidenceJson,
  fetchImageEvidenceBlob,
  fetchModerationQueue,
} from './api';
import type {
  AdminEvidenceItem,
  ChatLogSnapshot,
  ModerationCaseDetail,
  ModerationCaseType,
  ModerationQueueItem,
} from './types';
import './reviews.css';

type FilterTab = 'PENDING_ALL' | 'PENDING_COMPLAINT' | 'PENDING_LOW_STAR' | 'PROCESSED';

interface LoadedEvidenceState {
  loading: boolean;
  error?: string;
  imageUrl?: string;
  chatLog?: ChatLogSnapshot;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('vi-VN');
}

function formatCurrency(vnd: number): string {
  return `${vnd.toLocaleString('vi-VN')}đ`;
}

function conclusionLabel(code: string | null | undefined): string {
  switch (code) {
    case 'CHAP_NHAN_KHIEU_NAI':
      return 'Chấp nhận khiếu nại (đã gỡ & đảo điểm)';
    case 'BAC_KHIEU_NAI':
      return 'Bác khiếu nại (giữ nguyên đánh giá)';
    case 'CHAP_NHAN_DANH_GIA':
      return 'Chấp nhận đánh giá (đã công khai & trừ điểm)';
    case 'BAC_DANH_GIA':
      return 'Bác đánh giá (không trừ điểm)';
    default:
      return code || '—';
  }
}

function sourceLabel(source: AdminEvidenceItem['source']): string {
  switch (source) {
    case 'KHIEU_NAI_NGUOI_BAN':
      return 'Bằng chứng Người bán (khiếu nại)';
    case 'DANH_GIA_NGUOI_MUA':
      return 'Bằng chứng Người mua (đánh giá)';
    case 'BO_SUNG':
      return 'Bằng chứng bổ sung';
  }
}

export default function ReviewModerationPage() {
  const [tab, setTab] = useState<FilterTab>('PENDING_ALL');
  const [queue, setQueue] = useState<ModerationQueueItem[]>([]);
  const [queueTotal, setQueueTotal] = useState(0);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState('');

  const [selectedKey, setSelectedKey] = useState<{ caseType: ModerationCaseType; caseId: string } | null>(null);
  const [detail, setDetail] = useState<ModerationCaseDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const [evidenceMap, setEvidenceMap] = useState<Record<string, LoadedEvidenceState>>({});

  const [rationale, setRationale] = useState('');
  const [targetParty, setTargetParty] = useState<'SELLER' | 'BUYER'>('SELLER');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    setQueueError('');
    const type: 'ALL' | ModerationCaseType =
      tab === 'PENDING_COMPLAINT'
        ? 'COMPLAINT'
        : tab === 'PENDING_LOW_STAR'
          ? 'LOW_STAR_REVIEW'
          : 'ALL';
    const status: 'PENDING' | 'PROCESSED' = tab === 'PROCESSED' ? 'PROCESSED' : 'PENDING';
    try {
      const page = await fetchModerationQueue(type, status, 0, 50);
      setQueue(page.items);
      setQueueTotal(page.total);
    } catch (err) {
      setQueueError(err instanceof Error ? err.message : 'Không tải được danh sách kiểm duyệt đánh giá.');
    } finally {
      setQueueLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    setSelectedKey(null);
    setDetail(null);
    setActionError('');
    setActionSuccess('');
    void loadQueue();
  }, [loadQueue]);

  const loadSingleEvidence = useCallback(async (item: AdminEvidenceItem) => {
    setEvidenceMap((prev) => ({ ...prev, [item.id]: { loading: true } }));
    try {
      if (item.type === 'NHAT_KY_CHAT') {
        const chatLog = await fetchChatEvidenceJson(item.id);
        setEvidenceMap((prev) => ({ ...prev, [item.id]: { loading: false, chatLog } }));
      } else {
        const blob = await fetchImageEvidenceBlob(item.id);
        if (!blob) {
          setEvidenceMap((prev) => ({
            ...prev,
            [item.id]: { loading: false, error: 'Không tìm thấy tệp bằng chứng.' },
          }));
          return;
        }
        const imageUrl = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : '';
        setEvidenceMap((prev) => ({ ...prev, [item.id]: { loading: false, imageUrl } }));
      }
    } catch (err) {
      setEvidenceMap((prev) => ({
        ...prev,
        [item.id]: {
          loading: false,
          error: err instanceof Error ? err.message : 'Không tải được bằng chứng. Vui lòng thử tải lại.',
        },
      }));
    }
  }, []);

  const loadDetail = useCallback(
    async (caseType: ModerationCaseType, caseId: string) => {
      setDetailLoading(true);
      setDetailError('');
      setActionError('');
      setRationale('');
      setEvidenceMap((prev) => {
        Object.values(prev).forEach((entry) => {
          if (entry.imageUrl && typeof URL.revokeObjectURL === 'function') {
            URL.revokeObjectURL(entry.imageUrl);
          }
        });
        return {};
      });
      try {
        const data = await fetchCaseDetail(caseType, caseId);
        setDetail(data);
        setTargetParty(caseType === 'COMPLAINT' ? 'SELLER' : 'BUYER');
        for (const ev of data.evidences) {
          void loadSingleEvidence(ev);
        }
      } catch (err) {
        setDetail(null);
        setDetailError(err instanceof Error ? err.message : 'Không tải được chi tiết hồ sơ.');
      } finally {
        setDetailLoading(false);
      }
    },
    [loadSingleEvidence],
  );

  useEffect(() => {
    if (selectedKey) {
      void loadDetail(selectedKey.caseType, selectedKey.caseId);
    }
  }, [selectedKey, loadDetail]);

  const hasUnloadedOrFailedEvidence = Boolean(
    detail &&
      detail.evidences.some((ev) => {
        const state = evidenceMap[ev.id];
        return !state || state.loading || Boolean(state.error);
      }),
  );

  const isPendingCase = Boolean(
    detail &&
      ((detail.caseType === 'COMPLAINT' && detail.complaintStatus === 'CHO_XU_LY') ||
        (detail.caseType === 'LOW_STAR_REVIEW' && detail.reviewStatus === 'CHO_XET')),
  );

  async function submitDecision(action: 'UPHOLD' | 'DISMISS' | 'APPROVE' | 'REJECT' | 'REQUEST_MORE_INFO') {
    if (!detail || submitting) return;
    setActionError('');
    setActionSuccess('');

    const trimmedRationale = rationale.trim();
    if (!trimmedRationale) {
      setActionError('Vui lòng nhập căn cứ quyết định trước khi xác nhận.');
      return;
    }

    // UC-34 §3.3: Do not allow final conclusion while evidence failed to load
    if (action !== 'REQUEST_MORE_INFO' && hasUnloadedOrFailedEvidence) {
      setActionError('Cần tải đủ toàn bộ bằng chứng của hồ sơ trước khi đưa ra kết luận.');
      return;
    }

    setSubmitting(true);
    try {
      let response;
      if (detail.caseType === 'COMPLAINT') {
        response = await decideComplaint(detail.caseId, {
          action: action as 'UPHOLD' | 'DISMISS' | 'REQUEST_MORE_INFO',
          rationale: trimmedRationale,
          targetParty: action === 'REQUEST_MORE_INFO' ? targetParty : undefined,
          expectedVersion: detail.complaintVersion ?? undefined,
        });
      } else {
        response = await decideLowStarReview(detail.reviewId, {
          action: action as 'APPROVE' | 'REJECT' | 'REQUEST_MORE_INFO',
          rationale: trimmedRationale,
          targetParty: action === 'REQUEST_MORE_INFO' ? targetParty : undefined,
          expectedVersion: detail.reviewVersion,
        });
      }

      const deltaNote =
        typeof response.scoreDelta === 'number' && response.scoreDelta !== 0
          ? ` Tác động điểm: ${response.scoreDelta > 0 ? '+' : ''}${response.scoreDelta} (điểm sau xử lý: ${response.sellerScoreAfter ?? '—'}).`
          : '';
      const lockNote =
        response.restrictionChange === 'UNLOCKED'
          ? ' Tài khoản người bán đã được tự động mở khóa.'
          : response.restrictionChange
            ? ` Trạng thái hạn chế cập nhật: ${response.restrictionChange}.`
            : '';

      setActionSuccess(`Đã ghi nhận quyết định thành công.${deltaNote}${lockNote}`);
      setRationale('');
      await loadQueue();
      if (action === 'REQUEST_MORE_INFO') {
        await loadDetail(detail.caseType, detail.caseId);
      } else {
        setSelectedKey(null);
        setDetail(null);
      }
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status === 409 &&
        (err.code === 'ALREADY_DECIDED' || err.code === 'REVIEW_DELETED')
      ) {
        setActionError(err.message);
        await loadQueue();
      } else {
        setActionError(err instanceof Error ? err.message : 'Chưa lưu được quyết định. Vui lòng thử lại.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="page-content">
      <header className="page-heading">
        <p className="eyebrow">KIỂM DUYỆT ĐÁNH GIÁ · UC-34</p>
        <h1>Kiểm duyệt đánh giá &amp; khiếu nại</h1>
        <p>
          Xét duyệt đánh giá 1–3 sao đang chờ và giải quyết khiếu nại của người bán kèm áp dụng hoặc
          đảo tác động điểm uy tín theo FR-10/FR-12.
        </p>
      </header>

      <div className="rv-tabs" role="group" aria-label="Bộ lọc hàng chờ kiểm duyệt">
        <button
          type="button"
          className="rv-tab"
          aria-pressed={tab === 'PENDING_ALL'}
          onClick={() => setTab('PENDING_ALL')}
        >
          Tất cả chờ xử lý
        </button>
        <button
          type="button"
          className="rv-tab"
          aria-pressed={tab === 'PENDING_COMPLAINT'}
          onClick={() => setTab('PENDING_COMPLAINT')}
        >
          Khiếu nại đánh giá
        </button>
        <button
          type="button"
          className="rv-tab"
          aria-pressed={tab === 'PENDING_LOW_STAR'}
          onClick={() => setTab('PENDING_LOW_STAR')}
        >
          Đánh giá 1–3 sao
        </button>
        <button
          type="button"
          className="rv-tab"
          aria-pressed={tab === 'PROCESSED'}
          onClick={() => setTab('PROCESSED')}
        >
          Đã xử lý
        </button>
      </div>

      {actionSuccess ? (
        <p className="notice notice-success" role="status" style={{ marginBottom: 16 }}>
          {actionSuccess}
        </p>
      ) : null}

      <div className="rv-layout">
        <div>
          {queueError ? (
            <div className="notice notice-error" role="alert">
              <p>{queueError}</p>
              <button type="button" className="button" onClick={() => void loadQueue()}>
                Thử tải lại
              </button>
            </div>
          ) : queueLoading ? (
            <p className="notice" role="status">
              Đang tải hàng chờ kiểm duyệt…
            </p>
          ) : queue.length === 0 ? (
            <p className="notice" role="status">
              Không có hồ sơ đánh giá hoặc khiếu nại nào trong mục này.
            </p>
          ) : (
            <>
              <p className="form-help" style={{ marginBottom: 8 }}>
                Tổng số: {queueTotal} hồ sơ
              </p>
              <ul className="rv-list" aria-label="Danh sách hồ sơ kiểm duyệt đánh giá">
                {queue.map((item) => {
                  const isCurrent =
                    selectedKey?.caseType === item.caseType && selectedKey?.caseId === item.caseId;
                  return (
                    <li key={`${item.caseType}:${item.caseId}`}>
                      <button
                        type="button"
                        className="rv-row-btn"
                        aria-current={isCurrent ? 'true' : undefined}
                        onClick={() =>
                          setSelectedKey({ caseType: item.caseType, caseId: item.caseId })
                        }
                      >
                        <div className="rv-row-top">
                          <span
                            className={`rv-badge ${
                              item.caseType === 'COMPLAINT'
                                ? 'rv-badge-complaint'
                                : 'rv-badge-lowstar'
                            }`}
                          >
                            {item.caseType === 'COMPLAINT' ? 'Khiếu nại' : 'Đánh giá 1–3 sao'}
                          </span>
                          <strong>{item.stars}/5 sao</strong>
                        </div>
                        <strong>{item.listingTitle}</strong>
                        <span className="profile-row-meta">
                          Người mua: {item.buyerName} · Người bán: {item.sellerName}
                        </span>
                        <span className="profile-row-meta">
                          {item.reasonLabel} · {formatDate(item.submittedAt)}
                        </span>
                        {item.supplementalStatus === 'CHO_BO_SUNG' ? (
                          <span className="rv-badge">Đang chờ bổ sung</span>
                        ) : item.supplementalStatus === 'DA_BO_SUNG' ? (
                          <span className="rv-badge rv-badge-done">Đã nhận bổ sung</span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        <div>
          {detailLoading ? (
            <div className="rv-detail-card">
              <p className="notice" role="status">
                Đang tải chi tiết hồ sơ…
              </p>
            </div>
          ) : detailError ? (
            <div className="rv-detail-card">
              <div className="notice notice-error" role="alert">
                <p>{detailError}</p>
                {selectedKey ? (
                  <button
                    type="button"
                    className="button"
                    onClick={() => void loadDetail(selectedKey.caseType, selectedKey.caseId)}
                  >
                    Thử tải lại
                  </button>
                ) : null}
              </div>
            </div>
          ) : !detail ? (
            <div className="rv-detail-card">
              <p className="form-help">
                Chọn một khiếu nại hoặc đánh giá 1–3 sao ở danh sách bên trái để xem bằng chứng và
                ghi nhận kết luận.
              </p>
            </div>
          ) : (
            <article className="rv-detail-card" aria-label="Chi tiết hồ sơ kiểm duyệt">
              <header>
                <span
                  className={`rv-badge ${
                    detail.caseType === 'COMPLAINT' ? 'rv-badge-complaint' : 'rv-badge-lowstar'
                  }`}
                >
                  {detail.caseType === 'COMPLAINT'
                    ? 'Khiếu nại đánh giá (UC-33)'
                    : 'Đánh giá 1–3 sao chờ xét (UC-30)'}
                </span>
                <h2 style={{ marginTop: 8, marginBottom: 4 }}>{detail.listingTitle}</h2>
                <p className="form-help">
                  Giao dịch: {detail.transactionId} · Giá thỏa thuận:{' '}
                  {formatCurrency(detail.agreedPriceVnd)} · Hoàn tất:{' '}
                  {formatDate(detail.transactionCompletedAt)}
                </p>
              </header>

              <dl className="rv-meta-grid">
                <div>
                  <dt>Người mua (đánh giá)</dt>
                  <dd>{detail.buyerName}</dd>
                </div>
                <div>
                  <dt>Người bán (bị đánh giá)</dt>
                  <dd>
                    {detail.sellerName} (Uy tín: {detail.sellerReputationScore} ·{' '}
                    {detail.sellerAccountStatus})
                  </dd>
                </div>
                <div>
                  <dt>Số sao &amp; trạng thái đánh giá</dt>
                  <dd>
                    {detail.stars}/5 sao · {detail.reviewStatus} (v{detail.reviewVersion})
                  </dd>
                </div>
                <div>
                  <dt>Tác động điểm hiện hành</dt>
                  <dd>
                    {detail.appliedScoreDelta !== null
                      ? `${detail.appliedScoreDelta > 0 ? '+' : ''}${detail.appliedScoreDelta} điểm`
                      : 'Chưa áp dụng'}
                  </dd>
                </div>
              </dl>

              <div>
                <strong>Nội dung đánh giá</strong>
                <blockquote className="rv-quote">
                  {detail.reviewComment || 'Người mua không nhập nhận xét văn bản.'}
                </blockquote>
              </div>

              {detail.caseType === 'COMPLAINT' ? (
                <div>
                  <strong>Nội dung khiếu nại của người bán</strong>
                  <p style={{ marginBottom: 4 }}>
                    <strong>Lý do:</strong> {detail.complaintReasonLabel}
                  </p>
                  <blockquote className="rv-quote">
                    {detail.complaintDescription || 'Người bán đính kèm bằng chứng không có mô tả thêm.'}
                  </blockquote>
                </div>
              ) : null}

              {/* Private evidence list (NFR-01) */}
              <div>
                <strong>Bằng chứng đính kèm ({detail.evidences.length})</strong>
                {detail.evidences.length === 0 ? (
                  <p className="form-help">Không có tệp bằng chứng hay nhật ký chat đính kèm.</p>
                ) : (
                  <div className="rv-evidence-grid">
                    {detail.evidences.map((ev) => {
                      const state = evidenceMap[ev.id];
                      return (
                        <div key={ev.id} className="rv-evidence-item">
                          <span className="profile-row-meta">
                            {sourceLabel(ev.source)} · {formatDate(ev.createdAt)}
                          </span>
                          {!state || state.loading ? (
                            <p className="form-help" role="status">
                              Đang tải bằng chứng…
                            </p>
                          ) : state.error ? (
                            <div className="notice notice-error" role="alert">
                              <p>{state.error}</p>
                              <button
                                type="button"
                                className="button"
                                onClick={() => void loadSingleEvidence(ev)}
                              >
                                Tải lại bằng chứng
                              </button>
                            </div>
                          ) : ev.type === 'NHAT_KY_CHAT' && state.chatLog ? (
                            <ul className="rv-chat-log">
                              {state.chatLog.messages.map((m) => (
                                <li key={m.id}>
                                  <strong>{m.senderName}</strong>{' '}
                                  <span className="profile-row-meta">({formatDate(m.sentAt)})</span>
                                  <div>{m.content}</div>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <img
                              src={state.imageUrl}
                              alt={ev.originalFilename || 'Ảnh bằng chứng'}
                              className="rv-evidence-img"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Supplemental requests history */}
              {detail.supplementalRequests.length > 0 ? (
                <div>
                  <strong>Lịch sử yêu cầu bổ sung</strong>
                  <ul className="rv-chat-log" style={{ marginTop: 6 }}>
                    {detail.supplementalRequests.map((req) => (
                      <li key={req.id}>
                        <strong>
                          Gửi {req.recipientRole === 'NGUOI_BAN' ? 'Người bán' : 'Người mua'} (
                          {req.status === 'DA_PHAN_HOI' ? 'Đã phản hồi' : 'Chờ phản hồi'})
                        </strong>
                        <div>Yêu cầu: {req.requestNote}</div>
                        {req.responseNote ? <div>Phản hồi: {req.responseNote}</div> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {/* Decision history */}
              {detail.decisions.length > 0 ? (
                <div>
                  <strong>Lịch sử quyết định kiểm duyệt</strong>
                  <ul className="rv-chat-log" style={{ marginTop: 6 }}>
                    {detail.decisions.map((dec) => (
                      <li key={dec.id}>
                        <strong>{conclusionLabel(dec.conclusion)}</strong> · {dec.moderatorName} (
                        {formatDate(dec.decidedAt)})
                        <div>Căn cứ: {dec.rationale}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {/* Decision form (only for pending cases) */}
              {isPendingCase ? (
                <div className="rv-decision-form">
                  {!detail.canCurrentModeratorDecide ? (
                    <p className="notice notice-error" role="alert">
                      {detail.cannotDecideReason}
                    </p>
                  ) : (
                    <>
                      {detail.singleModeratorOverride ? (
                        <p className="notice" role="status">
                          Lưu ý (UC-34 §4): Bạn là kiểm duyệt viên hiệu lực duy nhất nên hệ thống sẽ
                          ghi nhận tình huống này vào căn cứ quyết định.
                        </p>
                      ) : null}

                      {hasUnloadedOrFailedEvidence ? (
                        <p className="notice notice-error" role="alert">
                          Chưa thể kết luận khi còn bằng chứng chưa tải xong hoặc lỗi tải. Hãy bấm
                          “Tải lại bằng chứng” ở trên.
                        </p>
                      ) : null}

                      {actionError ? (
                        <p className="notice notice-error" role="alert">
                          {actionError}
                        </p>
                      ) : null}

                      <label>
                        <strong>Căn cứ quyết định / Nội dung yêu cầu bổ sung *</strong>
                        <textarea
                          rows={3}
                          value={rationale}
                          onChange={(e) => setRationale(e.target.value)}
                          placeholder="Nhập căn cứ cụ thể theo bằng chứng và lịch sử giao dịch…"
                          disabled={submitting}
                        />
                      </label>

                      <label>
                        <span className="form-help">Bên nhận nếu chọn “Yêu cầu bổ sung”</span>
                        <select
                          value={targetParty}
                          onChange={(e) => setTargetParty(e.target.value as 'SELLER' | 'BUYER')}
                          disabled={submitting}
                        >
                          <option value="SELLER">Người bán ({detail.sellerName})</option>
                          <option value="BUYER">Người mua ({detail.buyerName})</option>
                        </select>
                      </label>

                      <div className="rv-decision-actions">
                        {detail.caseType === 'COMPLAINT' ? (
                          <>
                            <button
                              type="button"
                              className="button button-primary"
                              disabled={submitting || hasUnloadedOrFailedEvidence}
                              onClick={() => void submitDecision('UPHOLD')}
                            >
                              Chấp nhận khiếu nại (Gỡ &amp; đảo điểm)
                            </button>
                            <button
                              type="button"
                              className="button rv-btn-danger"
                              disabled={submitting || hasUnloadedOrFailedEvidence}
                              onClick={() => void submitDecision('DISMISS')}
                            >
                              Bác khiếu nại
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="button button-primary"
                              disabled={submitting || hasUnloadedOrFailedEvidence}
                              onClick={() => void submitDecision('APPROVE')}
                            >
                              Chấp nhận đánh giá (Công khai &amp; trừ điểm)
                            </button>
                            <button
                              type="button"
                              className="button rv-btn-danger"
                              disabled={submitting || hasUnloadedOrFailedEvidence}
                              onClick={() => void submitDecision('REJECT')}
                            >
                              Bác đánh giá
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          className="button"
                          disabled={submitting}
                          onClick={() => void submitDecision('REQUEST_MORE_INFO')}
                        >
                          Yêu cầu bổ sung
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : null}
            </article>
          )}
        </div>
      </div>
    </section>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import {
  cancelDispute,
  completeDispute,
  formatCancelReasonCode,
  formatCancelStatus,
  formatConclusion,
  formatDateTime,
  formatEscalationReason,
  formatEvidenceRequestStatus,
  formatFileSize,
  formatItemCondition,
  formatItemStatus,
  formatListingStatus,
  formatOrderStatus,
  formatPartyRole,
  formatQueueState,
  formatScheduleStatus,
  formatShortOrderId,
  formatTimelineAction,
  formatVnd,
  getDisputeDetail,
  isExternalHttpUrl,
  loadEvidenceBlobUrl,
  normalizeApiPath,
  requestDisputeEvidence,
} from './api';
import type { DisputeConclusion, DisputeDetail, EvidenceTargetParty } from './types';
import './disputes.css';

const MIN_BASIS = 10;
const MAX_BASIS = 2000;
const MIN_EVIDENCE_INSTRUCTION = 5;
const MAX_EVIDENCE_INSTRUCTION = 2000;
const MIN_DUE_HOURS = 1;
const MAX_DUE_HOURS = 168;

type ActiveAction = 'complete' | 'cancel' | 'evidence' | null;

interface MediaDescriptor {
  key: string;
  url: string;
  label: string;
}

interface MediaEntry {
  url: string;
  status: 'loading' | 'loaded' | 'error';
  objectUrl?: string;
  directUrl?: string;
  isExternal?: boolean;
  error?: string;
  runId: number;
}

interface LoadErrorState {
  status: number;
  code?: string;
  message: string;
}

function collectMediaDescriptors(detail: DisputeDetail | null): MediaDescriptor[] {
  if (!detail) return [];
  const result: MediaDescriptor[] = [];

  detail.handoverPhotos.forEach((photo, index) => {
    result.push({
      key: `handover:${photo.id}`,
      url: photo.url,
      label: `Ảnh bàn giao #${index + 1}`,
    });
  });

  detail.evidenceRequests.forEach((request) => {
    request.responses.forEach((response) => {
      response.attachments.forEach((attachmentItem, index) => {
        result.push({
          key: `supplementary:${attachmentItem.id}`,
          url: attachmentItem.url,
          label: attachmentItem.originalFilename || `Ảnh bổ sung #${index + 1}`,
        });
      });
    });
  });

  return result;
}

export default function DisputeDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<DisputeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<LoadErrorState | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  // Tách `stale` khỏi `actionError` để `load()` khi tự tải lại sau 409 không nuốt mất cảnh báo xung đột.
  const [stale, setStale] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [doneFlashMessage, setDoneFlashMessage] = useState('');
  const [activeAction, setActiveAction] = useState<ActiveAction>(null);
  const busy = activeAction !== null;

  // State cho quyết định Hoàn tất / Hủy giao dịch (UC-29 Basic Flow & Alt 1)
  const [selectedConclusion, setSelectedConclusion] = useState<DisputeConclusion | null>(null);
  const [basis, setBasis] = useState('');
  const [basisError, setBasisError] = useState('');
  const [confirmingDecision, setConfirmingDecision] = useState(false);

  // State cho yêu cầu bổ sung bằng chứng (UC-29 Alt 2)
  const [targetParty, setTargetParty] = useState<EvidenceTargetParty>('BUYER');
  const [instruction, setInstruction] = useState('');
  const [dueInHours, setDueInHours] = useState('48');
  const [evidenceInstructionError, setEvidenceInstructionError] = useState('');
  const [evidenceDueHoursError, setEvidenceDueHoursError] = useState('');

  // Quản lý vòng đời blob URL cho toàn bộ ảnh bàn giao & ảnh bổ sung (UC-29 Exception 3)
  const [mediaMap, setMediaMap] = useState<Record<string, MediaEntry>>({});
  const mediaEntriesRef = useRef<Map<string, MediaEntry>>(new Map());
  const nextRunIdRef = useRef(1);
  const isMountedRef = useRef(true);
  const activeOrderIdRef = useRef<string>(id);
  const loadedOrderIdRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const mutationSeqRef = useRef(0);

  const revokeAllMedia = useCallback(() => {
    for (const entry of mediaEntriesRef.current.values()) {
      if (entry.objectUrl) {
        URL.revokeObjectURL(entry.objectUrl);
      }
    }
    mediaEntriesRef.current.clear();
    setMediaMap({});
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    const entries = mediaEntriesRef.current;
    return () => {
      isMountedRef.current = false;
      for (const entry of entries.values()) {
        if (entry.objectUrl) {
          URL.revokeObjectURL(entry.objectUrl);
        }
      }
      entries.clear();
    };
  }, []);

  // Reset hoàn toàn khi chuyển sang mã giao dịch khác
  useEffect(() => {
    if (activeOrderIdRef.current !== id) {
      activeOrderIdRef.current = id;
      loadedOrderIdRef.current = null;
      mutationSeqRef.current += 1;
      busyRef.current = false;
      setActiveAction(null);
      revokeAllMedia();
      setDetail(null);
      setStale('');
      setActionError('');
      setActionSuccess('');
      setDoneFlashMessage('');
      setSelectedConclusion(null);
      setBasis('');
      setBasisError('');
      setConfirmingDecision(false);
      setTargetParty('BUYER');
      setInstruction('');
      setDueInHours('48');
      setEvidenceInstructionError('');
      setEvidenceDueHoursError('');
    }
  }, [id, revokeAllMedia]);

  // Tải hồ sơ chi tiết
  useEffect(() => {
    let active = true;
    setLoadError(null);
    setActionError('');
    if (loadedOrderIdRef.current !== id) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    void getDisputeDetail(id)
      .then((fresh) => {
        if (!active) return;
        loadedOrderIdRef.current = fresh.orderId;
        setDetail(fresh);
        setLoadError(null);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        const status = cause instanceof ApiError ? cause.status : 0;
        const code = cause instanceof ApiError ? cause.code : undefined;
        const message =
          cause instanceof Error && cause.message ? cause.message : 'Không thể tải hồ sơ tranh chấp.';
        loadedOrderIdRef.current = null;
        setDetail(null);
        setLoadError({ status, code, message });
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
        setRefreshing(false);
      });

    return () => {
      active = false;
    };
  }, [id, refreshNonce]);

  const mediaDescriptors = useMemo(() => collectMediaDescriptors(detail), [detail]);

  const fetchMediaDescriptor = useCallback((descriptor: MediaDescriptor) => {
    const runId = nextRunIdRef.current++;
    const existing = mediaEntriesRef.current.get(descriptor.key);
    if (existing?.objectUrl) {
      URL.revokeObjectURL(existing.objectUrl);
    }

    const resolved = normalizeApiPath(descriptor.url);
    if (!resolved) {
      const invalidEntry: MediaEntry = {
        url: descriptor.url,
        status: 'error',
        error: 'Đường dẫn ảnh bằng chứng không hợp lệ.',
        runId,
      };
      mediaEntriesRef.current.set(descriptor.key, invalidEntry);
      setMediaMap((prev) => ({ ...prev, [descriptor.key]: invalidEntry }));
      return;
    }

    if (isExternalHttpUrl(resolved)) {
      // URL cross-origin từ dữ liệu legacy: hiển thị trực tiếp qua <img src> không gửi Bearer token,
      // giữ trạng thái 'loading' cho đến khi trình duyệt báo onLoad/onError để giữ nguyên cổng chặn UC-29 §3.3.
      const externalLoadingEntry: MediaEntry = {
        url: descriptor.url,
        status: 'loading',
        directUrl: resolved,
        isExternal: true,
        runId,
      };
      mediaEntriesRef.current.set(descriptor.key, externalLoadingEntry);
      setMediaMap((prev) => ({ ...prev, [descriptor.key]: externalLoadingEntry }));
      return;
    }

    const loadingEntry: MediaEntry = {
      url: descriptor.url,
      status: 'loading',
      isExternal: false,
      runId,
    };
    mediaEntriesRef.current.set(descriptor.key, loadingEntry);
    setMediaMap((prev) => ({ ...prev, [descriptor.key]: loadingEntry }));

    void loadEvidenceBlobUrl(descriptor.url)
      .then((objectUrl) => {
        const current = mediaEntriesRef.current.get(descriptor.key);
        if (!isMountedRef.current || !current || current.runId !== runId) {
          if (objectUrl.startsWith('blob:')) {
            URL.revokeObjectURL(objectUrl);
          }
          return;
        }
        const loadedEntry: MediaEntry = {
          url: descriptor.url,
          status: 'loaded',
          objectUrl,
          isExternal: false,
          runId,
        };
        mediaEntriesRef.current.set(descriptor.key, loadedEntry);
        setMediaMap((prev) => ({ ...prev, [descriptor.key]: loadedEntry }));
      })
      .catch((cause: unknown) => {
        const current = mediaEntriesRef.current.get(descriptor.key);
        if (!isMountedRef.current || !current || current.runId !== runId) {
          return;
        }
        const message =
          cause instanceof Error && cause.message
            ? cause.message
            : 'Không thể tải tệp ảnh bằng chứng.';
        const errorEntry: MediaEntry = {
          url: descriptor.url,
          status: 'error',
          error: message,
          runId,
        };
        mediaEntriesRef.current.set(descriptor.key, errorEntry);
        setMediaMap((prev) => ({ ...prev, [descriptor.key]: errorEntry }));
      });
  }, []);

  // Tự động tải các ảnh mới xuất hiện trong hồ sơ và dọn các blob URL không còn dùng
  useEffect(() => {
    const currentKeys = new Set(mediaDescriptors.map((item) => item.key));
    let removedAny = false;
    for (const [key, entry] of mediaEntriesRef.current.entries()) {
      if (!currentKeys.has(key)) {
        if (entry.objectUrl) {
          URL.revokeObjectURL(entry.objectUrl);
        }
        mediaEntriesRef.current.delete(key);
        removedAny = true;
      }
    }
    if (removedAny) {
      setMediaMap((prev) => {
        const next: Record<string, MediaEntry> = {};
        for (const key of currentKeys) {
          if (prev[key]) next[key] = prev[key];
        }
        return next;
      });
    }

    for (const descriptor of mediaDescriptors) {
      const existing = mediaEntriesRef.current.get(descriptor.key);
      if (!existing || existing.url !== descriptor.url) {
        fetchMediaDescriptor(descriptor);
      }
    }
  }, [mediaDescriptors, fetchMediaDescriptor]);

  const handleRetryFailedMedia = useCallback(() => {
    for (const descriptor of mediaDescriptors) {
      const entry = mediaEntriesRef.current.get(descriptor.key);
      if (!entry || entry.status === 'error') {
        fetchMediaDescriptor(descriptor);
      }
    }
  }, [mediaDescriptors, fetchMediaDescriptor]);

  const handleImageRenderLoad = useCallback((descriptor: MediaDescriptor, runId: number) => {
    const existing = mediaEntriesRef.current.get(descriptor.key);
    if (!isMountedRef.current || !existing || existing.runId !== runId || !existing.isExternal) {
      return;
    }
    const next: MediaEntry = {
      ...existing,
      status: 'loaded',
    };
    mediaEntriesRef.current.set(descriptor.key, next);
    setMediaMap((prev) => ({ ...prev, [descriptor.key]: next }));
  }, []);

  const handleImageRenderError = useCallback((descriptor: MediaDescriptor, runId: number) => {
    const existing = mediaEntriesRef.current.get(descriptor.key);
    if (!isMountedRef.current || !existing || existing.runId !== runId) {
      return;
    }
    if (existing.objectUrl) {
      URL.revokeObjectURL(existing.objectUrl);
    }
    const next: MediaEntry = {
      url: descriptor.url,
      status: 'error',
      error: 'Trình duyệt không thể hiển thị ảnh bằng chứng này.',
      runId: nextRunIdRef.current++,
    };
    mediaEntriesRef.current.set(descriptor.key, next);
    setMediaMap((prev) => ({ ...prev, [descriptor.key]: next }));
  }, []);

  const failedMediaCount = mediaDescriptors.filter((d) => mediaMap[d.key]?.status === 'error').length;
  const loadingMediaCount = mediaDescriptors.filter((d) => {
    const status = mediaMap[d.key]?.status;
    return !status || status === 'loading';
  }).length;
  const allMediaLoaded = failedMediaCount === 0 && loadingMediaCount === 0;

  function handleSelectConclusion(conclusion: DisputeConclusion) {
    if (!allMediaLoaded || busy || busyRef.current) return;
    setSelectedConclusion(conclusion);
    setConfirmingDecision(false);
    setBasisError('');
    setActionError('');
  }

  function handleReviewDecision(event: FormEvent) {
    event.preventDefault();
    if (!selectedConclusion || !allMediaLoaded || busy || busyRef.current) return;

    const trimmed = basis.trim();
    if (trimmed.length < MIN_BASIS || trimmed.length > MAX_BASIS) {
      setBasisError(`Căn cứ quyết định là bắt buộc và cần từ ${MIN_BASIS} đến ${MAX_BASIS} ký tự.`);
      return;
    }
    setBasisError('');
    setConfirmingDecision(true);
  }

  async function handleConfirmDecision() {
    if (busyRef.current) return;
    if (!detail || !selectedConclusion || !allMediaLoaded) return;
    const trimmed = basis.trim();
    if (trimmed.length < MIN_BASIS || trimmed.length > MAX_BASIS) {
      setBasisError(`Căn cứ quyết định là bắt buộc và cần từ ${MIN_BASIS} đến ${MAX_BASIS} ký tự.`);
      setConfirmingDecision(false);
      return;
    }

    const targetOrderId = detail.orderId;
    const conclusion = selectedConclusion;
    const mutationId = ++mutationSeqRef.current;
    busyRef.current = true;
    setActiveAction(conclusion === 'HOAN_TAT' ? 'complete' : 'cancel');
    setStale('');
    setActionError('');
    setActionSuccess('');
    setBasisError('');

    try {
      const payload = { basis: trimmed, expectedVersion: detail.version };
      const updated =
        conclusion === 'HOAN_TAT'
          ? await completeDispute(targetOrderId, payload)
          : await cancelDispute(targetOrderId, payload);

      if (!isMountedRef.current || activeOrderIdRef.current !== targetOrderId) {
        return;
      }

      const doneMsg =
        conclusion === 'HOAN_TAT'
          ? `Đã xác nhận hoàn tất giao dịch ${formatShortOrderId(updated.orderId)}.`
          : `Đã hủy giao dịch ${formatShortOrderId(updated.orderId)}.`;

      loadedOrderIdRef.current = updated.orderId;
      setDetail(updated);
      setStale('');
      setSelectedConclusion(null);
      setBasis('');
      setConfirmingDecision(false);
      setActionSuccess(`${doneMsg} Quyết định đã được lưu và thông báo cho hai bên.`);
      setDoneFlashMessage(doneMsg);
    } catch (cause: unknown) {
      if (!isMountedRef.current || activeOrderIdRef.current !== targetOrderId) {
        return;
      }

      const status = cause instanceof ApiError ? cause.status : 0;
      const code = cause instanceof ApiError ? cause.code : undefined;
      const message =
        cause instanceof Error && cause.message ? cause.message : 'Không thể lưu quyết định. Vui lòng thử lại.';

      if (status === 403 && code === 'SELF_DISPUTE_FORBIDDEN') {
        setDetail(null);
        setLoadError({ status, code, message });
      } else if (
        status === 409 &&
        (code === 'DISPUTE_ALREADY_RESOLVED' || code === 'VERSION_CONFLICT' || code === 'INVALID_STATE_TRANSITION')
      ) {
        setSelectedConclusion(null);
        setConfirmingDecision(false);
        setStale(
          code === 'DISPUTE_ALREADY_RESOLVED'
            ? 'Giao dịch này đã được quyết định hoặc đã kết thúc trước khi bạn xác nhận. Hồ sơ vừa được tải lại để bạn kiểm tra kết quả mới nhất.'
            : code === 'VERSION_CONFLICT'
              ? 'Hồ sơ giao dịch đã có thay đổi mới sau khi bạn mở trang. Dữ liệu vừa được làm mới, vui lòng xem lại trước khi quyết định.'
              : `${message} Hồ sơ vừa được làm mới.`,
        );
        setRefreshNonce((n) => n + 1);
      } else if (status === 400 && (code === 'INVALID_BASIS' || code === 'INVALID_INPUT')) {
        setBasisError(message);
        setConfirmingDecision(false);
      } else {
        setActionError(message);
      }
    } finally {
      if (mutationSeqRef.current === mutationId) {
        busyRef.current = false;
        if (isMountedRef.current) {
          setActiveAction(null);
        }
      }
    }
  }

  async function handleSubmitEvidenceRequest(event: FormEvent) {
    event.preventDefault();
    if (busyRef.current) return;
    if (!detail || detail.hasActiveEvidenceRequest) return;

    const trimmed = instruction.trim();
    const parsedHours = Number(dueInHours);
    const hasInstructionError =
      trimmed.length < MIN_EVIDENCE_INSTRUCTION || trimmed.length > MAX_EVIDENCE_INSTRUCTION;
    const hasDueHoursError =
      dueInHours.trim() === '' ||
      !Number.isInteger(parsedHours) ||
      parsedHours < MIN_DUE_HOURS ||
      parsedHours > MAX_DUE_HOURS;

    if (hasInstructionError || hasDueHoursError) {
      setEvidenceInstructionError(
        hasInstructionError
          ? `Nội dung yêu cầu bổ sung cần từ ${MIN_EVIDENCE_INSTRUCTION} đến ${MAX_EVIDENCE_INSTRUCTION} ký tự.`
          : '',
      );
      setEvidenceDueHoursError(
        hasDueHoursError
          ? `Thời hạn bổ sung phải là số nguyên từ ${MIN_DUE_HOURS} đến ${MAX_DUE_HOURS} giờ.`
          : '',
      );
      return;
    }

    const targetOrderId = detail.orderId;
    const submittedTargetParty = targetParty;
    const mutationId = ++mutationSeqRef.current;
    busyRef.current = true;
    setActiveAction('evidence');
    setStale('');
    setEvidenceInstructionError('');
    setEvidenceDueHoursError('');
    setActionError('');
    setActionSuccess('');

    try {
      const updated = await requestDisputeEvidence(targetOrderId, {
        targetParty: submittedTargetParty,
        instruction: trimmed,
        dueInHours: parsedHours,
        expectedVersion: detail.version,
      });

      if (!isMountedRef.current || activeOrderIdRef.current !== targetOrderId) {
        return;
      }

      loadedOrderIdRef.current = updated.orderId;
      setDetail(updated);
      setStale('');
      setInstruction('');
      setDueInHours('48');
      setActionSuccess(
        `Đã gửi yêu cầu bổ sung bằng chứng tới ${formatPartyRole(submittedTargetParty).toLowerCase()}. Giao dịch giữ trạng thái Chờ xử lý.`,
      );
    } catch (cause: unknown) {
      if (!isMountedRef.current || activeOrderIdRef.current !== targetOrderId) {
        return;
      }

      const status = cause instanceof ApiError ? cause.status : 0;
      const code = cause instanceof ApiError ? cause.code : undefined;
      const message =
        cause instanceof Error && cause.message
          ? cause.message
          : 'Không thể gửi yêu cầu bổ sung bằng chứng.';

      if (status === 403 && code === 'SELF_DISPUTE_FORBIDDEN') {
        setDetail(null);
        setLoadError({ status, code, message });
      } else if (
        status === 409 &&
        (code === 'EVIDENCE_REQUEST_ALREADY_OPEN' ||
          code === 'DISPUTE_ALREADY_RESOLVED' ||
          code === 'VERSION_CONFLICT' ||
          code === 'INVALID_STATE_TRANSITION')
      ) {
        setStale(
          code === 'EVIDENCE_REQUEST_ALREADY_OPEN'
            ? 'Đã tồn tại một yêu cầu bổ sung bằng chứng đang mở cho giao dịch này. Hồ sơ vừa được làm mới.'
            : code === 'DISPUTE_ALREADY_RESOLVED'
              ? 'Giao dịch này đã được quyết định trước khi gửi yêu cầu bổ sung. Hồ sơ vừa được làm mới.'
              : 'Hồ sơ giao dịch đã thay đổi sau khi bạn mở trang. Dữ liệu vừa được làm mới.',
        );
        setRefreshNonce((n) => n + 1);
      } else if (status === 400) {
        if (/thời hạn|dueInHours|giờ/i.test(message)) {
          setEvidenceDueHoursError(message);
        } else {
          setEvidenceInstructionError(message);
        }
      } else {
        setActionError(message);
      }
    } finally {
      if (mutationSeqRef.current === mutationId) {
        busyRef.current = false;
        if (isMountedRef.current) {
          setActiveAction(null);
        }
      }
    }
  }

  function renderPhotoTile(descriptor: MediaDescriptor, subtitle?: string) {
    const entry = mediaMap[descriptor.key];
    const status = entry?.status ?? 'loading';
    const displayUrl = entry?.objectUrl ?? entry?.directUrl;

    if (displayUrl && (status === 'loaded' || (entry?.isExternal && status === 'loading'))) {
      return (
        <figure key={descriptor.key} className="dispute-photo-tile">
          <a href={displayUrl} target="_blank" rel="noopener noreferrer">
            <img
              key={`${descriptor.key}:${entry.runId}`}
              className="dispute-photo-img"
              src={displayUrl}
              alt={descriptor.label}
              referrerPolicy={entry.isExternal ? 'no-referrer' : undefined}
              onLoad={entry.isExternal ? () => handleImageRenderLoad(descriptor, entry.runId) : undefined}
              onError={() => handleImageRenderError(descriptor, entry.runId)}
            />
          </a>
          <figcaption className="dispute-photo-caption">
            <strong>{descriptor.label}</strong>
            {status === 'loading' ? <div>Đang tải ảnh…</div> : null}
            {subtitle ? <div>{subtitle}</div> : null}
          </figcaption>
        </figure>
      );
    }

    if (status === 'error') {
      return (
        <div key={descriptor.key} className="dispute-photo-tile dispute-photo-tile-error">
          <div className="dispute-photo-placeholder">
            <span>Không tải được {descriptor.label}</span>
          </div>
          <span className="dispute-photo-caption error">{entry?.error || 'Lỗi tải tệp ảnh.'}</span>
          <button
            type="button"
            className="button button-compact"
            onClick={() => fetchMediaDescriptor(descriptor)}
          >
            Tải lại ảnh
          </button>
        </div>
      );
    }

    return (
      <div key={descriptor.key} className="dispute-photo-tile">
        <div className="dispute-photo-placeholder" role="status">
          Đang tải {descriptor.label}…
        </div>
        <span className="dispute-photo-caption">{descriptor.label}</span>
      </div>
    );
  }

  if (loading) {
    return (
      <section className="page-content disputes-page">
        <p className="notice" role="status">
          Đang tải hồ sơ tranh chấp giao dịch…
        </p>
      </section>
    );
  }

  if (loadError) {
    const isSelfDispute = loadError.status === 403 && loadError.code === 'SELF_DISPUTE_FORBIDDEN';
    const isForbidden = loadError.status === 403 && !isSelfDispute;
    const isNotFound = loadError.status === 404 || loadError.code === 'DISPUTE_NOT_FOUND';

    return (
      <section className="page-content disputes-page">
        <header className="page-heading">
          <Link className="dispute-back-link" to="/disputes">
            ← Quay lại danh sách tranh chấp
          </Link>
          <p className="eyebrow">KIỂM DUYỆT GIAO DỊCH · UC-29</p>
          <h1>
            {isSelfDispute
              ? 'Không thể xem hoặc xử lý giao dịch của chính bạn'
              : isForbidden
                ? 'Không có quyền truy cập hồ sơ'
                : isNotFound
                  ? 'Không tìm thấy hồ sơ tranh chấp'
                  : 'Chưa thể tải hồ sơ tranh chấp'}
          </h1>
        </header>

        <section className="disputes-card">
          <p className="notice notice-error" role="alert">
            {isSelfDispute
              ? 'Theo quy định tránh xung đột lợi ích (UC-29), kiểm duyệt viên không được xem hồ sơ hay ra quyết định đối với giao dịch mà mình là người mua hoặc người bán. Vui lòng chuyển hồ sơ cho kiểm duyệt viên khác xử lý.'
              : isForbidden
                ? 'Tài khoản của bạn không có quyền xem hoặc xử lý hồ sơ tranh chấp này.'
                : isNotFound
                  ? 'Hồ sơ tranh chấp không tồn tại hoặc đã bị gỡ bỏ.'
                  : loadError.message}
          </p>
          <div className="filter-actions">
            <button type="button" className="button button-primary button-compact" onClick={() => navigate('/disputes')}>
              Quay lại hàng đợi tranh chấp
            </button>
            {!isSelfDispute && !isForbidden && !isNotFound && (
              <button
                type="button"
                className="button button-compact"
                onClick={() => setRefreshNonce((n) => n + 1)}
              >
                Thử lại
              </button>
            )}
          </div>
        </section>
      </section>
    );
  }

  if (!detail) {
    return (
      <section className="page-content disputes-page">
        <p className="notice notice-error" role="alert">
          Không tìm thấy dữ liệu hồ sơ tranh chấp.
        </p>
        <button type="button" className="button button-compact" onClick={() => navigate('/disputes')}>
          Quay lại hàng đợi
        </button>
      </section>
    );
  }

  // Dùng cờ `hasActiveEvidenceRequest` từ backend làm nguồn chuẩn để không khóa form khi yêu cầu cũ đã quá hạn.
  const hasActiveEvidenceRequest = detail.hasActiveEvidenceRequest;
  const isSlaOverdue = detail.overdueSla && detail.queueState !== 'RESOLVED';
  const decisionButtonsDisabled = busy || refreshing || !detail.decidable || !allMediaLoaded;

  return (
    <section className="page-content disputes-page">
      <header className="page-heading disputes-page-header">
        <div>
          <button
            type="button"
            className="text-button"
            onClick={() =>
              navigate(
                '/disputes',
                doneFlashMessage ? { state: { done: doneFlashMessage } } : undefined,
              )
            }
          >
            ← Quay lại hàng đợi tranh chấp
          </button>
          <p className="eyebrow">HỒ SƠ TRANH CHẤP GIAO DỊCH · UC-29</p>
          <h1>
            {formatShortOrderId(detail.orderId)} — {detail.listing.title}
          </h1>
          <div className="badge-group" style={{ marginTop: 8 }}>
            <span className="status-badge dispute-badge-neutral">{formatOrderStatus(detail.status)}</span>
            <span
              className={`status-badge ${
                detail.queueState === 'READY'
                  ? 'dispute-badge-ready'
                  : detail.queueState === 'WAITING_EVIDENCE'
                    ? 'dispute-badge-waiting'
                    : 'dispute-badge-resolved'
              }`}
            >
              {formatQueueState(detail.queueState)}
            </span>
            <span
              className={`status-badge ${
                detail.escalationReason === 'OVERDUE_24H' ? 'dispute-badge-overdue' : 'dispute-badge-cancel'
              }`}
            >
              {formatEscalationReason(detail.escalationReason)}
            </span>
            {isSlaOverdue && <span className="status-badge dispute-badge-overdue">Quá hạn phản hồi SLA</span>}
          </div>
        </div>

        <div className="disputes-header-actions">
          <button
            type="button"
            className="button button-compact"
            disabled={busy || refreshing}
            onClick={() => {
              setStale('');
              setActionError('');
              setRefreshNonce((n) => n + 1);
            }}
          >
            {refreshing ? 'Đang làm mới…' : 'Làm mới hồ sơ'}
          </button>
        </div>
      </header>

      <p className="dispute-no-rep-note">
        <strong>Nguyên tắc UC-29:</strong> Quyết định trong UC-29 không làm thay đổi điểm uy tín của hai bên. Hành vi
        vi phạm phát hiện trong quá trình xem xét được xử lý riêng qua quy trình báo cáo vi phạm (UC-35/UC-36/UC-37).
      </p>

      {stale && (
        <p className="notice notice-error" role="alert" data-testid="stale-alert">
          {stale}
        </p>
      )}

      {actionError && (
        <p className="notice notice-error" role="alert">
          {actionError}
        </p>
      )}

      {actionSuccess && (
        <div className="notice notice-success dispute-error-banner" role="status">
          <span>{actionSuccess}</span>
          {doneFlashMessage && (
            <button
              type="button"
              className="button button-compact"
              onClick={() => navigate('/disputes', { state: { done: doneFlashMessage } })}
            >
              Quay lại hàng đợi
            </button>
          )}
        </div>
      )}

      {failedMediaCount > 0 && (
        <div className="notice notice-error dispute-media-alert" role="alert" data-testid="media-error-alert">
          <p style={{ margin: 0 }}>
            <strong>Không tải được ảnh bằng chứng ({failedMediaCount}/{mediaDescriptors.length} ảnh).</strong>{' '}
            {detail.decidable
              ? 'Theo ngoại lệ UC-29 §3.3, hệ thống chưa cho phép ra quyết định hoàn tất hoặc hủy giao dịch cho đến khi toàn bộ ảnh bàn giao và ảnh bằng chứng được tải đầy đủ.'
              : 'Vui lòng thử tải lại để xem đầy đủ ảnh bàn giao và ảnh bằng chứng trong hồ sơ lưu trữ.'}
          </p>
          <div className="dispute-media-alert-actions">
            <button
              type="button"
              className="button button-primary button-compact"
              data-testid="retry-evidence-media"
              onClick={handleRetryFailedMedia}
            >
              Tải lại ảnh bằng chứng
            </button>
          </div>
        </div>
      )}

      {detail.decision && (
        <section
          className={`dispute-decision-outcome ${
            detail.decision.conclusion === 'HUY' ? 'dispute-decision-outcome-cancel' : ''
          }`}
          aria-label="Kết quả quyết định kiểm duyệt"
        >
          <div className="dispute-subcard-header">
            <div>
              <p className="eyebrow" style={{ marginBottom: 6 }}>
                QUYẾT ĐỊNH ĐÃ GHI NHẬN
              </p>
              <h2 style={{ margin: 0 }}>{formatConclusion(detail.decision.conclusion)}</h2>
            </div>
            <span className="status-badge dispute-badge-resolved">
              {detail.decision.decidedByName} · {formatDateTime(detail.decision.decidedAt)}
            </span>
          </div>

          <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
            <strong>Căn cứ quyết định:</strong> {detail.decision.basis}
          </p>

          {detail.decision.conclusion === 'HOAN_TAT' ? (
            <p className="dispute-muted-note">
              Đồ vật đã chuyển trạng thái Đã bán/Đã cho, tin đăng được lưu trữ, mã hoàn tất đã vô hiệu.
              {detail.reviewDeadlineAt
                ? ` Mở thời hạn đánh giá 15 ngày cho người mua đến ${formatDateTime(detail.reviewDeadlineAt)}.`
                : ''}
            </p>
          ) : (
            <>
              <p className="dispute-muted-note">
                Mã hoàn tất đã bị vô hiệu và đồ vật thành phần đã giải phóng về Còn hàng. Trạng thái tin đăng sau hủy:{' '}
                <strong>{formatListingStatus(detail.decision.listingStatusAfter)}</strong>.
              </p>
              {detail.decision.listingStatusAfter === 'AN' && (
                <div className="dispute-hidden-listing-alert" role="status" data-testid="listing-hidden-reason">
                  <strong>Tin đăng được giữ trạng thái Ẩn (không tự công khai lại):</strong>{' '}
                  {detail.decision.listingHiddenReason ||
                    'Tin đăng không còn đủ điều kiện công khai theo quy định.'}
                </div>
              )}
            </>
          )}
        </section>
      )}

      <div className="dispute-detail-layout">
        <div className="dispute-dossier-col">
          {/* 1. Thông tin giao dịch & các bên */}
          <section className="disputes-card" aria-label="Thông tin giao dịch">
            <h2>Thông tin giao dịch & các bên</h2>
            <dl className="dispute-meta-grid">
              <div className="dispute-meta-item">
                <dt>Mã giao dịch</dt>
                <dd className="dispute-code">{detail.orderId}</dd>
              </div>
              <div className="dispute-meta-item">
                <dt>Tin đăng</dt>
                <dd>
                  <strong>{detail.listing.title}</strong> · {formatListingStatus(detail.listing.status)}
                  {detail.listing.isCombo ? ' · Combo' : ''}
                </dd>
              </div>
              <div className="dispute-meta-item">
                <dt>Giá thỏa thuận / Niêm yết</dt>
                <dd>
                  <strong>{formatVnd(detail.agreedPriceVnd, detail.listing.isFree)}</strong> /{' '}
                  {formatVnd(detail.listing.listedPriceVnd, detail.listing.isFree)}
                </dd>
              </div>
              <div className="dispute-meta-item">
                <dt>Lý do chuyển xử lý</dt>
                <dd>
                  {formatEscalationReason(detail.escalationReason)} · {formatDateTime(detail.escalatedAt)}
                </dd>
              </div>
              <div className="dispute-meta-item">
                <dt>Người mua (Zero-PII)</dt>
                <dd>
                  <strong>{detail.buyer.displayName}</strong> · Điểm uy tín: {detail.buyer.reputationScore}
                </dd>
              </div>
              <div className="dispute-meta-item">
                <dt>Người bán (Zero-PII)</dt>
                <dd>
                  <strong>{detail.seller.displayName}</strong> · Điểm uy tín: {detail.seller.reputationScore}
                </dd>
              </div>
              <div className="dispute-meta-item">
                <dt>Hạn phản hồi KDV (3 ngày làm việc)</dt>
                <dd>
                  {formatDateTime(detail.responseDeadlineAt)}
                  {isSlaOverdue && <span className="dispute-sla-overdue-text"> · Đã quá hạn phản hồi SLA</span>}
                </dd>
              </div>
              <div className="dispute-meta-item">
                <dt>Lịch hẹn bàn giao chốt</dt>
                <dd>
                  {detail.meetingTime || detail.meetingLocation
                    ? `${formatDateTime(detail.meetingTime)} · ${detail.meetingLocation || 'Chưa rõ địa điểm'}`
                    : 'Chưa chốt lịch hẹn'}
                </dd>
              </div>
              <div className="dispute-meta-item">
                <dt>Bắt đầu giao / Báo giao</dt>
                <dd>
                  Bắt đầu: {formatDateTime(detail.deliveryStartedAt)} · Báo giao:{' '}
                  {formatDateTime(detail.reportedDeliveredAt)}
                </dd>
              </div>
              <div className="dispute-meta-item">
                <dt>Mốc kết thúc</dt>
                <dd>
                  {detail.completedAt
                    ? `Hoàn tất: ${formatDateTime(detail.completedAt)}`
                    : detail.cancelledAt
                      ? `Đã hủy: ${formatDateTime(detail.cancelledAt)}`
                      : 'Chưa kết thúc'}
                </dd>
              </div>
            </dl>
          </section>

          {/* 2. Đồ vật thành phần */}
          <section className="disputes-card" aria-label="Đồ vật thành phần">
            <h2>Đồ vật thành phần ({detail.items.length})</h2>
            {detail.items.length === 0 ? (
              <p className="dispute-muted-note">Không có danh sách đồ vật thành phần.</p>
            ) : (
              <ul className="dispute-sublist">
                {detail.items.map((item) => (
                  <li key={item.id} className="dispute-subcard">
                    <div className="dispute-subcard-header">
                      <strong>{item.name}</strong>
                      <div className="badge-group">
                        <span className="status-badge dispute-badge-neutral">{formatItemStatus(item.status)}</span>
                        {item.heldByThisOrder && (
                          <span className="status-badge dispute-badge-ready">Đang giữ cho giao dịch này</span>
                        )}
                      </div>
                    </div>
                    <p className="dispute-muted-note">Tình trạng: {formatItemCondition(item.condition)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 3. Ảnh bàn giao & báo giao */}
          <section className="disputes-card" aria-label="Ảnh bàn giao">
            <div className="dispute-subcard-header">
              <h2>Ảnh bàn giao ({detail.handoverPhotos.length})</h2>
              <span className="dispute-muted-note">Báo giao lúc: {formatDateTime(detail.reportedDeliveredAt)}</span>
            </div>
            {detail.deliveryNote && (
              <p className="notice">
                <strong>Ghi chú bàn giao của người bán:</strong> {detail.deliveryNote}
              </p>
            )}
            {detail.handoverPhotos.length === 0 ? (
              <p className="dispute-muted-note">Chưa có ảnh bàn giao nào được đính kèm.</p>
            ) : (
              <div className="dispute-photo-grid">
                {detail.handoverPhotos.map((photo, index) => {
                  const subtitle = [formatDateTime(photo.uploadedAt), formatFileSize(photo.sizeBytes)]
                    .filter(Boolean)
                    .join(' · ');
                  return renderPhotoTile(
                    {
                      key: `handover:${photo.id}`,
                      url: photo.url,
                      label: `Ảnh bàn giao #${index + 1}`,
                    },
                    subtitle,
                  );
                })}
              </div>
            )}
          </section>

          {/* 4. Lịch hẹn giao nhận */}
          <section className="disputes-card" aria-label="Đề xuất lịch hẹn">
            <h2>Lịch hẹn giao nhận ({detail.scheduleProposals.length})</h2>
            {detail.scheduleProposals.length === 0 ? (
              <p className="dispute-muted-note">Chưa có đề xuất lịch hẹn nào được ghi nhận.</p>
            ) : (
              <ul className="dispute-sublist">
                {detail.scheduleProposals.map((proposal) => (
                  <li key={proposal.id} className="dispute-subcard">
                    <div className="dispute-subcard-header">
                      <strong>{proposal.proposedByName}</strong>
                      <span className="status-badge dispute-badge-neutral">
                        {formatScheduleStatus(proposal.status)}
                      </span>
                    </div>
                    <p>
                      Thời gian: {formatDateTime(proposal.proposedTime)} · Địa điểm:{' '}
                      {proposal.proposedLocation || 'Chưa ghi rõ'}
                    </p>
                    {proposal.note && <p>Ghi chú: {proposal.note}</p>}
                    {proposal.rejectReason && <p className="error">Lý do từ chối: {proposal.rejectReason}</p>}
                    <span className="dispute-muted-note">
                      Tạo lúc {formatDateTime(proposal.createdAt)}
                      {proposal.respondedAt ? ` · Phản hồi lúc ${formatDateTime(proposal.respondedAt)}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 5. Yêu cầu hủy & phản hồi */}
          <section className="disputes-card" aria-label="Yêu cầu hủy giao dịch">
            <h2>Yêu cầu hủy & phản hồi ({detail.cancelRequests.length})</h2>
            {detail.cancelRequests.length === 0 ? (
              <p className="dispute-muted-note">Không có yêu cầu hủy nào cho giao dịch này.</p>
            ) : (
              <ul className="dispute-sublist">
                {detail.cancelRequests.map((req) => (
                  <li key={req.id} className="dispute-subcard">
                    <div className="dispute-subcard-header">
                      <span>
                        <strong>{req.requesterName}</strong> ({formatPartyRole(req.requesterRole)})
                      </span>
                      <span className="status-badge dispute-badge-cancel">{formatCancelStatus(req.status)}</span>
                    </div>
                    <p>
                      {req.reasonCode ? <strong>[{formatCancelReasonCode(req.reasonCode)}] </strong> : null}
                      {req.reasonNote || 'Không kèm ghi chú chi tiết.'}
                    </p>
                    {req.responderName && (
                      <p>
                        <strong>Phản hồi ({req.responderName}):</strong>{' '}
                        {req.responseNote || 'Không có ghi chú phản hồi.'}
                      </p>
                    )}
                    <span className="dispute-muted-note">
                      Gửi lúc {formatDateTime(req.createdAt)}
                      {req.respondedAt ? ` · Phản hồi lúc ${formatDateTime(req.respondedAt)}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 6. Yêu cầu bổ sung bằng chứng & phản hồi */}
          <section className="disputes-card" aria-label="Yêu cầu bổ sung bằng chứng">
            <h2>Lịch sử yêu cầu bổ sung bằng chứng ({detail.evidenceRequests.length})</h2>
            {detail.evidenceRequests.length === 0 ? (
              <p className="dispute-muted-note">Chưa có yêu cầu bổ sung bằng chứng nào từ kiểm duyệt viên.</p>
            ) : (
              <ul className="dispute-sublist">
                {detail.evidenceRequests.map((req) => (
                  <li key={req.id} className="dispute-subcard">
                    <div className="dispute-subcard-header">
                      <div>
                        <strong>Yêu cầu tới: {formatPartyRole(req.targetParty)}</strong>
                        <div className="dispute-muted-note">
                          Người yêu cầu: {req.requestedByName} · Tạo lúc {formatDateTime(req.createdAt)} · Hạn bổ sung:{' '}
                          {formatDateTime(req.dueAt)}
                        </div>
                      </div>
                      <span
                        className={`status-badge ${
                          req.status === 'CHO_BO_SUNG'
                            ? 'dispute-badge-waiting'
                            : req.status === 'DA_PHAN_HOI'
                              ? 'dispute-badge-resolved'
                              : req.status === 'QUA_HAN'
                                ? 'dispute-badge-overdue'
                                : 'dispute-badge-neutral'
                        }`}
                      >
                        {formatEvidenceRequestStatus(req.status)}
                      </span>
                    </div>
                    <p>{req.instruction}</p>

                    {req.responses.length === 0 ? (
                      <p className="dispute-muted-note">Chưa có phản hồi từ bên được yêu cầu.</p>
                    ) : (
                      <ul className="dispute-sublist">
                        {req.responses.map((response) => (
                          <li key={response.id} className="dispute-subcard" style={{ background: '#fff' }}>
                            <div className="dispute-subcard-header">
                              <strong>
                                {response.senderName} ({formatPartyRole(response.senderRole)})
                              </strong>
                              <span className="dispute-muted-note">{formatDateTime(response.createdAt)}</span>
                            </div>
                            <p>{response.note}</p>
                            {response.attachments.length > 0 && (
                              <div className="dispute-photo-grid">
                                {response.attachments.map((att, index) => {
                                  const subtitle = [formatDateTime(att.uploadedAt), formatFileSize(att.sizeBytes)]
                                    .filter(Boolean)
                                    .join(' · ');
                                  return renderPhotoTile(
                                    {
                                      key: `supplementary:${att.id}`,
                                      url: att.url,
                                      label: att.originalFilename || `Ảnh bổ sung #${index + 1}`,
                                    },
                                    subtitle,
                                  );
                                })}
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 7. Nhật ký trao đổi */}
          <section className="disputes-card" aria-label="Nhật ký trao đổi">
            <h2>Nhật ký trao đổi ({detail.chatMessages.length})</h2>
            {detail.chatMessages.length === 0 ? (
              <p className="dispute-muted-note">Không có tin nhắn trao đổi nào giữa hai bên cho tin đăng này.</p>
            ) : (
              <ul className="dispute-chat-list">
                {detail.chatMessages.map((msg) => (
                  <li
                    key={msg.id}
                    className={`dispute-chat-item ${
                      msg.senderRole === 'SELLER' ? 'dispute-chat-item-seller' : ''
                    }`}
                  >
                    <div className="dispute-subcard-header">
                      <strong>
                        {msg.senderName} ({formatPartyRole(msg.senderRole)})
                      </strong>
                      <span className="dispute-muted-note">{formatDateTime(msg.sentAt)}</span>
                    </div>
                    <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{msg.content}</p>
                    {msg.proposedPriceVnd != null && (
                      <span className="status-badge dispute-badge-neutral" style={{ width: 'fit-content' }}>
                        Đề xuất giá: {formatVnd(msg.proposedPriceVnd)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 8. Lịch sử trạng thái */}
          <section className="disputes-card" aria-label="Lịch sử trạng thái">
            <h2>Lịch sử trạng thái ({detail.timeline.length})</h2>
            {detail.timeline.length === 0 ? (
              <p className="dispute-muted-note">Chưa có bản ghi lịch sử trạng thái.</p>
            ) : (
              <ol className="dispute-timeline">
                {detail.timeline.map((entry) => (
                  <li
                    key={entry.id}
                    className={`dispute-timeline-item ${
                      entry.actorRole === 'MODERATOR' ? 'dispute-timeline-item-mod' : ''
                    }`}
                  >
                    <div className="dispute-subcard-header">
                      <strong>{formatTimelineAction(entry.action)}</strong>
                      <span className="dispute-muted-note">{formatDateTime(entry.createdAt)}</span>
                    </div>
                    <div className="dispute-muted-note">
                      {entry.fromStatus
                        ? `${formatOrderStatus(entry.fromStatus)} → ${formatOrderStatus(entry.toStatus)}`
                        : formatOrderStatus(entry.toStatus)}{' '}
                      · Thực hiện bởi: {formatPartyRole(entry.actorRole)}
                    </div>
                    {entry.note && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{entry.note}</p>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        {/* Cột phải: Bảng thao tác Kiểm duyệt viên */}
        <aside className="dispute-actions-col" aria-label="Bảng xử lý kiểm duyệt">
          {(stale || actionError) && (
            <div className="dispute-actions-inline-feedback" data-testid="actions-inline-feedback">
              {stale && <p className="notice notice-error">{stale}</p>}
              {actionError && <p className="notice notice-error">{actionError}</p>}
            </div>
          )}

          {/* Panel A: Ra quyết định Hoàn tất / Hủy */}
          <section className="disputes-card">
            <div>
              <p className="eyebrow" style={{ marginBottom: 6 }}>
                QUYẾT ĐỊNH KIỂM DUYỆT
              </p>
              <h2>Ra quyết định xử lý</h2>
            </div>

            {!detail.decidable ? (
              <p className="notice" role="status">
                Giao dịch này đang ở trạng thái <strong>{formatOrderStatus(detail.status)}</strong> nên không thể ra
                quyết định bổ sung.
              </p>
            ) : (
              <>
                {!allMediaLoaded && (
                  <p className="notice notice-error" data-testid="decision-disabled-hint">
                    {failedMediaCount > 0
                      ? 'Nút "Xác nhận hoàn tất" và "Hủy giao dịch" đang bị vô hiệu hóa vì chưa tải được đầy đủ ảnh bàn giao/bằng chứng (UC-29 §3.3). Hãy tải lại ảnh bằng chứng trước khi quyết định.'
                      : 'Đang tải đầy đủ ảnh bàn giao và bằng chứng trước khi mở khóa thao tác quyết định…'}
                  </p>
                )}

                <div className="dispute-decision-choices">
                  <button
                    type="button"
                    className={`button ${selectedConclusion === 'HOAN_TAT' ? 'button-primary' : ''}`}
                    data-testid="decision-complete-btn"
                    disabled={decisionButtonsDisabled}
                    onClick={() => handleSelectConclusion('HOAN_TAT')}
                  >
                    Xác nhận hoàn tất
                  </button>
                  <button
                    type="button"
                    className={`button ${selectedConclusion === 'HUY' ? 'button-danger' : ''}`}
                    data-testid="decision-cancel-btn"
                    disabled={decisionButtonsDisabled}
                    onClick={() => handleSelectConclusion('HUY')}
                  >
                    Hủy giao dịch
                  </button>
                </div>

                {selectedConclusion && (
                  <form className="dispute-form" onSubmit={handleReviewDecision} noValidate>
                    <p className="notice">
                      {selectedConclusion === 'HOAN_TAT'
                        ? 'Hoàn tất giao dịch: chuyển đồ vật sang Đã bán/Đã cho, lưu trữ tin đăng, vô hiệu mã OTP và mở hạn đánh giá 15 ngày cho người mua. Không thay đổi điểm uy tín.'
                        : 'Hủy giao dịch: vô hiệu mã OTP, giải phóng đồ vật về Còn hàng và kiểm tra điều kiện công khai lại tin đăng (hoặc giữ Ẩn kèm lý do cho người bán). Không thay đổi điểm uy tín.'}
                    </p>

                    <label htmlFor="dispute-basis-input">
                      Căn cứ quyết định ({MIN_BASIS}–{MAX_BASIS} ký tự)
                      <textarea
                        id="dispute-basis-input"
                        rows={5}
                        maxLength={MAX_BASIS}
                        disabled={busy || confirmingDecision}
                        value={basis}
                        aria-invalid={Boolean(basisError)}
                        aria-describedby={basisError ? 'dispute-basis-error' : 'dispute-basis-help'}
                        placeholder="Nêu rõ bằng chứng đã đối chiếu (ảnh bàn giao, lịch hẹn, trao đổi, phản hồi của hai bên) làm căn cứ cho kết luận…"
                        onChange={(event) => {
                          setBasis(event.target.value);
                          setBasisError('');
                        }}
                      />
                    </label>

                    <div className="dispute-field-footer">
                      <span id="dispute-basis-help">Tối thiểu {MIN_BASIS} ký tự sau khi cắt khoảng trắng.</span>
                      <span>
                        {basis.trim().length}/{MAX_BASIS}
                      </span>
                    </div>

                    {basisError && (
                      <p id="dispute-basis-error" className="error" role="alert">
                        {basisError}
                      </p>
                    )}

                    {!confirmingDecision ? (
                      <div className="form-actions-inline">
                        <button
                          type="submit"
                          className={`button ${
                            selectedConclusion === 'HUY' ? 'button-danger' : 'button-primary'
                          } button-compact`}
                          data-testid="decision-review-btn"
                          disabled={decisionButtonsDisabled}
                        >
                          Tiếp tục xác nhận
                        </button>
                        <button
                          type="button"
                          className="button button-compact"
                          disabled={busy}
                          onClick={() => {
                            setSelectedConclusion(null);
                            setBasisError('');
                            setConfirmingDecision(false);
                          }}
                        >
                          Đóng
                        </button>
                      </div>
                    ) : (
                      <div className="confirm-summary" data-testid="decision-confirm-box">
                        <h4>Xác nhận gửi quyết định: {formatConclusion(selectedConclusion)}</h4>
                        <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                          <strong>Căn cứ:</strong> {basis.trim()}
                        </p>
                        <p className="dispute-muted-note">
                          Thao tác này không thể hoàn tác và không làm thay đổi điểm uy tín của người mua hay người bán.
                        </p>
                        <div className="form-actions-inline">
                          <button
                            type="button"
                            className={`button ${
                              selectedConclusion === 'HUY' ? 'button-danger' : 'button-primary'
                            } button-compact`}
                            data-testid="decision-confirm-submit-btn"
                            disabled={decisionButtonsDisabled}
                            onClick={() => void handleConfirmDecision()}
                          >
                            {activeAction === 'complete' || activeAction === 'cancel'
                              ? 'Đang lưu quyết định…'
                              : 'Xác nhận gửi quyết định'}
                          </button>
                          <button
                            type="button"
                            className="button button-compact"
                            disabled={busy}
                            onClick={() => setConfirmingDecision(false)}
                          >
                            Chỉnh sửa căn cứ
                          </button>
                        </div>
                      </div>
                    )}
                  </form>
                )}
              </>
            )}
          </section>

          {/* Panel B: Yêu cầu bổ sung bằng chứng (UC-29 Alt 2) */}
          {detail.decidable && (
            <section className="disputes-card" aria-label="Tạo yêu cầu bổ sung bằng chứng">
              <div>
                <p className="eyebrow" style={{ marginBottom: 6 }}>
                  LUỒNG THAY THẾ · UC-29 ALT 2
                </p>
                <h2>Yêu cầu bổ sung bằng chứng</h2>
              </div>

              {hasActiveEvidenceRequest && (
                <p className="notice" role="status" data-testid="active-evidence-lock-notice">
                  Đang có một yêu cầu bổ sung bằng chứng ở trạng thái <strong>Đang chờ bổ sung</strong>. Vui lòng đợi
                  phản hồi hoặc hết hạn trước khi gửi yêu cầu mới.
                </p>
              )}

              <form className="dispute-form" onSubmit={(event) => void handleSubmitEvidenceRequest(event)} noValidate>
                <label htmlFor="evidence-target-party">
                  Bên cần bổ sung
                  <select
                    id="evidence-target-party"
                    value={targetParty}
                    disabled={busy || refreshing || hasActiveEvidenceRequest}
                    onChange={(event) => setTargetParty(event.target.value as EvidenceTargetParty)}
                  >
                    <option value="BUYER">Người mua</option>
                    <option value="SELLER">Người bán</option>
                    <option value="BOTH">Cả hai bên</option>
                  </select>
                </label>

                <label htmlFor="evidence-instruction-input">
                  Nội dung cần cung cấp ({MIN_EVIDENCE_INSTRUCTION}–{MAX_EVIDENCE_INSTRUCTION} ký tự)
                  <textarea
                    id="evidence-instruction-input"
                    rows={4}
                    maxLength={MAX_EVIDENCE_INSTRUCTION}
                    disabled={busy || refreshing || hasActiveEvidenceRequest}
                    value={instruction}
                    aria-invalid={Boolean(evidenceInstructionError)}
                    aria-describedby={evidenceInstructionError ? 'evidence-instruction-error' : undefined}
                    placeholder="Ví dụ: Đề nghị người mua cung cấp ảnh chụp sản phẩm hoặc xác nhận thời điểm đã gặp giao nhận…"
                    onChange={(event) => {
                      setInstruction(event.target.value);
                      setEvidenceInstructionError('');
                    }}
                  />
                </label>

                {evidenceInstructionError && (
                  <p id="evidence-instruction-error" className="error" role="alert">
                    {evidenceInstructionError}
                  </p>
                )}

                <label htmlFor="evidence-due-hours">
                  Thời hạn phản hồi (giờ, mặc định 48 giờ)
                  <input
                    id="evidence-due-hours"
                    type="number"
                    min={MIN_DUE_HOURS}
                    max={MAX_DUE_HOURS}
                    disabled={busy || refreshing || hasActiveEvidenceRequest}
                    value={dueInHours}
                    aria-invalid={Boolean(evidenceDueHoursError)}
                    aria-describedby={evidenceDueHoursError ? 'evidence-due-hours-error' : undefined}
                    onChange={(event) => {
                      setDueInHours(event.target.value);
                      setEvidenceDueHoursError('');
                    }}
                  />
                </label>

                {evidenceDueHoursError && (
                  <p id="evidence-due-hours-error" className="error" role="alert">
                    {evidenceDueHoursError}
                  </p>
                )}

                <button
                  type="submit"
                  className="button button-compact"
                  data-testid="submit-evidence-request-btn"
                  disabled={busy || refreshing || hasActiveEvidenceRequest}
                >
                  {activeAction === 'evidence' ? 'Đang gửi yêu cầu…' : 'Gửi yêu cầu bổ sung'}
                </button>
              </form>
            </section>
          )}
        </aside>
      </div>
    </section>
  );
}

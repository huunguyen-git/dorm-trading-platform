import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { isRestrictedError } from '../listings/sellerApi';
import {
  pickImagesFromLibrary,
  takePhotoWithCamera,
  type PickableImageAsset,
} from '../media/imagePicker';
import {
  extractDisputeError,
  fetchDisputeEvidenceDataUri,
  fetchOrderDispute,
  submitDisputeEvidenceResponse,
} from '../orders/disputeApi';
import {
  DISPUTE_EVIDENCE_NOTE_MAX_LENGTH,
  DISPUTE_EVIDENCE_NOTE_MIN_LENGTH,
  formatDisputeOrderStatus,
  formatEvidenceFileSize,
  getEscalationReasonMeta,
  getEvidenceRequestStatusMeta,
  getTargetPartyLabel,
  getTimelineActionLabel,
  getTimelineActorLabel,
  hasDisputeContent,
  MAX_DISPUTE_EVIDENCE_FILES,
  type DisputeAttachment,
  type DisputeEvidenceRequest,
  type MemberDispute,
} from '../orders/disputeTypes';
import { formatOrderDateTime, type OrderDetail } from '../orders/types';
import { component, primitive, semantic } from '../theme';
import {
  BottomSheet,
  CollapsibleAlert,
  FormField,
  HairlineDivider,
  Icon,
  InlineBanner,
  SectionHeading,
  StatusIndicator,
} from './ui';

export interface OrderDisputeSectionProps {
  order: OrderDetail;
  isRestricted: boolean;
  onDisputeUpdated?: (dispute: MemberDispute) => void;
}

function isDisputeEligibleOrderStatus(status: OrderDetail['status']): boolean {
  return status === 'CHO_XU_LY' || status === 'HOAN_TAT' || status === 'HUY';
}

export function OrderDisputeSection({
  order,
  isRestricted,
  onDisputeUpdated,
}: OrderDisputeSectionProps) {
  const eligible = isDisputeEligibleOrderStatus(order.status);

  const [dispute, setDispute] = useState<MemberDispute | null>(null);
  const [loading, setLoading] = useState<boolean>(order.status === 'CHO_XU_LY');
  const [loadError, setLoadError] = useState('');
  const [submitNotice, setSubmitNotice] = useState('');

  // Evidence submission BottomSheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteError, setNoteError] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<PickableImageAsset[]>([]);
  const [pickerError, setPickerError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Private attachment preview BottomSheet state
  const [previewAttachment, setPreviewAttachment] = useState<DisputeAttachment | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  const mountedRef = useRef(true);
  const fetchSeqRef = useRef(0);
  const previewSeqRef = useRef(0);
  const pickerInFlightRef = useRef(false);
  const disputeRef = useRef<MemberDispute | null>(null);
  const loadingRef = useRef<boolean>(loading);
  const loadErrorRef = useRef<string>(loadError);
  const prevOrderIdRef = useRef<string>(order.id);

  disputeRef.current = dispute;
  loadingRef.current = loading;
  loadErrorRef.current = loadError;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadDispute = useCallback(
    async (opts?: { forceLoading?: boolean }) => {
      if (!eligible) {
        if (disputeRef.current !== null) setDispute(null);
        if (loadingRef.current) setLoading(false);
        if (loadErrorRef.current) setLoadError('');
        return;
      }

      const seq = ++fetchSeqRef.current;
      const showSpinner = Boolean(opts?.forceLoading || order.status === 'CHO_XU_LY');
      if (showSpinner && !loadingRef.current) {
        setLoading(true);
      }
      if (loadErrorRef.current) {
        setLoadError('');
      }

      try {
        const data = await fetchOrderDispute(order.id);
        if (!mountedRef.current || seq !== fetchSeqRef.current) return;

        if (!hasDisputeContent(data)) {
          if (disputeRef.current !== null) setDispute(null);
          if (loadingRef.current) setLoading(false);
          return;
        }

        setDispute(data);
        if (loadingRef.current) setLoading(false);
      } catch (err) {
        if (!mountedRef.current || seq !== fetchSeqRef.current) return;
        if (loadingRef.current) setLoading(false);
        if (isRestrictedError(err)) {
          return;
        }
        if (order.status === 'CHO_XU_LY' || disputeRef.current !== null) {
          setLoadError(
            extractDisputeError(
              err,
              'Không thể tải hồ sơ xử lý tranh chấp. Vui lòng thử lại.',
            ),
          );
        }
      }
    },
    [eligible, order.id, order.status],
  );

  useEffect(() => {
    const orderChanged = prevOrderIdRef.current !== order.id;
    prevOrderIdRef.current = order.id;

    if (orderChanged) {
      setSheetOpen(false);
      setActiveRequestId(null);
      setNoteDraft('');
      setNoteError('');
      setSelectedFiles([]);
      setPickerError('');
      setSubmitError('');
      setSubmitNotice('');
      setPreviewAttachment(null);
      setPreviewUri(null);
      setPreviewError('');
      if (disputeRef.current !== null) setDispute(null);
    }

    if (!eligible) {
      if (disputeRef.current !== null) setDispute(null);
      if (loadingRef.current) setLoading(false);
      if (loadErrorRef.current) setLoadError('');
      return;
    }

    // Avoid redundant GET right after our own evidence submission already updated state to the latest version.
    if (
      !orderChanged &&
      disputeRef.current &&
      disputeRef.current.orderId === order.id &&
      disputeRef.current.status === order.status &&
      disputeRef.current.version === order.version
    ) {
      return;
    }

    void loadDispute();
  }, [eligible, loadDispute, order.id, order.status, order.version]);

  const openEvidenceSheet = (request: DisputeEvidenceRequest) => {
    if (isRestricted || !request.canSubmitResponse) return;
    setActiveRequestId(request.id);
    setNoteDraft('');
    setNoteError('');
    setSelectedFiles([]);
    setPickerError('');
    setSubmitError('');
    setSheetOpen(true);
  };

  const handlePickFromLibrary = async () => {
    if (pickerInFlightRef.current || submitting) return;
    setPickerError('');
    const remaining = Math.max(0, MAX_DISPUTE_EVIDENCE_FILES - selectedFiles.length);
    if (remaining <= 0) {
      setPickerError(`Bạn chỉ có thể đính kèm tối đa ${MAX_DISPUTE_EVIDENCE_FILES} ảnh.`);
      return;
    }
    pickerInFlightRef.current = true;
    try {
      const picked = await pickImagesFromLibrary(remaining);
      if (!mountedRef.current || picked.length === 0) return;
      setSelectedFiles((prev) => {
        const existingUris = new Set(prev.map((item) => item.uri));
        const next = [...prev];
        for (const asset of picked) {
          if (next.length >= MAX_DISPUTE_EVIDENCE_FILES) break;
          if (!existingUris.has(asset.uri)) {
            existingUris.add(asset.uri);
            next.push(asset);
          }
        }
        return next;
      });
    } catch (err) {
      if (!mountedRef.current) return;
      setPickerError(extractDisputeError(err, 'Không thể chọn ảnh từ thư viện.'));
    } finally {
      pickerInFlightRef.current = false;
    }
  };

  const handleTakePhoto = async () => {
    if (pickerInFlightRef.current || submitting) return;
    setPickerError('');
    if (selectedFiles.length >= MAX_DISPUTE_EVIDENCE_FILES) {
      setPickerError(`Bạn chỉ có thể đính kèm tối đa ${MAX_DISPUTE_EVIDENCE_FILES} ảnh.`);
      return;
    }
    pickerInFlightRef.current = true;
    try {
      const photo = await takePhotoWithCamera();
      if (!mountedRef.current || !photo) return;
      setSelectedFiles((prev) => {
        if (prev.length >= MAX_DISPUTE_EVIDENCE_FILES) return prev;
        if (prev.some((item) => item.uri === photo.uri)) return prev;
        return [...prev, photo];
      });
    } catch (err) {
      if (!mountedRef.current) return;
      setPickerError(extractDisputeError(err, 'Không thể chụp ảnh bằng chứng.'));
    } finally {
      pickerInFlightRef.current = false;
    }
  };

  const handleRemoveSelectedFile = (index: number) => {
    setPickerError('');
    setSelectedFiles((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmitEvidence = async () => {
    if (!activeRequestId || submitting || isRestricted) return;
    setNoteError('');
    setSubmitError('');

    const trimmed = noteDraft.trim();
    if (trimmed.length < DISPUTE_EVIDENCE_NOTE_MIN_LENGTH) {
      setNoteError(
        `Vui lòng nhập nội dung bổ sung tối thiểu ${DISPUTE_EVIDENCE_NOTE_MIN_LENGTH} ký tự.`,
      );
      return;
    }
    if (trimmed.length > DISPUTE_EVIDENCE_NOTE_MAX_LENGTH) {
      setNoteError(
        `Nội dung bổ sung tối đa ${DISPUTE_EVIDENCE_NOTE_MAX_LENGTH} ký tự.`,
      );
      return;
    }

    setSubmitting(true);
    try {
      const updated = await submitDisputeEvidenceResponse(
        order.id,
        activeRequestId,
        trimmed,
        selectedFiles,
      );
      if (!mountedRef.current) return;
      setDispute(updated);
      setSheetOpen(false);
      setActiveRequestId(null);
      setNoteDraft('');
      setSelectedFiles([]);
      setPickerError('');
      setSubmitError('');
      setSubmitNotice(
        'Đã gửi bằng chứng bổ sung thành công. Kiểm duyệt viên sẽ xem xét hồ sơ của bạn.',
      );
      onDisputeUpdated?.(updated);
    } catch (err) {
      if (!mountedRef.current) return;
      if (isRestrictedError(err)) {
        setSheetOpen(false);
        return;
      }
      setSubmitError(
        extractDisputeError(err, 'Không thể gửi bằng chứng bổ sung. Vui lòng thử lại.'),
      );
    } finally {
      if (mountedRef.current) {
        setSubmitting(false);
      }
    }
  };

  const loadAttachmentPreview = useCallback(async (att: DisputeAttachment) => {
    const seq = ++previewSeqRef.current;
    setPreviewAttachment(att);
    setPreviewUri(null);
    setPreviewError('');
    setPreviewLoading(true);
    try {
      const uri = await fetchDisputeEvidenceDataUri(att.url);
      if (!mountedRef.current || seq !== previewSeqRef.current) return;
      if (!uri) {
        setPreviewError('Không tìm thấy tệp ảnh bằng chứng hoặc bạn không có quyền xem.');
      } else {
        setPreviewUri(uri);
      }
    } catch (err) {
      if (!mountedRef.current || seq !== previewSeqRef.current) return;
      setPreviewError(extractDisputeError(err, 'Không thể tải ảnh bằng chứng. Vui lòng thử lại.'));
    } finally {
      if (mountedRef.current && seq === previewSeqRef.current) {
        setPreviewLoading(false);
      }
    }
  }, []);

  if (!eligible) {
    return null;
  }

  if (loading && !dispute) {
    return (
      <>
        <View style={styles.sectionGap} />
        <View style={styles.section} testID="dispute-loading">
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={semantic.color.accent} />
            <Text style={styles.caption}>Đang tải hồ sơ xử lý tranh chấp…</Text>
          </View>
        </View>
      </>
    );
  }

  if (loadError && !dispute) {
    return (
      <>
        <View style={styles.sectionGap} />
        <View style={styles.section} testID="dispute-load-error">
          <InlineBanner
            tone="danger"
            title="Chưa thể tải hồ sơ tranh chấp"
            message={loadError}
            actionLabel="Thử lại"
            actionTestID="dispute-retry-button"
            onActionPress={() => void loadDispute({ forceLoading: true })}
          />
        </View>
      </>
    );
  }

  if (!hasDisputeContent(dispute)) {
    return null;
  }

  const isPendingReview = dispute.status === 'CHO_XU_LY';
  const reasonMeta = getEscalationReasonMeta(dispute.escalationReason);
  const decision = dispute.decision;
  const activeEvidenceRequest =
    dispute.evidenceRequests.find((req) => req.status === 'CHO_BO_SUNG') ?? null;
  const pastEvidenceRequests = dispute.evidenceRequests.filter(
    (req) => req.id !== activeEvidenceRequest?.id,
  );
  const sheetRequest =
    dispute.evidenceRequests.find((req) => req.id === activeRequestId) ?? activeEvidenceRequest;
  const remainingPhotoSlots = Math.max(0, MAX_DISPUTE_EVIDENCE_FILES - selectedFiles.length);

  const renderResponsesList = (request: DisputeEvidenceRequest) => {
    if (!request.responses || request.responses.length === 0) return null;
    return (
      <View style={styles.responsesList} testID={`dispute-responses-${request.id}`}>
        {request.responses.map((resp) => (
          <View
            key={resp.id}
            style={styles.responseCard}
            testID={`dispute-response-${resp.id}`}
          >
            <View style={styles.rowBetween}>
              <Text style={styles.responseSender}>
                {resp.senderRole === 'BUYER' ? 'Người mua' : 'Người bán'}
                {resp.senderName ? ` · ${resp.senderName}` : ''}
              </Text>
              <Text style={styles.microMuted}>{formatOrderDateTime(resp.createdAt)}</Text>
            </View>
            <Text style={styles.responseNote}>{resp.note}</Text>
            {resp.attachments.length > 0 ? (
              <View style={styles.attachmentsRow}>
                {resp.attachments.map((att, idx) => (
                  <Pressable
                    key={att.id}
                    testID={`dispute-attachment-${att.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Xem ảnh bằng chứng ${att.originalFilename ?? idx + 1}`}
                    onPress={() => void loadAttachmentPreview(att)}
                    style={({ pressed }) => [styles.attachmentChip, pressed && styles.pressed]}
                  >
                    <Icon name="image" size={13} color={semantic.color.accent} />
                    <Text style={styles.attachmentChipText} numberOfLines={1}>
                      {att.originalFilename ?? `Ảnh bằng chứng ${idx + 1}`}
                    </Text>
                    {att.sizeBytes > 0 ? (
                      <Text style={styles.attachmentSizeText}>
                        {formatEvidenceFileSize(att.sizeBytes)}
                      </Text>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        ))}
      </View>
    );
  };

  return (
    <>
      <View style={styles.sectionGap} />
      <View style={styles.section} testID="order-dispute-section">
        {submitNotice ? (
          <CollapsibleAlert
            testID="dispute-submit-success-notice"
            tone="success"
            title="Đã gửi bằng chứng bổ sung"
            message={submitNotice}
            onDismiss={() => setSubmitNotice('')}
            dismissLabel="Đóng thông báo"
          />
        ) : null}

        {loadError ? (
          <InlineBanner
            tone="danger"
            message={loadError}
            actionLabel="Tải lại"
            onActionPress={() => void loadDispute({ forceLoading: true })}
          />
        ) : null}

        {/* Moderator Decision Card (HOAN_TAT / HUY) */}
        {decision ? (
          <View style={styles.cardBlock} testID="dispute-decision-card">
            <SectionHeading
              title="Kết quả xử lý của Kiểm duyệt viên"
              rightSlot={
                <StatusIndicator
                  testID="dispute-decision-conclusion-badge"
                  variant="urgent"
                  tone={decision.conclusion === 'HOAN_TAT' ? 'success' : 'danger'}
                  icon={decision.conclusion === 'HOAN_TAT' ? 'check-circle' : 'x-circle'}
                  label={
                    decision.conclusion === 'HOAN_TAT' ? 'Xác nhận hoàn tất' : 'Hủy giao dịch'
                  }
                />
              }
            />

            <View style={styles.metaStrip}>
              <View style={styles.metaCell}>
                <Text style={styles.metaLabel}>Thời điểm quyết định</Text>
                <Text style={styles.metaValue} testID="dispute-decision-decided-at">
                  {formatOrderDateTime(decision.decidedAt)}
                </Text>
              </View>
              {dispute.escalationReason ? (
                <View style={styles.metaCell}>
                  <Text style={styles.metaLabel}>Lý do chuyển xử lý</Text>
                  <Text style={styles.metaValue}>{reasonMeta.label}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.basisBox} testID="dispute-decision-basis">
              <Text style={styles.basisLabel}>Căn cứ quyết định</Text>
              <Text style={styles.basisText}>{decision.basis}</Text>
            </View>

            <View style={styles.reputationNoteRow} testID="dispute-reputation-unchanged-note">
              <Icon name="shield" size={14} color={semantic.color.textSecondary} />
              <Text style={styles.reputationNoteText}>
                Điểm uy tín không thay đổi từ quyết định này.
              </Text>
            </View>

            {/* Buyer 15-day review window (UC-30) */}
            {decision.conclusion === 'HOAN_TAT' &&
            dispute.reviewDeadlineAt &&
            dispute.viewerRole === 'BUYER' ? (
              <InlineBanner
                testID="dispute-buyer-review-window"
                tone="success"
                icon="star"
                title="Mở quyền đánh giá giao dịch (15 ngày)"
                message={`Hạn đánh giá giao dịch đến ${formatOrderDateTime(dispute.reviewDeadlineAt)}. Bạn có thể đánh giá đối tác cho giao dịch này theo quy định (UC-30).`}
              />
            ) : null}

            {/* Seller listing kept hidden warning (UC-29 Exception 4) */}
            {decision.conclusion === 'HUY' &&
            decision.listingStatusAfter === 'AN' &&
            dispute.viewerRole === 'SELLER' ? (
              <InlineBanner
                testID="dispute-seller-listing-hidden-alert"
                tone="warning"
                icon="alert-triangle"
                title="Tin đăng tạm giữ trạng thái Ẩn"
                message={`Đồ vật trong giao dịch đã trở về trạng thái Khả dụng, nhưng tin đăng được giữ ở trạng thái Ẩn do: ${
                  decision.listingHiddenReason || 'tin đăng không còn đủ điều kiện công khai tự động.'
                }`}
              />
            ) : null}

            {/* Seller listing reopened confirmation */}
            {decision.conclusion === 'HUY' &&
            decision.listingStatusAfter === 'CONG_KHAI' &&
            dispute.viewerRole === 'SELLER' ? (
              <InlineBanner
                testID="dispute-seller-listing-reopened-notice"
                tone="success"
                icon="check-circle"
                message="Đồ vật đã trở về trạng thái Khả dụng và tin đăng đã được công khai trở lại."
              />
            ) : null}
          </View>
        ) : null}

        {/* Pending Moderator Review Card (CHO_XU_LY) */}
        {isPendingReview ? (
          <View style={styles.cardBlock} testID="dispute-pending-card">
            <SectionHeading
              title="Hồ sơ chờ Kiểm duyệt viên xử lý"
              rightSlot={
                <StatusIndicator
                  testID="dispute-escalation-reason"
                  variant="soft"
                  tone={reasonMeta.tone}
                  label={reasonMeta.label}
                />
              }
            />

            <Text style={styles.bodyCaption}>{reasonMeta.description}</Text>

            <View style={styles.metaStrip}>
              <View style={styles.metaCell}>
                <Text style={styles.metaLabel}>Thời điểm chuyển xử lý</Text>
                <Text style={styles.metaValue} testID="dispute-escalated-at">
                  {formatOrderDateTime(dispute.escalatedAt)}
                </Text>
              </View>
              <View style={styles.metaCell}>
                <Text style={styles.metaLabel}>Hạn phản hồi KDV</Text>
                <Text style={styles.metaValue} testID="dispute-response-deadline">
                  {formatOrderDateTime(dispute.responseDeadlineAt)}
                </Text>
              </View>
            </View>

            <InlineBanner
              testID="dispute-sla-note"
              tone="warning"
              icon="clock"
              title="Phản hồi dự kiến trong 3 ngày làm việc"
              message={
                dispute.responseDeadlineAt
                  ? `Kiểm duyệt viên dự kiến phản hồi hồ sơ trước ${formatOrderDateTime(dispute.responseDeadlineAt)} (3 ngày làm việc kể từ lúc chuyển Chờ xử lý).`
                  : 'Kiểm duyệt viên dự kiến phản hồi hồ sơ trong 3 ngày làm việc kể từ lúc chuyển Chờ xử lý.'
              }
            />

            <InlineBanner
              testID="dispute-hold-reputation-note"
              tone="neutral"
              icon="shield"
              message="Đồ vật vẫn đang ở trạng thái Đang giữ (DANG_GIU) trong thời gian chờ quyết định. Điểm uy tín của hai bên không thay đổi từ quy trình xử lý này."
            />
          </View>
        ) : null}

        {/* Active Evidence Request (CHO_BO_SUNG) */}
        {activeEvidenceRequest ? (
          <>
            <HairlineDivider />
            <View style={styles.cardBlock} testID="dispute-active-evidence-request">
              <View style={styles.rowBetween}>
                <Text style={styles.subHeading}>Yêu cầu bổ sung bằng chứng</Text>
                <StatusIndicator
                  variant="soft"
                  tone={getEvidenceRequestStatusMeta(activeEvidenceRequest.status).tone}
                  label={getEvidenceRequestStatusMeta(activeEvidenceRequest.status).label}
                />
              </View>

              <View style={styles.evidenceBox}>
                <View style={styles.hintLine}>
                  <Icon name="user" size={14} color={semantic.color.accent} />
                  <Text style={styles.evidenceMetaText} testID="dispute-evidence-target">
                    Bên cần bổ sung: {getTargetPartyLabel(activeEvidenceRequest.targetParty)}
                  </Text>
                </View>
                <View style={styles.hintLine}>
                  <Icon name="clock" size={14} color={semantic.color.warning} />
                  <Text style={styles.evidenceMetaText} testID="dispute-evidence-due-at">
                    Hạn nộp bổ sung: {formatOrderDateTime(activeEvidenceRequest.dueAt)}
                  </Text>
                </View>
                <View style={styles.instructionWrap}>
                  <Text style={styles.basisLabel}>Nội dung Kiểm duyệt viên yêu cầu</Text>
                  <Text style={styles.instructionText} testID="dispute-evidence-instruction">
                    {activeEvidenceRequest.instruction}
                  </Text>
                </View>
              </View>

              {activeEvidenceRequest.hasViewerResponded ? (
                <View style={styles.respondedWrap}>
                  <StatusIndicator
                    testID="dispute-viewer-responded-badge"
                    variant="soft"
                    tone="success"
                    icon="check-circle"
                    label="Bạn đã gửi bằng chứng bổ sung"
                  />
                </View>
              ) : isRestricted ? (
                <InlineBanner
                  testID="dispute-restricted-readonly-notice"
                  tone="warning"
                  icon="lock"
                  title="Tài khoản ở chế độ chỉ xem"
                  message="Tài khoản của bạn đang bị khóa hoặc hạn chế nên không thể gửi bổ sung bằng chứng mới. Bạn vẫn có thể theo dõi tiến độ và quyết định của Kiểm duyệt viên."
                />
              ) : activeEvidenceRequest.canSubmitResponse ? (
                <Pressable
                  testID="open-evidence-sheet-button"
                  accessibilityRole="button"
                  accessibilityLabel="Bổ sung bằng chứng"
                  onPress={() => openEvidenceSheet(activeEvidenceRequest)}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    pressed && styles.primaryBtnPressed,
                  ]}
                >
                  <Icon name="send" size={15} color={component.button.primaryFg} />
                  <Text style={styles.primaryBtnText}>Bổ sung bằng chứng</Text>
                </Pressable>
              ) : (
                <InlineBanner
                  testID="dispute-waiting-other-party"
                  tone="neutral"
                  icon="clock"
                  message={`Đang chờ ${getTargetPartyLabel(activeEvidenceRequest.targetParty).toLowerCase()} gửi bổ sung bằng chứng trước ${formatOrderDateTime(activeEvidenceRequest.dueAt)}.`}
                />
              )}

              {renderResponsesList(activeEvidenceRequest)}
            </View>
          </>
        ) : null}

        {/* Past Evidence Requests */}
        {pastEvidenceRequests.length > 0 ? (
          <>
            <HairlineDivider />
            <View style={styles.cardBlock} testID="dispute-past-evidence-requests">
              <Text style={styles.subHeading}>
                Lịch sử yêu cầu bổ sung ({pastEvidenceRequests.length})
              </Text>
              {pastEvidenceRequests.map((req, idx) => {
                const statusMeta = getEvidenceRequestStatusMeta(req.status);
                return (
                  <Fragment key={req.id}>
                    {idx > 0 ? <HairlineDivider /> : null}
                    <View style={styles.pastReqBlock} testID={`dispute-evidence-req-${req.id}`}>
                      <View style={styles.rowBetween}>
                        <Text style={styles.pastReqTitle}>
                          {getTargetPartyLabel(req.targetParty)} · Hạn{' '}
                          {formatOrderDateTime(req.dueAt)}
                        </Text>
                        <StatusIndicator
                          variant="dot"
                          tone={statusMeta.tone}
                          label={statusMeta.label}
                        />
                      </View>
                      <Text style={styles.bodyCaption}>{req.instruction}</Text>
                      {req.hasViewerResponded ? (
                        <StatusIndicator
                          variant="soft"
                          tone="success"
                          icon="check"
                          label="Bạn đã gửi bằng chứng bổ sung"
                        />
                      ) : null}
                      {renderResponsesList(req)}
                    </View>
                  </Fragment>
                );
              })}
            </View>
          </>
        ) : null}

        {/* Dispute Timeline */}
        {dispute.timeline.length > 0 ? (
          <>
            <HairlineDivider />
            <View style={styles.cardBlock} testID="dispute-timeline-section">
              <Text style={styles.subHeading}>Lịch sử xử lý tranh chấp</Text>
              <View style={styles.timelineList}>
                {dispute.timeline.map((entry, idx) => {
                  const isLast = idx === dispute.timeline.length - 1;
                  const transitionText =
                    entry.fromStatus &&
                    entry.toStatus &&
                    entry.fromStatus !== entry.toStatus
                      ? `${formatDisputeOrderStatus(entry.fromStatus)} → ${formatDisputeOrderStatus(entry.toStatus)}`
                      : null;
                  return (
                    <View
                      key={entry.id}
                      style={styles.timelineRow}
                      testID={`dispute-timeline-item-${entry.id}`}
                    >
                      <View style={styles.timelineRail}>
                        <View
                          style={[
                            styles.timelineDot,
                            entry.actorRole === 'MODERATOR' && styles.timelineDotModerator,
                          ]}
                        />
                        {!isLast ? <View style={styles.timelineLine} /> : null}
                      </View>
                      <View style={styles.timelineContent}>
                        <Text style={styles.timelineAction}>
                          {getTimelineActionLabel(
                            entry.action,
                            entry.fromStatus,
                            entry.toStatus,
                          )}
                        </Text>
                        <Text style={styles.microMuted}>
                          {getTimelineActorLabel(entry.actorRole)} ·{' '}
                          {formatOrderDateTime(entry.createdAt)}
                        </Text>
                        {transitionText ? (
                          <Text style={styles.timelineTransition}>{transitionText}</Text>
                        ) : null}
                        {entry.note ? <Text style={styles.timelineNote}>{entry.note}</Text> : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          </>
        ) : null}
      </View>

      {/* BottomSheet: Submit Supplementary Evidence */}
      <BottomSheet
        visible={sheetOpen}
        onClose={() => {
          if (!submitting) setSheetOpen(false);
        }}
        title="Bổ sung bằng chứng"
        subtitle="Cung cấp giải trình rõ ràng và tối đa 5 ảnh chụp (JPEG/PNG/WebP, ≤ 5MB/ảnh)."
        testID="dispute-evidence-sheet"
        footerSlot={
          <View style={styles.rowActions}>
            <Pressable
              testID="cancel-dispute-evidence-button"
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel="Hủy"
              onPress={() => setSheetOpen(false)}
              style={({ pressed }) => [
                styles.secondaryBtn,
                styles.flex,
                submitting && styles.disabledBtn,
                pressed && !submitting && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryBtnText}>Hủy</Text>
            </Pressable>
            <Pressable
              testID="submit-dispute-evidence-button"
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel="Gửi bằng chứng"
              accessibilityState={{ disabled: submitting, busy: submitting }}
              onPress={() => void handleSubmitEvidence()}
              style={({ pressed }) => [
                styles.primaryBtn,
                styles.flex,
                submitting && styles.disabledBtn,
                pressed && !submitting && styles.primaryBtnPressed,
              ]}
            >
              <Icon name="send" size={15} color={component.button.primaryFg} />
              <Text style={styles.primaryBtnText}>
                {submitting ? 'Đang gửi…' : 'Gửi bằng chứng'}
              </Text>
            </Pressable>
          </View>
        }
      >
        <View style={styles.sheetBody}>
          {sheetRequest ? (
            <View style={styles.sheetReminderBox}>
              <Text style={styles.basisLabel}>Yêu cầu của Kiểm duyệt viên</Text>
              <Text style={styles.bodyCaption}>{sheetRequest.instruction}</Text>
              <Text style={styles.microMuted}>
                Hạn nộp: {formatOrderDateTime(sheetRequest.dueAt)}
              </Text>
            </View>
          ) : null}

          {submitError ? (
            <InlineBanner
              testID="dispute-evidence-submit-error"
              tone="danger"
              message={submitError}
            />
          ) : null}

          <FormField
            testID="dispute-evidence-note-input"
            label="Nội dung giải trình"
            required
            multiline
            maxLength={DISPUTE_EVIDENCE_NOTE_MAX_LENGTH}
            placeholder="Trình bày rõ sự việc, thời gian hẹn/bàn giao và thông tin cần xác minh…"
            helperText={`${noteDraft.trim().length}/${DISPUTE_EVIDENCE_NOTE_MAX_LENGTH} ký tự (tối thiểu ${DISPUTE_EVIDENCE_NOTE_MIN_LENGTH} ký tự)`}
            error={noteError}
            value={noteDraft}
            editable={!submitting}
            onChangeText={(text) => {
              setNoteDraft(text);
              if (noteError) setNoteError('');
              if (submitError) setSubmitError('');
            }}
          />

          <View style={styles.photoPickerSection}>
            <View style={styles.rowBetween}>
              <Text style={styles.photoSectionTitle}>Ảnh bằng chứng (tùy chọn)</Text>
              <Text style={styles.microMuted} testID="dispute-selected-files-count">
                {selectedFiles.length}/{MAX_DISPUTE_EVIDENCE_FILES} ảnh
              </Text>
            </View>

            <View style={styles.rowActions}>
              <Pressable
                testID="dispute-pick-library-button"
                disabled={submitting || remainingPhotoSlots <= 0}
                accessibilityRole="button"
                accessibilityLabel="Chọn ảnh từ thư viện"
                onPress={() => void handlePickFromLibrary()}
                style={({ pressed }) => [
                  styles.pickerBtn,
                  styles.flex,
                  (submitting || remainingPhotoSlots <= 0) && styles.disabledBtn,
                  pressed && !submitting && remainingPhotoSlots > 0 && styles.pressed,
                ]}
              >
                <Icon name="image" size={15} color={semantic.color.textPrimary} />
                <Text style={styles.pickerBtnText}>Thư viện</Text>
              </Pressable>

              <Pressable
                testID="dispute-take-photo-button"
                disabled={submitting || remainingPhotoSlots <= 0}
                accessibilityRole="button"
                accessibilityLabel="Chụp ảnh bằng chứng"
                onPress={() => void handleTakePhoto()}
                style={({ pressed }) => [
                  styles.pickerBtn,
                  styles.flex,
                  (submitting || remainingPhotoSlots <= 0) && styles.disabledBtn,
                  pressed && !submitting && remainingPhotoSlots > 0 && styles.pressed,
                ]}
              >
                <Icon name="camera" size={15} color={semantic.color.textPrimary} />
                <Text style={styles.pickerBtnText}>Chụp ảnh</Text>
              </Pressable>
            </View>

            {pickerError ? (
              <InlineBanner
                testID="dispute-evidence-picker-error"
                tone="danger"
                message={pickerError}
              />
            ) : null}

            {selectedFiles.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.previewRail}
              >
                {selectedFiles.map((asset, index) => (
                  <View
                    key={`${asset.uri}-${index}`}
                    style={styles.previewTile}
                    testID={`dispute-selected-photo-${index}`}
                  >
                    <Image
                      source={{ uri: asset.uri }}
                      style={styles.previewThumb}
                      resizeMode="cover"
                      accessibilityLabel={`Ảnh bằng chứng ${index + 1}`}
                    />
                    <Pressable
                      testID={`dispute-remove-photo-${index}`}
                      hitSlop={6}
                      disabled={submitting}
                      accessibilityRole="button"
                      accessibilityLabel={`Xóa ảnh ${index + 1}`}
                      onPress={() => handleRemoveSelectedFile(index)}
                      style={({ pressed }) => [styles.removePhotoBtn, pressed && styles.pressed]}
                    >
                      <Icon name="x" size={12} color={semantic.color.textInverse} />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            ) : null}
          </View>
        </View>
      </BottomSheet>

      {/* BottomSheet: Private Evidence Attachment Preview */}
      <BottomSheet
        visible={Boolean(previewAttachment)}
        onClose={() => {
          previewSeqRef.current += 1;
          setPreviewAttachment(null);
          setPreviewUri(null);
          setPreviewError('');
          setPreviewLoading(false);
        }}
        title={previewAttachment?.originalFilename ?? 'Ảnh bằng chứng'}
        subtitle={
          previewAttachment?.uploadedAt
            ? `Tải lên lúc ${formatOrderDateTime(previewAttachment.uploadedAt)}`
            : undefined
        }
        testID="dispute-attachment-preview-sheet"
      >
        <View style={styles.previewSheetBody}>
          {previewLoading ? (
            <View style={styles.previewCenter}>
              <ActivityIndicator size="small" color={semantic.color.accent} />
              <Text style={styles.caption}>Đang tải ảnh bằng chứng…</Text>
            </View>
          ) : previewError ? (
            <InlineBanner
              tone="danger"
              message={previewError}
              actionLabel="Thử lại"
              onActionPress={() => {
                if (previewAttachment) void loadAttachmentPreview(previewAttachment);
              }}
            />
          ) : previewUri ? (
            <Image
              source={{ uri: previewUri }}
              style={styles.previewFullImage}
              resizeMode="contain"
              accessibilityLabel={previewAttachment?.originalFilename ?? 'Ảnh bằng chứng'}
            />
          ) : null}
        </View>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  sectionGap: {
    height: primitive.space[2],
    backgroundColor: semantic.color.bgCanvas,
  },
  section: {
    backgroundColor: semantic.color.bgSurface,
    paddingHorizontal: semantic.spacing.pageX,
    paddingVertical: primitive.space[4],
    gap: primitive.space[3],
  },
  flex: {
    flex: 1,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2.5],
    paddingVertical: primitive.space[1],
  },
  cardBlock: {
    gap: primitive.space[2.5],
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: primitive.space[2],
  },
  subHeading: {
    ...semantic.type.label,
    color: semantic.color.textPrimary,
    flex: 1,
  },
  bodyCaption: {
    ...semantic.type.caption,
    color: semantic.color.textPrimary,
    lineHeight: 19,
  },
  caption: {
    ...semantic.type.caption,
  },
  microMuted: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  metaStrip: {
    flexDirection: 'row',
    gap: primitive.space[2],
  },
  metaCell: {
    flex: 1,
    backgroundColor: semantic.color.bgSubtle,
    borderRadius: primitive.radius.md,
    paddingHorizontal: primitive.space[3],
    paddingVertical: primitive.space[2],
    gap: 2,
  },
  metaLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: primitive.fontWeight.medium,
    color: semantic.color.textSecondary,
  },
  metaValue: {
    ...semantic.type.micro,
    color: semantic.color.textPrimary,
    fontWeight: primitive.fontWeight.semibold,
    fontVariant: ['tabular-nums'],
  },
  basisBox: {
    backgroundColor: semantic.color.bgSubtle,
    borderRadius: primitive.radius.md,
    padding: primitive.space[3],
    gap: primitive.space[1],
  },
  basisLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: primitive.fontWeight.semibold,
    color: semantic.color.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  basisText: {
    ...semantic.type.body,
    fontSize: primitive.fontSize.sm,
    lineHeight: 20,
    color: semantic.color.textPrimary,
  },
  reputationNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1.5],
  },
  reputationNoteText: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
    flex: 1,
  },
  evidenceBox: {
    backgroundColor: semantic.color.bgSubtle,
    borderRadius: primitive.radius.lg,
    padding: primitive.space[3],
    gap: primitive.space[2],
  },
  hintLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2],
  },
  evidenceMetaText: {
    ...semantic.type.caption,
    color: semantic.color.textPrimary,
    fontWeight: primitive.fontWeight.medium,
    flex: 1,
  },
  instructionWrap: {
    paddingTop: primitive.space[1],
    gap: primitive.space[1],
  },
  instructionText: {
    ...semantic.type.caption,
    color: semantic.color.textPrimary,
    lineHeight: 19,
  },
  respondedWrap: {
    alignItems: 'flex-start',
  },
  responsesList: {
    gap: primitive.space[2],
  },
  responseCard: {
    backgroundColor: semantic.color.bgSubtle,
    borderRadius: primitive.radius.md,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
    padding: primitive.space[3],
    gap: primitive.space[1.5],
  },
  responseSender: {
    ...semantic.type.micro,
    color: semantic.color.textPrimary,
    fontWeight: primitive.fontWeight.semibold,
    flex: 1,
  },
  responseNote: {
    ...semantic.type.caption,
    color: semantic.color.textPrimary,
    lineHeight: 19,
  },
  attachmentsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: primitive.space[1.5],
    paddingTop: primitive.space[1],
  },
  attachmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1],
    maxWidth: '100%',
    paddingHorizontal: primitive.space[2.5],
    paddingVertical: primitive.space[1.5],
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.accentSoft,
    borderWidth: 1,
    borderColor: semantic.color.accentBorder,
  },
  attachmentChipText: {
    ...semantic.type.micro,
    color: semantic.color.accent,
    fontWeight: primitive.fontWeight.semibold,
    maxWidth: 160,
  },
  attachmentSizeText: {
    fontSize: 10,
    lineHeight: 13,
    color: semantic.color.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  pastReqBlock: {
    gap: primitive.space[1.5],
    paddingVertical: primitive.space[1],
  },
  pastReqTitle: {
    ...semantic.type.micro,
    color: semantic.color.textPrimary,
    fontWeight: primitive.fontWeight.semibold,
    flex: 1,
  },
  timelineList: {
    gap: 0,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: primitive.space[2.5],
  },
  timelineRail: {
    width: 14,
    alignItems: 'center',
    paddingTop: 4,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.borderStrong,
  },
  timelineDotModerator: {
    backgroundColor: semantic.color.accent,
  },
  timelineLine: {
    width: 1.5,
    flex: 1,
    minHeight: 28,
    backgroundColor: semantic.color.borderHairline,
    marginVertical: 2,
  },
  timelineContent: {
    flex: 1,
    paddingBottom: primitive.space[3],
    gap: 2,
  },
  timelineAction: {
    ...semantic.type.caption,
    color: semantic.color.textPrimary,
    fontWeight: primitive.fontWeight.semibold,
  },
  timelineTransition: {
    ...semantic.type.micro,
    color: semantic.color.accent,
  },
  timelineNote: {
    ...semantic.type.micro,
    color: semantic.color.textPrimary,
    marginTop: 2,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2.5],
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: primitive.space[2],
    backgroundColor: component.button.primaryBg,
    minHeight: component.button.minHeight,
    borderRadius: component.button.radius,
    paddingHorizontal: component.button.paddingX,
  },
  primaryBtnPressed: {
    backgroundColor: component.button.primaryPressedBg,
  },
  primaryBtnText: {
    fontSize: primitive.fontSize.base,
    fontWeight: primitive.fontWeight.semibold,
    color: component.button.primaryFg,
  },
  secondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: component.button.minHeight,
    borderRadius: component.button.radius,
    borderWidth: 1,
    borderColor: component.button.secondaryBorder,
    backgroundColor: component.button.secondaryBg,
    paddingHorizontal: primitive.space[3],
  },
  secondaryBtnText: {
    fontSize: primitive.fontSize.sm,
    fontWeight: primitive.fontWeight.semibold,
    color: component.button.secondaryFg,
  },
  sheetBody: {
    gap: primitive.space[3],
  },
  sheetReminderBox: {
    backgroundColor: semantic.color.bgSubtle,
    borderRadius: primitive.radius.md,
    padding: primitive.space[3],
    gap: primitive.space[1],
  },
  photoPickerSection: {
    gap: primitive.space[2],
  },
  photoSectionTitle: {
    ...semantic.type.label,
    color: semantic.color.textSecondary,
  },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: primitive.space[1.5],
    minHeight: component.button.minHeightSm,
    borderRadius: component.button.radius,
    borderWidth: 1,
    borderColor: semantic.color.borderStrong,
    backgroundColor: semantic.color.bgSubtle,
    paddingHorizontal: primitive.space[3],
  },
  pickerBtnText: {
    ...semantic.type.label,
    color: semantic.color.textPrimary,
  },
  previewRail: {
    flexDirection: 'row',
    gap: primitive.space[2],
    paddingVertical: primitive.space[1],
  },
  previewTile: {
    width: 76,
    height: 76,
    borderRadius: primitive.radius.md,
    overflow: 'hidden',
    backgroundColor: semantic.color.bgTrack,
    position: 'relative',
  },
  previewThumb: {
    width: '100%',
    height: '100%',
  },
  removePhotoBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.overlayDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewSheetBody: {
    minHeight: 200,
    justifyContent: 'center',
  },
  previewCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: primitive.space[2],
    paddingVertical: primitive.space[6],
  },
  previewFullImage: {
    width: '100%',
    height: 320,
    borderRadius: primitive.radius.md,
    backgroundColor: semantic.color.bgSubtle,
  },
  disabledBtn: {
    opacity: primitive.opacity.disabled,
  },
  pressed: {
    opacity: primitive.opacity.pressed,
  },
});

export default OrderDisputeSection;

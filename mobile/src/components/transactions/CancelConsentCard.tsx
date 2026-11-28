import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  CANCEL_STATUS_LABELS,
  formatTransactionDateTime,
  type CancelDecision,
  type CancelRequestInfo,
} from '../../transactions/types';
import { component, primitive, semantic } from '../../theme';
import { BottomSheet, FormField, Icon, InlineBanner, StatusIndicator } from '../ui';

export interface CancelConsentCardProps {
  request: CancelRequestInfo;
  canRespond: boolean;
  hasHandoverProof?: boolean;
  onInspectProof?: () => void;
  onRespond: (decision: CancelDecision, responseNote: string) => Promise<void>;
  submitting?: boolean;
  error?: string | null;
}

export function CancelConsentCard({
  request,
  canRespond,
  hasHandoverProof = false,
  onInspectProof,
  onRespond,
  submitting = false,
  error,
}: CancelConsentCardProps) {
  const [pendingDecision, setPendingDecision] = useState<CancelDecision | null>(null);
  const [responseNote, setResponseNote] = useState('');

  const requesterRoleLabel = request.requestedByRole === 'SELLER' ? 'Người bán' : 'Người mua';
  const responderRoleLabel = request.requestedByRole === 'SELLER' ? 'Người mua' : 'Người bán';
  const requestedTime = formatTransactionDateTime(request.requestedAt);
  const respondedTime = formatTransactionDateTime(request.respondedAt);

  const openGuard = (decision: CancelDecision) => {
    setResponseNote('');
    setPendingDecision(decision);
  };

  const confirmDecision = async () => {
    if (!pendingDecision || submitting) return;
    await onRespond(pendingDecision, responseNote.trim());
    setPendingDecision(null);
    setResponseNote('');
  };

  // Closed / Agreed (terminal receipt covers full details)
  if (request.status === 'DONG_Y' || request.status === 'DA_DONG_DO_HOAN_TAT') {
    return null;
  }

  const decisionSheet = (
    <BottomSheet
      visible={pendingDecision !== null}
      onClose={() => {
        if (!submitting) setPendingDecision(null);
      }}
      title={
        pendingDecision === 'AGREE'
          ? 'Đồng ý hủy giao dịch?'
          : 'Từ chối yêu cầu hủy?'
      }
      subtitle={
        pendingDecision === 'AGREE'
          ? 'Hủy đơn và mở lại trạng thái đồ vật'
          : 'Giữ nguyên đơn và chuyển kiểm duyệt xem xét'
      }
      testID="cancel-decision-sheet"
      footerSlot={
        <View style={styles.decisionActions}>
          <Pressable
            testID="cancel-decision-back"
            disabled={submitting}
            onPress={() => setPendingDecision(null)}
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            style={({ pressed }) => [
              styles.rejectBtn,
              submitting && styles.disabled,
              pressed && !submitting && styles.pressed,
            ]}
          >
            <Text style={styles.rejectBtnText} numberOfLines={1}>
              Quay lại
            </Text>
          </Pressable>
          <Pressable
            testID="cancel-decision-confirm"
            disabled={submitting}
            onPress={() => void confirmDecision()}
            accessibilityRole="button"
            accessibilityLabel={
              pendingDecision === 'AGREE' ? 'Xác nhận đồng ý hủy' : 'Xác nhận từ chối'
            }
            accessibilityState={{ disabled: submitting, busy: submitting }}
            style={({ pressed }) => [
              pendingDecision === 'AGREE' ? styles.agreeBtn : styles.confirmRejectBtn,
              submitting && styles.disabled,
              pressed && !submitting && styles.pressed,
            ]}
          >
            <Text style={styles.agreeBtnText} numberOfLines={1}>
              {submitting
                ? 'Đang xử lý…'
                : pendingDecision === 'AGREE'
                  ? 'Đồng ý hủy'
                  : 'Xác nhận từ chối'}
            </Text>
          </Pressable>
        </View>
      }
    >
      <View style={styles.sheetBody}>
        <InlineBanner
          tone={pendingDecision === 'AGREE' ? 'danger' : 'warning'}
          message={
            pendingDecision === 'AGREE'
              ? 'Giao dịch sẽ chuyển sang Đã hủy và mở lại trạng thái đồ vật nếu không còn giao dịch khác.'
              : 'Đồ vật vẫn được giữ và hồ sơ kèm ảnh bàn giao sẽ chuyển đội kiểm duyệt xem xét.'
          }
        />
        <FormField
          testID="cancel-decision-note-input"
          label="Ghi chú (không bắt buộc)"
          placeholder={
            pendingDecision === 'AGREE'
              ? 'VD: Hai bên đã thống nhất hủy…'
              : 'VD: Hàng giao đúng ảnh bàn giao…'
          }
          multiline
          maxLength={500}
          value={responseNote}
          onChangeText={setResponseNote}
          editable={!submitting}
        />
      </View>
    </BottomSheet>
  );

  // State 1: Rejected summary card (supports switching back to AGREE before review closes)
  if (request.status === 'TU_CHOI') {
    return (
      <View style={styles.neutralCard} testID="cancel-rejected-card">
        <View style={styles.cardHeader}>
          <StatusIndicator
            variant="soft"
            tone="warning"
            icon="alert-circle"
            label={CANCEL_STATUS_LABELS.TU_CHOI}
          />
          {respondedTime ? (
            <Text style={styles.metaTime}>{respondedTime}</Text>
          ) : null}
        </View>

        <Text style={styles.cardTitle}>Yêu cầu hủy bị từ chối</Text>

        <View style={styles.reasonSummaryBox}>
          <View style={styles.metaSplitRow}>
            <Text style={styles.reasonSummaryLabel}>{requesterRoleLabel} yêu cầu</Text>
            {requestedTime ? <Text style={styles.metaTime}>{requestedTime}</Text> : null}
          </View>
          <Text style={styles.reasonSummaryValue}>{request.reasonLabel}</Text>
          {request.reasonNote ? (
            <Text style={styles.reasonNoteText}>“{request.reasonNote}”</Text>
          ) : null}
        </View>

        {request.responseNote ? (
          <View style={styles.responseBox}>
            <Text style={styles.reasonSummaryLabel}>{responderRoleLabel} từ chối</Text>
            <Text style={styles.reasonNoteText}>“{request.responseNote}”</Text>
          </View>
        ) : null}

        <Text style={styles.helperText}>
          Đồ vật vẫn đang được giữ trong lúc chờ kiểm duyệt. Hai bên vẫn có thể đồng ý hủy hoặc xác nhận nhận hàng trước khi có kết quả.
        </Text>

        {error ? <InlineBanner tone="danger" message={error} /> : null}

        {canRespond && !request.isViewerRequester ? (
          <Pressable
            testID="cancel-agree-btn"
            disabled={submitting}
            onPress={() => openGuard('AGREE')}
            accessibilityRole="button"
            accessibilityLabel="Chuyển sang đồng ý hủy"
            accessibilityState={{ disabled: submitting }}
            style={({ pressed }) => [
              styles.agreeBtn,
              submitting && styles.disabled,
              pressed && !submitting && styles.pressed,
            ]}
          >
            <Text style={styles.agreeBtnText} numberOfLines={1}>
              Chuyển sang đồng ý hủy
            </Text>
          </Pressable>
        ) : null}
        {decisionSheet}
      </View>
    );
  }

  // State 2: Pending request — Requester waiting card
  if (request.isViewerRequester) {
    return (
      <View style={styles.waitingCard} testID="cancel-waiting-card">
        <View style={styles.cardHeader}>
          <StatusIndicator
            variant="urgent"
            tone="warning"
            icon="clock"
            label="Chờ phản hồi"
          />
          {requestedTime ? <Text style={styles.metaTime}>{requestedTime}</Text> : null}
        </View>

        <Text style={styles.cardTitle}>Đã gửi yêu cầu hủy</Text>
        <View style={styles.reasonSummaryBox}>
          <Text style={styles.reasonSummaryLabel}>Lý do</Text>
          <Text style={styles.reasonSummaryValue}>{request.reasonLabel}</Text>
          {request.reasonNote ? (
            <Text style={styles.reasonNoteText}>“{request.reasonNote}”</Text>
          ) : null}
        </View>
        <Text style={styles.helperText}>
          Đồ vật vẫn được giữ trong lúc chờ {responderRoleLabel.toLowerCase()} phản hồi.
        </Text>
      </View>
    );
  }

  // State 3: Pending request — Counterparty decision card
  return (
    <View style={styles.decisionCard} testID="cancel-consent-card">
      <View style={styles.cardHeader}>
        <StatusIndicator
          variant="urgent"
          tone="warning"
          icon="alert-triangle"
          label="Yêu cầu hủy"
        />
        {requestedTime ? <Text style={styles.metaTime}>{requestedTime}</Text> : null}
      </View>

      <Text style={styles.cardTitle}>{requesterRoleLabel} muốn hủy giao dịch</Text>

      <View style={styles.reasonSummaryBox}>
        <Text style={styles.reasonSummaryLabel}>Lý do</Text>
        <Text style={styles.reasonSummaryValue}>{request.reasonLabel}</Text>
        {request.reasonNote ? (
          <Text style={styles.reasonNoteText}>“{request.reasonNote}”</Text>
        ) : null}
      </View>

      {hasHandoverProof && onInspectProof ? (
        <Pressable
          testID="cancel-inspect-proof-btn"
          hitSlop={8}
          onPress={onInspectProof}
          accessibilityRole="button"
          accessibilityLabel="Xem ảnh bàn giao"
          style={({ pressed }) => [styles.inspectLink, pressed && styles.pressed]}
        >
          <Icon name="image" size={14} color={semantic.color.accent} />
          <Text style={styles.inspectLinkText}>Xem ảnh bàn giao</Text>
          <Icon name="chevron-right" size={14} color={semantic.color.accent} />
        </Pressable>
      ) : null}

      {/* Visual 2-row contrast comparison (Soft Brick vs Soft Amber) */}
      <View style={styles.compareStack} testID="cancel-consequence-comparison">
        <View style={[styles.compareCard, styles.compareAgree]}>
          <View style={[styles.compareIconBox, styles.compareIconAgree]}>
            <Icon name="x" size={13} color={semantic.color.danger} />
          </View>
          <View style={styles.compareBody}>
            <Text style={styles.compareTitleAgree}>Đồng ý hủy</Text>
            <Text style={styles.compareDesc}>
              Hủy đơn và mở lại trạng thái đồ vật
            </Text>
          </View>
        </View>

        <View style={[styles.compareCard, styles.compareReject]}>
          <View style={[styles.compareIconBox, styles.compareIconReject]}>
            <Icon name="shield" size={13} color={semantic.color.warning} />
          </View>
          <View style={styles.compareBody}>
            <Text style={styles.compareTitleReject}>Từ chối</Text>
            <Text style={styles.compareDesc}>
              Giữ nguyên đơn và chuyển kiểm duyệt xem xét
            </Text>
          </View>
        </View>
      </View>

      {error ? <InlineBanner tone="danger" message={error} /> : null}

      {canRespond ? (
        <View style={styles.decisionActions}>
          <Pressable
            testID="cancel-reject-btn"
            disabled={submitting}
            onPress={() => openGuard('REJECT')}
            accessibilityRole="button"
            accessibilityLabel="Từ chối yêu cầu hủy"
            accessibilityState={{ disabled: submitting }}
            style={({ pressed }) => [
              styles.rejectBtn,
              submitting && styles.disabled,
              pressed && !submitting && styles.pressed,
            ]}
          >
            <Text style={styles.rejectBtnText} numberOfLines={1}>
              Từ chối
            </Text>
          </Pressable>

          <Pressable
            testID="cancel-agree-btn"
            disabled={submitting}
            onPress={() => openGuard('AGREE')}
            accessibilityRole="button"
            accessibilityLabel="Đồng ý hủy giao dịch"
            accessibilityState={{ disabled: submitting }}
            style={({ pressed }) => [
              styles.agreeBtn,
              submitting && styles.disabled,
              pressed && !submitting && styles.pressed,
            ]}
          >
            <Text style={styles.agreeBtnText} numberOfLines={1}>
              Đồng ý hủy
            </Text>
          </Pressable>
        </View>
      ) : null}

      {decisionSheet}
    </View>
  );
}

const styles = StyleSheet.create({
  waitingCard: {
    backgroundColor: semantic.color.warningSoft,
    borderWidth: 1,
    borderColor: semantic.color.borderStrong,
    borderRadius: primitive.radius.lg,
    padding: primitive.space[4],
    gap: primitive.space[2.5],
  },
  decisionCard: {
    backgroundColor: semantic.color.bgWarmTint,
    borderWidth: 1.5,
    borderColor: semantic.color.warning,
    borderRadius: primitive.radius.lg,
    padding: primitive.space[4],
    gap: primitive.space[3],
  },
  neutralCard: {
    backgroundColor: semantic.color.bgSubtle,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
    borderRadius: primitive.radius.lg,
    padding: primitive.space[4],
    gap: primitive.space[2.5],
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: primitive.space[2],
  },
  metaSplitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: primitive.space[2],
  },
  metaTime: {
    ...semantic.type.micro,
    fontVariant: ['tabular-nums'],
  },
  cardTitle: {
    ...semantic.type.sectionTitle,
  },
  reasonSummaryBox: {
    backgroundColor: semantic.color.bgSurface,
    borderRadius: primitive.radius.md,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
    paddingHorizontal: primitive.space[3],
    paddingVertical: primitive.space[2.5],
    gap: 3,
  },
  responseBox: {
    backgroundColor: semantic.color.warningSoft,
    borderRadius: primitive.radius.md,
    paddingHorizontal: primitive.space[3],
    paddingVertical: primitive.space[2],
    gap: 2,
  },
  reasonSummaryLabel: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
  },
  reasonSummaryValue: {
    ...semantic.type.label,
    color: semantic.color.textPrimary,
  },
  reasonNoteText: {
    ...semantic.type.caption,
    color: semantic.color.textPrimary,
    lineHeight: 19,
  },
  inspectLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1.5],
    alignSelf: 'flex-start',
    paddingHorizontal: primitive.space[2.5],
    paddingVertical: primitive.space[1.5],
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.accentSoft,
  },
  inspectLinkText: {
    ...semantic.type.micro,
    fontWeight: primitive.fontWeight.semibold,
    color: semantic.color.accent,
  },
  compareStack: {
    gap: primitive.space[2],
  },
  compareCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: primitive.space[2.5],
    paddingHorizontal: primitive.space[3],
    paddingVertical: primitive.space[2.5],
    borderRadius: primitive.radius.md,
    borderWidth: 1,
  },
  compareAgree: {
    backgroundColor: semantic.color.dangerSoft,
    borderColor: semantic.color.dangerSoft,
  },
  compareReject: {
    backgroundColor: semantic.color.warningSoft,
    borderColor: semantic.color.warningSoft,
  },
  compareIconBox: {
    width: 24,
    height: 24,
    borderRadius: primitive.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  compareIconAgree: {
    backgroundColor: semantic.color.bgSurface,
  },
  compareIconReject: {
    backgroundColor: semantic.color.bgSurface,
  },
  compareBody: {
    flex: 1,
    gap: 2,
  },
  compareTitleAgree: {
    ...semantic.type.label,
    color: semantic.color.danger,
  },
  compareTitleReject: {
    ...semantic.type.label,
    color: semantic.color.warning,
  },
  compareDesc: {
    ...semantic.type.micro,
    color: semantic.color.textPrimary,
    lineHeight: 16,
  },
  helperText: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
    lineHeight: 17,
  },
  decisionActions: {
    flexDirection: 'row',
    gap: primitive.space[2.5],
  },
  rejectBtn: {
    flex: 1,
    minHeight: component.button.minHeight,
    borderRadius: component.button.radius,
    borderWidth: 1,
    borderColor: component.button.secondaryBorder,
    backgroundColor: component.button.secondaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: primitive.space[3],
  },
  rejectBtnText: {
    fontSize: primitive.fontSize.base,
    fontWeight: primitive.fontWeight.semibold,
    color: component.button.secondaryFg,
  },
  agreeBtn: {
    flex: 1.3,
    minHeight: component.button.minHeight,
    borderRadius: component.button.radius,
    backgroundColor: component.button.destructiveBg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: primitive.space[3],
  },
  confirmRejectBtn: {
    flex: 1.3,
    minHeight: component.button.minHeight,
    borderRadius: component.button.radius,
    backgroundColor: semantic.color.warning,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: primitive.space[3],
  },
  agreeBtnText: {
    fontSize: primitive.fontSize.base,
    fontWeight: primitive.fontWeight.semibold,
    color: semantic.color.textInverse,
  },
  sheetBody: {
    gap: primitive.space[4],
  },
  disabled: {
    opacity: primitive.opacity.disabled,
  },
  pressed: {
    opacity: primitive.opacity.pressed,
  },
});

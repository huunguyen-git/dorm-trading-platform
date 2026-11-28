import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { Nav, RootStack } from '../navigation';
import { resolveUserRestriction, useSession } from '../auth/session';
import { pickImagesFromLibrary, takePhotoWithCamera } from '../media/imagePicker';
import {
  extractReviewApiError,
  fetchComplaintReasons,
  fetchReviewChatEvidenceOptions,
  isReviewRestrictedError,
  submitReviewComplaint,
  uploadComplaintEvidenceImages,
} from '../reviews/api';
import {
  formatComplaintStatusLabel,
  generateComplaintRequestId,
  MAX_COMPLAINT_CHAT_MESSAGES,
  MAX_COMPLAINT_DESCRIPTION_LENGTH,
  MAX_COMPLAINT_IMAGES,
  type ComplaintReason,
  type ComplaintSummary,
  type ReviewChatConversationOption,
  type UploadedReviewEvidence,
} from '../reviews/types';
import { RestrictedAccountNotice } from '../components/RestrictedAccountNotice';
import {
  CheckboxRow,
  HairlineDivider,
  Icon,
  InlineBanner,
  SectionHeading,
  StatusIndicator,
} from '../components/ui';
import { component, primitive, semantic } from '../theme';

export default function ReviewComplaintScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStack, 'ReviewComplaint'>>();
  const insets = useContext(SafeAreaInsetsContext);
  const bottomPad = Math.max(insets?.bottom ?? 0, primitive.space[4]);

  const token = useSession((s) => s.token);
  const user = useSession((s) => s.user);
  const restriction = useSession((s) => s.restriction);
  const dismissed = useSession((s) => s.restrictionDismissed);
  const hasVisibleRestriction = Boolean(
    restriction ?? (dismissed ? null : resolveUserRestriction(user)),
  );

  const reviewId = params?.reviewId ?? '';
  const reviewVersion = params?.reviewVersion;
  const listingTitle = params?.listingTitle ?? 'Giao dịch hoàn tất';
  const buyerName = params?.buyerName ?? 'Người mua';
  const stars = params?.stars ?? 1;
  const comment = params?.comment ?? null;
  const daysRemaining = params?.daysRemaining ?? 7;

  const clientRequestIdRef = useRef<string>(generateComplaintRequestId());

  const [reasons, setReasons] = useState<ComplaintReason[]>([]);
  const [reasonsLoading, setReasonsLoading] = useState(true);
  const [reasonsError, setReasonsError] = useState('');

  const [chatConversations, setChatConversations] = useState<ReviewChatConversationOption[]>([]);
  const [attachChatLog, setAttachChatLog] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);

  const [selectedReason, setSelectedReason] = useState('');
  const [description, setDescription] = useState('');
  const [evidences, setEvidences] = useState<UploadedReviewEvidence[]>([]);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [evidenceError, setEvidenceError] = useState('');

  const [reasonError, setReasonError] = useState('');
  const [contentError, setContentError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitErrorCode, setSubmitErrorCode] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<ComplaintSummary | null>(null);

  const loadData = useCallback(async () => {
    if (!token || !reviewId) return;
    setReasonsLoading(true);
    setReasonsError('');
    try {
      const items = await fetchComplaintReasons();
      setReasons(items);
    } catch (err) {
      if (!isReviewRestrictedError(err)) {
        setReasonsError(extractReviewApiError(err, 'Không thể tải danh sách lý do khiếu nại.').message);
      }
    } finally {
      setReasonsLoading(false);
    }

    try {
      const convs = await fetchReviewChatEvidenceOptions(reviewId);
      setChatConversations(convs);
      if (convs.length > 0) {
        setSelectedConversationId((prev) => prev ?? convs[0].conversationId);
      }
    } catch {
      setChatConversations([]);
    }
  }, [token, reviewId]);

  useEffect(() => {
    clientRequestIdRef.current = generateComplaintRequestId();
    setSubmitted(null);
    void loadData();
  }, [loadData]);

  const activeConversation = useMemo(
    () =>
      chatConversations.find((c) => c.conversationId === selectedConversationId) ??
      chatConversations[0] ??
      null,
    [chatConversations, selectedConversationId],
  );

  const handlePickLibrary = async () => {
    if (uploadingEvidence || submitting) return;
    const remaining = MAX_COMPLAINT_IMAGES - evidences.length;
    if (remaining <= 0) {
      setEvidenceError(`Chỉ được đính kèm tối đa ${MAX_COMPLAINT_IMAGES} ảnh bằng chứng.`);
      return;
    }
    setEvidenceError('');
    try {
      const picked = await pickImagesFromLibrary(remaining);
      if (picked.length === 0) return;
      setUploadingEvidence(true);
      const uploaded = await uploadComplaintEvidenceImages(picked);
      setEvidences((prev) => [...prev, ...uploaded].slice(0, MAX_COMPLAINT_IMAGES));
      setContentError('');
    } catch (err) {
      if (!isReviewRestrictedError(err)) {
        setEvidenceError(
          extractReviewApiError(
            err,
            'Tệp bằng chứng không hợp lệ. Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP tối đa 5MB.',
          ).message,
        );
      }
    } finally {
      setUploadingEvidence(false);
    }
  };

  const handleTakePhoto = async () => {
    if (uploadingEvidence || submitting) return;
    if (evidences.length >= MAX_COMPLAINT_IMAGES) {
      setEvidenceError(`Chỉ được đính kèm tối đa ${MAX_COMPLAINT_IMAGES} ảnh bằng chứng.`);
      return;
    }
    setEvidenceError('');
    try {
      const photo = await takePhotoWithCamera();
      if (!photo) return;
      setUploadingEvidence(true);
      const uploaded = await uploadComplaintEvidenceImages([photo]);
      setEvidences((prev) => [...prev, ...uploaded].slice(0, MAX_COMPLAINT_IMAGES));
      setContentError('');
    } catch (err) {
      if (!isReviewRestrictedError(err)) {
        setEvidenceError(extractReviewApiError(err, 'Không thể tải ảnh chụp làm bằng chứng.').message);
      }
    } finally {
      setUploadingEvidence(false);
    }
  };

  const handleToggleAttachChat = (checked: boolean) => {
    setAttachChatLog(checked);
    if (checked && activeConversation && selectedMessageIds.length === 0) {
      setSelectedMessageIds(activeConversation.messages.slice(-MAX_COMPLAINT_CHAT_MESSAGES).map((m) => m.id));
      setContentError('');
    }
    if (!checked) {
      setSelectedMessageIds([]);
    }
  };

  const handleToggleChatMessage = (messageId: string) => {
    setSelectedMessageIds((prev) => {
      if (prev.includes(messageId)) return prev.filter((id) => id !== messageId);
      if (prev.length >= MAX_COMPLAINT_CHAT_MESSAGES) return prev;
      setContentError('');
      return [...prev, messageId];
    });
  };

  const handleCancel = () => {
    if (typeof navigation.goBack === 'function') {
      navigation.goBack();
    } else {
      navigation.navigate('MyReviews');
    }
  };

  const handleSubmit = async () => {
    if (submitting || uploadingEvidence) return;
    setSubmitError('');
    setSubmitErrorCode(undefined);

    let invalid = false;
    if (!selectedReason) {
      setReasonError('Vui lòng chọn lý do khiếu nại.');
      invalid = true;
    } else {
      setReasonError('');
    }

    const trimmedDesc = description.trim();
    const hasChat = Boolean(attachChatLog && activeConversation && selectedMessageIds.length > 0);
    if (trimmedDesc.length > MAX_COMPLAINT_DESCRIPTION_LENGTH) {
      setContentError(`Mô tả khiếu nại không được vượt quá ${MAX_COMPLAINT_DESCRIPTION_LENGTH} ký tự.`);
      invalid = true;
    } else if (!trimmedDesc && evidences.length === 0 && !hasChat) {
      setContentError('Vui lòng nhập mô tả khiếu nại hoặc đính kèm ít nhất một bằng chứng.');
      invalid = true;
    } else {
      setContentError('');
    }

    if (invalid) return;

    setSubmitting(true);
    try {
      const result = await submitReviewComplaint({
        reviewId,
        expectedReviewVersion: reviewVersion,
        reasonCode: selectedReason,
        description: trimmedDesc,
        evidenceIds: evidences.map((e) => e.id),
        chatConversationId: hasChat ? activeConversation?.conversationId ?? null : null,
        chatMessageIds: hasChat ? selectedMessageIds : [],
        attachChatLog: hasChat,
        clientRequestId: clientRequestIdRef.current,
      });
      setSubmitted(result);
    } catch (err) {
      if (!isReviewRestrictedError(err)) {
        const parsed = extractReviewApiError(
          err,
          'Gửi khiếu nại thất bại. Dữ liệu bạn nhập vẫn được giữ lại để gửi lại.',
        );
        setSubmitError(parsed.message);
        setSubmitErrorCode(parsed.code);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.successScroll} testID="complaint-success-view">
          <View style={styles.successIcon}>
            <Icon name="check-circle" size={34} color={semantic.color.success} />
          </View>
          <Text style={styles.successTitle}>Đã gửi khiếu nại đánh giá</Text>
          <Text style={styles.successSubtitle}>
            Khiếu nại của bạn đã được ghi nhận ở trạng thái{' '}
            {formatComplaintStatusLabel(submitted.status, submitted.conclusion)}.
          </Text>

          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Lý do</Text>
              <Text style={styles.summaryValue}>{submitted.reasonLabel}</Text>
            </View>
            <HairlineDivider />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Bằng chứng</Text>
              <Text style={styles.summaryValue}>
                {submitted.imageEvidenceCount} ảnh
                {submitted.hasChatLog ? ' · Có nhật ký chat' : ''}
              </Text>
            </View>
            <HairlineDivider />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Trạng thái</Text>
              <StatusIndicator variant="soft" tone="warning" label="Chờ xử lý" />
            </View>
          </View>

          <Text style={styles.privacyNote}>
            Đánh giá đã được tạm khóa chỉnh sửa/xóa cho tới khi Kiểm duyệt viên kết luận. Bằng chứng
            và nhật ký chat chỉ Kiểm duyệt viên và Quản trị viên cấp cao được quyền xem.
          </Text>

          <Pressable
            testID="complaint-done-button"
            onPress={handleCancel}
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
          >
            <Text style={styles.primaryBtnText}>Quay lại danh sách đánh giá</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {hasVisibleRestriction ? (
            <View style={styles.bannerWrap}>
              <RestrictedAccountNotice />
            </View>
          ) : null}

          {submitError ? (
            <View style={styles.bannerWrap} testID="complaint-submit-error">
              <InlineBanner
                tone={
                  submitErrorCode === 'COMPLAINT_ALREADY_EXISTS' ||
                  submitErrorCode === 'REVIEW_CHANGED'
                    ? 'warning'
                    : 'danger'
                }
                title={
                  submitErrorCode === 'COMPLAINT_WINDOW_EXPIRED'
                    ? 'Hết hạn khiếu nại (7 ngày)'
                    : submitErrorCode === 'REVIEW_CHANGED'
                      ? 'Đánh giá vừa thay đổi'
                      : submitErrorCode === 'COMPLAINT_ALREADY_EXISTS'
                        ? 'Đã có khiếu nại trước đó'
                        : 'Chưa thể gửi khiếu nại'
                }
                message={submitError}
              />
            </View>
          ) : null}

          {/* Complained review snapshot */}
          <View style={styles.section} testID="complaint-review-card">
            <View style={styles.reviewHeader}>
              <View style={styles.starPill}>
                <Icon name="star" size={14} color={semantic.color.ratingStar} />
                <Text style={styles.starText}>{stars}/5 sao</Text>
              </View>
              <Text style={styles.deadlinePill}>Còn {daysRemaining} ngày khiếu nại</Text>
            </View>
            <Text style={styles.listingTitle}>{listingTitle}</Text>
            <Text style={styles.caption}>Người mua: {buyerName}</Text>
            {comment ? <Text style={styles.commentQuote}>“{comment}”</Text> : null}

            <View style={styles.privacyBanner}>
              <Icon name="shield" size={14} color={semantic.color.freeFg} />
              <Text style={styles.privacyBannerText}>
                Bằng chứng và nhật ký chat chỉ Kiểm duyệt viên và Quản trị viên cấp cao được xem.
              </Text>
            </View>
          </View>

          <View style={styles.sectionGap} />

          {/* Reason selection */}
          <View style={styles.section}>
            <SectionHeading title="Lý do khiếu nại *" />
            {reasonsLoading ? (
              <View style={styles.inlineLoading}>
                <ActivityIndicator size="small" color={semantic.color.accent} />
                <Text style={styles.caption}>Đang tải lý do khiếu nại…</Text>
              </View>
            ) : reasonsError ? (
              <InlineBanner
                tone="danger"
                message={reasonsError}
                actionLabel="Tải lại"
                onActionPress={() => void loadData()}
              />
            ) : (
              <View style={styles.reasonList}>
                {reasons.map((reason) => {
                  const selected = selectedReason === reason.code;
                  return (
                    <Pressable
                      key={reason.code}
                      testID={`complaint-reason-${reason.code}`}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => {
                        setSelectedReason(reason.code);
                        setReasonError('');
                        setSubmitError('');
                      }}
                      style={[styles.reasonRow, selected && styles.reasonRowSelected]}
                    >
                      <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
                        {selected ? <View style={styles.radioInner} /> : null}
                      </View>
                      <View style={styles.reasonBody}>
                        <Text style={[styles.reasonLabel, selected && styles.reasonLabelSelected]}>
                          {reason.label}
                        </Text>
                        <Text style={styles.caption}>{reason.description}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
            {reasonError ? (
              <Text style={styles.fieldError} testID="complaint-reason-error">
                {reasonError}
              </Text>
            ) : null}
          </View>

          <View style={styles.sectionGap} />

          {/* Description */}
          <View style={styles.section}>
            <SectionHeading
              title="Mô tả giải trình"
              subtitle="Nhập mô tả hoặc đính kèm ít nhất một bằng chứng (ảnh bàn giao, nhật ký chat)."
            />
            <TextInput
              testID="complaint-description-input"
              multiline
              numberOfLines={4}
              maxLength={MAX_COMPLAINT_DESCRIPTION_LENGTH}
              value={description}
              onChangeText={(text) => {
                setDescription(text);
                if (text.trim()) setContentError('');
                setSubmitError('');
              }}
              placeholder="Trình bày rõ lý do đánh giá chưa chính xác và bằng chứng kèm theo…"
              placeholderTextColor={semantic.color.textSecondary}
              textAlignVertical="top"
              style={[styles.textArea, contentError ? styles.inputError : null]}
            />
            <Text style={styles.charCount}>
              {description.length}/{MAX_COMPLAINT_DESCRIPTION_LENGTH}
            </Text>
            {contentError ? (
              <Text style={styles.fieldError} testID="complaint-content-error">
                {contentError}
              </Text>
            ) : null}
          </View>

          <View style={styles.sectionGap} />

          {/* Image Evidence */}
          <View style={styles.section}>
            <SectionHeading
              title={`Ảnh bằng chứng (${evidences.length}/${MAX_COMPLAINT_IMAGES})`}
              subtitle="Ảnh chụp bàn giao, tình trạng đồ vật (JPEG/PNG/WebP, tối đa 5MB/ảnh)."
            />
            <View style={styles.btnRow}>
              <Pressable
                testID="complaint-pick-image-button"
                disabled={uploadingEvidence || submitting || evidences.length >= MAX_COMPLAINT_IMAGES}
                onPress={() => void handlePickLibrary()}
                style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
              >
                <Icon name="image" size={16} color={semantic.color.textPrimary} />
                <Text style={styles.secondaryBtnText}>Chọn ảnh</Text>
              </Pressable>
              <Pressable
                testID="complaint-camera-button"
                disabled={uploadingEvidence || submitting || evidences.length >= MAX_COMPLAINT_IMAGES}
                onPress={() => void handleTakePhoto()}
                style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
              >
                <Icon name="camera" size={16} color={semantic.color.textPrimary} />
                <Text style={styles.secondaryBtnText}>Chụp ảnh</Text>
              </Pressable>
            </View>

            {uploadingEvidence ? (
              <View style={styles.inlineLoading}>
                <ActivityIndicator size="small" color={semantic.color.accent} />
                <Text style={styles.caption}>Đang tải ảnh bằng chứng…</Text>
              </View>
            ) : null}
            {evidenceError ? (
              <Text style={styles.fieldError} testID="complaint-evidence-error">
                {evidenceError}
              </Text>
            ) : null}

            {evidences.length > 0 ? (
              <View style={styles.evidenceGrid}>
                {evidences.map((item, idx) => (
                  <View key={item.id} style={styles.evidenceCard} testID={`complaint-evidence-${idx}`}>
                    {item.localUri ? (
                      <Image source={{ uri: item.localUri }} style={styles.evidenceThumb} resizeMode="cover" />
                    ) : null}
                    <Pressable
                      testID={`complaint-evidence-remove-${idx}`}
                      onPress={() => setEvidences((prev) => prev.filter((e) => e.id !== item.id))}
                      style={styles.removeBtn}
                    >
                      <Icon name="x" size={12} color={semantic.color.textInverse} />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          {/* Chat log evidence */}
          {chatConversations.length > 0 ? (
            <>
              <View style={styles.sectionGap} />
              <View style={styles.section} testID="complaint-chat-section">
                <SectionHeading title="Nhật ký chat với người mua" />
                <CheckboxRow
                  testID="complaint-attach-chat-toggle"
                  label="Đính kèm nhật ký hội thoại làm bằng chứng"
                  checked={attachChatLog}
                  onChange={handleToggleAttachChat}
                />
                {attachChatLog && activeConversation ? (
                  <View style={styles.chatMsgList}>
                    {activeConversation.messages.map((msg) => {
                      const checked = selectedMessageIds.includes(msg.id);
                      return (
                        <Pressable
                          key={msg.id}
                          testID={`complaint-chat-msg-${msg.id}`}
                          onPress={() => handleToggleChatMessage(msg.id)}
                          style={[styles.chatMsgRow, checked && styles.chatMsgRowSelected]}
                        >
                          <Icon
                            name={checked ? 'check-circle' : 'circle'}
                            size={16}
                            color={checked ? semantic.color.accent : semantic.color.textSecondary}
                          />
                          <View style={styles.flex}>
                            <Text style={styles.reasonLabel}>{msg.senderName}</Text>
                            <Text style={styles.caption}>{msg.content}</Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            </>
          ) : null}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: bottomPad }]}>
          <Pressable
            testID="complaint-cancel-button"
            disabled={submitting}
            onPress={handleCancel}
            style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed]}
          >
            <Text style={styles.cancelBtnText}>Hủy</Text>
          </Pressable>
          <Pressable
            testID="complaint-submit-button"
            disabled={submitting || uploadingEvidence || hasVisibleRestriction}
            onPress={() => void handleSubmit()}
            style={({ pressed }) => [
              styles.primaryBtn,
              styles.submitBtn,
              (submitting || uploadingEvidence || hasVisibleRestriction) && styles.disabled,
              pressed && styles.primaryBtnPressed,
            ]}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={semantic.color.textInverse} />
            ) : (
              <Text style={styles.primaryBtnText}>
                {submitError ? 'Gửi lại khiếu nại' : 'Gửi khiếu nại'}
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: semantic.color.bgSurface },
  scroll: { flex: 1, backgroundColor: semantic.color.bgCanvas },
  scrollContent: { paddingBottom: primitive.space[6] },
  bannerWrap: { paddingHorizontal: semantic.spacing.pageX, paddingTop: primitive.space[3], backgroundColor: semantic.color.bgSurface },
  section: { backgroundColor: semantic.color.bgSurface, paddingHorizontal: semantic.spacing.pageX, paddingVertical: primitive.space[4], gap: primitive.space[3] },
  sectionGap: { height: primitive.space[2], backgroundColor: semantic.color.bgCanvas },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  starPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: semantic.color.ratingBg, paddingHorizontal: primitive.space[2.5], paddingVertical: primitive.space[1], borderRadius: primitive.radius.full },
  starText: { ...semantic.type.label, color: semantic.color.ratingText },
  deadlinePill: { ...semantic.type.micro, color: semantic.color.warning },
  listingTitle: { ...semantic.type.sectionTitle },
  caption: { ...semantic.type.caption },
  commentQuote: { ...semantic.type.body, fontStyle: 'italic' },
  privacyBanner: { flexDirection: 'row', alignItems: 'center', gap: primitive.space[2], backgroundColor: semantic.color.freeBg, borderRadius: primitive.radius.md, padding: primitive.space[2.5] },
  privacyBannerText: { flex: 1, fontSize: primitive.fontSize.xs, color: semantic.color.freeFg },
  inlineLoading: { flexDirection: 'row', alignItems: 'center', gap: primitive.space[2] },
  reasonList: { gap: primitive.space[2] },
  reasonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: primitive.space[3], padding: primitive.space[3], borderRadius: primitive.radius.lg, borderWidth: 1, borderColor: semantic.color.borderHairline },
  reasonRowSelected: { borderColor: semantic.color.accent, backgroundColor: semantic.color.accentSoft },
  radioOuter: { width: 20, height: 20, borderRadius: primitive.radius.full, borderWidth: 2, borderColor: semantic.color.borderStrong, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  radioOuterSelected: { borderColor: semantic.color.accent },
  radioInner: { width: 10, height: 10, borderRadius: primitive.radius.full, backgroundColor: semantic.color.accent },
  reasonBody: { flex: 1, gap: 2 },
  reasonLabel: { ...semantic.type.label },
  reasonLabelSelected: { color: semantic.color.accentDeep },
  textArea: { minHeight: 110, borderRadius: component.input.radius, borderWidth: 1, borderColor: component.input.border, backgroundColor: component.input.bg, padding: primitive.space[3], fontSize: primitive.fontSize.base, color: semantic.color.textPrimary },
  inputError: { borderColor: component.input.errorBorder },
  charCount: { ...semantic.type.micro, textAlign: 'right' },
  fieldError: { fontSize: primitive.fontSize.sm, color: semantic.color.danger },
  btnRow: { flexDirection: 'row', gap: primitive.space[2.5] },
  secondaryBtn: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: primitive.space[2], borderRadius: component.button.radius, borderWidth: 1, borderColor: component.button.secondaryBorder, backgroundColor: component.button.secondaryBg },
  secondaryBtnText: { ...semantic.type.label },
  evidenceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: primitive.space[2.5] },
  evidenceCard: { width: 84, height: 84, borderRadius: primitive.radius.md, overflow: 'hidden', position: 'relative', borderWidth: 1, borderColor: semantic.color.borderHairline },
  evidenceThumb: { width: '100%', height: '100%' },
  removeBtn: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: primitive.radius.full, backgroundColor: semantic.color.overlayDark, alignItems: 'center', justifyContent: 'center' },
  chatMsgList: { gap: primitive.space[2] },
  chatMsgRow: { flexDirection: 'row', alignItems: 'flex-start', gap: primitive.space[2.5], padding: primitive.space[2.5], borderRadius: primitive.radius.md, borderWidth: 1, borderColor: semantic.color.borderHairline, backgroundColor: semantic.color.bgSubtle },
  chatMsgRowSelected: { borderColor: semantic.color.accentBorder, backgroundColor: semantic.color.accentSoft },
  footer: { flexDirection: 'row', gap: primitive.space[3], paddingHorizontal: semantic.spacing.pageX, paddingTop: primitive.space[3], borderTopWidth: 1, borderTopColor: semantic.color.borderHairline, backgroundColor: semantic.color.bgSurface },
  cancelBtn: { minHeight: component.button.minHeight, paddingHorizontal: primitive.space[4], borderRadius: component.button.radius, borderWidth: 1, borderColor: component.button.secondaryBorder, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { ...semantic.type.label, fontSize: primitive.fontSize.base },
  primaryBtn: { minHeight: component.button.minHeight, paddingHorizontal: primitive.space[4], borderRadius: component.button.radius, backgroundColor: component.button.primaryBg, alignItems: 'center', justifyContent: 'center' },
  submitBtn: { flex: 1 },
  primaryBtnPressed: { backgroundColor: component.button.primaryPressedBg },
  primaryBtnText: { color: component.button.primaryFg, fontSize: primitive.fontSize.base, fontWeight: primitive.fontWeight.semibold },
  disabled: { opacity: primitive.opacity.disabled },
  pressed: { opacity: primitive.opacity.pressed },
  successScroll: { flexGrow: 1, padding: semantic.spacing.section, alignItems: 'center', justifyContent: 'center', gap: primitive.space[4] },
  successIcon: { width: 64, height: 64, borderRadius: primitive.radius.full, backgroundColor: semantic.color.successSoft, alignItems: 'center', justifyContent: 'center' },
  successTitle: { ...semantic.type.screenTitle, textAlign: 'center' },
  successSubtitle: { ...semantic.type.body, color: semantic.color.textSecondary, textAlign: 'center' },
  summaryCard: { width: '100%', backgroundColor: semantic.color.bgSubtle, borderRadius: primitive.radius.xl, padding: primitive.space[4], gap: primitive.space[3], borderWidth: 1, borderColor: semantic.color.borderHairline },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: primitive.space[3] },
  summaryLabel: { ...semantic.type.caption },
  summaryValue: { ...semantic.type.label, flex: 1, textAlign: 'right' },
  privacyNote: { ...semantic.type.caption, textAlign: 'center' },
});

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
  extractReportApiError,
  fetchChatEvidenceOptions,
  fetchReportCategories,
  isReportRestrictedError,
  submitReport,
  uploadReportEvidenceImages,
} from '../reports/api';
import {
  formatReportStatusLabel,
  generateClientRequestId,
  MAX_REPORT_CHAT_MESSAGES,
  MAX_REPORT_DESCRIPTION_LENGTH,
  MAX_REPORT_IMAGES,
  type ChatEvidenceConversation,
  type ReportCategory,
  type ReportSubmissionResult,
  type UploadedReportEvidence,
} from '../reports/types';
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

function formatMessageTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(date);
  } catch {
    return iso.slice(0, 16).replace('T', ' ');
  }
}

export default function ReportScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStack, 'Report'>>();
  const insets = useContext(SafeAreaInsetsContext);
  const bottomPad = Math.max(insets?.bottom ?? 0, primitive.space[4]);

  const token = useSession((s) => s.token);
  const user = useSession((s) => s.user);
  const restriction = useSession((s) => s.restriction);
  const dismissed = useSession((s) => s.restrictionDismissed);
  const hasVisibleRestriction = Boolean(
    restriction ?? (dismissed ? null : resolveUserRestriction(user)),
  );

  const targetType = params?.targetType ?? 'TIN_DANG';
  const targetId = params?.targetId ?? '';
  const targetTitle = params?.targetTitle?.trim() || (targetType === 'NGUOI_DUNG' ? 'Người dùng' : 'Tin đăng');
  const sellerName = params?.sellerName?.trim() || null;
  const preselectedConversationId = params?.conversationId ?? null;

  const isListingReport = targetType === 'TIN_DANG';
  const clientRequestIdRef = useRef<string>(generateClientRequestId());

  const [categories, setCategories] = useState<ReportCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState('');

  const [chatConversations, setChatConversations] = useState<ChatEvidenceConversation[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [description, setDescription] = useState('');
  const [evidences, setEvidences] = useState<UploadedReportEvidence[]>([]);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [evidenceError, setEvidenceError] = useState('');

  const [attachChatLog, setAttachChatLog] = useState(Boolean(preselectedConversationId));
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(
    preselectedConversationId,
  );
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);

  const [categoryError, setCategoryError] = useState('');
  const [contentError, setContentError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitErrorCode, setSubmitErrorCode] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [submittedResult, setSubmittedResult] = useState<ReportSubmissionResult | null>(null);

  const loadReferenceData = useCallback(async () => {
    if (!token || !targetId) return;
    setCategoriesLoading(true);
    setCategoriesError('');
    try {
      const items = await fetchReportCategories(targetType);
      setCategories(items);
    } catch (err) {
      if (!isReportRestrictedError(err)) {
        const parsed = extractReportApiError(err, 'Không thể tải danh mục báo cáo. Vui lòng thử lại.');
        setCategoriesError(parsed.message);
      }
    } finally {
      setCategoriesLoading(false);
    }

    setChatLoading(true);
    try {
      const conversations = await fetchChatEvidenceOptions(targetType, targetId);
      setChatConversations(conversations);
      if (preselectedConversationId) {
        const matched = conversations.find((c) => c.conversationId === preselectedConversationId);
        if (matched) {
          setSelectedConversationId(matched.conversationId);
          setAttachChatLog(true);
          setSelectedMessageIds(matched.messages.slice(-MAX_REPORT_CHAT_MESSAGES).map((m) => m.id));
        }
      } else if (conversations.length > 0) {
        setSelectedConversationId((prev) => prev ?? conversations[0].conversationId);
      }
    } catch {
      // Chat evidence options are optional; never block reporting when unavailable
      setChatConversations([]);
    } finally {
      setChatLoading(false);
    }
  }, [token, targetId, targetType, preselectedConversationId]);

  useEffect(() => {
    clientRequestIdRef.current = generateClientRequestId();
    setSubmittedResult(null);
    void loadReferenceData();
  }, [loadReferenceData]);

  const activeConversation = useMemo(
    () => chatConversations.find((c) => c.conversationId === selectedConversationId) ?? chatConversations[0] ?? null,
    [chatConversations, selectedConversationId],
  );

  const handleSelectCategory = (code: string) => {
    setSelectedCategory(code);
    setCategoryError('');
    setSubmitError('');
    setSubmitErrorCode(undefined);
  };

  const handleDescriptionChange = (value: string) => {
    setDescription(value);
    if (value.trim().length > 0) {
      setContentError('');
    }
    setSubmitError('');
  };

  const handlePickFromLibrary = async () => {
    if (uploadingEvidence || submitting) return;
    const remaining = MAX_REPORT_IMAGES - evidences.length;
    if (remaining <= 0) {
      setEvidenceError(`Bạn chỉ có thể đính kèm tối đa ${MAX_REPORT_IMAGES} ảnh bằng chứng.`);
      return;
    }
    setEvidenceError('');
    try {
      const picked = await pickImagesFromLibrary(remaining);
      if (picked.length === 0) return;
      setUploadingEvidence(true);
      const uploaded = await uploadReportEvidenceImages(picked);
      setEvidences((prev) => [...prev, ...uploaded].slice(0, MAX_REPORT_IMAGES));
      setContentError('');
    } catch (err) {
      if (!isReportRestrictedError(err)) {
        const parsed = extractReportApiError(
          err,
          'Không thể tải lên tệp bằng chứng. Vui lòng chọn tệp JPEG, PNG hoặc WebP tối đa 5MB.',
        );
        setEvidenceError(parsed.message);
      }
    } finally {
      setUploadingEvidence(false);
    }
  };

  const handleTakePhoto = async () => {
    if (uploadingEvidence || submitting) return;
    if (evidences.length >= MAX_REPORT_IMAGES) {
      setEvidenceError(`Bạn chỉ có thể đính kèm tối đa ${MAX_REPORT_IMAGES} ảnh bằng chứng.`);
      return;
    }
    setEvidenceError('');
    try {
      const photo = await takePhotoWithCamera();
      if (!photo) return;
      setUploadingEvidence(true);
      const uploaded = await uploadReportEvidenceImages([photo]);
      setEvidences((prev) => [...prev, ...uploaded].slice(0, MAX_REPORT_IMAGES));
      setContentError('');
    } catch (err) {
      if (!isReportRestrictedError(err)) {
        const parsed = extractReportApiError(err, 'Không thể tải ảnh chụp làm bằng chứng. Vui lòng thử lại.');
        setEvidenceError(parsed.message);
      }
    } finally {
      setUploadingEvidence(false);
    }
  };

  const handleRemoveEvidence = (evidenceId: string) => {
    setEvidences((prev) => prev.filter((item) => item.id !== evidenceId));
    setEvidenceError('');
  };

  const handleToggleAttachChat = (next: boolean) => {
    setAttachChatLog(next);
    if (next && activeConversation && selectedMessageIds.length === 0) {
      setSelectedMessageIds(activeConversation.messages.slice(-MAX_REPORT_CHAT_MESSAGES).map((m) => m.id));
      setContentError('');
    }
    if (!next) {
      setSelectedMessageIds([]);
    }
    setSubmitError('');
  };

  const handleSelectConversation = (conversationId: string) => {
    setSelectedConversationId(conversationId);
    const conv = chatConversations.find((c) => c.conversationId === conversationId);
    if (conv && attachChatLog) {
      setSelectedMessageIds(conv.messages.slice(-MAX_REPORT_CHAT_MESSAGES).map((m) => m.id));
    } else {
      setSelectedMessageIds([]);
    }
  };

  const handleToggleChatMessage = (messageId: string) => {
    setSelectedMessageIds((prev) => {
      if (prev.includes(messageId)) {
        return prev.filter((id) => id !== messageId);
      }
      if (prev.length >= MAX_REPORT_CHAT_MESSAGES) {
        return prev;
      }
      setContentError('');
      return [...prev, messageId];
    });
  };

  const handleCancel = () => {
    if (typeof navigation.goBack === 'function') {
      navigation.goBack();
    } else {
      navigation.navigate('Listings');
    }
  };

  const handleSubmit = async () => {
    if (submitting || uploadingEvidence) return;
    setSubmitError('');
    setSubmitErrorCode(undefined);

    let hasValidationError = false;
    if (!selectedCategory) {
      setCategoryError('Vui lòng chọn danh mục báo cáo.');
      hasValidationError = true;
    } else {
      setCategoryError('');
    }

    const trimmedDescription = description.trim();
    const hasChatAttachment = Boolean(attachChatLog && activeConversation && selectedMessageIds.length > 0);
    if (trimmedDescription.length > MAX_REPORT_DESCRIPTION_LENGTH) {
      setContentError(`Mô tả báo cáo không được vượt quá ${MAX_REPORT_DESCRIPTION_LENGTH} ký tự.`);
      hasValidationError = true;
    } else if (!trimmedDescription && evidences.length === 0 && !hasChatAttachment) {
      setContentError('Vui lòng nhập mô tả báo cáo hoặc đính kèm ít nhất một bằng chứng.');
      hasValidationError = true;
    } else {
      setContentError('');
    }

    if (hasValidationError) {
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitReport({
        targetType,
        targetId,
        categoryCode: selectedCategory,
        description: trimmedDescription,
        evidenceIds: evidences.map((item) => item.id),
        chatConversationId: hasChatAttachment ? activeConversation?.conversationId ?? null : null,
        chatMessageIds: hasChatAttachment ? selectedMessageIds : [],
        attachChatLog: hasChatAttachment,
        clientRequestId: clientRequestIdRef.current,
      });
      setSubmittedResult(result);
    } catch (err) {
      if (!isReportRestrictedError(err)) {
        const parsed = extractReportApiError(
          err,
          'Gửi báo cáo thất bại. Dữ liệu bạn nhập vẫn được giữ lại để gửi lại.',
        );
        setSubmitError(parsed.message);
        setSubmitErrorCode(parsed.code);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <SafeAreaView style={styles.centerPage}>
        <View style={styles.centerCard}>
          <Icon name="lock" size={28} color={semantic.color.accent} />
          <Text style={styles.centerTitle}>Cần đăng nhập để gửi báo cáo</Text>
          <Text style={styles.centerSubtitle}>
            Vui lòng đăng nhập bằng tài khoản sinh viên đang hoạt động để báo cáo vi phạm.
          </Text>
          <Pressable
            testID="report-login-button"
            onPress={() => navigation.navigate('Login')}
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
          >
            <Text style={styles.primaryBtnText}>Đăng nhập</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (submittedResult) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.successScroll} testID="report-success-view">
          <View style={styles.successIconWrap}>
            <Icon name="check-circle" size={34} color={semantic.color.success} />
          </View>
          <Text style={styles.successTitle}>Đã gửi báo cáo thành công</Text>
          <Text style={styles.successSubtitle}>
            Báo cáo của bạn đã được chuyển tới Kiểm duyệt viên ở trạng thái{' '}
            {formatReportStatusLabel(submittedResult.status)}.
          </Text>

          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Đối tượng</Text>
              <Text style={styles.summaryValue} numberOfLines={2}>
                {submittedResult.targetSummary}
              </Text>
            </View>
            <HairlineDivider />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Danh mục</Text>
              <Text style={styles.summaryValue}>{submittedResult.categoryName}</Text>
            </View>
            <HairlineDivider />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Bằng chứng</Text>
              <Text style={styles.summaryValue}>
                {submittedResult.imageEvidenceCount} ảnh
                {submittedResult.hasChatLog ? ' · Có nhật ký chat' : ''}
              </Text>
            </View>
            <HairlineDivider />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Trạng thái</Text>
              <StatusIndicator
                variant="soft"
                tone="warning"
                label={formatReportStatusLabel(submittedResult.status)}
              />
            </View>
          </View>

          <Text style={styles.privacyNote}>
            Bằng chứng và nhật ký chat được bảo mật, chỉ Kiểm duyệt viên và Quản trị viên cấp cao
            được quyền xem xét. Trạng thái tin đăng và điểm uy tín chưa thay đổi cho tới khi có kết
            luận kiểm duyệt.
          </Text>

          <Pressable
            testID="report-done-button"
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            onPress={handleCancel}
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
          >
            <Text style={styles.primaryBtnText}>Quay lại</Text>
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
            <View style={styles.bannerWrap} testID="report-submit-error">
              <InlineBanner
                tone={submitErrorCode === 'DUPLICATE_REPORT' ? 'warning' : 'danger'}
                title={
                  submitErrorCode === 'DUPLICATE_REPORT'
                    ? 'Báo cáo đang được xử lý'
                    : submitErrorCode === 'LISTING_NOT_AVAILABLE'
                      ? 'Tin đăng không còn khả dụng'
                      : 'Chưa thể gửi báo cáo'
                }
                message={submitError}
              />
            </View>
          ) : null}

          {/* Target overview */}
          <View style={styles.section} testID="report-target-card">
            <View style={styles.targetHeader}>
              <View style={styles.targetIcon}>
                <Icon
                  name={isListingReport ? 'flag' : 'user'}
                  size={18}
                  color={semantic.color.danger}
                />
              </View>
              <View style={styles.targetTextWrap}>
                <Text style={styles.targetTypeLabel}>
                  {isListingReport ? 'Báo cáo tin đăng' : 'Báo cáo người dùng'}
                </Text>
                <Text style={styles.targetTitle} testID="report-target-title">
                  {targetTitle}
                </Text>
                {isListingReport && sellerName ? (
                  <Text style={styles.targetMeta}>Người đăng: {sellerName}</Text>
                ) : null}
                {isListingReport && targetId ? (
                  <Text style={styles.targetMeta} numberOfLines={1}>
                    Mã tin: {targetId}
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={styles.privacyBanner}>
              <Icon name="shield" size={14} color={semantic.color.freeFg} />
              <Text style={styles.privacyBannerText}>
                Bằng chứng và nhật ký chat chỉ Kiểm duyệt viên và Quản trị viên cấp cao được truy
                cập.
              </Text>
            </View>
          </View>

          <View style={styles.sectionGap} />

          {/* Report Category */}
          <View style={styles.section}>
            <SectionHeading
              title="Danh mục báo cáo *"
              subtitle="Chọn lý do phù hợp nhất để hệ thống tự gom nhóm báo cáo chính xác."
            />

            {categoriesLoading ? (
              <View style={styles.inlineLoading}>
                <ActivityIndicator size="small" color={semantic.color.accent} />
                <Text style={styles.captionText}>Đang tải danh mục báo cáo…</Text>
              </View>
            ) : categoriesError ? (
              <InlineBanner
                tone="danger"
                message={categoriesError}
                actionLabel="Tải lại"
                actionTestID="report-categories-retry"
                onActionPress={() => void loadReferenceData()}
              />
            ) : (
              <View style={styles.categoryList}>
                {categories.map((cat) => {
                  const selected = selectedCategory === cat.code;
                  return (
                    <Pressable
                      key={cat.code}
                      testID={`report-category-${cat.code}`}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => handleSelectCategory(cat.code)}
                      style={({ pressed }) => [
                        styles.categoryRow,
                        selected && styles.categoryRowSelected,
                        pressed && styles.pressedControl,
                      ]}
                    >
                      <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
                        {selected ? <View style={styles.radioInner} /> : null}
                      </View>
                      <View style={styles.categoryBody}>
                        <Text style={[styles.categoryName, selected && styles.categoryNameSelected]}>
                          {cat.name}
                        </Text>
                        {cat.description ? (
                          <Text style={styles.categoryDesc}>{cat.description}</Text>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {categoryError ? (
              <Text style={styles.fieldError} testID="report-category-error">
                {categoryError}
              </Text>
            ) : null}
          </View>

          <View style={styles.sectionGap} />

          {/* Description */}
          <View style={styles.section}>
            <SectionHeading
              title="Mô tả chi tiết"
              subtitle="Cần nhập mô tả hoặc đính kèm ít nhất một bằng chứng (ảnh hoặc nhật ký chat)."
            />
            <TextInput
              testID="report-description-input"
              multiline
              numberOfLines={4}
              maxLength={MAX_REPORT_DESCRIPTION_LENGTH}
              value={description}
              onChangeText={handleDescriptionChange}
              placeholder={
                isListingReport
                  ? 'Mô tả điểm sai sự thật, hàng cấm hoặc thông tin gây hiểu nhầm…'
                  : 'Mô tả cụ thể hành vi vi phạm, thời gian xảy ra sự việc…'
              }
              placeholderTextColor={semantic.color.textSecondary}
              textAlignVertical="top"
              style={[styles.textArea, contentError ? styles.inputError : null]}
            />
            <Text style={styles.charCount}>
              {description.length}/{MAX_REPORT_DESCRIPTION_LENGTH}
            </Text>
            {contentError ? (
              <Text style={styles.fieldError} testID="report-content-error">
                {contentError}
              </Text>
            ) : null}
          </View>

          <View style={styles.sectionGap} />

          {/* Image Evidence */}
          <View style={styles.section}>
            <SectionHeading
              title={`Ảnh bằng chứng (${evidences.length}/${MAX_REPORT_IMAGES})`}
              subtitle="Hỗ trợ JPEG, PNG, WebP (tối đa 5MB mỗi ảnh). Metadata EXIF/GPS sẽ tự động được gỡ bỏ."
            />

            <View style={styles.evidenceActionRow}>
              <Pressable
                testID="report-pick-image-button"
                disabled={uploadingEvidence || submitting || evidences.length >= MAX_REPORT_IMAGES}
                onPress={() => void handlePickFromLibrary()}
                accessibilityRole="button"
                accessibilityLabel="Chọn ảnh bằng chứng từ thư viện"
                style={({ pressed }) => [
                  styles.secondaryActionBtn,
                  (uploadingEvidence || submitting || evidences.length >= MAX_REPORT_IMAGES) &&
                    styles.disabledControl,
                  pressed && styles.pressedControl,
                ]}
              >
                <Icon name="image" size={16} color={semantic.color.textPrimary} />
                <Text style={styles.secondaryActionText}>Chọn từ thư viện</Text>
              </Pressable>

              <Pressable
                testID="report-camera-button"
                disabled={uploadingEvidence || submitting || evidences.length >= MAX_REPORT_IMAGES}
                onPress={() => void handleTakePhoto()}
                accessibilityRole="button"
                accessibilityLabel="Chụp ảnh bằng chứng"
                style={({ pressed }) => [
                  styles.secondaryActionBtn,
                  (uploadingEvidence || submitting || evidences.length >= MAX_REPORT_IMAGES) &&
                    styles.disabledControl,
                  pressed && styles.pressedControl,
                ]}
              >
                <Icon name="camera" size={16} color={semantic.color.textPrimary} />
                <Text style={styles.secondaryActionText}>Chụp ảnh</Text>
              </Pressable>
            </View>

            {uploadingEvidence ? (
              <View style={styles.inlineLoading} testID="report-evidence-uploading">
                <ActivityIndicator size="small" color={semantic.color.accent} />
                <Text style={styles.captionText}>Đang kiểm tra và tải lên ảnh bằng chứng…</Text>
              </View>
            ) : null}

            {evidenceError ? (
              <Text style={styles.fieldError} testID="report-evidence-error">
                {evidenceError}
              </Text>
            ) : null}

            {evidences.length > 0 ? (
              <View style={styles.evidenceGrid} testID="report-evidence-list">
                {evidences.map((item, idx) => (
                  <View key={item.id} style={styles.evidenceCard} testID={`report-evidence-${idx}`}>
                    {item.localUri ? (
                      <Image
                        source={{ uri: item.localUri }}
                        style={styles.evidenceThumb}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.evidenceThumbFallback}>
                        <Icon name="image" size={20} color={semantic.color.textSecondary} />
                      </View>
                    )}
                    <Pressable
                      testID={`report-evidence-remove-${idx}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Gỡ ảnh bằng chứng ${idx + 1}`}
                      onPress={() => handleRemoveEvidence(item.id)}
                      style={styles.removeEvidenceBtn}
                    >
                      <Icon name="x" size={12} color={semantic.color.textInverse} />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          {/* Chat Log Evidence (UC-35 §3.2 & UC-36 §3.2) */}
          {chatLoading || chatConversations.length > 0 ? (
            <>
              <View style={styles.sectionGap} />
              <View style={styles.section} testID="report-chat-section">
                <SectionHeading
                  title="Nhật ký hội thoại liên quan"
                  subtitle="Đính kèm tin nhắn làm bằng chứng cho Kiểm duyệt viên."
                />
                {chatLoading ? (
                  <View style={styles.inlineLoading}>
                    <ActivityIndicator size="small" color={semantic.color.accent} />
                    <Text style={styles.captionText}>Đang kiểm tra hội thoại liên quan…</Text>
                  </View>
                ) : (
                  <>
                    <CheckboxRow
                      testID="report-attach-chat-toggle"
                      label="Đính kèm nhật ký chat làm bằng chứng"
                      description={
                        activeConversation?.listingTitle
                          ? `Hội thoại về: ${activeConversation.listingTitle}`
                          : `Hội thoại với ${activeConversation?.counterpartyName ?? 'đối phương'}`
                      }
                      checked={attachChatLog}
                      onChange={handleToggleAttachChat}
                    />

                    {attachChatLog && chatConversations.length > 1 ? (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.convChips}
                      >
                        {chatConversations.map((conv) => {
                          const active = conv.conversationId === activeConversation?.conversationId;
                          return (
                            <Pressable
                              key={conv.conversationId}
                              onPress={() => handleSelectConversation(conv.conversationId)}
                              style={[styles.convChip, active && styles.convChipActive]}
                            >
                              <Text
                                style={[styles.convChipText, active && styles.convChipTextActive]}
                                numberOfLines={1}
                              >
                                {conv.listingTitle || conv.counterpartyName}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    ) : null}

                    {attachChatLog && activeConversation ? (
                      <View style={styles.chatMsgList}>
                        <Text style={styles.captionText}>
                          Đã chọn {selectedMessageIds.length}/{activeConversation.messages.length}{' '}
                          tin nhắn (tối đa {MAX_REPORT_CHAT_MESSAGES})
                        </Text>
                        {activeConversation.messages.map((msg) => {
                          const checked = selectedMessageIds.includes(msg.id);
                          return (
                            <Pressable
                              key={msg.id}
                              testID={`report-chat-msg-${msg.id}`}
                              accessibilityRole="checkbox"
                              accessibilityState={{ checked }}
                              onPress={() => handleToggleChatMessage(msg.id)}
                              style={[styles.chatMsgRow, checked && styles.chatMsgRowSelected]}
                            >
                              <Icon
                                name={checked ? 'check-circle' : 'circle'}
                                size={16}
                                color={checked ? semantic.color.accent : semantic.color.textSecondary}
                              />
                              <View style={styles.chatMsgBody}>
                                <View style={styles.chatMsgMetaRow}>
                                  <Text style={styles.chatMsgSender}>{msg.senderName}</Text>
                                  <Text style={styles.chatMsgTime}>
                                    {formatMessageTime(msg.sentAt)}
                                  </Text>
                                </View>
                                <Text style={styles.chatMsgContent} numberOfLines={3}>
                                  {msg.content}
                                </Text>
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : null}
                  </>
                )}
              </View>
            </>
          ) : null}
        </ScrollView>

        {/* Sticky footer actions */}
        <View style={[styles.footer, { paddingBottom: bottomPad }]}>
          <Pressable
            testID="report-cancel-button"
            disabled={submitting}
            onPress={handleCancel}
            accessibilityRole="button"
            accessibilityLabel="Hủy báo cáo"
            style={({ pressed }) => [
              styles.cancelBtn,
              submitting && styles.disabledControl,
              pressed && styles.pressedControl,
            ]}
          >
            <Text style={styles.cancelBtnText}>Hủy</Text>
          </Pressable>

          <Pressable
            testID="report-submit-button"
            disabled={submitting || uploadingEvidence || hasVisibleRestriction}
            onPress={() => void handleSubmit()}
            accessibilityRole="button"
            accessibilityLabel="Gửi báo cáo"
            accessibilityState={{
              disabled: submitting || uploadingEvidence || hasVisibleRestriction,
              busy: submitting,
            }}
            style={({ pressed }) => [
              styles.primaryBtn,
              styles.submitBtn,
              (submitting || uploadingEvidence || hasVisibleRestriction) && styles.disabledControl,
              pressed && styles.primaryBtnPressed,
            ]}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={semantic.color.textInverse} />
            ) : (
              <Text style={styles.primaryBtnText}>
                {submitError ? 'Gửi lại báo cáo' : 'Gửi báo cáo'}
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
  container: {
    flex: 1,
    backgroundColor: semantic.color.bgSurface,
  },
  scroll: {
    flex: 1,
    backgroundColor: semantic.color.bgCanvas,
  },
  scrollContent: {
    paddingBottom: primitive.space[6],
  },
  centerPage: {
    flex: 1,
    backgroundColor: semantic.color.bgPage,
    justifyContent: 'center',
    alignItems: 'center',
    padding: semantic.spacing.section,
  },
  centerCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: semantic.color.bgSurface,
    borderRadius: primitive.radius.xl,
    padding: primitive.space[5],
    alignItems: 'center',
    gap: primitive.space[3],
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
  },
  centerTitle: {
    ...semantic.type.sectionTitle,
    textAlign: 'center',
  },
  centerSubtitle: {
    ...semantic.type.caption,
    textAlign: 'center',
  },
  bannerWrap: {
    paddingHorizontal: semantic.spacing.pageX,
    paddingTop: primitive.space[3],
    backgroundColor: semantic.color.bgSurface,
  },
  section: {
    backgroundColor: semantic.color.bgSurface,
    paddingHorizontal: semantic.spacing.pageX,
    paddingVertical: primitive.space[4],
    gap: primitive.space[3],
  },
  sectionGap: {
    height: primitive.space[2],
    backgroundColor: semantic.color.bgCanvas,
  },
  targetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: primitive.space[3],
  },
  targetIcon: {
    width: 38,
    height: 38,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetTextWrap: {
    flex: 1,
    gap: 2,
  },
  targetTypeLabel: {
    ...semantic.type.micro,
    color: semantic.color.danger,
    textTransform: 'uppercase',
  },
  targetTitle: {
    ...semantic.type.sectionTitle,
  },
  targetMeta: {
    ...semantic.type.caption,
  },
  privacyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2],
    backgroundColor: semantic.color.freeBg,
    borderRadius: primitive.radius.md,
    paddingHorizontal: primitive.space[3],
    paddingVertical: primitive.space[2],
  },
  privacyBannerText: {
    flex: 1,
    fontSize: primitive.fontSize.xs,
    lineHeight: primitive.lineHeight.xs,
    color: semantic.color.freeFg,
  },
  inlineLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2],
    paddingVertical: primitive.space[2],
  },
  captionText: {
    ...semantic.type.caption,
  },
  categoryList: {
    gap: primitive.space[2],
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: primitive.space[3],
    padding: primitive.space[3],
    borderRadius: primitive.radius.lg,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
    backgroundColor: semantic.color.bgSurface,
  },
  categoryRowSelected: {
    borderColor: semantic.color.accent,
    backgroundColor: semantic.color.accentSoft,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: primitive.radius.full,
    borderWidth: 2,
    borderColor: semantic.color.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  radioOuterSelected: {
    borderColor: semantic.color.accent,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.accent,
  },
  categoryBody: {
    flex: 1,
    gap: 2,
  },
  categoryName: {
    ...semantic.type.label,
  },
  categoryNameSelected: {
    color: semantic.color.accentDeep,
  },
  categoryDesc: {
    ...semantic.type.caption,
  },
  textArea: {
    minHeight: 112,
    borderRadius: component.input.radius,
    borderWidth: 1,
    borderColor: component.input.border,
    backgroundColor: component.input.bg,
    paddingHorizontal: primitive.space[3],
    paddingVertical: primitive.space[3],
    fontSize: primitive.fontSize.base,
    color: semantic.color.textPrimary,
  },
  inputError: {
    borderColor: component.input.errorBorder,
  },
  charCount: {
    ...semantic.type.micro,
    textAlign: 'right',
  },
  fieldError: {
    fontSize: primitive.fontSize.sm,
    color: semantic.color.danger,
  },
  evidenceActionRow: {
    flexDirection: 'row',
    gap: primitive.space[2.5],
  },
  secondaryActionBtn: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: primitive.space[2],
    borderRadius: component.button.radius,
    borderWidth: 1,
    borderColor: component.button.secondaryBorder,
    backgroundColor: component.button.secondaryBg,
    paddingHorizontal: primitive.space[3],
  },
  secondaryActionText: {
    ...semantic.type.label,
  },
  evidenceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: primitive.space[2.5],
    marginTop: primitive.space[1],
  },
  evidenceCard: {
    width: 84,
    height: 84,
    borderRadius: primitive.radius.md,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
    backgroundColor: semantic.color.bgSubtle,
  },
  evidenceThumb: {
    width: '100%',
    height: '100%',
  },
  evidenceThumbFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeEvidenceBtn: {
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
  convChips: {
    gap: primitive.space[2],
    paddingVertical: primitive.space[1],
  },
  convChip: {
    paddingHorizontal: primitive.space[3],
    paddingVertical: primitive.space[1.5],
    borderRadius: primitive.radius.full,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
    backgroundColor: semantic.color.bgSubtle,
    maxWidth: 220,
  },
  convChipActive: {
    borderColor: semantic.color.accent,
    backgroundColor: semantic.color.accentSoft,
  },
  convChipText: {
    ...semantic.type.caption,
  },
  convChipTextActive: {
    color: semantic.color.accentDeep,
    fontWeight: primitive.fontWeight.semibold,
  },
  chatMsgList: {
    gap: primitive.space[2],
  },
  chatMsgRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: primitive.space[2.5],
    padding: primitive.space[2.5],
    borderRadius: primitive.radius.md,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
    backgroundColor: semantic.color.bgSubtle,
  },
  chatMsgRowSelected: {
    borderColor: semantic.color.accentBorder,
    backgroundColor: semantic.color.accentSoft,
  },
  chatMsgBody: {
    flex: 1,
    gap: 2,
  },
  chatMsgMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: primitive.space[2],
  },
  chatMsgSender: {
    ...semantic.type.label,
    fontSize: primitive.fontSize.xs,
  },
  chatMsgTime: {
    ...semantic.type.micro,
  },
  chatMsgContent: {
    ...semantic.type.caption,
    color: semantic.color.textPrimary,
  },
  footer: {
    flexDirection: 'row',
    gap: primitive.space[3],
    paddingHorizontal: semantic.spacing.pageX,
    paddingTop: primitive.space[3],
    borderTopWidth: 1,
    borderTopColor: semantic.color.borderHairline,
    backgroundColor: semantic.color.bgSurface,
  },
  cancelBtn: {
    minHeight: component.button.minHeight,
    paddingHorizontal: primitive.space[4],
    borderRadius: component.button.radius,
    borderWidth: 1,
    borderColor: component.button.secondaryBorder,
    backgroundColor: component.button.secondaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    ...semantic.type.label,
    fontSize: primitive.fontSize.base,
  },
  primaryBtn: {
    minHeight: component.button.minHeight,
    paddingHorizontal: primitive.space[4],
    borderRadius: component.button.radius,
    backgroundColor: component.button.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtn: {
    flex: 1,
  },
  primaryBtnPressed: {
    backgroundColor: component.button.primaryPressedBg,
  },
  primaryBtnText: {
    color: component.button.primaryFg,
    fontSize: primitive.fontSize.base,
    fontWeight: primitive.fontWeight.semibold,
  },
  disabledControl: {
    opacity: primitive.opacity.disabled,
  },
  pressedControl: {
    opacity: primitive.opacity.pressed,
  },
  successScroll: {
    flexGrow: 1,
    padding: semantic.spacing.section,
    alignItems: 'center',
    justifyContent: 'center',
    gap: primitive.space[4],
  },
  successIconWrap: {
    width: 64,
    height: 64,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    ...semantic.type.screenTitle,
    textAlign: 'center',
  },
  successSubtitle: {
    ...semantic.type.body,
    color: semantic.color.textSecondary,
    textAlign: 'center',
  },
  summaryCard: {
    width: '100%',
    backgroundColor: semantic.color.bgSubtle,
    borderRadius: primitive.radius.xl,
    padding: primitive.space[4],
    gap: primitive.space[3],
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: primitive.space[3],
  },
  summaryLabel: {
    ...semantic.type.caption,
  },
  summaryValue: {
    ...semantic.type.label,
    flex: 1,
    textAlign: 'right',
  },
  privacyNote: {
    ...semantic.type.caption,
    textAlign: 'center',
  },
});

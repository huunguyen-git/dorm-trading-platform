import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import {
  formatReputationSummary,
  formatVnd,
  type CategoryTreeNode,
  type CreateListingPayload,
  type ListingCategory,
  type ListingQuota,
  type ListingStatus,
  type LocationZone,
  type LocationZoneGroup,
  type UpdateListingPayload,
} from '../listings/types';
import InventoryPickerSection, { type InventoryPickerMode } from './InventoryPickerSection';
import ListingImageManager from './ListingImageManager';
import {
  FormField,
  HairlineDivider,
  Icon,
  InlineBanner,
  QuotaMeter,
  SectionHeading,
  StatusIndicator,
  SwitchRow,
} from './ui';
import { component, primitive, semantic } from '../theme';

export interface ListingFormInitialValues {
  title?: string;
  description?: string;
  condition?: string;
  priceVnd?: number;
  categoryId?: string;
  locationCode?: string;
  locationText?: string;
  latitude?: number | null;
  longitude?: number | null;
  courseCode?: string;
  courseName?: string;
  author?: string;
  images?: string[];
  itemIds?: string[];
}

export interface ListingFormConflictState {
  type: 'VERSION_CONFLICT' | 'QUOTA_EXCEEDED';
  message: string;
}

export interface ListingFormContentProps {
  mode: 'create' | 'edit';
  listingStatus?: ListingStatus;
  listingVersion?: number;
  pendingRequestCount?: number;
  initialValues?: ListingFormInitialValues;
  preselectedItemId?: string;
  quota: ListingQuota | null;
  categories: ListingCategory[];
  categoryTree: CategoryTreeNode[];
  locations: LocationZone[];
  loadingReferences?: boolean;
  submitting?: boolean;
  readOnly?: boolean;
  readOnlyMessage?: string;
  submitError?: string;
  conflictState?: ListingFormConflictState | null;
  headerSlot?: ReactNode;
  onReloadConflict?: () => void;
  onNavigateToInventoryCreate: () => void;
  onCancel: () => void;
  onSubmitCreate?: (payload: CreateListingPayload) => Promise<void>;
  onSubmitEdit?: (payload: UpdateListingPayload) => Promise<void>;
}

type FieldErrors = Partial<
  Record<
    'itemIds' | 'title' | 'categoryId' | 'condition' | 'priceVnd' | 'location' | 'description' | 'images',
    string
  >
>;

const ZONE_GROUP_LABELS: Record<LocationZoneGroup, string> = {
  KTX: 'Ký túc xá ĐHQG-HCM',
  TRUONG: 'Trường thành viên',
  LAN_CAN: 'Khu vực lân cận',
};

const ZONE_GROUP_ORDER: LocationZoneGroup[] = ['KTX', 'TRUONG', 'LAN_CAN'];

// Mirrors backend InventoryService linked_count statuses (excludes DA_RUT, HET_HAN, KET_THUC, AN)
const COUNTED_LINKED_LISTING_STATUSES: ReadonlySet<ListingStatus> = new Set([
  'NHAP',
  'CHO_DUYET',
  'CONG_KHAI',
  'GIU_CHO',
]);

function isTextbookCategory(categoryId: string, categories: ListingCategory[]): boolean {
  if (!categoryId) return false;
  const byId = new Map(categories.map((cat) => [cat.id, cat]));
  let current = byId.get(categoryId);
  let depth = 0;
  while (current && depth < 10) {
    if (current.id === 'GIAO_TRINH') return true;
    const lowered = current.name.toLowerCase();
    if (lowered.includes('giáo trình') || lowered.includes('sách')) return true;
    current = current.parentId ? byId.get(current.parentId) : undefined;
    depth += 1;
  }
  return categoryId === 'GIAO_TRINH';
}

function getCategoryBreadcrumb(categoryId: string, categories: ListingCategory[]): string {
  if (!categoryId) return '';
  const byId = new Map(categories.map((cat) => [cat.id, cat]));
  const parts: string[] = [];
  let current = byId.get(categoryId);
  let depth = 0;
  while (current && depth < 10) {
    parts.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
    depth += 1;
  }
  return parts.join(' › ');
}

function parsePriceInput(raw: string): number {
  const digitsOnly = raw.replace(/[.,\s]/g, '');
  if (!digitsOnly) return Number.NaN;
  if (!/^-?\d+$/.test(digitsOnly)) return Number.NaN;
  return Number(digitsOnly);
}

export default function ListingFormContent({
  mode,
  listingStatus,
  listingVersion = 0,
  pendingRequestCount = 0,
  initialValues,
  preselectedItemId,
  quota,
  categories,
  categoryTree,
  locations,
  loadingReferences = false,
  submitting = false,
  readOnly = false,
  readOnlyMessage,
  submitError,
  conflictState,
  headerSlot,
  onReloadConflict,
  onNavigateToInventoryCreate,
  onCancel,
  onSubmitCreate,
  onSubmitEdit,
}: ListingFormContentProps) {
  const insets = useContext(SafeAreaInsetsContext);
  const initialItemIds = initialValues?.itemIds ?? [];
  const initialPrice = initialValues?.priceVnd;
  const initialIsFree =
    mode === 'edit'
      ? initialPrice === 0
      : typeof initialPrice === 'number' && initialPrice === 0;

  const [selectedItemIds, setSelectedItemIds] = useState<string[]>(initialItemIds);
  const [pickerMode, setPickerMode] = useState<InventoryPickerMode>(
    initialItemIds.length >= 2 ? 'combo' : 'single',
  );
  const [title, setTitle] = useState(initialValues?.title ?? '');
  const [categoryId, setCategoryId] = useState(initialValues?.categoryId ?? '');
  const [courseCode, setCourseCode] = useState(initialValues?.courseCode ?? '');
  const [courseName, setCourseName] = useState(initialValues?.courseName ?? '');
  const [author, setAuthor] = useState(initialValues?.author ?? '');
  const [condition, setCondition] = useState(initialValues?.condition ?? '');
  const [isFree, setIsFree] = useState<boolean>(initialIsFree);
  const [priceInput, setPriceInput] = useState(
    initialPrice !== undefined && initialPrice !== null ? String(initialPrice) : '',
  );
  const [locationCode, setLocationCode] = useState(initialValues?.locationCode ?? '');
  const [locationText, setLocationText] = useState(initialValues?.locationText ?? '');
  const [latitude, setLatitude] = useState<number | null>(initialValues?.latitude ?? null);
  const [longitude, setLongitude] = useState<number | null>(initialValues?.longitude ?? null);
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [images, setImages] = useState<string[]>(initialValues?.images ?? []);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [activeSubmitAction, setActiveSubmitAction] = useState<'PUBLISH' | 'DRAFT' | 'KEEP' | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formBannerError, setFormBannerError] = useState('');

  useEffect(() => {
    if (!submitting) {
      setActiveSubmitAction(null);
    }
  }, [submitting]);

  useEffect(() => {
    if (submitError || conflictState) {
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    }
  }, [submitError, conflictState]);

  const hasInitialTextbookData = Boolean(
    initialValues?.courseCode || initialValues?.courseName || initialValues?.author,
  );
  const isTextbookSelected = useMemo(
    () => isTextbookCategory(categoryId, categories),
    [categoryId, categories],
  );
  const [textbookExpanded, setTextbookExpanded] = useState<boolean>(
    hasInitialTextbookData || isTextbookSelected,
  );

  useEffect(() => {
    if (isTextbookSelected) {
      setTextbookExpanded(true);
    }
  }, [isTextbookSelected]);

  const effectiveTree = useMemo<CategoryTreeNode[]>(() => {
    if (categoryTree.length > 0) return categoryTree;
    return categories.map((cat) => ({ ...cat, children: [] }));
  }, [categoryTree, categories]);

  const groupedLocations = useMemo(() => {
    const groups = new Map<LocationZoneGroup, LocationZone[]>();
    ZONE_GROUP_ORDER.forEach((group) => groups.set(group, []));
    locations.forEach((zone) => {
      const bucket = groups.get(zone.group) ?? [];
      bucket.push(zone);
      groups.set(zone.group, bucket);
    });
    return ZONE_GROUP_ORDER.map((group) => ({
      group,
      label: ZONE_GROUP_LABELS[group],
      items: groups.get(group) ?? [],
    })).filter((section) => section.items.length > 0);
  }, [locations]);

  const selectedZone = useMemo(
    () => locations.find((zone) => zone.code === locationCode) ?? null,
    [locations, locationCode],
  );

  const selectedCategoryPath = useMemo(
    () => getCategoryBreadcrumb(categoryId, categories),
    [categoryId, categories],
  );

  const parsedPricePreview = isFree ? 0 : parsePriceInput(priceInput);
  const quotaExhausted = Boolean(quota && (quota.remaining <= 0 || !quota.canPublish));
  const publishDisabledByQuota =
    quotaExhausted && (mode === 'create' || listingStatus === 'NHAP');
  const inactiveEditQuotaExhausted =
    quotaExhausted && mode === 'edit' && (listingStatus === 'DA_RUT' || listingStatus === 'HET_HAN');
  const formDisabled = readOnly || submitting;
  const bottomPad = Math.max(insets?.bottom ?? 0, primitive.space[3]);

  const clearFieldError = (key: keyof FieldErrors) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setFormBannerError('');
  };

  const handleToggleFree = (nextValue: boolean) => {
    if (formDisabled) return;
    clearFieldError('priceVnd');
    setIsFree(nextValue);
    if (nextValue) {
      setPriceInput('0');
    } else if (priceInput === '0') {
      setPriceInput('');
    }
  };

  const handleSelectZone = (zone: LocationZone) => {
    if (formDisabled) return;
    clearFieldError('location');
    if (locationCode === zone.code) {
      setLocationCode('');
      setLatitude(null);
      setLongitude(null);
      return;
    }
    setLocationCode(zone.code);
    setLatitude(zone.latitude);
    setLongitude(zone.longitude);
  };

  const validateAndBuildPayload = (targetAction: 'PUBLISH' | 'DRAFT' | 'KEEP') => {
    const errors: FieldErrors = {};
    const strict = targetAction === 'PUBLISH' || (mode === 'edit' && listingStatus !== 'NHAP');
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    const trimmedCondition = condition.trim();
    const trimmedLocationText = locationText.trim();

    if (!trimmedTitle) {
      errors.title = strict
        ? 'Vui lòng nhập tiêu đề tin đăng.'
        : 'Vui lòng nhập ít nhất tiêu đề để lưu bản nháp.';
    } else if (trimmedTitle.length > 255) {
      errors.title = 'Tiêu đề không được vượt quá 255 ký tự.';
    }

    let resolvedPrice = 0;
    if (isFree) {
      resolvedPrice = 0;
    } else if (priceInput.trim() === '') {
      if (strict) {
        errors.priceVnd = 'Vui lòng nhập giá bán (VNĐ) hoặc bật Tặng miễn phí (0đ).';
      } else {
        resolvedPrice = 0;
      }
    } else {
      const parsed = parsePriceInput(priceInput);
      if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
        errors.priceVnd = 'Giá bán phải là số nguyên hợp lệ (VNĐ).';
      } else if (parsed < 0) {
        errors.priceVnd = 'Giá bán không được nhỏ hơn 0đ.';
      } else {
        resolvedPrice = parsed;
      }
    }

    if (images.length > 5) {
      errors.images = 'Chỉ được đính kèm tối đa 5 ảnh thực tế.';
    }

    if (strict) {
      if (selectedItemIds.length === 0) {
        errors.itemIds = 'Vui lòng chọn ít nhất 1 đồ vật khả dụng từ Kho đồ cá nhân.';
      } else if (pickerMode === 'combo' && selectedItemIds.length < 2) {
        errors.itemIds = 'Tin combo cần chọn ít nhất 2 đồ vật. Hãy chọn thêm hoặc chuyển sang Tin đơn.';
      }

      if (!categoryId) {
        errors.categoryId = 'Vui lòng chọn danh mục phù hợp.';
      }

      if (!trimmedCondition) {
        errors.condition = 'Vui lòng nhập mô tả tình trạng đồ vật.';
      }

      if (!locationCode && !trimmedLocationText) {
        errors.location = 'Vui lòng chọn khu vực ĐHQG-HCM hoặc nhập điểm hẹn chi tiết.';
      }

      if (!trimmedDescription) {
        errors.description = 'Vui lòng nhập mô tả chi tiết cho tin đăng.';
      }

      if (images.length < 1) {
        errors.images = 'Vui lòng thêm ít nhất 1 ảnh thực tế để công khai tin.';
      }
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setFormBannerError(
        targetAction === 'PUBLISH'
          ? 'Vui lòng kiểm tra và hoàn thiện các trường còn thiếu trước khi công khai tin.'
          : targetAction === 'KEEP'
            ? 'Vui lòng kiểm tra và hoàn thiện các trường còn thiếu trước khi lưu thay đổi.'
            : 'Vui lòng kiểm tra lại thông tin chưa hợp lệ trước khi lưu nháp.',
      );
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
      return null;
    }

    setFormBannerError('');
    return {
      title: trimmedTitle,
      description: trimmedDescription,
      condition: trimmedCondition || null,
      priceVnd: resolvedPrice,
      categoryId,
      locationCode: locationCode || null,
      locationText: trimmedLocationText || null,
      latitude: selectedZone ? selectedZone.latitude : latitude,
      longitude: selectedZone ? selectedZone.longitude : longitude,
      courseCode: courseCode.trim() ? courseCode.trim().toUpperCase() : null,
      courseName: courseName.trim() || null,
      author: author.trim() || null,
      images: [...images],
      itemIds: [...selectedItemIds],
    };
  };

  const handleSubmit = async (targetAction: 'PUBLISH' | 'DRAFT' | 'KEEP') => {
    if (formDisabled || imageUploading) return;
    const base = validateAndBuildPayload(targetAction);
    if (!base) return;

    setActiveSubmitAction(targetAction);
    try {
      if (mode === 'create' && onSubmitCreate) {
        await onSubmitCreate({
          ...base,
          action: targetAction === 'DRAFT' ? 'DRAFT' : 'PUBLISH',
        });
      } else if (mode === 'edit' && onSubmitEdit) {
        await onSubmitEdit({
          ...base,
          action: targetAction === 'PUBLISH' ? 'PUBLISH' : 'KEEP',
          version: listingVersion,
        });
      }
    } finally {
      setActiveSubmitAction(null);
    }
  };

  const reputationSummary = quota ? formatReputationSummary(quota.reputationScore) : null;

  const quotaWarningMessage = quota
    ? publishDisabledByQuota
      ? `Bạn đã dùng hết hạn mức ${quota.activeCount}/${quota.limit} tin đang mở/giữ chỗ. Bạn vẫn có thể chọn Lưu nháp (không tính vào hạn mức) hoặc rút bớt tin cũ để công khai tin mới.`
      : inactiveEditQuotaExhausted
        ? `Bạn đã dùng hết hạn mức ${quota.activeCount}/${quota.limit} tin đang mở/giữ chỗ. Bạn vẫn có thể lưu thay đổi cho tin này, nhưng cần rút bớt tin cũ trước khi công khai lại hoặc gia hạn.`
        : quotaExhausted
          ? `Bạn đã đạt hạn mức ${quota.activeCount}/${quota.limit} tin đang mở/giữ chỗ. Bạn vẫn có thể lưu thay đổi cho tin này.`
          : undefined
    : undefined;

  const quotaWarningTestID = publishDisabledByQuota
    ? 'quota-exhausted-banner'
    : inactiveEditQuotaExhausted
      ? 'quota-exhausted-note'
      : undefined;

  const hasAlertBanners = Boolean(
    (readOnly && readOnlyMessage) ||
      (mode === 'edit' && pendingRequestCount > 0 && !readOnly) ||
      conflictState ||
      submitError ||
      formBannerError,
  );

  const canPublishNow = !formDisabled && !imageUploading && !publishDisabledByQuota;
  const canSaveDraftOrKeep = !formDisabled && !imageUploading;

  const readinessSteps = [
    { key: 'photos', label: 'Ảnh', done: images.length > 0 },
    {
      key: 'items',
      label: 'Đồ vật',
      done: pickerMode === 'combo' ? selectedItemIds.length >= 2 : selectedItemIds.length > 0,
    },
    {
      key: 'details',
      label: 'Thông tin',
      done: Boolean(
        title.trim() && condition.trim() && description.trim() && categoryId.trim(),
      ),
    },
    {
      key: 'pricing',
      label: 'Giá & Vị trí',
      done: Boolean(
        (isFree || (Number.isFinite(parsedPricePreview) && parsedPricePreview > 0)) &&
          (locationCode || locationText.trim()),
      ),
    },
  ];
  const readyCount = readinessSteps.filter((s) => s.done).length;
  const readyPercent = Math.round((readyCount / readinessSteps.length) * 100);

  const conditionPresets = ['Mới 99%', 'Mới 95%', 'Mới 90%', 'Dùng tốt'];
  const pricePresets = [
    { label: '30k', value: '30000' },
    { label: '50k', value: '50000' },
    { label: '100k', value: '100000' },
    { label: '200k', value: '200000' },
    { label: '500k', value: '500000' },
  ];

  const keyboardOffset = Platform.OS === 'ios' ? 88 : (insets?.top ?? 0) + 56;

  return (
    <KeyboardAvoidingView
      style={styles.shell}
      behavior="padding"
      keyboardVerticalOffset={keyboardOffset}
    >
      <ScrollView
        ref={scrollViewRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {headerSlot ? <View style={styles.headerSlotWrap}>{headerSlot}</View> : null}

        {hasAlertBanners ? (
          <View style={styles.alertsStack}>
            {readOnly && readOnlyMessage ? (
              <InlineBanner
                tone="warning"
                icon="lock"
                testID="listing-readonly-banner"
                title="Chế độ chỉ xem"
                message={readOnlyMessage}
              />
            ) : null}

            {mode === 'edit' && pendingRequestCount > 0 && !readOnly ? (
              <InlineBanner
                tone="neutral"
                testID="pending-requests-notice"
                title={`Đang có ${pendingRequestCount} yêu cầu mua chờ xử lý`}
                message={`Tin đang có ${pendingRequestCount} yêu cầu mua chờ xử lý. Nội dung cập nhật sẽ được hiển thị cho người mua.`}
              />
            ) : null}

            {conflictState?.type === 'VERSION_CONFLICT' ? (
              <InlineBanner
                tone="danger"
                testID="version-conflict-banner"
                title="Dữ liệu tin đã thay đổi"
                message={conflictState.message}
                actionLabel={onReloadConflict ? 'Tải lại tin mới nhất' : undefined}
                actionTestID="reload-conflict-button"
                onActionPress={onReloadConflict}
              />
            ) : null}

            {conflictState?.type === 'QUOTA_EXCEEDED' ? (
              <InlineBanner
                tone="warning"
                testID="quota-conflict-banner"
                title="Đã vượt hạn mức đăng tin"
                message={conflictState.message}
                actionLabel={mode === 'create' ? 'Lưu nháp thay thế' : 'Giữ ở bản nháp'}
                actionTestID="fallback-save-draft-button"
                onActionPress={() => {
                  if (!submitting) {
                    void handleSubmit(mode === 'create' ? 'DRAFT' : 'KEEP');
                  }
                }}
              />
            ) : null}

            {submitError ? <InlineBanner tone="danger" message={submitError} /> : null}
            {formBannerError ? <InlineBanner tone="danger" message={formBannerError} /> : null}
          </View>
        ) : null}

        {/* Section 1: Quota Strip (Lucian #299 QuotaMeter) */}
        {quota ? (
          <>
            <View style={styles.quotaSection} testID="listing-quota-card">
              <QuotaMeter
                activeCount={quota.activeCount}
                limit={quota.limit}
                reputationScore={quota.reputationScore}
                highTierThreshold={quota.highTierThreshold}
                standardLimit={quota.standardLimit}
                highTierLimit={quota.highTierLimit}
                label="Hạn mức tin đang mở"
                warningMessage={quotaWarningMessage}
                warningTestID={quotaWarningTestID}
                showUnlockCue={false}
                style={styles.quotaMeterFlush}
              />
              <View style={styles.quotaMetaRow}>
                <Text style={styles.quotaActiveCount} testID="quota-active-count">
                  Đang mở/giữ chỗ: {quota.activeCount} / {quota.limit} tin
                </Text>
                {reputationSummary ? (
                  <Text style={styles.quotaReputationText} testID="quota-reputation-badge">
                    {reputationSummary.scoreText} · {reputationSummary.tierLabel}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.quotaRuleCaption}>
                Dưới {quota.highTierThreshold} điểm: tối đa {quota.standardLimit} tin · Từ{' '}
                {quota.highTierThreshold} điểm: tối đa {quota.highTierLimit} tin đang mở.
              </Text>
            </View>
            <HairlineDivider />
          </>
        ) : null}

        {/* Readiness Checklist Strip */}
        {!readOnly ? (
          <>
            <View style={styles.readinessStrip} testID="form-readiness-strip">
              <View style={styles.readinessHeader}>
                <Text style={styles.readinessTitle}>Mức độ hoàn thiện tin</Text>
                <Text
                  style={[
                    styles.readinessCount,
                    readyCount === readinessSteps.length && styles.readinessCountDone,
                  ]}
                >
                  {readyCount === readinessSteps.length
                    ? 'Sẵn sàng công khai'
                    : `${readyCount}/${readinessSteps.length} mục`}
                </Text>
              </View>
              <View style={styles.readinessTrack}>
                <View
                  style={[
                    styles.readinessFill,
                    { width: `${readyPercent}%` },
                    readyCount === readinessSteps.length && styles.readinessFillDone,
                  ]}
                />
              </View>
              <View style={styles.readinessRow}>
                {readinessSteps.map((step) => (
                  <View
                    key={step.key}
                    style={[styles.readinessPill, step.done && styles.readinessPillDone]}
                  >
                    <Icon
                      name={step.done ? 'check-circle' : 'circle'}
                      size={12}
                      color={step.done ? semantic.color.freeFg : semantic.color.textSecondary}
                    />
                    <Text
                      style={[
                        styles.readinessPillText,
                        step.done && styles.readinessPillTextDone,
                      ]}
                      numberOfLines={1}
                    >
                      {step.label}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
            <HairlineDivider />
          </>
        ) : null}

        {/* Section 2: Photo-First Rail */}
        <View style={styles.section}>
          <ListingImageManager
            images={images}
            onChange={(nextImages) => {
              clearFieldError('images');
              setImages(nextImages);
            }}
            disabled={formDisabled}
            error={fieldErrors.images}
            onUploadingChange={setImageUploading}
          />
        </View>

        <HairlineDivider />

        {/* Section 3: Inventory Items */}
        <View style={styles.section}>
          <InventoryPickerSection
            selectedItemIds={selectedItemIds}
            onChangeSelectedItemIds={(ids) => {
              clearFieldError('itemIds');
              setSelectedItemIds(ids);
            }}
            mode={pickerMode}
            onChangeMode={(nextMode) => {
              clearFieldError('itemIds');
              setPickerMode(nextMode);
            }}
            disabled={formDisabled}
            error={fieldErrors.itemIds}
            preselectedItemId={preselectedItemId}
            currentListingItemIds={mode === 'edit' ? initialValues?.itemIds : undefined}
            currentListingCountsTowardLinked={
              mode === 'edit'
                ? !listingStatus || COUNTED_LINKED_LISTING_STATUSES.has(listingStatus)
                : undefined
            }
            onNavigateToInventoryCreate={onNavigateToInventoryCreate}
          />
        </View>

        <HairlineDivider />

        {/* Section 4: Core Details */}
        <View style={styles.section}>
          <SectionHeading title="Thông tin chi tiết" />

          <FormField
            label="Tiêu đề"
            required
            testID="listing-title-input"
            placeholder="VD: Giáo trình Nhập môn CNPM SE100 hoặc Combo bàn + đèn học"
            value={title}
            onChangeText={(value) => {
              clearFieldError('title');
              setTitle(value);
            }}
            maxLength={255}
            editable={!formDisabled}
            helperText="Tiêu đề ngắn gọn, nêu rõ tên món đồ hoặc combo (tối đa 255 ký tự)."
            error={fieldErrors.title}
          />

          <View style={styles.subGroup}>
            <FormField
              label="Tình trạng"
              required
              testID="listing-condition-input"
              placeholder="VD: Mới 95%, không ghi chú, còn đủ phụ kiện"
              value={condition}
              onChangeText={(value) => {
                clearFieldError('condition');
                setCondition(value);
              }}
              editable={!formDisabled}
              error={fieldErrors.condition}
            />
            {!formDisabled ? (
              <View style={styles.presetRow} testID="condition-presets-row">
                {conditionPresets.map((preset) => {
                  const active = condition.trim() === preset;
                  return (
                    <Pressable
                      key={preset}
                      testID={`condition-preset-${preset}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => {
                        clearFieldError('condition');
                        setCondition(preset);
                      }}
                      style={({ pressed }) => [
                        styles.presetChip,
                        active && styles.presetChipActive,
                        pressed && styles.pressedState,
                      ]}
                    >
                      <Text
                        style={[
                          styles.presetChipText,
                          active && styles.presetChipTextActive,
                        ]}
                      >
                        {preset}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>

          {/* Price & Free Giveaway */}
          <View style={styles.subGroup}>
            <SwitchRow
              testID="listing-free-toggle"
              label="Tặng miễn phí (0đ)"
              description="Chia sẻ miễn phí cho sinh viên trong khu vực"
              value={isFree}
              onValueChange={handleToggleFree}
              disabled={formDisabled}
            />

            <FormField
              label="Giá bán"
              required={!isFree}
              suffix="đ"
              testID="listing-price-input"
              accessibilityLabel="Giá bán"
              placeholder={isFree ? '0' : 'VD: 120000'}
              keyboardType="numeric"
              value={isFree ? '0' : priceInput}
              onChangeText={(value) => {
                clearFieldError('priceVnd');
                setPriceInput(value);
                if (value.trim() === '0') {
                  setIsFree(true);
                }
              }}
              editable={!formDisabled && !isFree}
              helperText={
                !isFree && Number.isFinite(parsedPricePreview) && parsedPricePreview > 0
                  ? `Hiển thị: ${formatVnd(parsedPricePreview)}`
                  : undefined
              }
              error={fieldErrors.priceVnd}
            />

            {!isFree && !formDisabled ? (
              <View style={styles.presetRow} testID="price-presets-row">
                {pricePresets.map((preset) => {
                  const active = priceInput.replace(/[^\d]/g, '') === preset.value;
                  return (
                    <Pressable
                      key={preset.value}
                      testID={`price-preset-${preset.value}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => {
                        clearFieldError('priceVnd');
                        setPriceInput(preset.value);
                      }}
                      style={({ pressed }) => [
                        styles.presetChip,
                        active && styles.presetChipActive,
                        pressed && styles.pressedState,
                      ]}
                    >
                      <Text
                        style={[
                          styles.presetChipText,
                          active && styles.presetChipTextActive,
                        ]}
                      >
                        {preset.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {isFree ? (
              <InlineBanner
                tone="success"
                icon="gift"
                testID="free-price-banner"
                message={
                  selectedItemIds.length >= 2 || pickerMode === 'combo'
                    ? 'Combo cho tặng miễn phí (0đ) · Người nhận không cần đề nghị giá.'
                    : 'Cho tặng miễn phí (0đ) · Người nhận không cần đề nghị giá.'
                }
              />
            ) : null}
          </View>

          {/* Category Selector */}
          <View style={styles.subGroup} testID="listing-category-picker">
            <View style={styles.fieldHeaderRow}>
              <View style={styles.fieldLabelWrap}>
                <Text style={styles.fieldLabel}>Danh mục</Text>
                <Text style={styles.requiredMark}>*</Text>
              </View>
              {selectedCategoryPath ? (
                <Text style={styles.selectedPathText} testID="selected-category-path">
                  {selectedCategoryPath}
                </Text>
              ) : null}
            </View>

            {loadingReferences && effectiveTree.length === 0 ? (
              <View style={styles.inlineLoading}>
                <ActivityIndicator color={semantic.color.accent} size="small" />
                <Text style={styles.caption}>Đang tải danh mục...</Text>
              </View>
            ) : (
              <View style={styles.categoryTreeWrap}>
                {effectiveTree.map((parent) => {
                  const parentSelected = categoryId === parent.id;
                  return (
                    <View key={parent.id} style={styles.categoryGroup}>
                      <Pressable
                        testID={`category-chip-${parent.id}`}
                        accessibilityRole="button"
                        accessibilityState={{ selected: parentSelected, disabled: formDisabled }}
                        disabled={formDisabled}
                        onPress={() => {
                          clearFieldError('categoryId');
                          setCategoryId(parent.id);
                        }}
                        style={({ pressed }) => [
                          styles.chip,
                          parentSelected && styles.chipSelected,
                          formDisabled && styles.disabledState,
                          pressed && !formDisabled && styles.pressedState,
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            parentSelected && styles.chipTextSelected,
                          ]}
                        >
                          {parent.name}
                        </Text>
                      </Pressable>

                      {parent.children.length > 0 ? (
                        <View style={styles.childCategoryRow}>
                          {parent.children.map((child) => {
                            const childSelected = categoryId === child.id;
                            return (
                              <Pressable
                                key={child.id}
                                testID={`category-chip-${child.id}`}
                                accessibilityRole="button"
                                accessibilityState={{
                                  selected: childSelected,
                                  disabled: formDisabled,
                                }}
                                disabled={formDisabled}
                                onPress={() => {
                                  clearFieldError('categoryId');
                                  setCategoryId(child.id);
                                }}
                                style={({ pressed }) => [
                                  styles.childChip,
                                  childSelected && styles.chipSelected,
                                  formDisabled && styles.disabledState,
                                  pressed && !formDisabled && styles.pressedState,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.childChipText,
                                    childSelected && styles.chipTextSelected,
                                  ]}
                                >
                                  {child.name}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}

            {fieldErrors.categoryId ? (
              <Text style={styles.inlineError}>{fieldErrors.categoryId}</Text>
            ) : null}
          </View>

          {/* Textbook Metadata (auto-expanded when textbook category selected) */}
          <View
            style={[
              styles.textbookPanel,
              isTextbookSelected && styles.textbookPanelAccent,
            ]}
            testID="textbook-fields-section"
          >
            <Pressable
              testID="toggle-textbook-section"
              accessibilityRole="button"
              accessibilityState={{ expanded: textbookExpanded }}
              onPress={() => setTextbookExpanded((prev) => !prev)}
              style={styles.textbookHeader}
            >
              <View style={styles.textbookHeaderLeft}>
                <Icon
                  name="book-open"
                  size={16}
                  color={isTextbookSelected ? semantic.color.accent : semantic.color.textSecondary}
                />
                <Text style={styles.textbookTitle}>Thông tin giáo trình</Text>
                {isTextbookSelected ? (
                  <StatusIndicator
                    testID="textbook-recommended-badge"
                    label="Khuyên nhập"
                    tone="accent"
                    variant="soft"
                  />
                ) : null}
              </View>

              <View style={styles.textbookToggleRight}>
                <Text style={styles.toggleLabel}>
                  {textbookExpanded ? 'Thu gọn' : 'Mở rộng'}
                </Text>
                <Icon
                  name={textbookExpanded ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={semantic.color.textSecondary}
                />
              </View>
            </Pressable>

            {textbookExpanded ? (
              <View style={styles.textbookFields}>
                <Text style={styles.caption}>
                  Giúp sinh viên cùng trường tìm nhanh giáo trình theo mã môn học.
                </Text>
                <FormField
                  label="Mã môn học"
                  testID="listing-course-code-input"
                  placeholder="VD: SE100, IT001, MA006"
                  autoCapitalize="characters"
                  value={courseCode}
                  onChangeText={setCourseCode}
                  editable={!formDisabled}
                />
                <FormField
                  label="Tên môn học"
                  testID="listing-course-name-input"
                  placeholder="VD: Phương pháp phát triển phần mềm hướng đối tượng"
                  value={courseName}
                  onChangeText={setCourseName}
                  editable={!formDisabled}
                />
                <FormField
                  label="Tác giả"
                  testID="listing-author-input"
                  placeholder="VD: Nguyễn Văn A, Ian Sommerville"
                  value={author}
                  onChangeText={setAuthor}
                  editable={!formDisabled}
                />
              </View>
            ) : null}
          </View>

          {/* Description */}
          <FormField
            label="Mô tả chi tiết"
            required
            multiline
            numberOfLines={4}
            testID="listing-description-input"
            accessibilityLabel="Mô tả chi tiết"
            placeholder="Mô tả rõ tình trạng, phụ kiện kèm theo, thời gian thuận tiện bàn giao..."
            value={description}
            onChangeText={(value) => {
              clearFieldError('description');
              setDescription(value);
            }}
            editable={!formDisabled}
            error={fieldErrors.description}
          />
        </View>

        <HairlineDivider />

        {/* Section 5: Meeting Location */}
        <View style={styles.section} testID="listing-location-picker">
          <SectionHeading
            title="Khu vực giao nhận"
            subtitle="Chọn khu vực gần bạn để sinh viên dễ tìm và hẹn giao nhận."
          />

          {loadingReferences && groupedLocations.length === 0 ? (
            <View style={styles.inlineLoading}>
              <ActivityIndicator color={semantic.color.accent} size="small" />
              <Text style={styles.caption}>Đang tải khu vực...</Text>
            </View>
          ) : (
            <View style={styles.zoneGroupsWrap}>
              {groupedLocations.map((group) => (
                <View key={group.group} style={styles.zoneGroup}>
                  <Text style={styles.zoneGroupTitle}>{group.label}</Text>
                  <View style={styles.zoneChipsRow}>
                    {group.items.map((zone) => {
                      const selected = locationCode === zone.code;
                      return (
                        <Pressable
                          key={zone.code}
                          testID={`location-chip-${zone.code}`}
                          accessibilityRole="button"
                          accessibilityState={{ selected, disabled: formDisabled }}
                          disabled={formDisabled}
                          onPress={() => handleSelectZone(zone)}
                          style={({ pressed }) => [
                            styles.chip,
                            selected && styles.chipSelected,
                            formDisabled && styles.disabledState,
                            pressed && !formDisabled && styles.pressedState,
                          ]}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              selected && styles.chipTextSelected,
                            ]}
                          >
                            {zone.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          )}

          {selectedZone ? (
            <View style={styles.selectedZoneRow}>
              <Icon name="map-pin" size={14} color={semantic.color.accent} />
              <Text style={styles.selectedZoneText} testID="selected-zone-summary">
                Khu vực đã chọn: {selectedZone.name}
              </Text>
            </View>
          ) : null}

          <FormField
            label="Điểm hẹn chi tiết"
            testID="listing-location-text-input"
            placeholder="VD: Sảnh tòa A1 KTX Khu A, Cổng chính UIT..."
            value={locationText}
            onChangeText={(value) => {
              clearFieldError('location');
              setLocationText(value);
            }}
            editable={!formDisabled}
            error={fieldErrors.location}
          />
        </View>
      </ScrollView>

      {/* Sticky Bottom Action Bar */}
      <View style={[styles.stickyBar, { paddingBottom: bottomPad }]}>
        {mode === 'create' ? (
          <>
            <Pressable
              testID="submit-draft-listing"
              accessibilityRole="button"
              accessibilityLabel="Lưu nháp"
              accessibilityState={{
                disabled: !canSaveDraftOrKeep,
                busy: submitting && activeSubmitAction === 'DRAFT',
              }}
              disabled={!canSaveDraftOrKeep}
              onPress={() => void handleSubmit('DRAFT')}
              style={({ pressed }) => [
                styles.secondaryBtn,
                styles.stickySecondary,
                !canSaveDraftOrKeep && styles.disabledState,
                pressed && canSaveDraftOrKeep && styles.pressedState,
              ]}
            >
              {submitting && activeSubmitAction === 'DRAFT' ? (
                <ActivityIndicator color={semantic.color.textPrimary} size="small" />
              ) : null}
              <Text style={styles.secondaryBtnText}>Lưu nháp</Text>
            </Pressable>

            <Pressable
              testID="submit-publish-listing"
              accessibilityRole="button"
              accessibilityLabel="Công khai tin"
              accessibilityState={{
                disabled: !canPublishNow,
                busy: submitting && activeSubmitAction !== 'DRAFT',
              }}
              disabled={!canPublishNow}
              onPress={() => void handleSubmit('PUBLISH')}
              style={({ pressed }) => [
                styles.primaryBtn,
                styles.stickyPrimary,
                !canPublishNow && styles.disabledState,
                pressed && canPublishNow && styles.primaryBtnPressed,
              ]}
            >
              {submitting && activeSubmitAction !== 'DRAFT' ? (
                <ActivityIndicator color={component.button.primaryFg} size="small" />
              ) : null}
              <Text style={styles.primaryBtnText}>Công khai tin</Text>
            </Pressable>
          </>
        ) : listingStatus === 'NHAP' ? (
          <>
            <Pressable
              testID="submit-save-listing"
              accessibilityRole="button"
              accessibilityLabel="Lưu thay đổi"
              accessibilityState={{
                disabled: !canSaveDraftOrKeep,
                busy: submitting && activeSubmitAction === 'KEEP',
              }}
              disabled={!canSaveDraftOrKeep}
              onPress={() => void handleSubmit('KEEP')}
              style={({ pressed }) => [
                styles.secondaryBtn,
                styles.stickySecondary,
                !canSaveDraftOrKeep && styles.disabledState,
                pressed && canSaveDraftOrKeep && styles.pressedState,
              ]}
            >
              {submitting && activeSubmitAction === 'KEEP' ? (
                <ActivityIndicator color={semantic.color.textPrimary} size="small" />
              ) : null}
              <Text style={styles.secondaryBtnText}>Lưu thay đổi</Text>
            </Pressable>

            <Pressable
              testID="submit-publish-draft-listing"
              accessibilityRole="button"
              accessibilityLabel="Công khai tin ngay"
              accessibilityState={{
                disabled: !canPublishNow,
                busy: submitting && activeSubmitAction !== 'KEEP',
              }}
              disabled={!canPublishNow}
              onPress={() => void handleSubmit('PUBLISH')}
              style={({ pressed }) => [
                styles.primaryBtn,
                styles.stickyPrimary,
                !canPublishNow && styles.disabledState,
                pressed && canPublishNow && styles.primaryBtnPressed,
              ]}
            >
              {submitting && activeSubmitAction !== 'KEEP' ? (
                <ActivityIndicator color={component.button.primaryFg} size="small" />
              ) : null}
              <Text style={styles.primaryBtnText}>Công khai tin ngay</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              testID="cancel-listing-form"
              accessibilityRole="button"
              accessibilityLabel="Hủy"
              accessibilityState={{ disabled: submitting }}
              disabled={submitting}
              onPress={onCancel}
              style={({ pressed }) => [
                styles.secondaryBtn,
                styles.stickyCancel,
                submitting && styles.disabledState,
                pressed && !submitting && styles.pressedState,
              ]}
            >
              <Text style={styles.secondaryBtnText}>Hủy</Text>
            </Pressable>

            <Pressable
              testID="submit-save-listing"
              accessibilityRole="button"
              accessibilityLabel="Lưu thay đổi"
              accessibilityState={{ disabled: !canSaveDraftOrKeep, busy: submitting }}
              disabled={!canSaveDraftOrKeep}
              onPress={() => void handleSubmit('KEEP')}
              style={({ pressed }) => [
                styles.primaryBtn,
                styles.stickyPrimary,
                !canSaveDraftOrKeep && styles.disabledState,
                pressed && canSaveDraftOrKeep && styles.primaryBtnPressed,
              ]}
            >
              {submitting ? (
                <ActivityIndicator color={component.button.primaryFg} size="small" />
              ) : null}
              <Text style={styles.primaryBtnText}>Lưu thay đổi</Text>
            </Pressable>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: semantic.color.bgSurface,
  },
  scroll: {
    flex: 1,
    backgroundColor: semantic.color.bgSurface,
  },
  scrollContent: {
    paddingBottom: primitive.space[8],
  },
  headerSlotWrap: {
    paddingHorizontal: semantic.spacing.pageX,
    paddingTop: primitive.space[3],
  },
  alertsStack: {
    paddingHorizontal: semantic.spacing.pageX,
    paddingTop: primitive.space[3],
    gap: primitive.space[2.5],
  },
  quotaSection: {
    paddingHorizontal: semantic.spacing.pageX,
    paddingVertical: primitive.space[4],
    gap: primitive.space[1.5],
  },
  quotaMeterFlush: {
    paddingVertical: 0,
  },
  quotaMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: primitive.space[2],
    marginTop: primitive.space[1],
  },
  quotaActiveCount: {
    ...semantic.type.micro,
    fontVariant: ['tabular-nums'],
    color: semantic.color.textPrimary,
    fontWeight: primitive.fontWeight.semibold,
  },
  quotaReputationText: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
  },
  quotaRuleCaption: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
  },
  readinessStrip: {
    paddingHorizontal: semantic.spacing.pageX,
    paddingVertical: primitive.space[3],
    backgroundColor: semantic.color.bgWarmTint,
    gap: primitive.space[2],
  },
  readinessHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: primitive.space[2],
  },
  readinessTitle: {
    ...semantic.type.micro,
    fontWeight: primitive.fontWeight.semibold,
    color: semantic.color.textPrimary,
  },
  readinessCount: {
    ...semantic.type.micro,
    fontWeight: primitive.fontWeight.semibold,
    color: semantic.color.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  readinessCountDone: {
    color: semantic.color.freeFg,
  },
  readinessTrack: {
    height: 4,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.borderHairline,
    overflow: 'hidden',
  },
  readinessFill: {
    height: '100%',
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.accent,
  },
  readinessFillDone: {
    backgroundColor: semantic.color.freeFg,
  },
  readinessRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: primitive.space[1.5],
  },
  readinessPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: primitive.space[2],
    paddingVertical: 4,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.bgSurface,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
  },
  readinessPillDone: {
    backgroundColor: semantic.color.freeBg,
    borderColor: semantic.color.freeBg,
  },
  readinessPillText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: primitive.fontWeight.medium,
    color: semantic.color.textSecondary,
  },
  readinessPillTextDone: {
    color: semantic.color.freeFg,
    fontWeight: primitive.fontWeight.semibold,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: primitive.space[1.5],
  },
  presetChip: {
    paddingHorizontal: primitive.space[2.5],
    paddingVertical: 5,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.bgSubtle,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
  },
  presetChipActive: {
    backgroundColor: semantic.color.accentSoft,
    borderColor: semantic.color.accent,
  },
  presetChipText: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
  },
  presetChipTextActive: {
    color: semantic.color.accent,
    fontWeight: primitive.fontWeight.semibold,
  },
  section: {
    paddingHorizontal: semantic.spacing.pageX,
    paddingVertical: primitive.space[5],
    gap: primitive.space[4],
  },
  subGroup: {
    gap: primitive.space[2.5],
  },
  fieldHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: primitive.space[2],
  },
  fieldLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1],
  },
  fieldLabel: {
    ...semantic.type.label,
    color: semantic.color.textSecondary,
  },
  requiredMark: {
    ...semantic.type.label,
    color: semantic.color.accent,
  },
  selectedPathText: {
    ...semantic.type.micro,
    color: semantic.color.accent,
    fontWeight: primitive.fontWeight.semibold,
  },
  caption: {
    ...semantic.type.caption,
  },
  inlineLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2],
    paddingVertical: primitive.space[2],
  },
  categoryTreeWrap: {
    gap: primitive.space[2.5],
  },
  categoryGroup: {
    gap: primitive.space[2],
  },
  childCategoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: primitive.space[2],
    paddingLeft: primitive.space[3],
  },
  chip: {
    alignSelf: 'flex-start',
    minHeight: component.chip.height,
    paddingHorizontal: primitive.space[3],
    paddingVertical: primitive.space[1.5],
    borderRadius: component.chip.radius,
    borderWidth: 1,
    borderColor: component.chip.border,
    backgroundColor: semantic.color.bgSubtle,
    justifyContent: 'center',
  },
  childChip: {
    minHeight: component.chip.height,
    paddingHorizontal: primitive.space[3],
    paddingVertical: primitive.space[1.5],
    borderRadius: component.chip.radius,
    borderWidth: 1,
    borderColor: component.chip.border,
    backgroundColor: semantic.color.bgSurface,
    justifyContent: 'center',
  },
  chipSelected: {
    backgroundColor: component.chip.activeBg,
    borderColor: component.chip.activeBorder,
  },
  chipText: {
    ...semantic.type.label,
    fontWeight: primitive.fontWeight.medium,
    color: semantic.color.textPrimary,
  },
  childChipText: {
    ...semantic.type.micro,
    color: semantic.color.textPrimary,
  },
  chipTextSelected: {
    color: component.chip.activeFg,
    fontWeight: primitive.fontWeight.semibold,
  },
  textbookPanel: {
    borderRadius: primitive.radius.lg,
    backgroundColor: semantic.color.bgSubtle,
    padding: primitive.space[4],
    gap: primitive.space[3],
  },
  textbookPanelAccent: {
    backgroundColor: semantic.color.accentSoft,
  },
  textbookHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: primitive.space[2],
  },
  textbookHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: primitive.space[2],
    flex: 1,
  },
  textbookTitle: {
    ...semantic.type.label,
    color: semantic.color.textPrimary,
  },
  textbookToggleRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1],
  },
  toggleLabel: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
  },
  textbookFields: {
    gap: primitive.space[3],
  },
  zoneGroupsWrap: {
    gap: primitive.space[3],
  },
  zoneGroup: {
    gap: primitive.space[2],
  },
  zoneGroupTitle: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  zoneChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: primitive.space[2],
  },
  selectedZoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1.5],
  },
  selectedZoneText: {
    ...semantic.type.label,
    color: semantic.color.accent,
  },
  inlineError: {
    ...semantic.type.micro,
    color: semantic.color.danger,
  },
  stickyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2.5],
    paddingHorizontal: semantic.spacing.pageX,
    paddingTop: primitive.space[3],
    backgroundColor: semantic.color.bgSurface,
    borderTopWidth: 1,
    borderTopColor: semantic.color.borderHairline,
  },
  stickySecondary: {
    flex: 1,
  },
  stickyCancel: {
    minWidth: 96,
  },
  stickyPrimary: {
    flex: 1.4,
  },
  primaryBtn: {
    minHeight: component.button.minHeight,
    paddingHorizontal: component.button.paddingX,
    borderRadius: component.button.radius,
    backgroundColor: component.button.primaryBg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: primitive.space[2],
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
    minHeight: component.button.minHeight,
    paddingHorizontal: component.button.paddingX,
    borderRadius: component.button.radius,
    backgroundColor: semantic.color.bgTrack,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: primitive.space[2],
  },
  secondaryBtnText: {
    fontSize: primitive.fontSize.base,
    fontWeight: primitive.fontWeight.semibold,
    color: semantic.color.textPrimary,
  },
  disabledState: {
    opacity: primitive.opacity.disabled,
  },
  pressedState: {
    opacity: primitive.opacity.pressed,
  },
});

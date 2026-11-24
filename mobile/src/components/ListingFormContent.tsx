import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
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
import { Action, Field, Notice, ui } from './AuthUI';
import { colors, radius, space } from '../theme';

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
  onReloadConflict,
  onNavigateToInventoryCreate,
  onCancel,
  onSubmitCreate,
  onSubmitEdit,
}: ListingFormContentProps) {
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
  const [imageUploading, setImageUploading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formBannerError, setFormBannerError] = useState('');

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

  const clearFieldError = (key: keyof FieldErrors) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setFormBannerError('');
  };

  const handleToggleFree = () => {
    if (formDisabled) return;
    clearFieldError('priceVnd');
    setIsFree((prev) => {
      const next = !prev;
      if (next) {
        setPriceInput('0');
      } else if (priceInput === '0') {
        setPriceInput('');
      }
      return next;
    });
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
        errors.priceVnd = 'Vui lòng nhập giá bán (VNĐ) hoặc bật Cho tặng miễn phí (0đ).';
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
        strict
          ? 'Vui lòng kiểm tra và hoàn thiện các trường còn thiếu trước khi công khai tin.'
          : 'Vui lòng kiểm tra lại thông tin chưa hợp lệ trước khi lưu nháp.',
      );
      return null;
    }

    setFormBannerError('');
    const basePayload = {
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

    return basePayload;
  };

  const handleSubmit = async (targetAction: 'PUBLISH' | 'DRAFT' | 'KEEP') => {
    if (formDisabled || imageUploading) return;
    const base = validateAndBuildPayload(targetAction);
    if (!base) return;

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
  };

  const quotaProgressRatio =
    quota && quota.limit > 0 ? Math.min(1, Math.max(0, quota.activeCount / quota.limit)) : 0;

  return (
    <View style={styles.container}>
      {/* FR-05 Quota Meter Card */}
      {quota ? (
        <View style={styles.quotaCard} testID="listing-quota-card">
          <View style={styles.quotaTopRow}>
            <Text style={styles.quotaTitle}>Hạn mức đăng tin (FR-05)</Text>
            <View style={styles.reputationBadge} testID="quota-reputation-badge">
              <Text style={styles.reputationBadgeText}>
                Uy tín: {quota.reputationScore} điểm
              </Text>
            </View>
          </View>

          <View style={styles.quotaCountRow}>
            <Text style={styles.quotaCountText} testID="quota-active-count">
              Đang mở/giữ chỗ: {quota.activeCount} / {quota.limit} tin
            </Text>
            <Text
              style={[
                styles.quotaRemainingText,
                quota.remaining === 0 && { color: colors.danger },
              ]}
            >
              Còn lại: {quota.remaining}
            </Text>
          </View>

          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.round(quotaProgressRatio * 100)}%`,
                  backgroundColor: quota.remaining === 0 ? colors.danger : colors.brand,
                },
              ]}
            />
          </View>

          <Text style={styles.quotaRuleCaption}>
            &lt; {quota.highTierThreshold} điểm: tối đa {quota.standardLimit} tin · ≥{' '}
            {quota.highTierThreshold} điểm: tối đa {quota.highTierLimit} tin đang hoạt động.
          </Text>

          {publishDisabledByQuota ? (
            <View style={styles.quotaWarningBox} testID="quota-exhausted-banner">
              <Text style={styles.quotaWarningText}>
                Bạn đã dùng hết hạn mức {quota.activeCount}/{quota.limit} tin đang mở/giữ chỗ. Bạn vẫn có thể chọn{' '}
                <Text style={{ fontWeight: '700' }}>Lưu nháp</Text> (không tính vào hạn mức) hoặc rút bớt tin cũ để công khai tin mới.
              </Text>
            </View>
          ) : inactiveEditQuotaExhausted ? (
            <View style={styles.quotaWarningBox} testID="quota-exhausted-note">
              <Text style={styles.quotaWarningText}>
                Bạn đã dùng hết hạn mức {quota.activeCount}/{quota.limit} tin đang mở/giữ chỗ. Bạn vẫn có thể lưu thay đổi cho tin này, nhưng cần rút bớt tin cũ trước khi công khai lại hoặc gia hạn.
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Read-only lock banner (UC-17 exception) */}
      {readOnly && readOnlyMessage ? (
        <View style={styles.lockBanner} testID="listing-readonly-banner">
          <Text style={styles.lockBannerTitle}>Chế độ chỉ xem</Text>
          <Text style={styles.lockBannerText}>{readOnlyMessage}</Text>
        </View>
      ) : null}

      {/* Pending requests info notice (UC-17 alt flow) */}
      {mode === 'edit' && pendingRequestCount > 0 && !readOnly ? (
        <View style={styles.infoBanner} testID="pending-requests-notice">
          <Text style={styles.infoBannerTitle}>
            Đang có {pendingRequestCount} yêu cầu mua chờ xử lý
          </Text>
          <Text style={styles.infoBannerText}>
            Tin đang có {pendingRequestCount} yêu cầu chờ xử lý; hệ thống ghi nhận sự kiện cập nhật để đồng bộ thông báo ở giai đoạn P2-04.
          </Text>
        </View>
      ) : null}

      {/* Optimistic Lock / Quota 409 conflict banners */}
      {conflictState?.type === 'VERSION_CONFLICT' ? (
        <View style={styles.conflictBox} testID="version-conflict-banner">
          <Text style={styles.conflictTitle}>Xung đột phiên bản (409)</Text>
          <Text style={styles.conflictText}>{conflictState.message}</Text>
          {onReloadConflict ? (
            <Action
              secondary
              title="Tải lại tin mới nhất"
              testID="reload-conflict-button"
              onPress={onReloadConflict}
            />
          ) : null}
        </View>
      ) : null}

      {conflictState?.type === 'QUOTA_EXCEEDED' ? (
        <View style={styles.quotaWarningBox} testID="quota-conflict-banner">
          <Text style={styles.conflictTitle}>Đã vượt hạn mức đăng tin</Text>
          <Text style={styles.quotaWarningText}>{conflictState.message}</Text>
          <Action
            secondary
            title={mode === 'create' ? 'Lưu nháp thay thế' : 'Giữ ở bản nháp'}
            testID="fallback-save-draft-button"
            disabled={submitting}
            onPress={() => void handleSubmit(mode === 'create' ? 'DRAFT' : 'KEEP')}
          />
        </View>
      ) : null}

      {/* Top error notices */}
      {submitError ? <Notice message={submitError} error /> : null}
      {formBannerError ? <Notice message={formBannerError} error /> : null}

      {/* 1. Inventory Picker (FR-04) */}
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
        onNavigateToInventoryCreate={onNavigateToInventoryCreate}
      />

      <View style={styles.sectionDivider} />

      {/* 2. Title */}
      <View style={styles.fieldGroup}>
        <Field
          label="Tiêu đề *"
          testID="listing-title-input"
          placeholder="VD: Giáo trình Nhập môn CNPM SE100 hoặc Combo bàn + đèn học"
          value={title}
          onChangeText={(value) => {
            clearFieldError('title');
            setTitle(value);
          }}
          maxLength={255}
          editable={!formDisabled}
          hint="Tiêu đề ngắn gọn, nêu rõ tên món đồ hoặc combo (tối đa 255 ký tự)."
        />
        {fieldErrors.title ? <Text style={styles.inlineError}>{fieldErrors.title}</Text> : null}
      </View>

      {/* 3. Hierarchical Category Picker */}
      <View style={styles.fieldGroup} testID="listing-category-picker">
        <View style={styles.labelRow}>
          <Text style={ui.label}>Danh mục *</Text>
          {selectedCategoryPath ? (
            <Text style={styles.selectedPathText} testID="selected-category-path">
              {selectedCategoryPath}
            </Text>
          ) : null}
        </View>

        {loadingReferences && effectiveTree.length === 0 ? (
          <View style={styles.inlineLoading}>
            <ActivityIndicator color={colors.brand} size="small" />
            <Text style={ui.caption}>Đang tải danh mục…</Text>
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
                    style={[
                      styles.categoryChip,
                      parentSelected && styles.categoryChipSelected,
                      formDisabled && styles.chipDisabled,
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        parentSelected && styles.categoryChipTextSelected,
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
                            accessibilityState={{ selected: childSelected, disabled: formDisabled }}
                            disabled={formDisabled}
                            onPress={() => {
                              clearFieldError('categoryId');
                              setCategoryId(child.id);
                            }}
                            style={[
                              styles.childCategoryChip,
                              childSelected && styles.categoryChipSelected,
                              formDisabled && styles.chipDisabled,
                            ]}
                          >
                            <Text
                              style={[
                                styles.childCategoryChipText,
                                childSelected && styles.categoryChipTextSelected,
                              ]}
                            >
                              ↳ {child.name}
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

      {/* 4. Textbook Metadata (auto-highlighted for GIAO_TRINH or children) */}
      <View
        style={[
          styles.textbookBox,
          isTextbookSelected && styles.textbookBoxHighlighted,
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
            <Text style={styles.textbookTitle}>Thông tin giáo trình</Text>
            {isTextbookSelected ? (
              <View style={styles.recommendPill} testID="textbook-recommended-badge">
                <Text style={styles.recommendPillText}>Khuyên nhập</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.toggleArrow}>{textbookExpanded ? 'Thu gọn ▲' : 'Mở rộng ▼'}</Text>
        </Pressable>

        {textbookExpanded ? (
          <View style={styles.textbookFields}>
            <Text style={ui.caption}>
              Giúp sinh viên cùng trường tìm nhanh giáo trình theo mã môn học (FR-04 / FR-06).
            </Text>
            <Field
              label="Mã môn học"
              testID="listing-course-code-input"
              placeholder="VD: SE100, IT001, MA006"
              autoCapitalize="characters"
              value={courseCode}
              onChangeText={setCourseCode}
              editable={!formDisabled}
            />
            <Field
              label="Tên môn học"
              testID="listing-course-name-input"
              placeholder="VD: Phương pháp phát triển phần mềm hướng đối tượng"
              value={courseName}
              onChangeText={setCourseName}
              editable={!formDisabled}
            />
            <Field
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

      {/* 5. Condition */}
      <View style={styles.fieldGroup}>
        <Field
          label="Tình trạng *"
          testID="listing-condition-input"
          placeholder="VD: Mới 95%, không ghi chú, còn đủ phụ kiện"
          value={condition}
          onChangeText={(value) => {
            clearFieldError('condition');
            setCondition(value);
          }}
          editable={!formDisabled}
        />
        {fieldErrors.condition ? (
          <Text style={styles.inlineError}>{fieldErrors.condition}</Text>
        ) : null}
      </View>

      {/* 6. Price & Free Giveaway Toggle */}
      <View style={styles.fieldGroup}>
        <View style={styles.priceHeaderRow}>
          <Text style={ui.label}>Giá bán (VNĐ) *</Text>
          <Pressable
            testID="listing-free-toggle"
            accessibilityRole="switch"
            accessibilityLabel="Cho tặng miễn phí (0đ)"
            accessibilityState={{ checked: isFree, disabled: formDisabled }}
            disabled={formDisabled}
            onPress={handleToggleFree}
            style={[
              styles.freeTogglePill,
              isFree && styles.freeTogglePillActive,
              formDisabled && styles.chipDisabled,
            ]}
          >
            <Text style={[styles.freeToggleText, isFree && styles.freeToggleTextActive]}>
              {isFree ? '✓ Cho tặng miễn phí (0đ)' : 'Cho tặng miễn phí (0đ)'}
            </Text>
          </Pressable>
        </View>

        <TextInput
          testID="listing-price-input"
          accessibilityLabel="Giá bán (VNĐ)"
          placeholder={isFree ? '0' : 'VD: 120000'}
          placeholderTextColor={colors.muted}
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
          style={[
            ui.field,
            (formDisabled || isFree) && { backgroundColor: '#f5f4ef' },
          ]}
        />

        {isFree ? (
          <View style={styles.freePreviewBanner} testID="free-price-banner">
            <Text style={styles.freePreviewText}>
              {selectedItemIds.length >= 2 || pickerMode === 'combo'
                ? 'Combo cho tặng miễn phí (0đ) · Nút đề nghị giá sẽ được ẩn với người nhận.'
                : 'Tin cho tặng miễn phí (0đ) · Nút đề nghị giá sẽ được ẩn với người nhận.'}
            </Text>
          </View>
        ) : Number.isFinite(parsedPricePreview) && parsedPricePreview > 0 ? (
          <Text style={ui.caption}>Hiển thị: {formatVnd(parsedPricePreview)}</Text>
        ) : null}

        {fieldErrors.priceVnd ? (
          <Text style={styles.inlineError}>{fieldErrors.priceVnd}</Text>
        ) : null}
      </View>

      {/* 7. Location Zone Picker & Meeting Point */}
      <View style={styles.fieldGroup} testID="listing-location-picker">
        <Text style={ui.label}>Khu vực ĐHQG-HCM *</Text>
        <Text style={ui.caption}>
          Chọn khu vực KTX / trường gần bạn nhất để tự động gắn tọa độ giao nhận.
        </Text>

        {loadingReferences && groupedLocations.length === 0 ? (
          <View style={styles.inlineLoading}>
            <ActivityIndicator color={colors.brand} size="small" />
            <Text style={ui.caption}>Đang tải khu vực…</Text>
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
                        style={[
                          styles.zoneChip,
                          selected && styles.categoryChipSelected,
                          formDisabled && styles.chipDisabled,
                        ]}
                      >
                        <Text
                          style={[
                            styles.zoneChipText,
                            selected && styles.categoryChipTextSelected,
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
          <Text style={styles.zoneCoordCaption} testID="selected-zone-summary">
            Đã chọn: {selectedZone.name} ({selectedZone.latitude.toFixed(4)},{' '}
            {selectedZone.longitude.toFixed(4)})
          </Text>
        ) : null}

        <Field
          label="Điểm hẹn chi tiết"
          testID="listing-location-text-input"
          placeholder="VD: Sảnh tòa A1 KTX Khu A, Cổng chính UIT..."
          value={locationText}
          onChangeText={(value) => {
            clearFieldError('location');
            setLocationText(value);
          }}
          editable={!formDisabled}
        />

        {fieldErrors.location ? (
          <Text style={styles.inlineError}>{fieldErrors.location}</Text>
        ) : null}
      </View>

      {/* 8. Description */}
      <View style={styles.fieldGroup}>
        <Text style={ui.label}>Mô tả chi tiết *</Text>
        <TextInput
          testID="listing-description-input"
          accessibilityLabel="Mô tả chi tiết"
          placeholder="Mô tả rõ tình trạng, phụ kiện kèm theo, thời gian thuận tiện bàn giao..."
          placeholderTextColor={colors.muted}
          multiline
          numberOfLines={4}
          value={description}
          onChangeText={(value) => {
            clearFieldError('description');
            setDescription(value);
          }}
          editable={!formDisabled}
          style={[
            ui.field,
            styles.textArea,
            formDisabled && { backgroundColor: '#f5f4ef' },
          ]}
        />
        {fieldErrors.description ? (
          <Text style={styles.inlineError}>{fieldErrors.description}</Text>
        ) : null}
      </View>

      <View style={styles.sectionDivider} />

      {/* 9. Photos (1-5) */}
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

      <View style={styles.sectionDivider} />

      {/* 10. Action Buttons */}
      <View style={styles.submitGroup}>
        {mode === 'create' ? (
          <>
            <Action
              title="Công khai tin"
              testID="submit-publish-listing"
              disabled={formDisabled || imageUploading || publishDisabledByQuota}
              busy={submitting}
              onPress={() => void handleSubmit('PUBLISH')}
            />
            <Action
              secondary
              title="Lưu nháp"
              testID="submit-draft-listing"
              disabled={formDisabled || imageUploading}
              busy={submitting}
              onPress={() => void handleSubmit('DRAFT')}
            />
          </>
        ) : (
          <>
            <Action
              title="Lưu thay đổi"
              testID="submit-save-listing"
              disabled={formDisabled || imageUploading}
              busy={submitting}
              onPress={() => void handleSubmit('KEEP')}
            />
            {listingStatus === 'NHAP' ? (
              <Action
                secondary
                title="Công khai tin ngay"
                testID="submit-publish-draft-listing"
                disabled={formDisabled || imageUploading || publishDisabledByQuota}
                busy={submitting}
                onPress={() => void handleSubmit('PUBLISH')}
              />
            ) : null}
          </>
        )}

        <Action
          secondary
          title="Hủy"
          testID="cancel-listing-form"
          disabled={submitting}
          onPress={onCancel}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: space.lg,
  },
  quotaCard: {
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: '#f9f8f5',
    borderWidth: 1,
    borderColor: colors.line,
    gap: space.sm,
  },
  quotaTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  quotaTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  reputationBadge: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: 16,
    backgroundColor: '#e6f4ea',
  },
  reputationBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#137333',
  },
  quotaCountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.sm,
  },
  quotaCountText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
  },
  quotaRemainingText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#137333',
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e3e4df',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  quotaRuleCaption: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 17,
  },
  quotaWarningBox: {
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: '#fef7e0',
    borderWidth: 1,
    borderColor: '#f0d796',
    gap: space.sm,
  },
  quotaWarningText: {
    fontSize: 13,
    color: '#7a4500',
    lineHeight: 19,
  },
  lockBanner: {
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: '#fef7e0',
    borderWidth: 1,
    borderColor: '#e9c874',
    gap: space.xs,
  },
  lockBannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#8a4f00',
  },
  lockBannerText: {
    fontSize: 13,
    color: colors.ink,
    lineHeight: 20,
  },
  infoBanner: {
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: '#e8f0fe',
    borderWidth: 1,
    borderColor: '#c2d7fa',
    gap: space.xs,
  },
  infoBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1967d2',
  },
  infoBannerText: {
    fontSize: 13,
    color: colors.ink,
    lineHeight: 19,
  },
  conflictBox: {
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: '#fff0ec',
    borderWidth: 1,
    borderColor: '#e5b8af',
    gap: space.sm,
  },
  conflictTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.danger,
  },
  conflictText: {
    fontSize: 13,
    color: colors.ink,
    lineHeight: 19,
  },
  sectionDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  fieldGroup: {
    gap: space.sm,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  selectedPathText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.brand,
  },
  inlineLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
  },
  categoryTreeWrap: {
    gap: space.sm,
  },
  categoryGroup: {
    gap: space.xs,
  },
  categoryChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#f9f8f5',
  },
  childCategoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    paddingLeft: space.md,
  },
  childCategoryChip: {
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  categoryChipSelected: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  chipDisabled: {
    opacity: 0.5,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
  },
  childCategoryChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.ink,
  },
  categoryChipTextSelected: {
    color: colors.surface,
    fontWeight: '700',
  },
  textbookBox: {
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#f9f8f5',
    gap: space.md,
  },
  textbookBoxHighlighted: {
    borderColor: colors.brand,
    backgroundColor: '#fdf8f6',
  },
  textbookHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.sm,
  },
  textbookHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    flexWrap: 'wrap',
  },
  textbookTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  recommendPill: {
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: 12,
    backgroundColor: colors.brand,
  },
  recommendPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.surface,
  },
  toggleArrow: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.brand,
  },
  textbookFields: {
    gap: space.md,
  },
  priceHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  freeTogglePill: {
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#f9f8f5',
  },
  freeTogglePillActive: {
    backgroundColor: '#e6f4ea',
    borderColor: '#137333',
  },
  freeToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.ink,
  },
  freeToggleTextActive: {
    color: '#137333',
    fontWeight: '700',
  },
  freePreviewBanner: {
    padding: space.sm,
    borderRadius: radius.md,
    backgroundColor: '#e6f4ea',
  },
  freePreviewText: {
    fontSize: 12,
    color: '#137333',
    fontWeight: '600',
    lineHeight: 18,
  },
  zoneGroupsWrap: {
    gap: space.md,
  },
  zoneGroup: {
    gap: space.xs,
  },
  zoneGroupTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  zoneChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  zoneChip: {
    paddingHorizontal: space.md,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  zoneChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.ink,
  },
  zoneCoordCaption: {
    fontSize: 12,
    color: colors.brand,
    fontWeight: '600',
  },
  textArea: {
    minHeight: 104,
    textAlignVertical: 'top',
  },
  inlineError: {
    fontSize: 12,
    color: colors.danger,
    fontWeight: '600',
    lineHeight: 17,
  },
  submitGroup: {
    gap: space.sm,
  },
});

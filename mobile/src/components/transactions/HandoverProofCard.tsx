import { useCallback, useContext, useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { fetchHandoverPhotoDataUri } from '../../transactions/api';
import {
  formatFileSize,
  formatMimeShort,
  formatTransactionDateTime,
  type HandoverProofInfo,
} from '../../transactions/types';
import { primitive, semantic } from '../../theme';
import { Icon, InlineBanner, SkeletonBox } from '../ui';

export interface HandoverProofCardProps {
  proof: HandoverProofInfo;
  canViewPhoto?: boolean;
  externalLightboxOpen?: boolean;
  onExternalLightboxClose?: () => void;
  testID?: string;
}

export function HandoverProofCard({
  proof,
  canViewPhoto = true,
  externalLightboxOpen = false,
  onExternalLightboxClose,
  testID = 'handover-proof-card',
}: HandoverProofCardProps) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const stageWidth = Math.max(windowWidth || 375, 320);
  const stageHeight = Math.max((windowHeight || 720) * 0.62, 320);
  const insets = useContext(SafeAreaInsetsContext);

  const photos = proof.photos.length > 0
    ? proof.photos
    : [{ id: proof.photoId ?? 'primary', url: proof.photoUrl, contentType: proof.contentType, sizeBytes: 0, uploadedAt: proof.uploadedAt }];

  const [activeIndex, setActiveIndex] = useState(0);
  const [dataUris, setDataUris] = useState<Record<string, string>>({});
  const [loadingUrl, setLoadingUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  const verticalZoomScrollRef = useRef<ComponentRef<typeof ScrollView> | null>(null);
  const horizontalZoomScrollRef = useRef<ComponentRef<typeof ScrollView> | null>(null);
  const hasCenteredZoomRef = useRef(false);
  const mountedRef = useRef(true);
  const activeRequestIdRef = useRef(0);
  const activeProofUrlRef = useRef(proof.photoUrl);
  const activePhotoUrlRef = useRef<string | null>(null);
  const dataUrisRef = useRef<Record<string, string>>({});

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const zoomedSize = Math.round(stageWidth * 1.85);
  const centerOffsetX = Math.max(0, Math.round((zoomedSize - stageWidth) / 2));
  const centerOffsetY = Math.max(0, Math.round((zoomedSize - stageHeight) / 2));

  const centerZoomViewport = useCallback(() => {
    verticalZoomScrollRef.current?.scrollTo?.({ y: centerOffsetY, animated: false });
    horizontalZoomScrollRef.current?.scrollTo?.({ x: centerOffsetX, animated: false });
  }, [centerOffsetX, centerOffsetY]);

  useEffect(() => {
    hasCenteredZoomRef.current = false;
    if (!zoomed) return;
    const timer = setTimeout(() => {
      centerZoomViewport();
      hasCenteredZoomRef.current = true;
    }, 0);
    return () => clearTimeout(timer);
  }, [zoomed, activeIndex, centerZoomViewport]);

  // Reset local viewer state & private photo cache when viewing a different transaction proof
  useEffect(() => {
    activeRequestIdRef.current += 1;
    activeProofUrlRef.current = proof.photoUrl;
    dataUrisRef.current = {};
    setDataUris({});
    setLoadingUrl(null);
    setActiveIndex(0);
    setZoomed(false);
    setLoadError('');
  }, [proof.photoUrl]);

  const safeIndex = Math.min(activeIndex, photos.length - 1);
  const currentPhoto = photos[safeIndex];
  const currentPhotoUrl = currentPhoto?.url ?? null;
  activeProofUrlRef.current = proof.photoUrl;
  activePhotoUrlRef.current = currentPhotoUrl;
  const currentDataUri = currentPhotoUrl ? dataUris[currentPhotoUrl] : undefined;
  const isModalVisible = lightboxOpen || externalLightboxOpen;

  const selectPhotoIndex = useCallback(
    (nextIndex: number) => {
      activeRequestIdRef.current += 1;
      setZoomed(false);
      setLoadError('');
      const targetUrl = photos[nextIndex]?.url;
      if (targetUrl && dataUrisRef.current[targetUrl]) {
        setLoadingUrl(null);
      }
      setActiveIndex(nextIndex);
    },
    [photos],
  );

  const loadPhoto = useCallback(
    async (url: string) => {
      if (!canViewPhoto) return;
      const reqId = ++activeRequestIdRef.current;
      const scopeProofUrl = proof.photoUrl;
      setLoadingUrl(url);
      setLoadError('');
      try {
        const uri = await fetchHandoverPhotoDataUri(url);
        if (!mountedRef.current || activeProofUrlRef.current !== scopeProofUrl) {
          return;
        }
        if (!uri) {
          if (activeRequestIdRef.current === reqId && activePhotoUrlRef.current === url) {
            setLoadError('Không tìm thấy ảnh bàn giao.');
          }
          return;
        }
        dataUrisRef.current = { ...dataUrisRef.current, [url]: uri };
        setDataUris((prev) => ({ ...prev, [url]: uri }));
        if (activeRequestIdRef.current === reqId) {
          setLoadError('');
        }
      } catch (err) {
        if (
          mountedRef.current &&
          activeProofUrlRef.current === scopeProofUrl &&
          activeRequestIdRef.current === reqId &&
          activePhotoUrlRef.current === url
        ) {
          setLoadError(
            err instanceof Error && err.message && !err.message.startsWith('API ')
              ? err.message
              : 'Không thể tải ảnh bàn giao. Vui lòng thử lại.',
          );
        }
      } finally {
        if (mountedRef.current && activeRequestIdRef.current === reqId) {
          setLoadingUrl((prev) => (prev === url ? null : prev));
        }
      }
    },
    [canViewPhoto, proof.photoUrl],
  );

  useEffect(() => {
    if (!currentPhotoUrl || !canViewPhoto) return;
    if (dataUrisRef.current[currentPhotoUrl]) return;
    void loadPhoto(currentPhotoUrl);
  }, [canViewPhoto, currentPhotoUrl, proof.photoUrl, loadPhoto]);

  const closeLightbox = () => {
    setLightboxOpen(false);
    setZoomed(false);
    onExternalLightboxClose?.();
  };

  const openLightbox = () => {
    if (!currentDataUri) return;
    setZoomed(false);
    setLightboxOpen(true);
  };

  const stepPhoto = (delta: -1 | 1) => {
    if (photos.length <= 1) return;
    const nextIndex = ((safeIndex + delta) % photos.length + photos.length) % photos.length;
    selectPhotoIndex(nextIndex);
  };

  const uploadedLabel = formatTransactionDateTime(currentPhoto?.uploadedAt ?? proof.uploadedAt);
  const mimeLabel = formatMimeShort(currentPhoto?.contentType ?? proof.contentType);
  const sizeLabel = formatFileSize(currentPhoto?.sizeBytes);
  const metadataParts = [mimeLabel, sizeLabel, uploadedLabel].filter(Boolean).join(' · ');

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.headerRow}>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title} accessibilityRole="header">
            Ảnh bàn giao
          </Text>
          {uploadedLabel ? (
            <Text style={styles.timestamp} testID="handover-proof-timestamp">
              {uploadedLabel}
            </Text>
          ) : null}
        </View>

        <View style={styles.privacyPill} testID="handover-privacy-badge">
          <Icon name="shield" size={12} color={semantic.color.success} />
          <Text style={styles.privacyPillText}>Riêng tư</Text>
        </View>
      </View>

      <View style={styles.stage}>
        {loadingUrl === currentPhoto?.url && !currentDataUri ? (
          <View style={styles.loadingSkeletonWrap} testID="handover-proof-loading">
            <SkeletonBox width="100%" height={198} radius={primitive.radius.md} />
            <View style={styles.loadingBadge}>
              <Icon name="lock" size={12} color={semantic.color.textSecondary} />
              <Text style={styles.loadingText}>Đang tải ảnh…</Text>
            </View>
          </View>
        ) : loadError && !currentDataUri ? (
          <View style={styles.errorState} testID="handover-proof-error">
            <InlineBanner
              tone="danger"
              message={loadError}
              actionLabel="Tải lại"
              actionTestID="handover-proof-retry"
              onActionPress={() => {
                if (currentPhoto) void loadPhoto(currentPhoto.url);
              }}
            />
          </View>
        ) : currentDataUri ? (
          <Pressable
            testID="handover-proof-zoom-trigger"
            accessibilityRole="button"
            accessibilityLabel="Phóng to ảnh bàn giao"
            onPress={openLightbox}
            style={styles.photoPressable}
          >
            <Image
              testID="handover-proof-image"
              source={{ uri: currentDataUri }}
              style={styles.photo}
              resizeMode="cover"
              accessibilityLabel={`Ảnh bàn giao ${safeIndex + 1} / ${photos.length}`}
            />

            <View style={styles.zoomHintPill}>
              <Icon name="maximize-2" size={12} color={semantic.color.textInverse} />
              <Text style={styles.zoomHintText}>Phóng to</Text>
            </View>

            {photos.length > 1 ? (
              <View style={styles.counterPill} testID="handover-proof-counter">
                <Text style={styles.zoomHintText}>
                  {safeIndex + 1} / {photos.length}
                </Text>
              </View>
            ) : null}
          </Pressable>
        ) : (
          <View style={styles.centerState}>
            <Icon name="lock" size={20} color={semantic.color.textSecondary} />
            <Text style={styles.loadingText}>Ảnh bàn giao ở chế độ riêng tư.</Text>
          </View>
        )}
      </View>

      {photos.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.switcherRow}
        >
          {photos.map((photo, index) => {
            const active = index === safeIndex;
            return (
              <Pressable
                key={photo.id || `${photo.url}-${index}`}
                testID={`handover-proof-switch-${index}`}
                onPress={() => selectPhotoIndex(index)}
                accessibilityRole="button"
                accessibilityLabel={`Xem ảnh bàn giao ${index + 1}`}
                accessibilityState={{ selected: active }}
                style={[styles.switchChip, active && styles.switchChipActive]}
              >
                <Icon
                  name="image"
                  size={13}
                  color={active ? semantic.color.accent : semantic.color.textSecondary}
                />
                <Text style={[styles.switchChipText, active && styles.switchChipTextActive]}>
                  {index === 0 ? 'Ảnh chính' : `Ảnh ${index + 1}`}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {proof.note ? (
        <View style={styles.noteBox} testID="handover-proof-note">
          <Text style={styles.noteLabel}>Ghi chú người bán</Text>
          <Text style={styles.noteText}>{proof.note}</Text>
        </View>
      ) : null}

      {/* Full-Screen 2D Zoomable Multi-Photo Proof Lightbox Modal */}
      {isModalVisible ? (
        <Modal
          visible={isModalVisible}
          transparent
          statusBarTranslucent
          animationType="fade"
          onRequestClose={closeLightbox}
        >
          <View style={styles.lightboxBackdrop} testID="handover-proof-lightbox">
            <StatusBar barStyle="light-content" />

            <View
              style={[
                styles.lightboxHeader,
                { paddingTop: Math.max((insets?.top ?? 0) + primitive.space[4], primitive.space[8]) },
              ]}
            >
              <View style={styles.lightboxTitleWrap}>
                <Text style={styles.lightboxCounter} testID="proof-lightbox-counter">
                  {safeIndex + 1} / {photos.length}
                </Text>
                {uploadedLabel ? (
                  <Text style={styles.lightboxMeta}>{uploadedLabel}</Text>
                ) : null}
              </View>

              <View style={styles.lightboxHeaderActions}>
                <Pressable
                  testID="proof-zoom-toggle"
                  onPress={() => setZoomed((prev) => !prev)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={zoomed ? 'Thu nhỏ 1x' : 'Phóng to 2x'}
                  style={({ pressed }) => [styles.lightboxPillBtn, pressed && styles.pressed]}
                >
                  <Icon name="maximize-2" size={14} color={semantic.color.textInverse} />
                  <Text style={styles.lightboxPillText}>{zoomed ? '2x' : '1x'}</Text>
                </Pressable>

                <Pressable
                  testID="proof-lightbox-close"
                  onPress={closeLightbox}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Đóng trình xem ảnh bàn giao"
                  style={({ pressed }) => [styles.lightboxCloseBtn, pressed && styles.pressed]}
                >
                  <Icon name="x" size={20} color={semantic.color.textInverse} />
                </Pressable>
              </View>
            </View>

            <View style={styles.lightboxStage}>
              {currentDataUri ? (
                zoomed ? (
                  <ScrollView
                    ref={verticalZoomScrollRef}
                    testID="proof-lightbox-zoom-vertical"
                    style={{ width: stageWidth, maxHeight: stageHeight }}
                    contentContainerStyle={styles.lightboxScrollCenter}
                    contentOffset={{ x: 0, y: centerOffsetY }}
                    onContentSizeChange={() => {
                      if (!hasCenteredZoomRef.current) {
                        centerZoomViewport();
                        hasCenteredZoomRef.current = true;
                      }
                    }}
                    showsVerticalScrollIndicator={false}
                    nestedScrollEnabled
                  >
                    <ScrollView
                      ref={horizontalZoomScrollRef}
                      testID="proof-lightbox-zoom-horizontal"
                      horizontal
                      contentContainerStyle={styles.lightboxScrollCenter}
                      contentOffset={{ x: centerOffsetX, y: 0 }}
                      showsHorizontalScrollIndicator={false}
                    >
                      <Image
                        testID="proof-lightbox-image"
                        source={{ uri: currentDataUri }}
                        style={{
                          width: zoomedSize,
                          height: zoomedSize,
                        }}
                        resizeMode="contain"
                        accessibilityLabel={`Ảnh bàn giao phóng to ${safeIndex + 1}`}
                      />
                    </ScrollView>
                  </ScrollView>
                ) : (
                  <Image
                    testID="proof-lightbox-image"
                    source={{ uri: currentDataUri }}
                    style={{
                      width: stageWidth,
                      height: Math.min(stageWidth * 1.05, stageHeight),
                    }}
                    resizeMode="contain"
                    accessibilityLabel={`Ảnh bàn giao phóng to ${safeIndex + 1}`}
                  />
                )
              ) : (
                <ActivityIndicator size="large" color={semantic.color.textInverse} />
              )}

              {photos.length > 1 ? (
                <>
                  <Pressable
                    testID="proof-lightbox-prev"
                    onPress={() => stepPhoto(-1)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="Ảnh bàn giao trước"
                    style={({ pressed }) => [
                      styles.lightboxNavBtn,
                      styles.lightboxNavPrev,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Icon name="chevron-left" size={22} color={semantic.color.textInverse} />
                  </Pressable>
                  <Pressable
                    testID="proof-lightbox-next"
                    onPress={() => stepPhoto(1)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="Ảnh bàn giao tiếp theo"
                    style={({ pressed }) => [
                      styles.lightboxNavBtn,
                      styles.lightboxNavNext,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Icon name="chevron-right" size={22} color={semantic.color.textInverse} />
                  </Pressable>
                </>
              ) : null}
            </View>

            <View
              style={[
                styles.lightboxFooter,
                { paddingBottom: Math.max(insets?.bottom ?? 0, primitive.space[4]) },
              ]}
            >
              {photos.length > 1 ? (
                <View style={styles.lightboxDotsRow} testID="proof-lightbox-dots">
                  {photos.map((photo, index) => {
                    const active = index === safeIndex;
                    return (
                      <Pressable
                        key={photo.id || `dot-${index}`}
                        testID={`proof-lightbox-dot-${index}`}
                        hitSlop={6}
                        onPress={() => selectPhotoIndex(index)}
                        accessibilityRole="button"
                        accessibilityLabel={`Chuyển sang ảnh ${index + 1}`}
                        accessibilityState={{ selected: active }}
                        style={[styles.lightboxDot, active && styles.lightboxDotActive]}
                      />
                    );
                  })}
                </View>
              ) : null}

              {metadataParts ? (
                <Text style={styles.lightboxMetaFooter} testID="proof-lightbox-metadata">
                  {metadataParts}
                </Text>
              ) : null}

              <View style={styles.lightboxPrivacyRow}>
                <Icon name="shield" size={13} color={semantic.color.textInverseMuted} />
                <Text style={styles.lightboxPrivacyText}>
                  Riêng tư · Chỉ hai bên & Kiểm duyệt
                </Text>
              </View>

              {proof.note ? (
                <Text style={styles.lightboxNote} numberOfLines={3}>
                  “{proof.note}”
                </Text>
              ) : null}
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: primitive.space[2.5],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: primitive.space[2],
    flexWrap: 'wrap',
  },
  headerTextWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...semantic.type.sectionTitle,
  },
  timestamp: {
    ...semantic.type.micro,
    fontVariant: ['tabular-nums'],
  },
  privacyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: primitive.space[2],
    paddingVertical: 4,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.successSoft,
  },
  privacyPillText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: primitive.fontWeight.semibold,
    color: semantic.color.success,
  },
  stage: {
    width: '100%',
    minHeight: 200,
    borderRadius: primitive.radius.lg,
    overflow: 'hidden',
    backgroundColor: semantic.color.bgSubtle,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
  },
  loadingSkeletonWrap: {
    position: 'relative',
    minHeight: 200,
    justifyContent: 'center',
  },
  loadingBadge: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1.5],
    paddingHorizontal: primitive.space[3],
    paddingVertical: primitive.space[1.5],
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.overlayLight,
  },
  photoPressable: {
    width: '100%',
    aspectRatio: 16 / 10,
    position: 'relative',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  zoomHintPill: {
    position: 'absolute',
    bottom: primitive.space[2.5],
    left: primitive.space[2.5],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: primitive.space[2.5],
    paddingVertical: primitive.space[1],
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.overlayDark,
  },
  counterPill: {
    position: 'absolute',
    bottom: primitive.space[2.5],
    right: primitive.space[2.5],
    paddingHorizontal: primitive.space[2.5],
    paddingVertical: primitive.space[1],
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.overlayDark,
  },
  zoomHintText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: primitive.fontWeight.semibold,
    fontVariant: ['tabular-nums'],
    color: semantic.color.textInverse,
  },
  centerState: {
    minHeight: 200,
    alignItems: 'center',
    justifyContent: 'center',
    gap: primitive.space[2],
    padding: primitive.space[4],
  },
  errorState: {
    padding: primitive.space[3],
  },
  loadingText: {
    ...semantic.type.micro,
    color: semantic.color.textPrimary,
    fontWeight: primitive.fontWeight.medium,
  },
  switcherRow: {
    flexDirection: 'row',
    gap: primitive.space[2],
  },
  switchChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: primitive.space[2.5],
    paddingVertical: primitive.space[1.5],
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.bgSubtle,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
  },
  switchChipActive: {
    backgroundColor: semantic.color.accentSoft,
    borderColor: semantic.color.accentBorder,
  },
  switchChipText: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
  },
  switchChipTextActive: {
    color: semantic.color.accent,
    fontWeight: primitive.fontWeight.semibold,
  },
  noteBox: {
    backgroundColor: semantic.color.bgSubtle,
    borderRadius: primitive.radius.md,
    paddingHorizontal: primitive.space[3],
    paddingVertical: primitive.space[2.5],
    gap: 3,
  },
  noteLabel: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
  },
  noteText: {
    ...semantic.type.body,
    fontSize: primitive.fontSize.sm,
    lineHeight: 20,
  },
  lightboxBackdrop: {
    flex: 1,
    backgroundColor: semantic.color.lightboxBg,
    justifyContent: 'space-between',
  },
  lightboxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: semantic.spacing.pageX,
    paddingBottom: primitive.space[3],
    gap: primitive.space[2],
  },
  lightboxTitleWrap: {
    flex: 1,
    gap: 2,
  },
  lightboxCounter: {
    fontSize: primitive.fontSize.base,
    fontWeight: primitive.fontWeight.bold,
    color: semantic.color.textInverse,
    fontVariant: ['tabular-nums'],
  },
  lightboxMeta: {
    fontSize: primitive.fontSize.xs,
    color: semantic.color.textInverseMuted,
    fontVariant: ['tabular-nums'],
  },
  lightboxHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2],
  },
  lightboxPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 36,
    paddingHorizontal: primitive.space[3],
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.inversePillBg,
    borderWidth: 1,
    borderColor: semantic.color.inversePillBorder,
  },
  lightboxPillText: {
    fontSize: primitive.fontSize.xs,
    fontWeight: primitive.fontWeight.bold,
    fontVariant: ['tabular-nums'],
    color: semantic.color.textInverse,
  },
  lightboxCloseBtn: {
    width: 38,
    height: 38,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.inversePillBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  lightboxScrollCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxNavBtn: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.overlayDark,
    borderWidth: 1,
    borderColor: semantic.color.inversePillBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxNavPrev: {
    left: primitive.space[3],
  },
  lightboxNavNext: {
    right: primitive.space[3],
  },
  lightboxFooter: {
    paddingHorizontal: semantic.spacing.pageX,
    paddingTop: primitive.space[2],
    gap: primitive.space[2],
  },
  lightboxDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: primitive.space[1.5],
  },
  lightboxDot: {
    width: 7,
    height: 7,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.inversePillBorder,
  },
  lightboxDotActive: {
    width: 20,
    backgroundColor: semantic.color.textInverse,
  },
  lightboxMetaFooter: {
    fontSize: primitive.fontSize.xs,
    fontWeight: primitive.fontWeight.medium,
    fontVariant: ['tabular-nums'],
    color: semantic.color.textInverse,
    textAlign: 'center',
  },
  lightboxPrivacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: primitive.space[1.5],
  },
  lightboxPrivacyText: {
    fontSize: primitive.fontSize.xs,
    color: semantic.color.textInverseMuted,
    textAlign: 'center',
    flexShrink: 1,
  },
  lightboxNote: {
    fontSize: primitive.fontSize.sm,
    lineHeight: 20,
    color: semantic.color.textInverse,
    textAlign: 'center',
  },
  pressed: {
    opacity: primitive.opacity.pressed,
  },
});

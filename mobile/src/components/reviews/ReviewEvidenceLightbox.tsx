import { useContext } from 'react';
import {
  Image,
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { buildReviewEvidenceImageSource } from '../../api/client';
import { useSession } from '../../auth/session';
import type { ReviewEvidenceItem } from '../../reviews/types';
import { Icon } from '../ui';
import { primitive, semantic } from '../../theme';

export interface ReviewEvidenceLightboxProps {
  items: ReviewEvidenceItem[];
  activeIndex: number;
  visible: boolean;
  onChangeIndex: (index: number) => void;
  onClose: () => void;
}

export function ReviewEvidenceLightbox({
  items,
  activeIndex,
  visible,
  onChangeIndex,
  onClose,
}: ReviewEvidenceLightboxProps) {
  const token = useSession((s) => s.token);
  const insets = useContext(SafeAreaInsetsContext);
  const { width } = useWindowDimensions();
  const stageWidth = Math.max(width || 375, 320);

  if (!visible || items.length === 0) return null;

  const safeIndex = Math.max(0, Math.min(items.length - 1, activeIndex));
  const current = items[safeIndex];
  const topPad = Math.max((insets?.top ?? 0) + primitive.space[4], primitive.space[8]);
  const bottomPad = Math.max(insets?.bottom ?? 0, primitive.space[4]);

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop} testID="review-evidence-lightbox">
        <StatusBar barStyle="light-content" />

        <View style={[styles.header, { paddingTop: topPad }]}>
          <View style={styles.headerMeta}>
            <Text style={styles.counter} testID="review-evidence-lightbox-counter">
              Bằng chứng {safeIndex + 1} / {items.length}
            </Text>
            <Text style={styles.privateNote}>Ảnh riêng tư · Không công khai</Text>
          </View>
          <Pressable
            testID="review-evidence-lightbox-close"
            onPress={onClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Đóng xem bằng chứng"
            style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
          >
            <Icon name="x" size={20} color={semantic.color.textInverse} />
          </Pressable>
        </View>

        <View style={styles.stage}>
          <Image
            testID="review-evidence-lightbox-image"
            source={buildReviewEvidenceImageSource(current.url, token)}
            style={{ width: stageWidth, height: stageWidth }}
            resizeMode="contain"
            accessibilityLabel={current.originalFilename ?? `Ảnh bằng chứng ${safeIndex + 1}`}
          />

          {items.length > 1 ? (
            <>
              <Pressable
                testID="review-evidence-lightbox-prev"
                accessibilityRole="button"
                accessibilityLabel="Ảnh bằng chứng trước"
                onPress={() => onChangeIndex((safeIndex - 1 + items.length) % items.length)}
                style={({ pressed }) => [styles.navBtn, styles.navPrev, pressed && styles.pressed]}
              >
                <Icon name="chevron-left" size={22} color={semantic.color.textInverse} />
              </Pressable>
              <Pressable
                testID="review-evidence-lightbox-next"
                accessibilityRole="button"
                accessibilityLabel="Ảnh bằng chứng tiếp theo"
                onPress={() => onChangeIndex((safeIndex + 1) % items.length)}
                style={({ pressed }) => [styles.navBtn, styles.navNext, pressed && styles.pressed]}
              >
                <Icon name="chevron-right" size={22} color={semantic.color.textInverse} />
              </Pressable>
            </>
          ) : null}
        </View>

        <View style={[styles.footer, { paddingBottom: bottomPad }]}>
          {current.originalFilename ? (
            <Text style={styles.filename} numberOfLines={1}>
              {current.originalFilename}
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: semantic.color.lightboxBg,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: semantic.spacing.pageX,
    paddingBottom: primitive.space[3],
  },
  headerMeta: {
    gap: 2,
  },
  counter: {
    ...semantic.type.label,
    color: semantic.color.textInverse,
    fontVariant: ['tabular-nums'],
  },
  privateNote: {
    ...semantic.type.micro,
    color: semantic.color.textInverseMuted,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.inversePillBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  navBtn: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.overlayDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navPrev: {
    left: primitive.space[3],
  },
  navNext: {
    right: primitive.space[3],
  },
  footer: {
    paddingHorizontal: semantic.spacing.pageX,
    paddingTop: primitive.space[2],
    alignItems: 'center',
  },
  filename: {
    ...semantic.type.caption,
    color: semantic.color.textInverseMuted,
  },
  pressed: {
    opacity: primitive.opacity.pressed,
  },
});

// Lucian UX/UI Prompt #305 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#305
import { useContext, useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { component, primitive, semantic } from '../../theme';
import { Icon } from './Icon';
import { useReduceMotion } from './LayoutPrimitives';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  rightActionLabel?: string;
  onRightAction?: () => void;
  rightActionTestID?: string;
  footerLabel?: string;
  footerCount?: number;
  footerDisabled?: boolean;
  onFooterPress?: () => void;
  footerTestID?: string;
  footerSlot?: React.ReactNode;
  scrollable?: boolean;
  maxHeightRatio?: number;
  testID?: string;
  contentStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

export function BottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  rightActionLabel,
  onRightAction,
  rightActionTestID,
  footerLabel,
  footerCount,
  footerDisabled = false,
  onFooterPress,
  footerTestID,
  footerSlot,
  scrollable = true,
  maxHeightRatio = 0.85,
  testID,
  contentStyle,
  children,
}: BottomSheetProps) {
  const reduceMotion = useReduceMotion();
  const insets = useContext(SafeAreaInsetsContext);
  const scrimOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(320)).current;

  useEffect(() => {
    if (!visible) {
      scrimOpacity.setValue(0);
      sheetTranslateY.setValue(320);
      return;
    }

    if (reduceMotion) {
      scrimOpacity.setValue(1);
      sheetTranslateY.setValue(0);
      return;
    }

    const animation = Animated.parallel([
      Animated.timing(scrimOpacity, {
        toValue: 1,
        duration: primitive.duration.medium,
        easing: Easing.bezier(...primitive.easing.standard),
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: 0,
        duration: primitive.duration.sheet,
        easing: Easing.bezier(...primitive.easing.springSoft),
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => {
      animation.stop();
    };
  }, [visible, reduceMotion, scrimOpacity, sheetTranslateY]);

  const screenHeight = Dimensions.get('window').height || 800;
  const maxHeight = Math.round(screenHeight * maxHeightRatio);
  const bottomPad = Math.max(insets?.bottom ?? 0, primitive.space[4]);

  const resolvedFooterLabel =
    footerLabel && typeof footerCount === 'number'
      ? `${footerLabel} (${footerCount})`
      : footerLabel;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay} accessibilityViewIsModal>
        <Pressable
          testID={testID ? `${testID}-scrim` : 'bottom-sheet-scrim'}
          accessibilityRole="button"
          accessibilityLabel="Đóng bảng"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        >
          <Animated.View
            pointerEvents="none"
            style={[styles.scrim, { opacity: scrimOpacity }]}
          />
        </Pressable>

        <Animated.View
          testID={testID}
          style={[
            styles.sheet,
            {
              maxHeight,
              paddingBottom: footerLabel || footerSlot ? 0 : bottomPad,
              transform: [{ translateY: sheetTranslateY }],
            },
          ]}
        >
          <View style={styles.grabberRow}>
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={styles.grabber}
            />
          </View>

          {title || rightActionLabel ? (
            <View style={styles.header}>
              <View style={styles.headerTextWrap}>
                {title ? (
                  <Text style={styles.title} accessibilityRole="header">
                    {title}
                  </Text>
                ) : null}
                {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
              </View>

              <View style={styles.headerActions}>
                {rightActionLabel && onRightAction ? (
                  <Pressable
                    testID={rightActionTestID}
                    onPress={onRightAction}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={rightActionLabel}
                    style={({ pressed }) => [styles.rightActionBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.rightActionText}>{rightActionLabel}</Text>
                  </Pressable>
                ) : null}

                <Pressable
                  testID={testID ? `${testID}-close` : 'bottom-sheet-close'}
                  onPress={onClose}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Đóng"
                  style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
                >
                  <Icon name="x" size={18} color={semantic.color.textSecondary} />
                </Pressable>
              </View>
            </View>
          ) : null}

          {scrollable ? (
            <ScrollView
              style={styles.bodyScroll}
              contentContainerStyle={[styles.bodyContent, contentStyle]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          ) : (
            <View style={[styles.bodyContent, contentStyle]}>{children}</View>
          )}

          {footerSlot ? (
            <View style={[styles.footer, { paddingBottom: bottomPad }]}>{footerSlot}</View>
          ) : resolvedFooterLabel && onFooterPress ? (
            <View style={[styles.footer, { paddingBottom: bottomPad }]}>
              <Pressable
                testID={footerTestID}
                disabled={footerDisabled}
                onPress={onFooterPress}
                accessibilityRole="button"
                accessibilityLabel={resolvedFooterLabel}
                accessibilityState={{ disabled: footerDisabled }}
                style={({ pressed }) => [
                  styles.footerButton,
                  footerDisabled && styles.footerButtonDisabled,
                  pressed && !footerDisabled && styles.footerButtonPressed,
                ]}
              >
                <Text style={styles.footerButtonText}>{resolvedFooterLabel}</Text>
              </Pressable>
            </View>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: component.sheet.scrim,
  },
  sheet: {
    backgroundColor: component.sheet.bg,
    borderTopLeftRadius: component.sheet.topRadius,
    borderTopRightRadius: component.sheet.topRadius,
    ...primitive.elevation.sheet,
    overflow: 'hidden',
  },
  grabberRow: {
    alignItems: 'center',
    paddingTop: primitive.space[2.5],
    paddingBottom: primitive.space[1.5],
  },
  grabber: {
    width: component.sheet.grabberW,
    height: component.sheet.grabberH,
    borderRadius: primitive.radius.full,
    backgroundColor: component.sheet.grabberBg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: component.sheet.paddingX,
    paddingTop: primitive.space[1],
    paddingBottom: primitive.space[3],
    borderBottomWidth: 1,
    borderBottomColor: semantic.color.borderHairline,
    gap: primitive.space[3],
  },
  headerTextWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...semantic.type.sectionTitle,
  },
  subtitle: {
    ...semantic.type.caption,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2],
  },
  rightActionBtn: {
    minHeight: 36,
    paddingHorizontal: primitive.space[2],
    justifyContent: 'center',
  },
  rightActionText: {
    ...semantic.type.label,
    color: semantic.color.accent,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.bgSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bodyScroll: {
    flexGrow: 0,
  },
  bodyContent: {
    paddingHorizontal: component.sheet.paddingX,
    paddingVertical: primitive.space[4],
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: semantic.color.borderHairline,
    paddingHorizontal: component.sheet.paddingX,
    paddingTop: primitive.space[3],
    backgroundColor: component.sheet.bg,
  },
  footerButton: {
    minHeight: component.button.minHeight,
    borderRadius: component.button.radius,
    backgroundColor: component.button.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: component.button.paddingX,
  },
  footerButtonPressed: {
    backgroundColor: component.button.primaryPressedBg,
  },
  footerButtonDisabled: {
    opacity: primitive.opacity.disabled,
  },
  footerButtonText: {
    fontSize: primitive.fontSize.base,
    fontWeight: primitive.fontWeight.semibold,
    color: component.button.primaryFg,
  },
  pressed: {
    opacity: primitive.opacity.pressed,
  },
});

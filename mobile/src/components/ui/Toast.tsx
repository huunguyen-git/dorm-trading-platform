// Lucian UX/UI Prompt #435 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#435
import { useContext, useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { primitive, semantic } from '../../theme';
import { Icon, type AppIconName } from './Icon';
import { useReduceMotion } from './LayoutPrimitives';

export type ToastTone = 'success' | 'info' | 'warning' | 'danger';

export interface ToastProps {
  visible: boolean;
  message: string;
  tone?: ToastTone;
  durationMs?: number;
  onDismiss: () => void;
  actionLabel?: string;
  onActionPress?: () => void;
  /** Change this token to reset the auto-dismiss timer without remounting the Toast (preserves useReduceMotion). */
  triggerKey?: number | string;
  bottomOffset?: number;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

const TONE_META: Record<
  ToastTone,
  { icon: AppIconName; iconBg: string; iconColor: string; barColor: string; borderColor: string }
> = {
  success: {
    icon: 'check',
    iconBg: semantic.color.success,
    iconColor: semantic.color.textInverse,
    barColor: semantic.color.success,
    borderColor: semantic.color.successSoft,
  },
  info: {
    icon: 'info',
    iconBg: semantic.color.accent,
    iconColor: semantic.color.textInverse,
    barColor: semantic.color.accent,
    borderColor: semantic.color.accentBorder,
  },
  warning: {
    icon: 'alert-triangle',
    iconBg: semantic.color.warning,
    iconColor: semantic.color.textInverse,
    barColor: semantic.color.warning,
    borderColor: semantic.color.warningSoft,
  },
  danger: {
    icon: 'alert-circle',
    iconBg: semantic.color.danger,
    iconColor: semantic.color.textInverse,
    barColor: semantic.color.danger,
    borderColor: semantic.color.dangerSoft,
  },
};

const DEFAULT_DURATION_MS = 3400;

export function Toast({
  visible,
  message,
  tone = 'success',
  durationMs = DEFAULT_DURATION_MS,
  onDismiss,
  actionLabel,
  onActionPress,
  triggerKey,
  bottomOffset,
  testID = 'editorial-toast',
  style,
}: ToastProps) {
  const reduceMotion = useReduceMotion();
  const insets = useContext(SafeAreaInsetsContext);
  const translateY = useRef(new Animated.Value(visible ? 0 : 28)).current;
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const progress = useRef(new Animated.Value(1)).current;
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!visible || !message.trim()) {
      return;
    }

    const timer =
      durationMs > 0
        ? setTimeout(() => {
            onDismissRef.current();
          }, durationMs)
        : null;

    if (reduceMotion) {
      translateY.setValue(0);
      opacity.setValue(1);
      progress.setValue(1);
      return () => {
        if (timer) clearTimeout(timer);
      };
    }

    translateY.setValue(28);
    opacity.setValue(0);
    progress.setValue(1);

    const enterAnim = Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: primitive.duration.medium,
        easing: Easing.bezier(...primitive.easing.springSoft),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: primitive.duration.normal,
        easing: Easing.bezier(...primitive.easing.standard),
        useNativeDriver: true,
      }),
    ]);

    const drainAnim =
      durationMs > 0
        ? Animated.timing(progress, {
            toValue: 0,
            duration: durationMs,
            easing: Easing.linear,
            useNativeDriver: false,
          })
        : null;

    enterAnim.start();
    drainAnim?.start();

    return () => {
      if (timer) clearTimeout(timer);
      enterAnim.stop();
      drainAnim?.stop();
    };
  }, [durationMs, message, opacity, progress, reduceMotion, tone, translateY, triggerKey, visible]);

  if (!visible || !message.trim()) {
    return null;
  }

  const meta = TONE_META[tone];
  const resolvedBottom = bottomOffset ?? Math.max(insets?.bottom ?? 0, primitive.space[3]) + primitive.space[2];
  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, { bottom: resolvedBottom }, style]}
    >
      <Animated.View
        testID={testID}
        accessibilityRole={tone === 'danger' || tone === 'warning' ? 'alert' : 'summary'}
        accessibilityLiveRegion="polite"
        style={[
          styles.card,
          {
            borderColor: meta.borderColor,
            opacity,
            transform: [{ translateY }],
          },
        ]}
      >
        <View style={[styles.iconSeal, { backgroundColor: meta.iconBg }]}>
          <Icon name={meta.icon} size={13} color={meta.iconColor} />
        </View>

        <Text style={styles.message} numberOfLines={3}>
          {message}
        </Text>

        {actionLabel && onActionPress ? (
          <Pressable
            testID={`${testID}-action`}
            onPress={onActionPress}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
          >
            <Text style={styles.actionText}>{actionLabel}</Text>
          </Pressable>
        ) : null}

        <Pressable
          testID={`${testID}-dismiss`}
          onPress={onDismiss}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Đóng thông báo"
          style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
        >
          <Icon name="x" size={14} color={semantic.color.textSecondary} />
        </Pressable>

        {!reduceMotion && durationMs > 0 ? (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.progressTrack}
          >
            <Animated.View
              style={[
                styles.progressFill,
                { width: progressWidth, backgroundColor: meta.barColor },
              ]}
            />
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: semantic.spacing.pageX,
    right: semantic.spacing.pageX,
    zIndex: 50,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 460,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2.5],
    paddingLeft: primitive.space[3],
    paddingRight: primitive.space[2],
    paddingVertical: primitive.space[2.5],
    borderRadius: primitive.radius.xl,
    backgroundColor: semantic.color.bgSurface,
    borderWidth: 1,
    overflow: 'hidden',
    ...primitive.elevation.floating,
  },
  iconSeal: {
    width: 24,
    height: 24,
    borderRadius: primitive.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    ...semantic.type.caption,
    color: semantic.color.textPrimary,
    fontWeight: primitive.fontWeight.medium,
    lineHeight: 19,
    flex: 1,
  },
  actionBtn: {
    paddingHorizontal: primitive.space[2.5],
    paddingVertical: primitive.space[1],
    borderRadius: primitive.radius.md,
    backgroundColor: semantic.color.bgSubtle,
  },
  actionText: {
    ...semantic.type.micro,
    color: semantic.color.accent,
    fontWeight: primitive.fontWeight.semibold,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: primitive.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    position: 'absolute',
    left: primitive.space[3],
    right: primitive.space[3],
    bottom: 0,
    height: 2.5,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.bgTrack,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: primitive.radius.full,
    opacity: 0.85,
  },
  pressed: {
    opacity: primitive.opacity.pressed,
  },
});

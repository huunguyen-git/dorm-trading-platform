// Lucian UX/UI Prompt #299 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#299
import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { component, primitive, semantic } from '../../theme';
import { Icon } from './Icon';
import { useReduceMotion } from './LayoutPrimitives';

export interface QuotaMeterProps {
  activeCount: number;
  limit: number;
  reputationScore?: number;
  highTierThreshold?: number;
  standardLimit?: number;
  highTierLimit?: number;
  label?: string;
  warningMessage?: string;
  showUnlockCue?: boolean;
  testID?: string;
  warningTestID?: string;
  style?: StyleProp<ViewStyle>;
}

export function QuotaMeter({
  activeCount,
  limit,
  highTierThreshold = 120,
  standardLimit = 5,
  highTierLimit = 10,
  label = 'Hạn mức tin đang mở',
  warningMessage,
  showUnlockCue = true,
  testID,
  warningTestID,
  style,
}: QuotaMeterProps) {
  const reduceMotion = useReduceMotion();

  const safeLimit = Math.max(1, limit);
  const safeActive = Math.max(0, activeCount);
  const ratio = safeActive / safeLimit;
  const percent = Math.min(100, Math.round(ratio * 100));
  const remaining = Math.max(0, safeLimit - safeActive);

  const isMaxed = ratio >= 1;
  const isNearLimit = !isMaxed && ratio >= 0.8;
  const showWarning = isMaxed || isNearLimit || Boolean(warningMessage);

  const fillAnim = useRef(new Animated.Value(percent)).current;
  const warnOpacity = useRef(new Animated.Value(showWarning ? 1 : 0.01)).current;
  const warnTranslateY = useRef(new Animated.Value(showWarning ? 0 : -12)).current;
  const prevPercentRef = useRef(percent);
  const prevShowWarningRef = useRef(showWarning);

  useEffect(() => {
    const changed = prevPercentRef.current !== percent;
    prevPercentRef.current = percent;

    if (!changed || reduceMotion) {
      fillAnim.setValue(percent);
      return;
    }

    const animation = Animated.timing(fillAnim, {
      toValue: percent,
      duration: primitive.duration.meter,
      easing: Easing.bezier(...primitive.easing.meterEase),
      useNativeDriver: false,
    });
    animation.start();
    return () => {
      animation.stop();
    };
  }, [fillAnim, percent, reduceMotion]);

  useEffect(() => {
    const transitionedOn = showWarning && !prevShowWarningRef.current;
    prevShowWarningRef.current = showWarning;

    if (!showWarning) {
      warnOpacity.setValue(0.01);
      warnTranslateY.setValue(-12);
      return;
    }

    if (!transitionedOn || reduceMotion) {
      warnOpacity.setValue(1);
      warnTranslateY.setValue(0);
      return;
    }

    warnOpacity.setValue(0.01);
    warnTranslateY.setValue(-12);
    const animation = Animated.parallel([
      Animated.timing(warnOpacity, {
        toValue: 1,
        duration: primitive.duration.sheet,
        easing: Easing.bezier(...primitive.easing.springSoft),
        useNativeDriver: true,
      }),
      Animated.timing(warnTranslateY, {
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
  }, [reduceMotion, showWarning, warnOpacity, warnTranslateY]);

  const fillColor = isMaxed
    ? component.quotaMeter.maxFill
    : isNearLimit
      ? component.quotaMeter.warnFill
      : component.quotaMeter.normalFill;

  const animatedWidth = fillAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  const resolvedWarning =
    warningMessage ??
    (isMaxed
      ? 'Đã đạt hạn mức tin đang mở. Rút bớt tin cũ hoặc lưu bản nháp để đăng sau.'
      : `Còn ${remaining} suất tin đang hiển thị.`);

  return (
    <View testID={testID} style={[styles.container, style]}>
      <View style={styles.topRow}>
        <Text style={styles.label}>{label}</Text>
        <Text
          style={[
            styles.ratio,
            isMaxed && styles.ratioDanger,
            isNearLimit && styles.ratioWarning,
          ]}
        >
          {`${safeActive} / ${safeLimit} tin`}
        </Text>
      </View>

      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: safeLimit, now: Math.min(safeActive, safeLimit) }}
        style={styles.track}
      >
        <Animated.View
          style={[
            styles.fill,
            {
              width: animatedWidth,
              backgroundColor: fillColor,
            },
          ]}
        />
      </View>

      {showUnlockCue ? (
        <Text style={styles.unlockCue}>
          {`< ${highTierThreshold} điểm: tối đa ${standardLimit} tin · ≥ ${highTierThreshold} điểm: tối đa ${highTierLimit} tin`}
        </Text>
      ) : null}

      {showWarning ? (
        <Animated.View
          testID={warningTestID}
          accessibilityRole="alert"
          style={[
            styles.warningStrip,
            {
              backgroundColor: isMaxed
                ? semantic.color.dangerSoft
                : semantic.color.warningSoft,
              opacity: warnOpacity,
              transform: [{ translateY: warnTranslateY }],
            },
          ]}
        >
          <Icon
            name="alert-circle"
            size={15}
            color={isMaxed ? semantic.color.danger : semantic.color.warning}
          />
          <Text
            style={[
              styles.warningText,
              { color: isMaxed ? semantic.color.danger : semantic.color.warning },
            ]}
          >
            {resolvedWarning}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: primitive.space[3],
    gap: primitive.space[2],
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: primitive.space[2],
  },
  label: {
    ...semantic.type.label,
    color: semantic.color.textPrimary,
  },
  ratio: {
    ...semantic.type.label,
    fontVariant: ['tabular-nums'],
    color: semantic.color.textPrimary,
  },
  ratioWarning: {
    color: semantic.color.warning,
  },
  ratioDanger: {
    color: semantic.color.danger,
  },
  track: {
    height: component.quotaMeter.trackH,
    borderRadius: component.quotaMeter.radius,
    backgroundColor: component.quotaMeter.trackBg,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: component.quotaMeter.radius,
  },
  unlockCue: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
  },
  warningStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2],
    borderRadius: primitive.radius.md,
    paddingHorizontal: primitive.space[3],
    paddingVertical: primitive.space[2],
  },
  warningText: {
    ...semantic.type.micro,
    flex: 1,
    lineHeight: 17,
  },
});

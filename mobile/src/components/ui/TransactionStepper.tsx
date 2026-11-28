// Lucian UX/UI Prompt #444 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#444
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
import type { TransactionStatus } from '../../transactions/types';
import { primitive, semantic } from '../../theme';
import { Icon, type AppIconName } from './Icon';
import { useReduceMotion } from './LayoutPrimitives';

export interface TransactionStepperProps {
  status: TransactionStatus;
  hasHandoverProof?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

interface StepNode {
  key: string;
  label: string;
  state: 'done' | 'current' | 'upcoming' | 'warning' | 'danger';
  icon?: AppIconName;
}

function buildSteps(status: TransactionStatus, hasHandoverProof: boolean): StepNode[] {
  if (status === 'HOAN_TAT') {
    return [
      { key: 'hold', label: 'Giữ chỗ', state: 'done' },
      { key: 'deliver', label: 'Báo giao', state: 'done' },
      { key: 'otp', label: 'Xác nhận', state: 'done' },
      { key: 'done', label: 'Hoàn tất', state: 'done', icon: 'check' },
    ];
  }

  if (status === 'HUY') {
    return [
      { key: 'hold', label: 'Giữ chỗ', state: 'done' },
      { key: 'deliver', label: 'Báo giao', state: hasHandoverProof ? 'done' : 'upcoming' },
      { key: 'otp', label: 'Xác nhận', state: 'upcoming' },
      { key: 'cancelled', label: 'Đã hủy', state: 'danger', icon: 'x' },
    ];
  }

  if (status === 'CHO_XU_LY') {
    return [
      { key: 'hold', label: 'Giữ chỗ', state: 'done' },
      { key: 'deliver', label: 'Báo giao', state: 'done' },
      { key: 'otp', label: 'Xác nhận', state: 'warning', icon: 'clock' },
      { key: 'review', label: 'Xem xét', state: 'warning', icon: 'shield' },
    ];
  }

  if (status === 'CHO_XAC_NHAN') {
    return [
      { key: 'hold', label: 'Giữ chỗ', state: 'done' },
      { key: 'deliver', label: 'Báo giao', state: 'done' },
      { key: 'otp', label: 'Xác nhận', state: 'current' },
      { key: 'done', label: 'Hoàn tất', state: 'upcoming' },
    ];
  }

  if (status === 'DANG_GIAO') {
    return [
      { key: 'hold', label: 'Giữ chỗ', state: 'done' },
      { key: 'deliver', label: 'Báo giao', state: 'current' },
      { key: 'otp', label: 'Xác nhận', state: 'upcoming' },
      { key: 'done', label: 'Hoàn tất', state: 'upcoming' },
    ];
  }

  return [
    { key: 'hold', label: 'Giữ chỗ', state: 'current' },
    { key: 'deliver', label: 'Báo giao', state: 'upcoming' },
    { key: 'otp', label: 'Xác nhận', state: 'upcoming' },
    { key: 'done', label: 'Hoàn tất', state: 'upcoming' },
  ];
}

function getProgressRatio(status: TransactionStatus): number {
  switch (status) {
    case 'YEU_CAU':
    case 'GIU_CHO':
      return 0;
    case 'DANG_GIAO':
      return 1 / 3;
    case 'CHO_XAC_NHAN':
      return 2 / 3;
    case 'CHO_XU_LY':
    case 'HOAN_TAT':
    case 'HUY':
      return 1;
    default:
      return 0;
  }
}

export function TransactionStepper({
  status,
  hasHandoverProof = false,
  testID = 'tx-stepper',
  style,
}: TransactionStepperProps) {
  const reduceMotion = useReduceMotion();
  const steps = buildSteps(status, hasHandoverProof);
  const hasCurrent = steps.some((step) => step.state === 'current' || step.state === 'warning');
  const progressRatio = getProgressRatio(status);

  const lineAnim = useRef(new Animated.Value(progressRatio)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduceMotion) {
      lineAnim.setValue(progressRatio);
      return;
    }
    const animation = Animated.timing(lineAnim, {
      toValue: progressRatio,
      duration: 320,
      easing: Easing.bezier(...primitive.easing.standard),
      useNativeDriver: false,
    });
    animation.start();
    return () => {
      animation.stop();
    };
  }, [lineAnim, progressRatio, reduceMotion]);

  useEffect(() => {
    if (!hasCurrent || reduceMotion) {
      pulseAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.14,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [hasCurrent, pulseAnim, reduceMotion]);

  const fillColor =
    status === 'HOAN_TAT'
      ? semantic.color.success
      : status === 'HUY'
        ? semantic.color.danger
        : status === 'CHO_XU_LY'
          ? semantic.color.warning
          : semantic.color.accent;

  const animatedWidth = lineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const activeStep =
    [...steps]
      .reverse()
      .find((step) => step.state === 'current' || step.state === 'warning' || step.state === 'danger') ??
    steps[steps.length - 1];

  return (
    <View
      testID={testID}
      accessibilityRole="summary"
      accessibilityLabel={`Tiến trình giao dịch: ${activeStep.label}`}
      style={[styles.container, style]}
    >
      <View style={styles.railWrap}>
        <View style={styles.trackLine}>
          <Animated.View
            style={[
              styles.fillLine,
              { width: animatedWidth, backgroundColor: fillColor },
            ]}
          />
        </View>

        <View style={styles.nodesRow}>
          {steps.map((step, index) => {
            const isDone = step.state === 'done';
            const isCurrent = step.state === 'current';
            const isWarning = step.state === 'warning';
            const isDanger = step.state === 'danger';

            const dotBg = isDone
              ? status === 'HOAN_TAT'
                ? semantic.color.success
                : semantic.color.accent
              : isDanger
                ? semantic.color.danger
                : isWarning
                  ? semantic.color.warningSoft
                  : semantic.color.bgSurface;

            const dotBorder = isDone
              ? dotBg
              : isCurrent
                ? semantic.color.accent
                : isWarning
                  ? semantic.color.warning
                  : isDanger
                    ? semantic.color.danger
                    : semantic.color.borderStrong;

            const ringColor = isWarning ? semantic.color.warningSoft : semantic.color.accentSoft;

            return (
              <View key={step.key} style={styles.stepCol} testID={`${testID}-step-${step.key}`}>
                <View style={styles.dotHost}>
                  {isCurrent || (isWarning && index === steps.length - 1) ? (
                    <Animated.View
                      pointerEvents="none"
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                      style={[
                        styles.pulseRing,
                        {
                          backgroundColor: ringColor,
                          transform: [{ scale: pulseAnim }],
                        },
                      ]}
                    />
                  ) : null}

                  <View
                    style={[
                      styles.dot,
                      {
                        backgroundColor: dotBg,
                        borderColor: dotBorder,
                      },
                    ]}
                  >
                    {isDone ? (
                      <Icon name="check" size={14} color={semantic.color.textInverse} />
                    ) : isDanger ? (
                      <Icon name={step.icon ?? 'x'} size={14} color={semantic.color.textInverse} />
                    ) : isWarning ? (
                      <Icon name={step.icon ?? 'clock'} size={13} color={semantic.color.warning} />
                    ) : (
                      <Text
                        style={[
                          styles.dotIndex,
                          isCurrent && styles.dotIndexCurrent,
                        ]}
                      >
                        {index + 1}
                      </Text>
                    )}
                  </View>
                </View>

                <Text
                  numberOfLines={1}
                  style={[
                    styles.label,
                    isDone && styles.labelDone,
                    isCurrent && styles.labelCurrent,
                    isWarning && styles.labelWarning,
                    isDanger && styles.labelDanger,
                  ]}
                >
                  {step.label}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const DOT_SIZE = 30;

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingVertical: primitive.space[2],
  },
  railWrap: {
    position: 'relative',
    width: '100%',
  },
  trackLine: {
    position: 'absolute',
    top: DOT_SIZE / 2 - 1.5,
    left: '12.5%',
    right: '12.5%',
    height: 3,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.borderHairline,
    overflow: 'hidden',
  },
  fillLine: {
    height: '100%',
    borderRadius: primitive.radius.full,
  },
  nodesRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  stepCol: {
    flex: 1,
    alignItems: 'center',
    gap: primitive.space[1.5],
  },
  dotHost: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  pulseRing: {
    position: 'absolute',
    width: DOT_SIZE + 10,
    height: DOT_SIZE + 10,
    borderRadius: primitive.radius.full,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: primitive.radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotIndex: {
    fontSize: primitive.fontSize.xs,
    fontWeight: primitive.fontWeight.bold,
    fontVariant: ['tabular-nums'],
    color: semantic.color.textSecondary,
  },
  dotIndexCurrent: {
    color: semantic.color.accent,
  },
  label: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: primitive.fontWeight.medium,
    color: semantic.color.textSecondary,
    textAlign: 'center',
  },
  labelDone: {
    color: semantic.color.textPrimary,
    fontWeight: primitive.fontWeight.semibold,
  },
  labelCurrent: {
    color: semantic.color.accent,
    fontWeight: primitive.fontWeight.bold,
  },
  labelWarning: {
    color: semantic.color.warning,
    fontWeight: primitive.fontWeight.bold,
  },
  labelDanger: {
    color: semantic.color.danger,
    fontWeight: primitive.fontWeight.bold,
  },
});

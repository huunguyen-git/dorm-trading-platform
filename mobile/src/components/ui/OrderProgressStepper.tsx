// Lucian UX/UI Prompt #444 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#444
import { Fragment, useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { primitive, semantic } from '../../theme';
import { Icon } from './Icon';
import { useReduceMotion } from './LayoutPrimitives';

export interface OrderProgressStep {
  key: string;
  label: string;
}

export interface OrderProgressStepperProps {
  steps?: OrderProgressStep[];
  /** Zero-based index of the current active step. Use `steps.length` when all steps are completed. */
  currentStep: number;
  /** Marks the current step as halted/cancelled instead of actively progressing. */
  cancelled?: boolean;
  /** Optional subtitle shown beneath the stepper (e.g. UC-27 / UC-28 / cancelled cue). */
  statusNote?: string;
  /** Override active/completed accent tone (`success` for completed orders, `accent` default). */
  tone?: 'accent' | 'success';
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export const DEFAULT_ORDER_STEPS: OrderProgressStep[] = [
  { key: 'request', label: 'Yêu cầu' },
  { key: 'reserved', label: 'Giữ chỗ' },
  { key: 'delivering', label: 'Đang giao' },
  { key: 'completed', label: 'Hoàn tất' },
];

// Lucian #444 motion constants preserved from source specification
const LINE_FILL_MS = 320;
const LINE_STAGGER_MS = 260;
const CHECK_POP_MS = 500;
const BREATHE_HALF_MS = 1000;
const LINE_EASE: readonly [number, number, number, number] = [0.5, 0, 0.4, 1];
const CHECK_POP_EASE: readonly [number, number, number, number] = [0.3, 1.8, 0.5, 1];

export function OrderProgressStepper({
  steps = DEFAULT_ORDER_STEPS,
  currentStep,
  cancelled = false,
  statusNote,
  tone = 'accent',
  testID,
  style,
}: OrderProgressStepperProps) {
  const reduceMotion = useReduceMotion();
  const clampedStep = Math.max(0, Math.min(steps.length, currentStep));
  const isAllDone = !cancelled && clampedStep >= steps.length;
  const activeColor =
    tone === 'success' || isAllDone ? semantic.color.success : semantic.color.accent;
  const activeHaloBorder =
    tone === 'success' || isAllDone ? semantic.color.successSoft : semantic.color.accentBorder;
  const activeHaloBg =
    tone === 'success' || isAllDone ? semantic.color.successSoft : semantic.color.accentSoft;

  const prevStepRef = useRef(clampedStep);
  const pulseActiveRef = useRef(false);
  const lineAnimsRef = useRef<Animated.Value[]>([]);
  const checkAnimsRef = useRef<Animated.Value[]>([]);
  const pulseAnim = useRef(new Animated.Value(0)).current;

  const lineCount = Math.max(0, steps.length - 1);
  if (lineAnimsRef.current.length !== lineCount) {
    lineAnimsRef.current = Array.from(
      { length: lineCount },
      (_, idx) => new Animated.Value(idx < clampedStep ? 1 : 0),
    );
  }
  if (checkAnimsRef.current.length !== steps.length) {
    checkAnimsRef.current = Array.from(
      { length: steps.length },
      (_, idx) => new Animated.Value(idx < clampedStep ? 1 : 0),
    );
  }

  useEffect(() => {
    const from = prevStepRef.current;
    const changed = from !== clampedStep;
    prevStepRef.current = clampedStep;

    if (!changed) {
      return;
    }

    const lineAnims = lineAnimsRef.current;
    const checkAnims = checkAnimsRef.current;

    if (reduceMotion) {
      lineAnims.forEach((anim, k) => {
        anim.setValue(k < clampedStep ? 1 : 0);
      });
      checkAnims.forEach((anim, k) => {
        anim.setValue(k < clampedStep ? 1 : 0);
      });
      return;
    }

    const lineEasing = Easing.bezier(...LINE_EASE);
    const checkEasing = Easing.bezier(...CHECK_POP_EASE);
    const animations: Animated.CompositeAnimation[] = [];

    lineAnims.forEach((anim, k) => {
      const on = k < clampedStep;
      const delay =
        on && k >= from
          ? (k - from) * LINE_STAGGER_MS
          : !on && k < from
            ? Math.round((from - 1 - k) * LINE_STAGGER_MS * 0.6)
            : 0;
      animations.push(
        Animated.timing(anim, {
          toValue: on ? 1 : 0,
          duration: LINE_FILL_MS,
          delay,
          easing: lineEasing,
          useNativeDriver: false,
        }),
      );
    });

    checkAnims.forEach((anim, k) => {
      const done = k < clampedStep;
      if (cancelled && k === clampedStep) {
        anim.setValue(0);
        return;
      }
      const delay = done && k >= from ? (k - from) * LINE_STAGGER_MS + LINE_STAGGER_MS : 0;
      animations.push(
        Animated.timing(anim, {
          toValue: done ? 1 : 0,
          duration: done ? CHECK_POP_MS : primitive.duration.normal,
          delay,
          easing: done ? checkEasing : Easing.bezier(...primitive.easing.standard),
          useNativeDriver: true,
        }),
      );
    });

    const composite = Animated.parallel(animations);
    composite.start();
    return () => {
      composite.stop();
    };
  }, [cancelled, clampedStep, reduceMotion]);

  useEffect(() => {
    const shouldBreathe = !reduceMotion && !cancelled && !isAllDone;
    if (!shouldBreathe) {
      if (pulseActiveRef.current) {
        pulseActiveRef.current = false;
        pulseAnim.setValue(0);
      }
      return;
    }

    pulseActiveRef.current = true;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: BREATHE_HALF_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: BREATHE_HALF_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [cancelled, isAllDone, pulseAnim, reduceMotion]);

  const activeLabel = isAllDone
    ? steps[steps.length - 1]?.label ?? 'Hoàn tất'
    : steps[Math.min(clampedStep, steps.length - 1)]?.label ?? '';
  const summaryA11yLabel = cancelled
    ? `Tiến độ giao dịch: đã hủy tại bước ${activeLabel}`
    : isAllDone
      ? `Tiến độ giao dịch: đã hoàn tất ${steps.length}/${steps.length} bước`
      : `Tiến độ giao dịch: bước ${clampedStep + 1}/${steps.length} — ${activeLabel}`;

  const haloScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.12],
  });
  const haloOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.95, 0.45],
  });

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={summaryA11yLabel}
      accessibilityValue={{
        min: 0,
        max: steps.length,
        now: clampedStep,
      }}
      style={[styles.container, style]}
    >
      <View style={styles.stepsRow}>
        {steps.map((step, index) => {
          const isDone = index < clampedStep;
          const isCurrent = !isAllDone && index === clampedStep;
          const isCancelledCurrent = cancelled && isCurrent;
          const checkProgress = checkAnimsRef.current[index];
          const lineProgress = index < lineCount ? lineAnimsRef.current[index] : null;

          const checkScale = checkProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [0.2, 1],
          });
          const checkRotate = checkProgress.interpolate({
            inputRange: [0, 1],
            outputRange: ['-30deg', '0deg'],
          });
          const numberOpacity = checkProgress.interpolate({
            inputRange: [0, 0.5, 1],
            outputRange: [1, 0.2, 0],
          });

          const dotBg = isDone
            ? activeColor
            : isCancelledCurrent
              ? semantic.color.dangerSoft
              : semantic.color.bgSurface;
          const dotBorder = isDone
            ? activeColor
            : isCancelledCurrent
              ? semantic.color.danger
              : isCurrent
                ? activeColor
                : semantic.color.borderStrong;

          return (
            <Fragment key={step.key}>
              <View
                testID={testID ? `${testID}-step-${step.key}` : undefined}
                style={styles.stepCol}
              >
                <View style={styles.dotSlot}>
                  {isCurrent && !cancelled ? (
                    <Animated.View
                      pointerEvents="none"
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                      style={[
                        styles.haloRing,
                        {
                          borderColor: activeHaloBorder,
                          backgroundColor: activeHaloBg,
                          opacity: reduceMotion ? 0.8 : haloOpacity,
                          transform: [{ scale: reduceMotion ? 1 : haloScale }],
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
                    {isCancelledCurrent ? (
                      <Icon name="x" size={15} color={semantic.color.danger} />
                    ) : (
                      <>
                        <Animated.Text
                          style={[
                            styles.dotNumber,
                            isCurrent && { color: activeColor },
                            { opacity: numberOpacity },
                          ]}
                        >
                          {index + 1}
                        </Animated.Text>
                        <Animated.View
                          style={[
                            styles.checkOverlay,
                            {
                              opacity: checkProgress,
                              transform: [{ scale: checkScale }, { rotate: checkRotate }],
                            },
                          ]}
                        >
                          <Icon name="check" size={16} color={semantic.color.textInverse} />
                        </Animated.View>
                      </>
                    )}
                  </View>
                </View>

                <Text
                  numberOfLines={1}
                  style={[
                    styles.stepLabel,
                    isDone && styles.stepLabelDone,
                    isCurrent && !cancelled && styles.stepLabelCurrent,
                    isCancelledCurrent && styles.stepLabelCancelled,
                  ]}
                >
                  {step.label}
                </Text>
              </View>

              {lineProgress ? (
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={styles.connectorTrack}
                >
                  <Animated.View
                    style={[
                      styles.connectorFill,
                      {
                        backgroundColor: cancelled ? semantic.color.borderStrong : activeColor,
                        width: lineProgress.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0%', '100%'],
                        }),
                      },
                    ]}
                  />
                </View>
              ) : null}
            </Fragment>
          );
        })}
      </View>

      {statusNote ? <Text style={styles.statusNote}>{statusNote}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: primitive.space[2.5],
    paddingTop: primitive.space[2],
    paddingBottom: primitive.space[1],
  },
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
  },
  stepCol: {
    alignItems: 'center',
    width: 68,
    gap: primitive.space[2],
  },
  dotSlot: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  haloRing: {
    position: 'absolute',
    top: -6,
    left: -6,
    right: -6,
    bottom: -6,
    borderRadius: primitive.radius.full,
    borderWidth: 2,
  },
  dot: {
    width: 36,
    height: 36,
    borderRadius: primitive.radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  dotNumber: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: primitive.fontWeight.bold,
    fontVariant: ['tabular-nums'],
    color: semantic.color.textSecondary,
  },
  checkOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectorTrack: {
    flex: 1,
    height: 3,
    marginTop: 17,
    marginHorizontal: -10,
    borderRadius: 2,
    backgroundColor: semantic.color.borderHairline,
    overflow: 'hidden',
  },
  connectorFill: {
    height: '100%',
    borderRadius: 2,
  },
  stepLabel: {
    fontSize: primitive.fontSize.xs,
    lineHeight: primitive.lineHeight.xs,
    fontWeight: primitive.fontWeight.medium,
    color: semantic.color.textSecondary,
    textAlign: 'center',
  },
  stepLabelDone: {
    color: primitive.color.stone700,
    fontWeight: primitive.fontWeight.semibold,
  },
  stepLabelCurrent: {
    color: semantic.color.textPrimary,
    fontWeight: primitive.fontWeight.bold,
  },
  stepLabelCancelled: {
    color: semantic.color.danger,
    fontWeight: primitive.fontWeight.bold,
  },
  statusNote: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
    textAlign: 'center',
  },
});

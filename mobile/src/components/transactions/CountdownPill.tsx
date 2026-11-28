// Lucian UX/UI Prompt #265 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#265
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  computeRemainingSeconds,
  formatCountdownMmSs,
} from '../../transactions/types';
import { primitive, semantic } from '../../theme';
import { Icon } from '../ui/Icon';
import { useReduceMotion } from '../ui/LayoutPrimitives';

export interface CountdownPillProps {
  expiresAt: string | null;
  clockOffsetMs?: number;
  /** Total verification TTL in seconds (default 600s = 10 min) used for draining progress bar ratio. */
  ttlSeconds?: number;
  showProgressBar?: boolean;
  /** Optional element placed to the left of the countdown pill (e.g. crisp section header). */
  headerLeft?: React.ReactNode;
  /** Optional element placed to the right of the countdown pill (above the full-width draining bar). */
  headerRight?: React.ReactNode;
  inactiveLabel?: string;
  inactiveTone?: 'neutral' | 'warning' | 'danger';
  onExpired?: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

const WARN_THRESHOLD_SECONDS = 120;
const DEFAULT_TTL_SECONDS = 600;

export function CountdownPill({
  expiresAt,
  clockOffsetMs = 0,
  ttlSeconds = DEFAULT_TTL_SECONDS,
  showProgressBar = false,
  headerLeft,
  headerRight,
  inactiveLabel,
  inactiveTone = 'neutral',
  onExpired,
  testID = 'otp-countdown',
  style,
}: CountdownPillProps) {
  const reduceMotion = useReduceMotion();
  const { width: windowWidth } = useWindowDimensions();
  const isUltraNarrow = windowWidth > 0 && windowWidth < 340;
  const safeTtl = Math.max(60, Number.isFinite(ttlSeconds) ? ttlSeconds : DEFAULT_TTL_SECONDS);

  const [remaining, setRemaining] = useState<number>(() =>
    computeRemainingSeconds(expiresAt, clockOffsetMs),
  );
  const firedExpiredForRef = useRef<string | null>(null);
  const clockOffsetRef = useRef(clockOffsetMs);
  clockOffsetRef.current = clockOffsetMs;
  const onExpiredRef = useRef(onExpired);
  onExpiredRef.current = onExpired;

  const initialRatio = inactiveLabel
    ? 0
    : Math.max(0, Math.min(1, computeRemainingSeconds(expiresAt, clockOffsetMs) / safeTtl));
  const barAnim = useRef(new Animated.Value(initialRatio)).current;
  const prevRatioRef = useRef(initialRatio);

  useEffect(() => {
    const initial = computeRemainingSeconds(expiresAt, clockOffsetRef.current);
    setRemaining(initial);

    if (!expiresAt || inactiveLabel) return;
    if (initial <= 0) {
      if (firedExpiredForRef.current !== expiresAt) {
        firedExpiredForRef.current = expiresAt;
        onExpiredRef.current?.();
      }
      return;
    }

    const interval = setInterval(() => {
      const next = computeRemainingSeconds(expiresAt, clockOffsetRef.current);
      setRemaining(next);
      if (next <= 0 && firedExpiredForRef.current !== expiresAt) {
        firedExpiredForRef.current = expiresAt;
        onExpiredRef.current?.();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt, inactiveLabel]);

  const isExpired = !inactiveLabel && remaining <= 0;
  const isWarning = !inactiveLabel && remaining > 0 && remaining <= WARN_THRESHOLD_SECONDS;
  const ratio = inactiveLabel || isExpired ? 0 : Math.max(0, Math.min(1, remaining / safeTtl));

  useEffect(() => {
    const changed = prevRatioRef.current !== ratio;
    prevRatioRef.current = ratio;
    if (!showProgressBar) return;
    if (!changed || reduceMotion) {
      barAnim.setValue(ratio);
      return;
    }
    const anim = Animated.timing(barAnim, {
      toValue: ratio,
      duration: 380,
      easing: Easing.bezier(...primitive.easing.standard),
      useNativeDriver: false,
    });
    anim.start();
    return () => {
      anim.stop();
    };
  }, [barAnim, ratio, reduceMotion, showProgressBar]);

  const bg = inactiveLabel
    ? inactiveTone === 'danger'
      ? semantic.color.dangerSoft
      : inactiveTone === 'warning'
        ? semantic.color.warningSoft
        : semantic.color.bgTrack
    : isExpired
      ? semantic.color.dangerSoft
      : isWarning
        ? semantic.color.warningSoft
        : semantic.color.accentSoft;

  const fg = inactiveLabel
    ? inactiveTone === 'danger'
      ? semantic.color.danger
      : inactiveTone === 'warning'
        ? semantic.color.warning
        : semantic.color.textSecondary
    : isExpired
      ? semantic.color.danger
      : isWarning
        ? semantic.color.warning
        : semantic.color.accentDeep;

  const barFillColor = inactiveLabel
    ? inactiveTone === 'danger'
      ? semantic.color.danger
      : inactiveTone === 'warning'
        ? semantic.color.warning
        : semantic.color.borderStrong
    : isExpired
      ? semantic.color.danger
      : isWarning
        ? semantic.color.warning
        : semantic.color.accent;

  const textLabel = inactiveLabel
    ? inactiveLabel
    : isExpired
      ? '00:00 · Hết hạn'
      : formatCountdownMmSs(remaining);

  const animatedBarWidth = barAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const pillNode = (
    <View
      testID={testID}
      accessibilityLiveRegion={isExpired ? 'polite' : 'none'}
      accessibilityLabel={
        inactiveLabel
          ? inactiveLabel
          : isExpired
            ? 'Mã xác nhận đã hết hạn'
            : `Thời gian còn lại ${formatCountdownMmSs(remaining)}`
      }
      style={[styles.pill, { backgroundColor: bg }]}
    >
      <Icon name="clock" size={13} color={fg} />
      <Text
        numberOfLines={1}
        ellipsizeMode="clip"
        textBreakStrategy="simple"
        style={[styles.text, { color: fg }]}
      >
        {textLabel}
      </Text>
    </View>
  );

  const hasRowSiblings = Boolean(headerLeft || headerRight);

  return (
    <View
      style={[
        styles.wrap,
        (showProgressBar || hasRowSiblings) && styles.wrapFullWidth,
        style,
      ]}
    >
      <View
        style={
          hasRowSiblings
            ? [styles.headerRow, isUltraNarrow && styles.headerRowNarrow]
            : undefined
        }
      >
        {headerLeft ?? null}
        {pillNode}
        {headerRight ?? null}
      </View>

      {showProgressBar ? (
        <View
          testID={`${testID}-bar`}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Thời gian hiệu lực mã xác nhận"
          accessibilityValue={{
            min: 0,
            max: safeTtl,
            now: inactiveLabel ? 0 : Math.min(remaining, safeTtl),
          }}
          style={styles.barTrack}
        >
          <Animated.View
            style={[
              styles.barFill,
              {
                width: animatedBarWidth,
                backgroundColor: barFillColor,
              },
            ]}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: primitive.space[1.5],
    alignSelf: 'flex-start',
  },
  wrapFullWidth: {
    width: '100%',
    alignSelf: 'stretch',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'nowrap',
    gap: primitive.space[2],
  },
  headerRowNarrow: {
    flexWrap: 'wrap',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 5,
    paddingHorizontal: primitive.space[2.5],
    paddingVertical: 5,
    borderRadius: primitive.radius.full,
  },
  text: {
    ...semantic.type.micro,
    fontWeight: primitive.fontWeight.semibold,
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
    paddingRight: 2,
  },
  barTrack: {
    width: '100%',
    height: 3.5,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.bgTrack,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: primitive.radius.full,
  },
});

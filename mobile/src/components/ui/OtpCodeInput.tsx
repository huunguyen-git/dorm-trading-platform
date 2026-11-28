// Lucian UX/UI Prompt #026 & #406 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#026 · https://lucianlabs.dev/uxui-prompt/#406
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { component, primitive, semantic } from '../../theme';
import { Icon } from './Icon';
import { useReduceMotion } from './LayoutPrimitives';

export type OtpVisualStatus = 'idle' | 'checking' | 'error' | 'success';

export interface OtpCodeInputProps {
  value: string;
  onChange: (nextCode: string) => void;
  length?: number;
  disabled?: boolean;
  status?: OtpVisualStatus;
  /** Increment or change this token whenever a fresh error occurs to re-trigger horizontal shake. */
  errorShakeKey?: number | string;
  onFocus?: () => void;
  onBlur?: () => void;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

const DEFAULT_LENGTH = 6;

export function OtpCodeInput({
  value,
  onChange,
  length = DEFAULT_LENGTH,
  disabled = false,
  status = 'idle',
  errorShakeKey,
  onFocus,
  onBlur,
  accessibilityLabel = 'Mã xác nhận',
  testID = 'handover-otp-input',
  style,
}: OtpCodeInputProps) {
  const reduceMotion = useReduceMotion();
  const { width: windowWidth } = useWindowDimensions();
  const inputRef = useRef<ComponentRef<typeof TextInput> | null>(null);
  const [focused, setFocused] = useState(false);

  const sanitized = value.replace(/\D/g, '').slice(0, length);
  const digits = Array.from({ length }, (_, idx) => sanitized[idx] ?? '');
  const activeIndex = Math.min(sanitized.length, length - 1);

  const shakeX = useRef(new Animated.Value(0)).current;
  const caretOpacity = useRef(new Animated.Value(1)).current;
  const digitScales = useRef(Array.from({ length: DEFAULT_LENGTH }, () => new Animated.Value(1))).current;
  const prevDigitsRef = useRef<string[]>(digits);
  const prevShakeKeyRef = useRef<number | string | undefined>(errorShakeKey);

  // Responsive box width so 6 boxes + middle dash never overflow on 320px–375px narrow screens
  const availableRowWidth = Math.max(264, Math.min((windowWidth || 375) - 48, 360));
  const gapSize = availableRowWidth < 310 ? 6 : 8;
  const sepWidth = availableRowWidth < 310 ? 8 : 10;
  const cellWidth = Math.max(
    36,
    Math.min(46, Math.floor((availableRowWidth - gapSize * 5 - sepWidth - gapSize * 2) / length)),
  );
  const cellHeight = Math.round(cellWidth * 1.18);

  // Digit spring pop-in animation (Lucian #026/#406)
  useEffect(() => {
    const prev = prevDigitsRef.current;
    prevDigitsRef.current = digits;

    if (reduceMotion) return;

    const anims: Animated.CompositeAnimation[] = [];
    for (let i = 0; i < Math.min(length, digitScales.length); i += 1) {
      if (digits[i] && digits[i] !== prev[i]) {
        digitScales[i].setValue(0.45);
        anims.push(
          Animated.timing(digitScales[i], {
            toValue: 1,
            duration: primitive.duration.medium,
            easing: Easing.bezier(...primitive.easing.springPop),
            useNativeDriver: true,
          }),
        );
      }
    }
    if (anims.length === 0) return;
    const parallel = Animated.parallel(anims);
    parallel.start();
    return () => {
      parallel.stop();
    };
  }, [digits, digitScales, length, reduceMotion]);

  // Error horizontal shake (Lucian #406 + theme primitive.easing.shake)
  useEffect(() => {
    const changed = errorShakeKey !== undefined && errorShakeKey !== prevShakeKeyRef.current;
    prevShakeKeyRef.current = errorShakeKey;

    if (status !== 'error' && !changed) {
      shakeX.setValue(0);
      return;
    }
    if ((!changed && status !== 'error') || reduceMotion) {
      shakeX.setValue(0);
      return;
    }

    const easing = Easing.bezier(...primitive.easing.shake);
    const step = 70;
    const sequence = Animated.sequence([
      Animated.timing(shakeX, { toValue: -8, duration: step, easing, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 7, duration: step, easing, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -4, duration: step, easing, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 2, duration: step, easing, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 0, duration: step, easing, useNativeDriver: true }),
    ]);
    sequence.start();
    return () => {
      sequence.stop();
    };
  }, [errorShakeKey, reduceMotion, shakeX, status]);

  // Blinking terracotta caret for active empty cell
  useEffect(() => {
    if (!focused || disabled || reduceMotion || status === 'success' || sanitized.length >= length) {
      caretOpacity.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(caretOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(caretOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [caretOpacity, disabled, focused, length, reduceMotion, sanitized.length, status]);

  const handleChangeText = (raw: string) => {
    if (disabled) return;
    const cleaned = raw.replace(/\D/g, '').slice(0, length);
    onChange(cleaned);
  };

  const focusInput = () => {
    if (!disabled) {
      inputRef.current?.focus();
    }
  };

  const renderCell = (index: number) => {
    const digit = digits[index];
    const isCurrent = focused && !disabled && index === activeIndex;
    const isError = status === 'error';
    const isSuccess = status === 'success';
    const showCaret = isCurrent && !digit && !isSuccess;

    const borderColor = disabled
      ? semantic.color.borderHairline
      : isError
        ? component.input.errorBorder
        : isSuccess
          ? component.input.validBorder
          : isCurrent
            ? component.input.focusBorder
            : digit
              ? semantic.color.textPrimary
              : component.input.border;

    const backgroundColor = disabled
      ? component.input.disabledBg
      : isError
        ? semantic.color.dangerSoft
        : isSuccess
          ? semantic.color.successSoft
          : component.input.bg;

    const haloColor =
      !disabled && isCurrent && !isError && !isSuccess
        ? component.input.focusHalo
        : 'transparent';

    return (
      <View
        key={index}
        testID={`otp-cell-${index}`}
        style={[
          styles.cellHalo,
          { backgroundColor: haloColor },
        ]}
      >
        <View
          style={[
            styles.cell,
            {
              width: cellWidth,
              height: cellHeight,
              borderColor,
              borderWidth: isCurrent || isError || isSuccess ? 1.5 : 1,
              backgroundColor,
            },
          ]}
        >
          {digit ? (
            <Animated.Text
              style={[
                styles.digit,
                disabled && styles.digitDisabled,
                isError && styles.digitError,
                isSuccess && styles.digitSuccess,
                { transform: [{ scale: digitScales[index] ?? 1 }] },
              ]}
            >
              {digit}
            </Animated.Text>
          ) : showCaret ? (
            <Animated.View style={[styles.caret, { opacity: caretOpacity }]} />
          ) : (
            <View style={styles.emptyDot} />
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.root, style]}>
      <Pressable
        onPress={focusInput}
        disabled={disabled}
        accessibilityRole="none"
        style={styles.pressWrapper}
      >
        <Animated.View
          style={[
            styles.row,
            { gap: gapSize, transform: [{ translateX: shakeX }] },
          ]}
        >
          {Array.from({ length: Math.min(3, length) }, (_, i) => renderCell(i))}
          {length === 6 ? (
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[styles.separator, { width: sepWidth }]}
            />
          ) : null}
          {Array.from({ length: Math.max(0, length - 3) }, (_, i) => renderCell(i + 3))}

          <TextInput
            ref={inputRef}
            testID={testID}
            value={sanitized}
            onChangeText={handleChangeText}
            onFocus={() => {
              setFocused(true);
              onFocus?.();
            }}
            onBlur={() => {
              setFocused(false);
              onBlur?.();
            }}
            editable={!disabled}
            keyboardType="number-pad"
            inputMode="numeric"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={length}
            caretHidden
            selectTextOnFocus={false}
            accessibilityLabel={accessibilityLabel}
            accessibilityHint="Nhập mã xác nhận hoặc dán từ bộ nhớ tạm"
            accessibilityState={{ disabled }}
            style={styles.hiddenInput}
          />
        </Animated.View>
      </Pressable>

      {status === 'success' ? (
        <View style={styles.verifiedBadge} testID={`${testID}-verified`}>
          <Icon name="check-circle" size={14} color={semantic.color.success} />
          <Text style={styles.verifiedText}>Mã hợp lệ</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    gap: primitive.space[2],
    width: '100%',
  },
  pressWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellHalo: {
    borderRadius: primitive.radius.lg + 2,
    padding: 2,
  },
  cell: {
    borderRadius: primitive.radius.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  digit: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: primitive.fontWeight.bold,
    fontVariant: ['tabular-nums'],
    color: semantic.color.textPrimary,
  },
  digitDisabled: {
    color: semantic.color.textSecondary,
  },
  digitError: {
    color: semantic.color.danger,
  },
  digitSuccess: {
    color: semantic.color.success,
  },
  caret: {
    width: 2,
    height: 22,
    borderRadius: 1,
    backgroundColor: semantic.color.accent,
  },
  emptyDot: {
    width: 5,
    height: 5,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.borderStrong,
  },
  separator: {
    height: 2,
    borderRadius: 2,
    backgroundColor: semantic.color.borderStrong,
  },
  hiddenInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.001,
    color: 'transparent',
    backgroundColor: 'transparent',
    fontSize: 1,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1.5],
  },
  verifiedText: {
    ...semantic.type.micro,
    color: semantic.color.success,
    fontWeight: primitive.fontWeight.semibold,
  },
});

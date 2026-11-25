// Lucian UX/UI Prompt #434 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#434
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type StyleProp,
  type TextInputFocusEventData,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { component, primitive, semantic } from '../../theme';
import { Icon, type AppIconName } from './Icon';
import { useReduceMotion } from './LayoutPrimitives';

export interface FormFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  helperText?: string;
  error?: string | null;
  valid?: boolean;
  required?: boolean;
  suffix?: string;
  leadingIcon?: AppIconName;
  passwordToggle?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
}

export function FormField({
  label,
  helperText,
  error,
  valid = false,
  required = false,
  suffix,
  leadingIcon,
  passwordToggle = false,
  editable = true,
  secureTextEntry = false,
  accessibilityLabel,
  onFocus,
  onBlur,
  containerStyle,
  inputStyle,
  multiline,
  testID,
  ...inputProps
}: FormFieldProps) {
  const reduceMotion = useReduceMotion();
  const [focused, setFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const shakeX = useRef(new Animated.Value(0)).current;
  const statusScale = useRef(new Animated.Value(0.2)).current;
  const statusOpacity = useRef(new Animated.Value(0)).current;
  const prevErrorRef = useRef<string | null | undefined>(undefined);

  const isDisabled = editable === false;
  const hasError = Boolean(error && error.trim().length > 0);
  const showValid = !hasError && valid;
  const statusKind: 'error' | 'valid' | null = hasError ? 'error' : showValid ? 'valid' : null;

  useEffect(() => {
    const errorChanged = hasError && prevErrorRef.current !== error;
    prevErrorRef.current = error;

    if (!errorChanged || reduceMotion) {
      shakeX.setValue(0);
      return;
    }

    const easing = Easing.bezier(...primitive.easing.shake);
    const step = 75;
    const sequence = Animated.sequence([
      Animated.timing(shakeX, { toValue: -2, duration: step, easing, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 5, duration: step, easing, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -7, duration: step, easing, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 5, duration: step, easing, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -2, duration: step, easing, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 0, duration: step, easing, useNativeDriver: true }),
    ]);
    sequence.start();
    return () => {
      sequence.stop();
    };
  }, [error, hasError, reduceMotion, shakeX]);

  useEffect(() => {
    if (!statusKind) {
      statusScale.setValue(0.2);
      statusOpacity.setValue(0);
      return;
    }

    if (reduceMotion) {
      statusScale.setValue(1);
      statusOpacity.setValue(1);
      return;
    }

    statusScale.setValue(0.2);
    statusOpacity.setValue(0);
    const animation = Animated.parallel([
      Animated.timing(statusOpacity, {
        toValue: 1,
        duration: primitive.duration.fast,
        useNativeDriver: true,
      }),
      Animated.timing(statusScale, {
        toValue: 1,
        duration: primitive.duration.sheet,
        easing: Easing.bezier(...primitive.easing.springPop),
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => {
      animation.stop();
    };
  }, [reduceMotion, statusKind, statusOpacity, statusScale]);

  const borderColor = isDisabled
    ? semantic.color.borderHairline
    : hasError
      ? component.input.errorBorder
      : focused
        ? component.input.focusBorder
        : showValid
          ? component.input.validBorder
          : component.input.border;

  const haloColor = isDisabled
    ? 'transparent'
    : hasError
      ? component.input.errorHalo
      : focused
        ? component.input.focusHalo
        : showValid
          ? component.input.validHalo
          : 'transparent';

  const handleFocus = (event: NativeSyntheticEvent<TextInputFocusEventData>) => {
    setFocused(true);
    onFocus?.(event);
  };

  const handleBlur = (event: NativeSyntheticEvent<TextInputFocusEventData>) => {
    setFocused(false);
    onBlur?.(event);
  };

  const effectiveSecure = passwordToggle ? !showPassword : secureTextEntry;
  const feedbackText = hasError ? error : helperText;

  return (
    <View style={[styles.container, containerStyle]}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, isDisabled && styles.labelDisabled]}>{label}</Text>
        {required ? <Text style={styles.requiredMark}>*</Text> : null}
      </View>

      <Animated.View
        style={[
          styles.halo,
          { backgroundColor: haloColor, transform: [{ translateX: shakeX }] },
        ]}
      >
        <View
          style={[
            styles.inputShell,
            multiline && styles.inputShellMultiline,
            {
              backgroundColor: isDisabled ? component.input.disabledBg : component.input.bg,
              borderColor,
              borderWidth: focused || hasError || showValid ? 1.5 : 1,
            },
          ]}
        >
          {leadingIcon ? (
            <View style={styles.leadingIcon}>
              <Icon
                name={leadingIcon}
                size={17}
                color={focused ? semantic.color.accent : semantic.color.textSecondary}
              />
            </View>
          ) : null}

          <TextInput
            {...inputProps}
            testID={testID}
            editable={editable}
            multiline={multiline}
            secureTextEntry={effectiveSecure}
            accessibilityLabel={accessibilityLabel ?? label}
            placeholderTextColor={semantic.color.textSecondary}
            onFocus={handleFocus}
            onBlur={handleBlur}
            style={[
              styles.input,
              multiline && styles.inputMultiline,
              isDisabled && styles.inputDisabled,
              inputStyle,
            ]}
          />

          {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}

          {passwordToggle ? (
            <Pressable
              testID={testID ? `${testID}-toggle-password` : undefined}
              onPress={() => setShowPassword((prev) => !prev)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            >
              <Icon
                name={showPassword ? 'eye-off' : 'eye'}
                size={18}
                color={semantic.color.textSecondary}
              />
            </Pressable>
          ) : null}

          {statusKind ? (
            <Animated.View
              testID={testID ? `${testID}-status-icon` : undefined}
              style={[
                styles.statusCircle,
                {
                  backgroundColor:
                    statusKind === 'error'
                      ? semantic.color.dangerSoft
                      : semantic.color.successSoft,
                  opacity: statusOpacity,
                  transform: [{ scale: statusScale }],
                },
              ]}
            >
              <Icon
                name={statusKind === 'error' ? 'alert-circle' : 'check'}
                size={14}
                color={
                  statusKind === 'error' ? semantic.color.danger : semantic.color.success
                }
              />
            </Animated.View>
          ) : null}
        </View>
      </Animated.View>

      <View style={styles.messageRow} accessibilityLiveRegion="polite">
        {feedbackText ? (
          <Text
            style={[
              styles.messageText,
              hasError ? styles.errorText : styles.helperText,
            ]}
          >
            {feedbackText}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1],
    marginBottom: primitive.space[1.5],
  },
  label: {
    ...semantic.type.label,
    color: semantic.color.textSecondary,
  },
  labelDisabled: {
    opacity: primitive.opacity.disabled,
  },
  requiredMark: {
    ...semantic.type.label,
    color: semantic.color.accent,
  },
  halo: {
    borderRadius: component.input.radius + 3,
    padding: 2,
  },
  inputShell: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: component.input.minHeight,
    borderRadius: component.input.radius,
    paddingLeft: component.input.paddingLeft,
    paddingRight: component.input.paddingRight,
    gap: primitive.space[2],
  },
  inputShellMultiline: {
    alignItems: 'flex-start',
    paddingVertical: primitive.space[2.5],
  },
  leadingIcon: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    fontSize: primitive.fontSize.base,
    lineHeight: primitive.lineHeight.base,
    color: semantic.color.textPrimary,
    paddingVertical: primitive.space[2],
  },
  inputMultiline: {
    minHeight: 84,
    textAlignVertical: 'top',
  },
  inputDisabled: {
    color: semantic.color.textSecondary,
  },
  suffix: {
    ...semantic.type.label,
    color: semantic.color.textSecondary,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: primitive.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusCircle: {
    width: 24,
    height: 24,
    borderRadius: primitive.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageRow: {
    minHeight: 20,
    paddingTop: primitive.space[1],
    paddingHorizontal: primitive.space[1],
  },
  messageText: {
    ...semantic.type.micro,
  },
  helperText: {
    color: semantic.color.textSecondary,
  },
  errorText: {
    color: semantic.color.danger,
  },
  pressed: {
    opacity: primitive.opacity.pressed,
  },
});

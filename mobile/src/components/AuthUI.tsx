import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputFocusEvent,
  type TextInputProps,
} from 'react-native';
import { component, primitive, semantic } from '../theme';
import { Icon, InlineBanner, type AppIconName, type InlineBannerTone } from './ui';

export type ActionVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';

export const ui = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: semantic.color.bgPage,
  },
  content: {
    flexGrow: 1,
    paddingBottom: primitive.space[8],
    gap: primitive.space[4],
  },
  card: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    backgroundColor: semantic.color.bgSurface,
    paddingHorizontal: semantic.spacing.pageX,
    paddingVertical: primitive.space[5],
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: semantic.color.borderHairline,
    gap: primitive.space[4],
  },
  heading: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    paddingHorizontal: semantic.spacing.pageX,
    paddingTop: primitive.space[5],
    gap: primitive.space[1.5],
  },
  brand: {
    ...semantic.type.micro,
    color: semantic.color.accent,
    fontWeight: primitive.fontWeight.semibold,
    letterSpacing: 0.6,
  },
  caption: {
    ...semantic.type.caption,
  },
  label: {
    ...semantic.type.label,
    color: semantic.color.textSecondary,
  },
  field: {
    borderWidth: 1,
    borderColor: component.input.border,
    borderRadius: component.input.radius,
    paddingLeft: component.input.paddingLeft,
    paddingRight: component.input.paddingRight,
    minHeight: component.input.minHeight,
    paddingVertical: primitive.space[2.5],
    fontSize: primitive.fontSize.base,
    lineHeight: primitive.lineHeight.base,
    color: semantic.color.textPrimary,
    backgroundColor: component.input.bg,
  },
  button: {
    minHeight: component.button.minHeight,
    borderRadius: component.button.radius,
    paddingHorizontal: component.button.paddingX,
    paddingVertical: primitive.space[3],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: component.button.primaryBg,
    flexDirection: 'row',
    gap: primitive.space[2],
  },
  notice: {
    paddingHorizontal: primitive.space[3],
    paddingVertical: primitive.space[3],
    borderRadius: primitive.radius.lg,
    backgroundColor: semantic.color.bgSubtle,
    gap: primitive.space[1],
  },
  divider: {
    borderTopWidth: 1,
    borderColor: semantic.color.borderHairline,
    paddingTop: primitive.space[4],
    gap: primitive.space[3],
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: primitive.space[2],
  },
  badge: {
    paddingHorizontal: primitive.space[2.5],
    paddingVertical: primitive.space[1],
    backgroundColor: semantic.color.bgTrack,
    borderRadius: primitive.radius.full,
    color: semantic.color.textPrimary,
    fontSize: primitive.fontSize.xs,
    fontWeight: primitive.fontWeight.medium,
    overflow: 'hidden',
  },
});

export function AuthScreen({
  title,
  subtitle,
  showBrand = false,
  children,
}: {
  title: string;
  subtitle?: string;
  showBrand?: boolean;
  children: ReactNode;
}) {
  return (
    <KeyboardAvoidingView
      style={ui.page}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <ScrollView
        contentContainerStyle={ui.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={ui.heading}>
          {showBrand ? <Text style={ui.brand}>Chợ KTX · ĐHQG-HCM</Text> : null}
          <Text accessibilityRole="header" style={styles.screenTitle}>
            {title}
          </Text>
          {subtitle ? <Text style={ui.caption}>{subtitle}</Text> : null}
        </View>
        <View style={ui.card}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function Field({
  label,
  hint,
  style,
  onFocus,
  onBlur,
  accessibilityLabel,
  ...props
}: TextInputProps & { label: string; hint?: string }) {
  const [focused, setFocused] = useState(false);
  const isDisabled = props.editable === false;

  const handleFocus = (e: TextInputFocusEvent) => {
    setFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e: TextInputFocusEvent) => {
    setFocused(false);
    onBlur?.(e);
  };

  return (
    <View style={styles.fieldGroup}>
      <Text style={[ui.label, isDisabled && styles.labelDisabled]}>{label}</Text>
      <TextInput
        accessibilityLabel={accessibilityLabel ?? label}
        placeholderTextColor={semantic.color.textSecondary}
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={[
          ui.field,
          focused && !isDisabled && styles.fieldFocused,
          isDisabled && styles.fieldDisabledBox,
          isDisabled && styles.inputTextDisabled,
          style,
        ]}
        {...props}
      />
      {hint ? <Text style={styles.hintText}>{hint}</Text> : null}
    </View>
  );
}

export function PasswordField({
  label,
  onFocus,
  onBlur,
  accessibilityLabel,
  style,
  ...props
}: TextInputProps & { label: string }) {
  const [show, setShow] = useState(false);
  const [focused, setFocused] = useState(false);
  const isDisabled = props.editable === false;

  const handleFocus = (e: TextInputFocusEvent) => {
    setFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e: TextInputFocusEvent) => {
    setFocused(false);
    onBlur?.(e);
  };

  return (
    <View style={styles.fieldGroup}>
      <Text style={[ui.label, isDisabled && styles.labelDisabled]}>{label}</Text>
      <View
        style={[
          styles.passwordShell,
          focused && !isDisabled && styles.fieldFocused,
          isDisabled && styles.fieldDisabledBox,
        ]}
      >
        <TextInput
          accessibilityLabel={accessibilityLabel ?? label}
          placeholderTextColor={semantic.color.textSecondary}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={[styles.passwordInput, isDisabled && styles.inputTextDisabled, style]}
          {...props}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${show ? 'Ẩn' : 'Hiện'} ${label.toLowerCase()}`}
          accessibilityState={{ expanded: show }}
          onPress={() => setShow((prev) => !prev)}
          hitSlop={8}
          style={({ pressed }) => [styles.eyeButton, pressed && styles.pressed]}
        >
          <Icon
            name={show ? 'eye-off' : 'eye'}
            size={18}
            color={semantic.color.textSecondary}
          />
        </Pressable>
      </View>
    </View>
  );
}

export function Action({
  title,
  onPress,
  disabled = false,
  busy = false,
  secondary = false,
  variant,
  compact = false,
  icon,
  testID,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  secondary?: boolean;
  variant?: ActionVariant;
  compact?: boolean;
  icon?: AppIconName;
  testID?: string;
}) {
  const resolvedVariant: ActionVariant = variant ?? (secondary ? 'secondary' : 'primary');
  const isDisabled = disabled || busy;

  const fgColor =
    resolvedVariant === 'primary'
      ? component.button.primaryFg
      : resolvedVariant === 'secondary'
        ? component.button.secondaryFg
        : resolvedVariant === 'destructive'
          ? component.button.destructiveFg
          : component.button.ghostFg;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: isDisabled, busy }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        ui.button,
        compact && styles.buttonCompact,
        resolvedVariant === 'primary' && {
          backgroundColor: pressed
            ? component.button.primaryPressedBg
            : component.button.primaryBg,
          borderColor: pressed
            ? component.button.primaryPressedBg
            : component.button.primaryBg,
        },
        resolvedVariant === 'secondary' && {
          backgroundColor: pressed ? semantic.color.bgSubtle : component.button.secondaryBg,
          borderColor: component.button.secondaryBorder,
        },
        resolvedVariant === 'ghost' && {
          backgroundColor: pressed ? semantic.color.bgSubtle : 'transparent',
          borderColor: 'transparent',
          minHeight: compact ? component.button.minHeightSm : 42,
        },
        resolvedVariant === 'destructive' && {
          backgroundColor: component.button.destructiveSoftBg,
          borderColor: 'transparent',
        },
        isDisabled && styles.buttonDisabled,
        pressed && !isDisabled && resolvedVariant !== 'primary' && styles.pressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={fgColor} />
      ) : icon ? (
        <Icon name={icon} size={compact ? 15 : 17} color={fgColor} />
      ) : null}
      <Text
        numberOfLines={1}
        style={[
          styles.buttonLabel,
          compact && styles.buttonLabelCompact,
          { color: fgColor },
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

export function Notice({
  message,
  error = false,
  tone,
}: {
  message: string;
  error?: boolean;
  tone?: InlineBannerTone;
}) {
  if (!message) return null;
  const resolvedTone: InlineBannerTone = tone ?? (error ? 'danger' : 'neutral');
  return <InlineBanner tone={resolvedTone} message={message} />;
}

export function Steps({ current, labels }: { current: number; labels: string[] }) {
  return (
    <View
      accessibilityLabel={`Bước ${current + 1}: ${labels[current]}`}
      style={styles.stepsRow}
    >
      {labels.map((label, index) => {
        const isActive = index === current;
        const isDone = index < current;

        return (
          <View key={label} style={styles.stepItem}>
            <View
              style={[
                styles.stepDot,
                isActive && styles.stepDotActive,
                isDone && styles.stepDotDone,
              ]}
            >
              {isDone ? (
                <Icon name="check" size={12} color={semantic.color.textInverse} />
              ) : (
                <Text
                  style={[
                    styles.stepNum,
                    isActive && styles.stepNumActive,
                  ]}
                >
                  {index + 1}
                </Text>
              )}
            </View>
            <Text
              numberOfLines={1}
              style={[
                styles.stepLabel,
                isActive && styles.stepLabelActive,
                isDone && styles.stepLabelDone,
              ]}
            >
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screenTitle: {
    ...semantic.type.screenTitle,
  },
  fieldGroup: {
    gap: primitive.space[1.5],
  },
  labelDisabled: {
    opacity: primitive.opacity.disabled,
  },
  fieldFocused: {
    borderColor: component.input.focusBorder,
    borderWidth: 1.5,
  },
  fieldDisabledBox: {
    backgroundColor: component.input.disabledBg,
    borderColor: semantic.color.borderHairline,
  },
  inputTextDisabled: {
    color: semantic.color.textSecondary,
  },
  hintText: {
    ...semantic.type.micro,
  },
  passwordShell: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: component.input.minHeight,
    borderRadius: component.input.radius,
    borderWidth: 1,
    borderColor: component.input.border,
    backgroundColor: component.input.bg,
    paddingLeft: component.input.paddingLeft,
    paddingRight: component.input.paddingRight,
    gap: primitive.space[2],
  },
  passwordInput: {
    flex: 1,
    fontSize: primitive.fontSize.base,
    lineHeight: primitive.lineHeight.base,
    color: semantic.color.textPrimary,
    paddingVertical: primitive.space[2.5],
  },
  eyeButton: {
    width: 34,
    height: 34,
    borderRadius: primitive.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonCompact: {
    minHeight: component.button.minHeightSm,
    paddingHorizontal: primitive.space[3],
    paddingVertical: primitive.space[2],
    borderRadius: primitive.radius.md,
  },
  buttonDisabled: {
    opacity: primitive.opacity.disabled,
  },
  buttonLabel: {
    fontSize: primitive.fontSize.base,
    lineHeight: 20,
    fontWeight: primitive.fontWeight.semibold,
  },
  buttonLabelCompact: {
    fontSize: primitive.fontSize.sm,
    lineHeight: 18,
  },
  pressed: {
    opacity: primitive.opacity.pressed,
  },
  stepsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: primitive.space[3],
    paddingBottom: primitive.space[1],
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1.5],
  },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.bgTrack,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: {
    backgroundColor: semantic.color.accent,
  },
  stepDotDone: {
    backgroundColor: semantic.color.success,
  },
  stepNum: {
    fontSize: primitive.fontSize.xs,
    fontWeight: primitive.fontWeight.semibold,
    color: semantic.color.textSecondary,
  },
  stepNumActive: {
    color: semantic.color.textInverse,
  },
  stepLabel: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
  },
  stepLabelActive: {
    color: semantic.color.textPrimary,
    fontWeight: primitive.fontWeight.semibold,
  },
  stepLabelDone: {
    color: semantic.color.success,
  },
});

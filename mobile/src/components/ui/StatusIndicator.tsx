import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { component, primitive, semantic } from '../../theme';
import { Icon, type AppIconName } from './Icon';

export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent';
export type StatusVariant = 'dot' | 'soft' | 'urgent';

export interface StatusIndicatorProps {
  label: string;
  tone?: StatusTone;
  variant?: StatusVariant;
  icon?: AppIconName;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

const TONE_TOKENS: Record<
  StatusTone,
  { dot: string; softBg: string; softFg: string; urgentBg: string; urgentFg: string }
> = {
  neutral: {
    dot: semantic.color.textSecondary,
    softBg: component.badge.neutralBg,
    softFg: component.badge.neutralFg,
    urgentBg: semantic.color.textPrimary,
    urgentFg: semantic.color.textInverse,
  },
  success: {
    dot: semantic.color.success,
    softBg: component.badge.successBg,
    softFg: component.badge.successFg,
    urgentBg: semantic.color.success,
    urgentFg: semantic.color.textInverse,
  },
  warning: {
    dot: semantic.color.warning,
    softBg: component.badge.warningBg,
    softFg: component.badge.warningFg,
    urgentBg: semantic.color.warning,
    urgentFg: semantic.color.textInverse,
  },
  danger: {
    dot: semantic.color.danger,
    softBg: component.badge.dangerBg,
    softFg: component.badge.dangerFg,
    urgentBg: semantic.color.danger,
    urgentFg: semantic.color.textInverse,
  },
  accent: {
    dot: semantic.color.accent,
    softBg: component.badge.accentBg,
    softFg: component.badge.accentFg,
    urgentBg: semantic.color.accent,
    urgentFg: semantic.color.textInverse,
  },
};

export function StatusIndicator({
  label,
  tone = 'neutral',
  variant = 'dot',
  icon,
  testID,
  style,
}: StatusIndicatorProps) {
  const palette = TONE_TOKENS[tone];

  if (variant === 'dot') {
    return (
      <View testID={testID} style={[styles.dotRow, style]}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.dot, { backgroundColor: palette.dot }]}
        />
        <Text
          numberOfLines={1}
          style={[
            styles.dotLabel,
            { color: tone === 'neutral' ? semantic.color.textSecondary : palette.dot },
          ]}
        >
          {label}
        </Text>
      </View>
    );
  }

  const isUrgent = variant === 'urgent';
  const bg = isUrgent ? palette.urgentBg : palette.softBg;
  const fg = isUrgent ? palette.urgentFg : palette.softFg;

  return (
    <View testID={testID} style={[styles.pill, { backgroundColor: bg }, style]}>
      {icon ? <Icon name={icon} size={12} color={fg} /> : null}
      <Text
        numberOfLines={1}
        style={[styles.pillLabel, isUrgent && styles.urgentLabel, { color: fg }]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1.5],
    alignSelf: 'flex-start',
  },
  dot: {
    width: component.badge.dotSize,
    height: component.badge.dotSize,
    borderRadius: primitive.radius.full,
  },
  dotLabel: {
    ...semantic.type.micro,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: primitive.space[1],
    borderRadius: component.badge.radius,
    paddingHorizontal: component.badge.paddingX,
    paddingVertical: component.badge.paddingY,
  },
  pillLabel: {
    ...semantic.type.micro,
  },
  urgentLabel: {
    fontWeight: primitive.fontWeight.semibold,
  },
});

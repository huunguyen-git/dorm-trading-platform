import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { primitive, semantic } from '../../theme';
import { Icon, type AppIconName } from './Icon';

export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);
  const currentRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    const syncValue = (enabled: boolean) => {
      if (!mounted) return;
      if (currentRef.current !== enabled) {
        currentRef.current = enabled;
        setReduceMotion(enabled);
      }
    };

    if (typeof AccessibilityInfo?.isReduceMotionEnabled === 'function') {
      void AccessibilityInfo.isReduceMotionEnabled()
        .then((enabled) => syncValue(Boolean(enabled)))
        .catch(() => {});
    }

    const subscription =
      typeof AccessibilityInfo?.addEventListener === 'function'
        ? AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
            syncValue(Boolean(enabled));
          })
        : null;

    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);

  return reduceMotion;
}

export interface HairlineDividerProps {
  insetLeft?: number;
  insetRight?: number;
  spacing?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function HairlineDivider({
  insetLeft = 0,
  insetRight = 0,
  spacing = 0,
  style,
  testID,
}: HairlineDividerProps) {
  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.divider,
        {
          marginLeft: insetLeft,
          marginRight: insetRight,
          marginVertical: spacing,
        },
        style,
      ]}
    />
  );
}

export interface SectionHeadingProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onActionPress?: () => void;
  actionIcon?: AppIconName;
  actionTestID?: string;
  rightSlot?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function SectionHeading({
  title,
  subtitle,
  actionLabel,
  onActionPress,
  actionIcon,
  actionTestID,
  rightSlot,
  style,
  testID,
}: SectionHeadingProps) {
  return (
    <View testID={testID} style={[styles.sectionHeader, style]}>
      <View style={styles.sectionTitleWrap}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>

      {rightSlot ??
        (actionLabel && onActionPress ? (
          <Pressable
            testID={actionTestID}
            onPress={onActionPress}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            style={({ pressed }) => [styles.sectionAction, pressed && styles.pressed]}
          >
            <Text style={styles.sectionActionText}>{actionLabel}</Text>
            {actionIcon ? (
              <Icon name={actionIcon} size={15} color={semantic.color.accent} />
            ) : null}
          </Pressable>
        ) : null)}
    </View>
  );
}

export type InlineBannerTone = 'neutral' | 'warning' | 'danger' | 'success';

export interface InlineBannerProps {
  tone?: InlineBannerTone;
  title?: string;
  message: string;
  icon?: AppIconName | false;
  actionLabel?: string;
  onActionPress?: () => void;
  actionTestID?: string;
  onDismiss?: () => void;
  dismissTestID?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const BANNER_TONE_CONFIG: Record<
  InlineBannerTone,
  { bg: string; fg: string; iconColor: string; defaultIcon: AppIconName }
> = {
  neutral: {
    bg: semantic.color.bgSubtle,
    fg: semantic.color.textPrimary,
    iconColor: semantic.color.textSecondary,
    defaultIcon: 'info',
  },
  warning: {
    bg: semantic.color.warningSoft,
    fg: semantic.color.warning,
    iconColor: semantic.color.warning,
    defaultIcon: 'alert-triangle',
  },
  danger: {
    bg: semantic.color.dangerSoft,
    fg: semantic.color.danger,
    iconColor: semantic.color.danger,
    defaultIcon: 'alert-circle',
  },
  success: {
    bg: semantic.color.successSoft,
    fg: semantic.color.success,
    iconColor: semantic.color.success,
    defaultIcon: 'check-circle',
  },
};

export function InlineBanner({
  tone = 'neutral',
  title,
  message,
  icon,
  actionLabel,
  onActionPress,
  actionTestID,
  onDismiss,
  dismissTestID,
  style,
  testID,
}: InlineBannerProps) {
  const cfg = BANNER_TONE_CONFIG[tone];
  const resolvedIcon = icon === false ? null : (icon ?? cfg.defaultIcon);
  const isAlert = tone === 'danger' || tone === 'warning';

  return (
    <View
      testID={testID}
      accessibilityRole={isAlert ? 'alert' : 'summary'}
      accessibilityLiveRegion={isAlert ? 'polite' : 'none'}
      style={[styles.banner, { backgroundColor: cfg.bg }, style]}
    >
      {resolvedIcon ? (
        <View style={styles.bannerIconWrap}>
          <Icon name={resolvedIcon} size={17} color={cfg.iconColor} />
        </View>
      ) : null}

      <View style={styles.bannerBody}>
        {title ? <Text style={[styles.bannerTitle, { color: cfg.fg }]}>{title}</Text> : null}
        <Text
          style={[
            styles.bannerMessage,
            { color: tone === 'neutral' ? semantic.color.textPrimary : cfg.fg },
          ]}
        >
          {message}
        </Text>
        {actionLabel && onActionPress ? (
          <Pressable
            testID={actionTestID}
            onPress={onActionPress}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            style={({ pressed }) => [styles.bannerAction, pressed && styles.pressed]}
          >
            <Text style={[styles.bannerActionText, { color: cfg.fg }]}>{actionLabel}</Text>
            <Icon name="chevron-right" size={14} color={cfg.fg} />
          </Pressable>
        ) : null}
      </View>

      {onDismiss ? (
        <Pressable
          testID={dismissTestID}
          onPress={onDismiss}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Đóng thông báo"
          style={({ pressed }) => [styles.bannerDismiss, pressed && styles.pressed]}
        >
          <Icon name="x" size={16} color={cfg.iconColor} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  divider: {
    height: 1,
    backgroundColor: semantic.color.borderHairline,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: primitive.space[3],
  },
  sectionTitleWrap: {
    flex: 1,
    gap: primitive.space[1],
  },
  sectionTitle: {
    ...semantic.type.sectionTitle,
  },
  sectionSubtitle: {
    ...semantic.type.caption,
  },
  sectionAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1],
    minHeight: 36,
    paddingHorizontal: primitive.space[1],
  },
  sectionActionText: {
    ...semantic.type.label,
    color: semantic.color.accent,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: primitive.radius.lg,
    paddingHorizontal: primitive.space[3],
    paddingVertical: primitive.space[3],
    gap: primitive.space[2.5],
  },
  bannerIconWrap: {
    paddingTop: 2,
  },
  bannerBody: {
    flex: 1,
    gap: primitive.space[1],
  },
  bannerTitle: {
    ...semantic.type.label,
  },
  bannerMessage: {
    ...semantic.type.caption,
    lineHeight: 19,
  },
  bannerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: primitive.space[1],
    marginTop: primitive.space[1],
    minHeight: 32,
  },
  bannerActionText: {
    ...semantic.type.label,
  },
  bannerDismiss: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: primitive.radius.full,
  },
  pressed: {
    opacity: primitive.opacity.pressed,
  },
});

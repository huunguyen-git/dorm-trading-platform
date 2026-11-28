// Lucian UX/UI Prompt #072 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#072
import { useRef, useState } from 'react';
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
import { primitive, semantic } from '../../theme';
import { Icon, type AppIconName } from './Icon';
import { useReduceMotion } from './LayoutPrimitives';

export type CollapsibleAlertTone = 'accent' | 'success' | 'warning' | 'danger' | 'neutral';

export interface CollapsibleAlertProps {
  tone?: CollapsibleAlertTone;
  title: string;
  message: string;
  meta?: string;
  details?: string;
  icon?: AppIconName;
  onPress?: () => void;
  onDismiss?: () => void;
  dismissLabel?: string;
  dismissTestID?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

const TONE_PALETTE: Record<
  CollapsibleAlertTone,
  { accent: string; bg: string; border: string; defaultIcon: AppIconName }
> = {
  accent: {
    accent: semantic.color.accent,
    bg: semantic.color.accentSoft,
    border: semantic.color.accentBorder,
    defaultIcon: 'bell',
  },
  success: {
    accent: semantic.color.success,
    bg: semantic.color.successSoft,
    border: semantic.color.borderHairline,
    defaultIcon: 'check',
  },
  warning: {
    accent: semantic.color.warning,
    bg: semantic.color.warningSoft,
    border: semantic.color.borderHairline,
    defaultIcon: 'alert-triangle',
  },
  danger: {
    accent: semantic.color.danger,
    bg: semantic.color.dangerSoft,
    border: semantic.color.borderHairline,
    defaultIcon: 'alert-circle',
  },
  neutral: {
    accent: semantic.color.textPrimary,
    bg: semantic.color.bgSubtle,
    border: semantic.color.borderHairline,
    defaultIcon: 'info',
  },
};

// Lucian #072 motion values preserved from source CSS
const SLIDE_OUT_MS = 400;
const FADE_OUT_MS = 300;
const CHEVRON_MS = 350;

export function CollapsibleAlert({
  tone = 'accent',
  title,
  message,
  meta,
  details,
  icon,
  onPress,
  onDismiss,
  dismissLabel = 'Đóng thông báo',
  dismissTestID,
  testID,
  style,
}: CollapsibleAlertProps) {
  const reduceMotion = useReduceMotion();
  const [expanded, setExpanded] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  const slideX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const chevronAnim = useRef(new Animated.Value(0)).current;

  const palette = TONE_PALETTE[tone];
  const resolvedIcon = icon ?? palette.defaultIcon;
  const isAlert = tone === 'danger' || tone === 'warning';

  const handleToggleDetails = () => {
    const next = !expanded;
    setExpanded(next);
    if (reduceMotion) {
      chevronAnim.setValue(next ? 1 : 0);
      return;
    }
    Animated.timing(chevronAnim, {
      toValue: next ? 1 : 0,
      duration: CHEVRON_MS,
      easing: Easing.bezier(...primitive.easing.springSoft),
      useNativeDriver: true,
    }).start();
  };

  const handleDismiss = () => {
    if (!onDismiss || dismissing) return;
    setDismissing(true);
    if (reduceMotion) {
      onDismiss();
      return;
    }
    Animated.parallel([
      Animated.timing(slideX, {
        toValue: 40,
        duration: SLIDE_OUT_MS,
        easing: Easing.bezier(...primitive.easing.standard),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: FADE_OUT_MS,
        easing: Easing.bezier(...primitive.easing.standard),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        onDismiss();
      }
    });
  };

  const chevronRotate = chevronAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const bodyContent = (
    <View style={styles.innerRow}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.leftBar, { backgroundColor: palette.accent }]}
      />

      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.iconBadge, { backgroundColor: palette.accent }]}
      >
        <Icon name={resolvedIcon} size={15} color={semantic.color.textInverse} />
      </View>

      <View style={styles.textCol}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.message}>{message}</Text>
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}

        {details ? (
          <View style={styles.detailsWrap}>
            <Pressable
              testID={testID ? `${testID}-details-toggle` : undefined}
              onPress={handleToggleDetails}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={expanded ? 'Ẩn chi tiết' : 'Xem chi tiết'}
              accessibilityState={{ expanded }}
              style={styles.detailsToggle}
            >
              <Text style={[styles.detailsToggleText, { color: palette.accent }]}>
                {expanded ? 'Ẩn chi tiết' : 'Chi tiết'}
              </Text>
              <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
                <Icon name="chevron-down" size={13} color={palette.accent} />
              </Animated.View>
            </Pressable>
            {expanded ? (
              <View style={styles.detailsBox}>
                <Text style={styles.detailsText}>{details}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      {onDismiss ? (
        <Pressable
          testID={dismissTestID ?? (testID ? `${testID}-dismiss` : undefined)}
          disabled={dismissing}
          onPress={handleDismiss}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={dismissLabel}
          style={({ pressed }) => [styles.dismissBtn, pressed && styles.dismissBtnPressed]}
        >
          <Icon name="x" size={14} color={semantic.color.textSecondary} />
        </Pressable>
      ) : onPress ? (
        <View style={styles.trailingChevron}>
          <Icon name="chevron-right" size={16} color={semantic.color.textSecondary} />
        </View>
      ) : null}
    </View>
  );

  return (
    <Animated.View
      testID={testID}
      accessibilityRole={isAlert ? 'alert' : 'summary'}
      accessibilityLiveRegion={isAlert ? 'polite' : 'none'}
      style={[
        styles.card,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          opacity,
          transform: [{ translateX: slideX }],
        },
        style,
      ]}
    >
      {onPress ? (
        <Pressable
          testID={testID ? `${testID}-press` : undefined}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={title}
          style={({ pressed }) => [pressed && styles.pressed]}
        >
          {bodyContent}
        </Pressable>
      ) : (
        bodyContent
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: primitive.radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  innerRow: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: primitive.space[3],
    paddingTop: primitive.space[3.5 as keyof typeof primitive.space] ?? 14,
    paddingBottom: 14,
    paddingLeft: 14,
    paddingRight: 12,
  },
  leftBar: {
    position: 'absolute',
    left: 0,
    top: 14,
    bottom: 14,
    width: 3,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  textCol: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: primitive.fontWeight.bold,
    color: semantic.color.textPrimary,
  },
  message: {
    ...semantic.type.caption,
    lineHeight: 19,
    color: primitive.color.stone700,
  },
  meta: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
    marginTop: 2,
  },
  detailsWrap: {
    marginTop: primitive.space[1.5],
    gap: primitive.space[1.5],
  },
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
  },
  detailsToggleText: {
    ...semantic.type.micro,
    fontWeight: primitive.fontWeight.bold,
  },
  detailsBox: {
    backgroundColor: semantic.color.bgSurface,
    borderRadius: primitive.radius.md,
    padding: primitive.space[2.5],
  },
  detailsText: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
    lineHeight: 18,
  },
  dismissBtn: {
    width: 28,
    height: 28,
    borderRadius: primitive.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -2,
    marginRight: -2,
  },
  dismissBtnPressed: {
    backgroundColor: semantic.color.bgTrack,
  },
  trailingChevron: {
    paddingTop: 4,
  },
  pressed: {
    opacity: primitive.opacity.pressed,
  },
});

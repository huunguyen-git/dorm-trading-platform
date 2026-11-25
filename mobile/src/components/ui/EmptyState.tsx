// Lucian UX/UI Prompt #092 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#092
import { useEffect, useRef } from 'react';
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
import { component, primitive, semantic } from '../../theme';
import { Icon, type AppIconName } from './Icon';
import { useReduceMotion } from './LayoutPrimitives';

export interface FilterLoosenSuggestion {
  key: string;
  activeLabel: string;
  actionLabel: string;
  onPress: () => void;
  testID?: string;
}

export interface EmptyStateProps {
  icon?: AppIconName;
  title: string;
  subtitle?: string;
  suggestions?: FilterLoosenSuggestion[];
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  primaryActionTestID?: string;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  secondaryActionTestID?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({
  icon = 'inbox',
  title,
  subtitle,
  suggestions,
  primaryActionLabel,
  onPrimaryAction,
  primaryActionTestID,
  secondaryActionLabel,
  onSecondaryAction,
  secondaryActionTestID,
  testID,
  style,
}: EmptyStateProps) {
  const reduceMotion = useReduceMotion();
  const containerOpacity = useRef(new Animated.Value(reduceMotion ? 1 : 0.01)).current;
  const containerScale = useRef(new Animated.Value(reduceMotion ? 1 : 0.97)).current;

  useEffect(() => {
    if (reduceMotion) {
      containerOpacity.setValue(1);
      containerScale.setValue(1);
      return;
    }

    const easing = Easing.bezier(...primitive.easing.standard);
    const animation = Animated.parallel([
      Animated.timing(containerOpacity, {
        toValue: 1,
        duration: primitive.duration.medium,
        easing,
        useNativeDriver: true,
      }),
      Animated.timing(containerScale, {
        toValue: 1,
        duration: primitive.duration.medium,
        easing,
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => {
      animation.stop();
    };
  }, [containerOpacity, containerScale, reduceMotion]);

  return (
    <Animated.View
      testID={testID}
      style={[
        styles.container,
        { opacity: containerOpacity, transform: [{ scale: containerScale }] },
        style,
      ]}
    >
      <View style={styles.iconCircle}>
        <Icon name={icon} size={24} color={semantic.color.textSecondary} />
      </View>

      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

      {suggestions && suggestions.length > 0 ? (
        <View style={styles.suggestionsList}>
          {suggestions.map((item) => (
            <Pressable
              key={item.key}
              testID={item.testID}
              onPress={item.onPress}
              accessibilityRole="button"
              accessibilityLabel={`${item.actionLabel}: ${item.activeLabel}`}
              style={({ pressed }) => [
                styles.suggestionRow,
                pressed && styles.suggestionRowPressed,
              ]}
            >
              <View style={styles.suggestionLeft}>
                <View style={styles.strikePill}>
                  <Text numberOfLines={1} style={styles.strikeText}>
                    {item.activeLabel}
                  </Text>
                </View>
                <Text numberOfLines={1} style={styles.suggestionAction}>
                  {item.actionLabel}
                </Text>
              </View>
              <Icon name="chevron-right" size={16} color={semantic.color.textSecondary} />
            </Pressable>
          ))}
        </View>
      ) : null}

      {primaryActionLabel || secondaryActionLabel ? (
        <View style={styles.actionsWrap}>
          {primaryActionLabel && onPrimaryAction ? (
            <Pressable
              testID={primaryActionTestID}
              onPress={onPrimaryAction}
              accessibilityRole="button"
              accessibilityLabel={primaryActionLabel}
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && styles.primaryBtnPressed,
              ]}
            >
              <Text style={styles.primaryBtnText}>{primaryActionLabel}</Text>
            </Pressable>
          ) : null}

          {secondaryActionLabel && onSecondaryAction ? (
            <Pressable
              testID={secondaryActionTestID}
              onPress={onSecondaryAction}
              accessibilityRole="button"
              accessibilityLabel={secondaryActionLabel}
              style={({ pressed }) => [
                styles.secondaryBtn,
                pressed && styles.secondaryBtnPressed,
              ]}
            >
              <Text style={styles.secondaryBtnText}>{secondaryActionLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: primitive.space[8],
    paddingHorizontal: primitive.space[5],
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.bgSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: primitive.space[3],
  },
  title: {
    ...semantic.type.sectionTitle,
    textAlign: 'center',
  },
  subtitle: {
    ...semantic.type.caption,
    textAlign: 'center',
    marginTop: primitive.space[1.5],
    maxWidth: 300,
  },
  suggestionsList: {
    width: '100%',
    gap: primitive.space[2],
    marginTop: primitive.space[5],
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 46,
    borderRadius: primitive.radius.lg,
    backgroundColor: semantic.color.bgSubtle,
    paddingHorizontal: primitive.space[3],
    paddingVertical: primitive.space[2],
    gap: primitive.space[2],
  },
  suggestionRowPressed: {
    opacity: primitive.opacity.pressed,
  },
  suggestionLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2.5],
  },
  strikePill: {
    backgroundColor: semantic.color.bgTrack,
    borderRadius: primitive.radius.full,
    paddingHorizontal: primitive.space[2.5],
    paddingVertical: primitive.space[1],
    maxWidth: '50%',
  },
  strikeText: {
    ...semantic.type.micro,
    textDecorationLine: 'line-through',
    color: semantic.color.textSecondary,
  },
  suggestionAction: {
    ...semantic.type.label,
    flex: 1,
    color: semantic.color.textPrimary,
  },
  actionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: primitive.space[2.5],
    marginTop: primitive.space[5],
  },
  primaryBtn: {
    minHeight: 44,
    paddingHorizontal: primitive.space[5],
    borderRadius: component.button.radius,
    backgroundColor: component.button.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnPressed: {
    backgroundColor: component.button.primaryPressedBg,
  },
  primaryBtnText: {
    ...semantic.type.label,
    color: component.button.primaryFg,
  },
  secondaryBtn: {
    minHeight: 44,
    paddingHorizontal: primitive.space[4],
    borderRadius: component.button.radius,
    backgroundColor: semantic.color.bgSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnPressed: {
    opacity: primitive.opacity.pressed,
  },
  secondaryBtnText: {
    ...semantic.type.label,
    color: semantic.color.textPrimary,
  },
});

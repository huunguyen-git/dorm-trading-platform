// Lucian UX/UI Prompt #416 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#416
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { component, primitive, semantic } from '../../theme';
import { useReduceMotion } from './LayoutPrimitives';

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: string;
  testID?: string;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string = string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

interface SegmentRect {
  x: number;
  width: number;
}

export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  disabled = false,
  accessibilityLabel,
  testID,
  style,
}: SegmentedControlProps<T>) {
  const reduceMotion = useReduceMotion();
  const [trackWidth, setTrackWidth] = useState(0);
  const [rects, setRects] = useState<Record<string, SegmentRect>>({});
  const hasAnimatedInit = useRef(false);
  const prevIndexRef = useRef(-1);

  const thumbLeft = useRef(new Animated.Value(component.segmented.trackPad)).current;
  const thumbRight = useRef(new Animated.Value(component.segmented.trackPad)).current;

  const activeIndex = Math.max(
    0,
    options.findIndex((opt) => opt.value === value),
  );
  const activeOption = options[activeIndex];
  const activeRect = activeOption ? rects[activeOption.value] : undefined;
  const isMeasured = trackWidth > 0 && Boolean(activeRect && activeRect.width > 0);

  useEffect(() => {
    if (!isMeasured || !activeRect) return;

    const targetLeft = activeRect.x;
    const targetRight = Math.max(
      component.segmented.trackPad,
      trackWidth - (activeRect.x + activeRect.width),
    );

    if (!hasAnimatedInit.current || reduceMotion) {
      hasAnimatedInit.current = true;
      prevIndexRef.current = activeIndex;
      thumbLeft.setValue(targetLeft);
      thumbRight.setValue(targetRight);
      return;
    }

    const movingForward = activeIndex >= prevIndexRef.current;
    prevIndexRef.current = activeIndex;
    const easing = Easing.bezier(...primitive.easing.springThumb);

    const animation = Animated.parallel([
      Animated.timing(thumbLeft, {
        toValue: targetLeft,
        duration: movingForward ? 620 : 380,
        easing,
        useNativeDriver: false,
      }),
      Animated.timing(thumbRight, {
        toValue: targetRight,
        duration: movingForward ? 380 : 620,
        easing,
        useNativeDriver: false,
      }),
    ]);
    animation.start();
    return () => {
      animation.stop();
    };
  }, [activeIndex, activeRect, isMeasured, reduceMotion, thumbLeft, thumbRight, trackWidth]);

  const handleTrackLayout = (event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    if (nextWidth > 0 && Math.abs(nextWidth - trackWidth) > 0.5) {
      setTrackWidth(nextWidth);
    }
  };

  const handleOptionLayout = (optionValue: T) => (event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    setRects((prev) => {
      const existing = prev[optionValue];
      if (existing && Math.abs(existing.x - x) < 0.5 && Math.abs(existing.width - width) < 0.5) {
        return prev;
      }
      return { ...prev, [optionValue]: { x, width } };
    });
  };

  return (
    <View
      testID={testID}
      onLayout={handleTrackLayout}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[styles.track, disabled && styles.trackDisabled, style]}
    >
      {isMeasured ? (
        <Animated.View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.thumb,
            disabled && styles.thumbDisabled,
            {
              left: thumbLeft,
              right: thumbRight,
            },
          ]}
        />
      ) : null}

      {options.map((option) => {
        const selected = option.value === value;
        const optionOwnDisabled = Boolean(option.disabled);
        const isDisabled = disabled || optionOwnDisabled;

        return (
          <Pressable
            key={option.value}
            testID={option.testID}
            disabled={isDisabled}
            hitSlop={4}
            onLayout={handleOptionLayout(option.value)}
            onPress={() => {
              if (!isDisabled && !selected) {
                onChange(option.value);
              }
            }}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected, disabled: isDisabled }}
            style={({ pressed }) => [
              styles.option,
              !isMeasured && selected && styles.optionFallbackSelected,
              !isMeasured && selected && disabled && styles.thumbDisabled,
              !disabled && optionOwnDisabled && styles.optionDisabled,
              pressed && !isDisabled && !selected && styles.optionPressed,
            ]}
          >
            <Text
              numberOfLines={1}
              style={[styles.label, selected && styles.labelSelected]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    backgroundColor: component.segmented.trackBg,
    borderWidth: 1,
    borderColor: component.segmented.trackBorder,
    borderRadius: component.segmented.trackRadius,
    padding: component.segmented.trackPad,
  },
  trackDisabled: {
    opacity: primitive.opacity.disabled,
  },
  thumb: {
    position: 'absolute',
    top: component.segmented.trackPad,
    bottom: component.segmented.trackPad,
    backgroundColor: component.segmented.thumbBg,
    borderRadius: component.segmented.thumbRadius,
    ...primitive.elevation.thumb,
  },
  thumbDisabled: {
    elevation: 0,
    shadowOpacity: 0,
  },
  option: {
    flex: 1,
    minHeight: component.segmented.itemHeight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: primitive.space[2.5],
    borderRadius: component.segmented.thumbRadius,
    zIndex: 1,
  },
  optionFallbackSelected: {
    backgroundColor: component.segmented.thumbBg,
    ...primitive.elevation.thumb,
  },
  optionDisabled: {
    opacity: primitive.opacity.disabled,
  },
  optionPressed: {
    opacity: primitive.opacity.pressed,
  },
  label: {
    fontSize: primitive.fontSize.sm,
    lineHeight: primitive.lineHeight.sm,
    fontWeight: primitive.fontWeight.medium,
    color: semantic.color.textSecondary,
  },
  labelSelected: {
    fontWeight: primitive.fontWeight.semibold,
    color: semantic.color.textPrimary,
  },
});

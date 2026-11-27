// Lucian UX/UI Prompt #048 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#048
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { component, primitive, semantic } from '../../theme';
import { useReduceMotion } from './LayoutPrimitives';

export interface UnderlineTabItem<T extends string = string> {
  value: T;
  label: string;
  count?: number;
  testID?: string;
}

export interface UnderlineTabsProps<T extends string = string> {
  items: UnderlineTabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

interface TabRect {
  x: number;
  width: number;
}

const INDICATOR_INSET = 10;

export function UnderlineTabs<T extends string = string>({
  items,
  value,
  onChange,
  accessibilityLabel,
  testID,
  style,
}: UnderlineTabsProps<T>) {
  const reduceMotion = useReduceMotion();
  const scrollRef = useRef<ComponentRef<typeof ScrollView> | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [rects, setRects] = useState<Record<string, TabRect>>({});
  const hasInit = useRef(false);

  const indicatorLeft = useRef(new Animated.Value(0)).current;
  const indicatorWidth = useRef(new Animated.Value(0)).current;

  const activeRect = rects[value];
  const isMeasured = Boolean(activeRect && activeRect.width > 0);

  useEffect(() => {
    if (!isMeasured || !activeRect) return;

    const targetLeft = activeRect.x + INDICATOR_INSET;
    const targetWidth = Math.max(16, activeRect.width - INDICATOR_INSET * 2);

    if (!hasInit.current || reduceMotion) {
      hasInit.current = true;
      indicatorLeft.setValue(targetLeft);
      indicatorWidth.setValue(targetWidth);
    } else {
      const easing = Easing.bezier(...primitive.easing.standard);
      const animation = Animated.parallel([
        Animated.timing(indicatorLeft, {
          toValue: targetLeft,
          duration: 260,
          easing,
          useNativeDriver: false,
        }),
        Animated.timing(indicatorWidth, {
          toValue: targetWidth,
          duration: 260,
          easing,
          useNativeDriver: false,
        }),
      ]);
      animation.start();
    }

    if (viewportWidth > 0 && scrollRef.current) {
      const centerX = Math.max(0, activeRect.x - viewportWidth / 2 + activeRect.width / 2);
      scrollRef.current.scrollTo({ x: centerX, animated: !reduceMotion });
    }
  }, [activeRect, indicatorLeft, indicatorWidth, isMeasured, reduceMotion, viewportWidth]);

  const handleTabLayout = (tabValue: T) => (event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    setRects((prev) => {
      const existing = prev[tabValue];
      if (existing && Math.abs(existing.x - x) < 0.5 && Math.abs(existing.width - width) < 0.5) {
        return prev;
      }
      return { ...prev, [tabValue]: { x, width } };
    });
  };

  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}
      style={[styles.container, style]}
    >
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.tabsRow}>
          {items.map((item) => {
            const selected = item.value === value;
            return (
              <Pressable
                key={item.value}
                testID={item.testID}
                onLayout={handleTabLayout(item.value)}
                onPress={() => {
                  if (!selected) {
                    onChange(item.value);
                  }
                }}
                accessibilityRole="tab"
                accessibilityLabel={
                  typeof item.count === 'number' ? `${item.label} (${item.count})` : item.label
                }
                accessibilityState={{ selected }}
                style={({ pressed }) => [
                  styles.tab,
                  !isMeasured && selected && styles.tabFallbackSelected,
                  pressed && !selected && styles.tabPressed,
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[styles.tabLabel, selected && styles.tabLabelActive]}
                >
                  {item.label}
                </Text>
                {typeof item.count === 'number' ? (
                  <Text style={[styles.countText, selected && styles.countTextActive]}>
                    {item.count}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}

          {isMeasured ? (
            <Animated.View
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[
                styles.indicator,
                {
                  left: indicatorLeft,
                  width: indicatorWidth,
                },
              ]}
            />
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: component.underlineTabs.height,
    borderBottomWidth: 1,
    borderBottomColor: component.underlineTabs.borderColor,
    backgroundColor: semantic.color.bgSurface,
  },
  scrollContent: {
    paddingHorizontal: primitive.space[3],
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    gap: primitive.space[1],
  },
  tab: {
    height: component.underlineTabs.height,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: primitive.space[3],
    gap: primitive.space[1.5],
  },
  tabFallbackSelected: {
    borderBottomWidth: component.underlineTabs.indicatorHeight,
    borderBottomColor: component.underlineTabs.indicatorColor,
  },
  tabPressed: {
    opacity: primitive.opacity.pressed,
  },
  tabLabel: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: primitive.fontWeight.medium,
    color: component.underlineTabs.inactiveFg,
  },
  tabLabelActive: {
    fontWeight: primitive.fontWeight.semibold,
    color: component.underlineTabs.activeFg,
  },
  countText: {
    fontSize: primitive.fontSize.xs,
    lineHeight: primitive.lineHeight.xs,
    fontWeight: primitive.fontWeight.medium,
    fontVariant: ['tabular-nums'],
    color: semantic.color.textSecondary,
  },
  countTextActive: {
    color: semantic.color.accent,
    fontWeight: primitive.fontWeight.semibold,
  },
  indicator: {
    position: 'absolute',
    bottom: 0,
    height: component.underlineTabs.indicatorHeight,
    borderTopLeftRadius: component.underlineTabs.indicatorRadius,
    borderTopRightRadius: component.underlineTabs.indicatorRadius,
    backgroundColor: component.underlineTabs.indicatorColor,
  },
});

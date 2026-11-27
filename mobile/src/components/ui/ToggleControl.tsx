// Lucian UX/UI Prompt #433 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#433
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
import { Icon } from './Icon';
import { useReduceMotion } from './LayoutPrimitives';

export interface CheckboxRowProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function CheckboxRow({
  label,
  description,
  checked,
  onChange,
  disabled = false,
  testID,
  style,
}: CheckboxRowProps) {
  const reduceMotion = useReduceMotion();
  const checkScale = useRef(new Animated.Value(checked ? 1 : 0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;
  const prevCheckedRef = useRef(checked);

  useEffect(() => {
    const changed = prevCheckedRef.current !== checked;
    prevCheckedRef.current = checked;

    if (!changed || reduceMotion) {
      checkScale.setValue(checked ? 1 : 0);
      return;
    }

    const animation = Animated.timing(checkScale, {
      toValue: checked ? 1 : 0,
      duration: checked ? 350 : 150,
      easing: checked
        ? Easing.bezier(...primitive.easing.springPop)
        : Easing.bezier(...primitive.easing.standard),
      useNativeDriver: true,
    });
    animation.start();
    return () => {
      animation.stop();
    };
  }, [checked, checkScale, reduceMotion]);

  const handlePressIn = () => {
    if (disabled || reduceMotion) return;
    Animated.timing(pressScale, {
      toValue: 0.88,
      duration: primitive.duration.press,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    if (disabled || reduceMotion) return;
    Animated.timing(pressScale, {
      toValue: 1,
      duration: primitive.duration.fast,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable
      testID={testID}
      disabled={disabled}
      onPress={() => {
        if (!disabled) {
          onChange(!checked);
        }
      }}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      style={[styles.row, disabled && styles.disabled, style]}
    >
      <Animated.View
        style={[
          styles.checkboxBox,
          checked ? styles.checkboxChecked : styles.checkboxUnchecked,
          { transform: [{ scale: pressScale }] },
        ]}
      >
        <Animated.View style={{ transform: [{ scale: checkScale }] }}>
          <Icon name="check" size={14} color={semantic.color.textInverse} />
        </Animated.View>
      </Animated.View>

      <View style={styles.textWrap}>
        <Text style={styles.label}>{label}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
    </Pressable>
  );
}

export interface SwitchRowProps {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

const SWITCH_TRAVEL =
  component.toggle.switchWidth -
  component.toggle.switchKnobSize -
  component.toggle.switchPad * 2;

export function SwitchRow({
  label,
  description,
  value,
  onValueChange,
  disabled = false,
  testID,
  style,
}: SwitchRowProps) {
  const reduceMotion = useReduceMotion();
  const knobX = useRef(new Animated.Value(value ? SWITCH_TRAVEL : 0)).current;
  const knobScaleX = useRef(new Animated.Value(1)).current;
  const prevValueRef = useRef(value);

  useEffect(() => {
    const target = value ? SWITCH_TRAVEL : 0;
    const changed = prevValueRef.current !== value;
    prevValueRef.current = value;

    if (!changed || reduceMotion) {
      knobX.setValue(target);
      return;
    }

    const animation = Animated.timing(knobX, {
      toValue: target,
      duration: 380,
      easing: Easing.bezier(...primitive.easing.springPop),
      useNativeDriver: true,
    });
    animation.start();
    return () => {
      animation.stop();
    };
  }, [knobX, reduceMotion, value]);

  const handlePressIn = () => {
    if (disabled || reduceMotion) return;
    Animated.timing(knobScaleX, {
      toValue: 1.15,
      duration: primitive.duration.press,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    if (disabled || reduceMotion) return;
    Animated.timing(knobScaleX, {
      toValue: 1,
      duration: primitive.duration.fast,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable
      testID={testID}
      disabled={disabled}
      onPress={() => {
        if (!disabled) {
          onValueChange(!value);
        }
      }}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      style={[styles.switchRow, disabled && styles.disabled, style]}
    >
      <View style={styles.textWrap}>
        <Text style={styles.label}>{label}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>

      <View
        style={[
          styles.switchTrack,
          { backgroundColor: value ? component.toggle.onBg : component.toggle.offBg },
        ]}
      >
        <Animated.View
          style={[
            styles.switchKnob,
            {
              transform: [{ translateX: knobX }, { scaleX: knobScaleX }],
            },
          ]}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    gap: primitive.space[3],
    paddingVertical: primitive.space[1.5],
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    gap: primitive.space[3],
    paddingVertical: primitive.space[1.5],
  },
  disabled: {
    opacity: primitive.opacity.disabled,
  },
  checkboxBox: {
    width: component.toggle.checkboxSize,
    height: component.toggle.checkboxSize,
    borderRadius: component.toggle.checkboxRadius,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  checkboxUnchecked: {
    backgroundColor: semantic.color.bgSurface,
    borderColor: semantic.color.borderStrong,
  },
  checkboxChecked: {
    backgroundColor: component.toggle.onBg,
    borderColor: component.toggle.onBg,
  },
  switchTrack: {
    width: component.toggle.switchWidth,
    height: component.toggle.switchHeight,
    borderRadius: primitive.radius.full,
    padding: component.toggle.switchPad,
    justifyContent: 'center',
  },
  switchKnob: {
    width: component.toggle.switchKnobSize,
    height: component.toggle.switchKnobSize,
    borderRadius: primitive.radius.full,
    backgroundColor: component.toggle.knobBg,
    ...primitive.elevation.thumb,
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  label: {
    ...semantic.type.body,
    fontWeight: primitive.fontWeight.medium,
  },
  description: {
    ...semantic.type.micro,
  },
});

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../ui';
import { primitive, semantic } from '../../theme';

export interface StarRatingRowProps {
  value: number;
  onChange?: (rating: number) => void;
  readOnly?: boolean;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  showNumeric?: boolean;
  testIDPrefix?: string;
}

const ICON_SIZES = {
  sm: 14,
  md: 20,
  lg: 28,
} as const;

export function StarRatingRow({
  value,
  onChange,
  readOnly = false,
  size = 'md',
  disabled = false,
  showNumeric = false,
  testIDPrefix = 'star-rating',
}: StarRatingRowProps) {
  const iconSize = ICON_SIZES[size];
  const roundedValue = Math.max(0, Math.min(5, Math.round(value)));

  if (readOnly || !onChange) {
    return (
      <View
        style={styles.readOnlyRow}
        accessibilityLabel={`${value} trên 5 sao`}
        testID={testIDPrefix}
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const filled = star <= roundedValue;
          return (
            <View
              key={star}
              style={[
                styles.readOnlyStarBadge,
                size === 'sm' && styles.readOnlyStarBadgeSm,
                filled ? styles.readOnlyStarFilled : styles.readOnlyStarEmpty,
              ]}
            >
              <Icon
                name="star"
                size={iconSize}
                color={filled ? semantic.color.ratingStar : semantic.color.borderStrong}
              />
            </View>
          );
        })}
        {showNumeric ? (
          <Text style={styles.numericLabel}>{value > 0 ? `${value}/5` : '—'}</Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.interactiveRow} accessibilityRole="radiogroup" testID={testIDPrefix}>
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= value;
        const selected = star === value;
        return (
          <Pressable
            key={star}
            testID={`${testIDPrefix}-${star}`}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityLabel={`Chọn ${star} sao`}
            accessibilityState={{ selected, disabled }}
            onPress={() => onChange(star)}
            style={({ pressed }) => [
              styles.starButton,
              filled && styles.starButtonActive,
              selected && styles.starButtonSelected,
              disabled && styles.disabled,
              pressed && !disabled && styles.pressed,
            ]}
          >
            <Icon
              name="star"
              size={iconSize}
              color={filled ? semantic.color.ratingStar : semantic.color.textSecondary}
            />
            <Text style={[styles.starNum, filled && styles.starNumActive]}>{star}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  readOnlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  readOnlyStarBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: primitive.radius.xs,
    padding: 2,
  },
  readOnlyStarBadgeSm: {
    padding: 1,
  },
  readOnlyStarFilled: {
    backgroundColor: semantic.color.ratingBg,
  },
  readOnlyStarEmpty: {
    backgroundColor: 'transparent',
  },
  numericLabel: {
    ...semantic.type.micro,
    fontWeight: primitive.fontWeight.bold,
    fontVariant: ['tabular-nums'],
    color: semantic.color.textPrimary,
    marginLeft: primitive.space[1],
  },
  interactiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: primitive.space[2],
  },
  starButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: primitive.radius.lg,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
    backgroundColor: semantic.color.bgSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: primitive.space[2],
  },
  starButtonActive: {
    backgroundColor: semantic.color.ratingBg,
    borderColor: semantic.color.ratingStar,
  },
  starButtonSelected: {
    borderWidth: 1.5,
  },
  starNum: {
    ...semantic.type.micro,
    fontWeight: primitive.fontWeight.semibold,
    fontVariant: ['tabular-nums'],
    color: semantic.color.textSecondary,
  },
  starNumActive: {
    color: semantic.color.ratingText,
    fontWeight: primitive.fontWeight.bold,
  },
  disabled: {
    opacity: primitive.opacity.disabled,
  },
  pressed: {
    opacity: primitive.opacity.pressed,
  },
});

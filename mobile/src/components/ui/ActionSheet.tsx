import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { component, primitive, semantic } from '../../theme';
import { BottomSheet } from './BottomSheet';
import { Icon, type AppIconName } from './Icon';
import { HairlineDivider } from './LayoutPrimitives';

export interface ActionSheetOption {
  key: string;
  label: string;
  description?: string;
  icon?: AppIconName;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
}

export interface ActionSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  options: ActionSheetOption[];
  cancelLabel?: string;
  testID?: string;
}

export function ActionSheet({
  visible,
  onClose,
  title,
  subtitle,
  options,
  cancelLabel = 'Hủy',
  testID,
}: ActionSheetProps) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      scrollable={options.length > 6}
      testID={testID}
      contentStyle={styles.listContent}
      footerSlot={
        <Pressable
          testID={testID ? `${testID}-cancel` : 'action-sheet-cancel'}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
          style={({ pressed }) => [styles.cancelBtn, pressed && styles.cancelBtnPressed]}
        >
          <Text style={styles.cancelText}>{cancelLabel}</Text>
        </Pressable>
      }
    >
      {options.map((option, index) => {
        const fg = option.destructive ? semantic.color.danger : semantic.color.textPrimary;
        const iconColor = option.destructive
          ? semantic.color.danger
          : semantic.color.textSecondary;

        return (
          <Fragment key={option.key}>
            {index > 0 ? <HairlineDivider insetLeft={component.sheet.paddingX} /> : null}
            <Pressable
              testID={option.testID}
              disabled={option.disabled}
              onPress={() => {
                if (option.disabled) return;
                onClose();
                option.onPress();
              }}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityState={{ disabled: Boolean(option.disabled) }}
              style={({ pressed }) => [
                styles.row,
                option.disabled && styles.rowDisabled,
                pressed && !option.disabled && styles.rowPressed,
              ]}
            >
              {option.icon ? (
                <View style={styles.iconWrap}>
                  <Icon name={option.icon} size={18} color={iconColor} />
                </View>
              ) : null}
              <View style={styles.textWrap}>
                <Text style={[styles.rowLabel, { color: fg }]}>{option.label}</Text>
                {option.description ? (
                  <Text style={styles.rowDescription}>{option.description}</Text>
                ) : null}
              </View>
            </Pressable>
          </Fragment>
        );
      })}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 0,
    paddingVertical: primitive.space[1],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 50,
    paddingHorizontal: component.sheet.paddingX,
    paddingVertical: primitive.space[3],
    gap: primitive.space[3],
    backgroundColor: component.sheet.bg,
  },
  rowPressed: {
    backgroundColor: semantic.color.bgSubtle,
  },
  rowDisabled: {
    opacity: primitive.opacity.disabled,
  },
  iconWrap: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontSize: primitive.fontSize.base,
    lineHeight: primitive.lineHeight.base,
    fontWeight: primitive.fontWeight.medium,
  },
  rowDescription: {
    ...semantic.type.micro,
  },
  cancelBtn: {
    minHeight: component.button.minHeight,
    borderRadius: component.button.radius,
    backgroundColor: semantic.color.bgTrack,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnPressed: {
    opacity: primitive.opacity.pressed,
  },
  cancelText: {
    fontSize: primitive.fontSize.base,
    fontWeight: primitive.fontWeight.semibold,
    color: semantic.color.textPrimary,
  },
});

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  CANCEL_REASON_OPTIONS,
  type CancelReasonCode,
} from '../../transactions/types';
import { component, primitive, semantic } from '../../theme';
import { BottomSheet, FormField, Icon, InlineBanner } from '../ui';

export interface CancelRequestSheetProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (payload: { reasonCode: CancelReasonCode; reasonNote: string }) => Promise<void>;
  submitting?: boolean;
  error?: string | null;
}

const MAX_NOTE_LENGTH = 500;

export function CancelRequestSheet({
  visible,
  onClose,
  onSubmit,
  submitting = false,
  error,
}: CancelRequestSheetProps) {
  const [selectedCode, setSelectedCode] = useState<CancelReasonCode | null>(null);
  const [note, setNote] = useState('');
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (!visible) {
      setValidationError('');
    }
  }, [visible]);

  const selectedOption = CANCEL_REASON_OPTIONS.find((opt) => opt.code === selectedCode) ?? null;
  const requiresNote = Boolean(selectedOption?.requiresNote);

  const handleConfirm = async () => {
    if (submitting) return;
    if (!selectedCode) {
      setValidationError('Vui lòng chọn lý do hủy.');
      return;
    }
    const trimmed = note.trim();
    if (requiresNote && trimmed.length < 3) {
      setValidationError('Vui lòng nhập ít nhất 3 ký tự cho lý do khác.');
      return;
    }
    setValidationError('');
    await onSubmit({ reasonCode: selectedCode, reasonNote: trimmed });
  };

  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title="Yêu cầu hủy giao dịch"
      testID="cancel-request-sheet"
      footerSlot={
        <View style={styles.footerRow}>
          <Pressable
            testID="cancel-request-dismiss-btn"
            disabled={submitting}
            onPress={handleClose}
            accessibilityRole="button"
            accessibilityLabel="Đóng"
            style={({ pressed }) => [
              styles.secondaryBtn,
              submitting && styles.disabled,
              pressed && !submitting && styles.pressed,
            ]}
          >
            <Text style={styles.secondaryBtnText} numberOfLines={1}>
              Quay lại
            </Text>
          </Pressable>
          <Pressable
            testID="cancel-submit-btn"
            disabled={submitting || !selectedCode}
            onPress={() => void handleConfirm()}
            accessibilityRole="button"
            accessibilityLabel="Gửi yêu cầu hủy"
            accessibilityState={{ disabled: submitting || !selectedCode, busy: submitting }}
            style={({ pressed }) => [
              styles.destructiveBtn,
              (submitting || !selectedCode) && styles.disabled,
              pressed && !submitting && Boolean(selectedCode) && styles.pressed,
            ]}
          >
            <Text style={styles.destructiveBtnText} numberOfLines={1}>
              {submitting ? 'Đang gửi…' : 'Gửi yêu cầu hủy'}
            </Text>
          </Pressable>
        </View>
      }
    >
      <View style={styles.body}>
        <InlineBanner
          testID="cancel-mutual-warning"
          tone="warning"
          message="Cần bên kia đồng ý để hủy. Đồ vật vẫn được giữ trong lúc chờ."
        />

        <View style={styles.chipsSection}>
          <Text style={styles.fieldLabel}>Lý do hủy *</Text>
          <View style={styles.chipsWrap}>
            {CANCEL_REASON_OPTIONS.map((option) => {
              const selected = option.code === selectedCode;
              return (
                <Pressable
                  key={option.code}
                  testID={`cancel-reason-chip-${option.code}`}
                  disabled={submitting}
                  onPress={() => {
                    setSelectedCode(option.code);
                    setValidationError('');
                  }}
                  accessibilityRole="radio"
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected, disabled: submitting }}
                  style={({ pressed }) => [
                    styles.reasonChip,
                    selected && styles.reasonChipSelected,
                    pressed && !submitting && styles.pressed,
                  ]}
                >
                  <Icon
                    name={selected ? 'check-circle' : 'circle'}
                    size={15}
                    color={selected ? semantic.color.accent : semantic.color.textSecondary}
                  />
                  <Text
                    style={[
                      styles.reasonChipText,
                      selected && styles.reasonChipTextSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <FormField
          testID="cancel-reason-note-input"
          label={requiresNote ? 'Chi tiết lý do' : 'Ghi chú (không bắt buộc)'}
          required={requiresNote}
          placeholder="Mô tả ngắn gọn tình trạng thực tế…"
          multiline
          maxLength={MAX_NOTE_LENGTH}
          value={note}
          onChangeText={(next) => {
            setNote(next);
            if (validationError) setValidationError('');
          }}
          editable={!submitting}
          helperText={`${note.trim().length}/${MAX_NOTE_LENGTH} ký tự`}
          error={validationError || undefined}
        />

        {error ? <InlineBanner tone="danger" message={error} /> : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: primitive.space[4],
  },
  chipsSection: {
    gap: primitive.space[2],
  },
  fieldLabel: {
    ...semantic.type.label,
    color: semantic.color.textSecondary,
  },
  chipsWrap: {
    gap: primitive.space[2],
  },
  reasonChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2.5],
    paddingHorizontal: primitive.space[3],
    paddingVertical: primitive.space[2.5],
    borderRadius: primitive.radius.md,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
    backgroundColor: semantic.color.bgSurface,
  },
  reasonChipSelected: {
    borderColor: semantic.color.accent,
    backgroundColor: semantic.color.accentSoft,
  },
  reasonChipText: {
    ...semantic.type.body,
    fontSize: primitive.fontSize.sm,
    flex: 1,
  },
  reasonChipTextSelected: {
    color: semantic.color.accentDeep,
    fontWeight: primitive.fontWeight.semibold,
  },
  footerRow: {
    flexDirection: 'row',
    gap: primitive.space[2.5],
  },
  secondaryBtn: {
    flex: 1,
    minHeight: component.button.minHeight,
    borderRadius: component.button.radius,
    borderWidth: 1,
    borderColor: component.button.secondaryBorder,
    backgroundColor: component.button.secondaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: primitive.space[3],
  },
  secondaryBtnText: {
    fontSize: primitive.fontSize.base,
    fontWeight: primitive.fontWeight.semibold,
    color: component.button.secondaryFg,
  },
  destructiveBtn: {
    flex: 1.5,
    minHeight: component.button.minHeight,
    borderRadius: component.button.radius,
    backgroundColor: component.button.destructiveBg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: primitive.space[3],
  },
  destructiveBtnText: {
    fontSize: primitive.fontSize.base,
    fontWeight: primitive.fontWeight.semibold,
    color: semantic.color.textInverse,
  },
  disabled: {
    opacity: primitive.opacity.disabled,
  },
  pressed: {
    opacity: primitive.opacity.pressed,
  },
});

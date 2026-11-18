import { StyleSheet, Text, View } from 'react-native';
import { resolveUserRestriction, useSession, type AccountRestriction } from '../auth/session';
import { colors, radius, space } from '../theme';
import { Action } from './AuthUI';

function getRestrictionTitle(lockType: string | null): string {
  if (lockType === 'KHOA_TAM_THOI') return 'Tài khoản đang bị khóa tạm thời';
  if (lockType === 'KHOA_VINH_VIEN') return 'Tài khoản bị khóa vĩnh viễn';
  return 'Tài khoản đang bị hạn chế';
}

export function formatLockedUntil(lockedUntil: string): string {
  const parsed = new Date(lockedUntil);
  if (Number.isNaN(parsed.getTime())) {
    return lockedUntil;
  }
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(parsed);
  } catch {
    return parsed.toLocaleString('vi-VN');
  }
}

export function RestrictedAccountNotice({
  restriction: overrideRestriction,
}: {
  restriction?: AccountRestriction | null;
} = {}) {
  const sessionRestriction = useSession((state) => state.restriction);
  const sessionUser = useSession((state) => state.user);
  const dismissed = useSession((state) => state.restrictionDismissed);
  const restriction =
    overrideRestriction !== undefined
      ? overrideRestriction
      : sessionRestriction ?? (dismissed ? null : resolveUserRestriction(sessionUser));

  if (!restriction) return null;

  const title = getRestrictionTitle(restriction.lockType);
  const trimmedMessage = (restriction.message ?? '').trim();
  const showMessage =
    Boolean(trimmedMessage) &&
    trimmedMessage !== title &&
    trimmedMessage !== restriction.reason?.trim();

  return (
    <View
      testID="restricted-account-notice"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={styles.card}
    >
      <Text style={styles.title}>{title}</Text>
      {showMessage ? <Text style={styles.body}>{restriction.message}</Text> : null}
      {restriction.reason ? <Text style={styles.detail}>Lý do: {restriction.reason}</Text> : null}
      {restriction.lockedUntil ? (
        <Text style={styles.detail}>Mở khóa sau: {formatLockedUntil(restriction.lockedUntil)}</Text>
      ) : null}
      {typeof restriction.reputationScore === 'number' ? (
        <Text style={styles.detail}>Điểm uy tín: {restriction.reputationScore}</Text>
      ) : null}
      {restriction.appealable ? (
        <View style={styles.appealBox}>
          <Text style={styles.appealText}>
            Bạn có quyền gửi khiếu nại kèm bằng chứng tới Kiểm duyệt viên để được xem xét lại.
          </Text>
        </View>
      ) : null}
      <Action
        title="Đã hiểu"
        secondary
        testID="dismiss-restriction"
        onPress={() => useSession.getState().clearRestriction()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: '#fff0ec',
    borderWidth: 1,
    borderColor: '#e5b8af',
    gap: space.sm,
  },
  title: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: '700',
  },
  body: {
    color: colors.ink,
    lineHeight: 22,
  },
  detail: {
    color: colors.ink,
    fontWeight: '500',
    lineHeight: 22,
  },
  appealBox: {
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  appealText: {
    color: colors.ink,
    lineHeight: 20,
  },
});

export default RestrictedAccountNotice;

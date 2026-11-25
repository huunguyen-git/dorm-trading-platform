import { StyleSheet, Text, View } from 'react-native';
import { resolveUserRestriction, useSession, type AccountRestriction } from '../auth/session';
import { primitive, semantic } from '../theme';
import { Action } from './AuthUI';
import { HairlineDivider, Icon, type AppIconName } from './ui';

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

  const isTemporary = restriction.lockType === 'KHOA_TAM_THOI';
  const surfaceBg = isTemporary ? semantic.color.warningSoft : semantic.color.dangerSoft;
  const accentColor = isTemporary ? semantic.color.warning : semantic.color.danger;
  const iconName: AppIconName =
    restriction.lockType === 'KHOA_VINH_VIEN' ? 'lock' : 'alert-triangle';

  return (
    <View
      testID="restricted-account-notice"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.strip, { backgroundColor: surfaceBg }]}
    >
      <View style={styles.headerRow}>
        <View style={styles.iconWrap}>
          <Icon name={iconName} size={18} color={accentColor} />
        </View>
        <Text style={[styles.title, { color: accentColor }]}>{title}</Text>
      </View>

      {showMessage ? <Text style={styles.body}>{restriction.message}</Text> : null}

      <View style={styles.detailList}>
        {restriction.reason ? (
          <Text style={styles.detail}>Lý do: {restriction.reason}</Text>
        ) : null}
        {restriction.lockedUntil ? (
          <Text style={styles.detail}>
            Mở khóa sau: {formatLockedUntil(restriction.lockedUntil)}
          </Text>
        ) : null}
        {typeof restriction.reputationScore === 'number' ? (
          <Text style={styles.detail}>Điểm uy tín: {restriction.reputationScore}</Text>
        ) : null}
      </View>

      {restriction.appealable ? (
        <>
          <HairlineDivider />
          <View style={styles.appealRow}>
            <View style={styles.appealIcon}>
              <Icon name="shield" size={15} color={semantic.color.textSecondary} />
            </View>
            <Text style={styles.appealText}>
              Bạn có quyền gửi khiếu nại kèm bằng chứng tới Kiểm duyệt viên để được xem xét lại.
            </Text>
          </View>
        </>
      ) : null}

      <View style={styles.footerRow}>
        <Action
          title="Đã hiểu"
          variant="secondary"
          compact
          testID="dismiss-restriction"
          onPress={() => useSession.getState().clearRestriction()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    padding: primitive.space[4],
    borderRadius: primitive.radius.lg,
    gap: primitive.space[2.5],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2],
  },
  iconWrap: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...semantic.type.sectionTitle,
    flex: 1,
  },
  body: {
    ...semantic.type.body,
  },
  detailList: {
    gap: primitive.space[1],
  },
  detail: {
    ...semantic.type.caption,
    color: semantic.color.textPrimary,
    fontWeight: primitive.fontWeight.medium,
  },
  appealRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: primitive.space[2],
  },
  appealIcon: {
    paddingTop: 2,
  },
  appealText: {
    ...semantic.type.caption,
    color: semantic.color.textPrimary,
    flex: 1,
  },
  footerRow: {
    alignItems: 'flex-start',
    paddingTop: primitive.space[1],
  },
});

export default RestrictedAccountNotice;

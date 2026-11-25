import { useContext, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import type { Nav } from '../navigation';
import { api, RestrictedAccountError } from '../api/client';
import { resolveUserRestriction, useSession, type User } from '../auth/session';
import { Action, Field, Notice } from '../components/AuthUI';
import { RestrictedAccountNotice } from '../components/RestrictedAccountNotice';
import {
  BottomNavBar,
  HairlineDivider,
  Icon,
  SectionHeading,
  StatusIndicator,
  type BottomNavTab,
} from '../components/ui';
import { primitive, semantic } from '../theme';

function sanitizeProfileError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith('API ')) {
    return 'Không thể kết nối máy chủ. Vui lòng thử lại.';
  }
  return trimmed;
}

function getInitials(name?: string | null, email?: string | null): string {
  const cleaned = (name ?? '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .trim();
  if (cleaned) {
    const words = cleaned
      .split(/\s+/)
      .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
      .filter((token) => /^\p{L}/u.test(token));
    if (words.length >= 2) {
      const first = Array.from(words[0])[0] ?? '';
      const last = Array.from(words[words.length - 1])[0] ?? '';
      return `${first}${last}`.toUpperCase();
    }
    if (words.length === 1) {
      return Array.from(words[0]).slice(0, 2).join('').toUpperCase();
    }
  }
  const mailPrefix = ((email ?? '').trim().split('@')[0] ?? '').replace(/[^\p{L}\p{N}]/gu, '');
  return mailPrefix ? Array.from(mailPrefix).slice(0, 2).join('').toUpperCase() : '';
}

export default function ProfileScreen() {
  const nav = useNavigation<Nav>();
  const insets = useContext(SafeAreaInsetsContext);
  const user = useSession((s) => s.user);
  const sessionRestriction = useSession((s) => s.restriction);
  const restrictionDismissed = useSession((s) => s.restrictionDismissed);
  const isLocked = user?.accountStatus === 'BI_KHOA';
  const hasRestriction = Boolean(
    sessionRestriction ?? (restrictionDismissed ? null : resolveUserRestriction(user)),
  );
  const showPendingNotice = !isLocked && !user?.roles.includes('MEMBER');
  const [name, setName] = useState(user?.name ?? '');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const initials = getInitials(user?.name, user?.email);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      await action();
    } catch (e) {
      if (typeof RestrictedAccountError === 'function' && e instanceof RestrictedAccountError) {
        if (!useSession.getState().restriction) {
          useSession.setState({ restriction: e.restriction, restrictionDismissed: false });
        }
        setError('');
      } else {
        setError(sanitizeProfileError(e));
      }
    } finally {
      setBusy(false);
    }
  }

  const handleBottomNav = (target: BottomNavTab) => {
    if (target === 'Profile') return;
    if (target === 'CreateListing') {
      nav.navigate('CreateListing');
      return;
    }
    nav.navigate(target);
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: (insets?.top ?? 0) + primitive.space[3] }]}>
        <Text accessibilityRole="header" style={styles.topBarTitle}>
          Hồ sơ của bạn
        </Text>
      </View>

      <KeyboardAvoidingView
        style={styles.bodyWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Identity Summary Band */}
          <View style={styles.surfaceSection}>
            <View style={styles.identityRow}>
              <View style={styles.avatar}>
                {initials ? (
                  <Text style={styles.avatarText}>{initials}</Text>
                ) : (
                  <Icon name="user" size={22} color={semantic.color.accent} />
                )}
              </View>
              <View style={styles.identityMeta}>
                <Text style={styles.displayName} numberOfLines={1}>
                  {user?.name || 'Thành viên'}
                </Text>
                {user?.email ? (
                  <Text style={styles.emailText} numberOfLines={1}>
                    {user.email}
                  </Text>
                ) : null}
                {user?.studentId ? (
                  <Text style={styles.studentIdText}>MSSV · {user.studentId}</Text>
                ) : null}
              </View>
            </View>

            <View style={styles.statusRow}>
              <StatusIndicator
                variant="dot"
                tone={user?.emailVerified ? 'success' : 'warning'}
                label={user?.emailVerified ? 'Email đã xác minh' : 'Chưa xác minh email'}
              />
              <StatusIndicator
                variant="dot"
                tone={user?.profileApproved ? 'success' : 'warning'}
                label={user?.profileApproved ? 'Hồ sơ đã duyệt' : 'Hồ sơ chờ duyệt'}
              />
              {isLocked ? (
                <StatusIndicator
                  variant="urgent"
                  tone="danger"
                  icon="lock"
                  label="Tài khoản bị khóa"
                />
              ) : null}
            </View>
          </View>

          <HairlineDivider />

          {/* Account Alerts */}
          {hasRestriction || showPendingNotice ? (
            <View style={styles.noticeStack}>
              <RestrictedAccountNotice />
              {showPendingNotice ? (
                <Notice message="Bạn có thể sửa hồ sơ và xem mặt hàng. Cần xác minh email và duyệt hồ sơ trước khi giao dịch." />
              ) : null}
            </View>
          ) : (
            <View style={styles.sectionSpacer} />
          )}

          {/* Editable Profile Section */}
          <View style={styles.surfaceSection}>
            <SectionHeading
              title="Thông tin cá nhân"
              subtitle="Cập nhật họ tên hiển thị và đồng bộ trạng thái xác minh."
            />

            <Field
              label="Họ tên"
              testID="profile-name"
              maxLength={150}
              value={name}
              onChangeText={setName}
              editable={!busy && !isLocked}
            />

            <Notice message={message} tone="success" />
            <Notice message={error} error />

            <View style={styles.actionStack}>
              <Action
                title="Lưu họ tên"
                busy={busy}
                disabled={isLocked}
                onPress={() =>
                  void run(async () => {
                    if (!name.trim()) throw new Error('Họ tên không được để trống.');
                    const updated = await api<User>('/auth/profile', {
                      method: 'PATCH',
                      body: JSON.stringify({ name: name.trim() }),
                    });
                    useSession.setState({
                      user: updated,
                      restriction: resolveUserRestriction(updated),
                      restrictionDismissed: false,
                    });
                    setMessage('Đã lưu hồ sơ.');
                  })
                }
              />

              {!user?.emailVerified ? (
                <Action
                  title="Xác minh email"
                  variant="secondary"
                  icon="mail"
                  disabled={busy || isLocked}
                  onPress={() => nav.navigate('AuthFlow', { mode: 'verify' })}
                />
              ) : null}

              <Action
                title="Cập nhật trạng thái hồ sơ"
                variant="secondary"
                icon="refresh-cw"
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    const fresh = await api<User>('/auth/me');
                    useSession.setState({
                      user: fresh,
                      restriction: resolveUserRestriction(fresh),
                      restrictionDismissed: false,
                    });
                    setName(fresh.name);
                    setMessage('Đã cập nhật trạng thái hồ sơ.');
                  })
                }
              />
            </View>
          </View>

          <HairlineDivider />

          {/* Security & Session Section */}
          <View style={styles.surfaceSection}>
            <SectionHeading
              title="Bảo mật tài khoản"
              subtitle="Đổi mật khẩu giữ lại phiên này và đăng xuất các phiên khác."
            />

            <View style={styles.actionStack}>
              <Action
                title="Đổi mật khẩu"
                variant="secondary"
                icon="key"
                disabled={busy || isLocked}
                onPress={() => nav.navigate('AuthFlow', { mode: 'change' })}
              />

              <Action
                title="Đăng xuất thiết bị này"
                variant="destructive"
                icon="log-out"
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    await useSession.getState().logout();
                    nav.replace('Listings');
                  })
                }
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <BottomNavBar activeTab="Profile" onNavigate={handleBottomNav} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.color.bgPage,
  },
  topBar: {
    backgroundColor: semantic.color.bgSurface,
    paddingHorizontal: semantic.spacing.pageX,
    paddingBottom: primitive.space[3],
    borderBottomWidth: 1,
    borderBottomColor: semantic.color.borderHairline,
  },
  topBarTitle: {
    ...semantic.type.screenTitle,
  },
  bodyWrap: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: primitive.space[8],
  },
  surfaceSection: {
    backgroundColor: semantic.color.bgSurface,
    paddingHorizontal: semantic.spacing.pageX,
    paddingVertical: primitive.space[5],
    gap: primitive.space[4],
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[3],
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: primitive.fontSize.lg,
    fontWeight: primitive.fontWeight.bold,
    color: semantic.color.accent,
  },
  identityMeta: {
    flex: 1,
    gap: 2,
  },
  displayName: {
    ...semantic.type.sectionTitle,
  },
  emailText: {
    ...semantic.type.caption,
    color: semantic.color.textPrimary,
  },
  studentIdText: {
    ...semantic.type.micro,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: primitive.space[3],
  },
  noticeStack: {
    paddingHorizontal: semantic.spacing.pageX,
    paddingVertical: primitive.space[3],
    gap: primitive.space[2.5],
  },
  sectionSpacer: {
    height: primitive.space[3],
  },
  actionStack: {
    gap: primitive.space[2.5],
  },
});

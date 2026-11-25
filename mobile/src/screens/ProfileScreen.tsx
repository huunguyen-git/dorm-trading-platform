import { useCallback, useContext, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import type { Nav } from '../navigation';
import { api, RestrictedAccountError } from '../api/client';
import { resolveUserRestriction, useSession, type User } from '../auth/session';
import { profileApi, statusLabel, type Profile, type ProfileUpdate } from '../profile/api';
import { useSellerListings } from '../listings/sellerStore';
import { formatReputationSummary } from '../listings/types';
import { Action, Field, Notice } from '../components/AuthUI';
import { RestrictedAccountNotice } from '../components/RestrictedAccountNotice';
import {
  BottomNavBar,
  HairlineDivider,
  Icon,
  SectionHeading,
  SegmentedControl,
  StatusIndicator,
  type BottomNavTab,
} from '../components/ui';
import { primitive, semantic } from '../theme';

type Draft = { [K in keyof Required<ProfileUpdate>]: string };

const emptyDraft: Draft = {
  name: '',
  studentId: '',
  phone: '',
  school: '',
  campus: '',
  major: '',
  cohort: '',
  studyStatus: '',
};

const toDraft = (p: Profile): Draft => ({
  name: p.name ?? '',
  studentId: p.studentId ?? '',
  phone: p.phone ?? '',
  school: p.school ?? '',
  campus: p.campus ?? '',
  major: p.major ?? '',
  cohort: p.cohort ?? '',
  studyStatus: p.studyStatus ?? '',
});

const STUDY_OPTIONS: { value: 'DANG_HOC' | 'DA_TOT_NGHIEP'; label: string }[] = [
  { value: 'DANG_HOC', label: 'Đang học' },
  { value: 'DA_TOT_NGHIEP', label: 'Đã tốt nghiệp' },
];

const studyLabel = (value: string | null) =>
  value === 'DA_TOT_NGHIEP' ? 'Đã tốt nghiệp' : 'Đang học';

const MAX_CARD_BYTES = 5 * 1024 * 1024;

const isProfileLocked = (p: Profile) =>
  p.accountStatus === 'BI_KHOA' || p.accountStatus === 'VO_HIEU_HOA';

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
  const token = useSession((s) => s.token);
  const sessionUser = useSession((s) => s.user);
  const sessionRestriction = useSession((s) => s.restriction);
  const restrictionDismissed = useSession((s) => s.restrictionDismissed);
  const quota = useSellerListings((s) => s.quota);
  const loadQuota = useSellerListings((s) => s.loadQuota);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [cardUri, setCardUri] = useState<string | null>(null);
  const [pick, setPick] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const isLocked = Boolean(
    (profile && isProfileLocked(profile)) ||
    sessionUser?.accountStatus === 'BI_KHOA' ||
    sessionUser?.accountStatus === 'VO_HIEU_HOA',
  );
  const hasRestriction = Boolean(
    sessionRestriction ?? (restrictionDismissed ? null : resolveUserRestriction(sessionUser)),
  );
  const isActiveMember = Boolean(token && sessionUser?.roles.includes('MEMBER') && !isLocked);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const fresh = await profileApi.me();
      setProfile(fresh);
      setDraft(toDraft(fresh));
      setCardUri(fresh.hasStudentCard ? await profileApi.cardUri(fresh.id) : null);
      // Hồ sơ đổi trạng thái thì quyền MEMBER cũng đổi: đồng bộ lại phiên để nút giao dịch bật/tắt đúng.
      const sessionFresh = await api<User>('/auth/me');
      useSession.setState({
        user: sessionFresh,
        restriction: resolveUserRestriction(sessionFresh),
        restrictionDismissed: false,
      });
    } catch (e) {
      setError(sanitizeProfileError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const syncQuota = useCallback(() => {
    if (!isActiveMember) return;
    void loadQuota().catch(() => { });
  }, [isActiveMember, loadQuota]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    syncQuota();
  }, [syncQuota]);

  useEffect(() => {
    if (typeof nav?.addListener !== 'function') return;
    return nav.addListener('focus', syncQuota);
  }, [nav, syncQuota]);

  async function chooseCard() {
    setError('');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > MAX_CARD_BYTES) {
      setError('Ảnh thẻ tối đa 5MB.');
      return;
    }
    const type = asset.mimeType ?? 'image/jpeg';
    if (type !== 'image/jpeg' && type !== 'image/png') {
      setError('Ảnh thẻ chỉ nhận JPEG hoặc PNG.');
      return;
    }
    setPick({ uri: asset.uri, name: asset.fileName ?? 'the-sinh-vien.jpg', type });
    setCardUri(asset.uri);
  }

  async function save() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (!draft.name.trim() || !draft.studentId.trim()) {
        throw new Error('Nhập họ tên và MSSV.');
      }
      if (draft.phone.trim() && !/^\+?[0-9][0-9 -]{7,19}$/.test(draft.phone.trim())) {
        throw new Error('Số điện thoại không hợp lệ.');
      }
      // Gửi chuỗi rỗng cho trường tùy chọn để xóa được giá trị cũ (server hiểu null là "giữ nguyên").
      const body = Object.fromEntries(
        Object.entries(draft).map(([key, value]) => [key, value.trim()]),
      ) as ProfileUpdate;
      const updated = await profileApi.update(body);
      // Phần chữ đã lưu trên server: cập nhật ngay để lỗi tải ảnh (413/mạng) không làm UI hiện sai.
      setProfile(updated);
      setDraft(toDraft(updated));
      if (pick) {
        await profileApi.uploadCard(pick);
        setPick(null);
      }
      const fresh = pick ? await profileApi.me() : updated;
      setProfile(fresh);
      setDraft(toDraft(fresh));
      setCardUri(fresh.hasStudentCard ? await profileApi.cardUri(fresh.id) : null);
      // Tên hiệu lực chỉ đổi sau khi duyệt: đồng bộ lại phiên để header/nút giao dịch khớp trạng thái thật.
      const sessionFresh = await api<User>('/auth/me');
      useSession.setState({
        user: sessionFresh,
        restriction: resolveUserRestriction(sessionFresh),
      });
      setEditing(false);
      setMessage(
        fresh.profileStatus === 'CHO_DUYET'
          ? 'Đã lưu. Thông tin định danh đang chờ kiểm duyệt.'
          : 'Đã lưu hồ sơ.',
      );
    } catch (e) {
      // Hạn chế tài khoản đã có banner riêng; báo thêm lỗi đỏ ở đây là trùng.
      if (typeof RestrictedAccountError === 'function' && e instanceof RestrictedAccountError) {
        if (!useSession.getState().restriction) {
          useSession.setState({ restriction: e.restriction, restrictionDismissed: false });
        }
        return;
      }
      setError(sanitizeProfileError(e));
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setDraft(profile ? toDraft(profile) : emptyDraft);
    setPick(null);
    setEditing(false);
    setError('');
    setMessage('');
  }

  const handleBottomNav = (target: BottomNavTab) => {
    if (target === 'Profile') return;
    if (target === 'CreateListing') {
      nav.navigate('CreateListing');
      return;
    }
    nav.navigate(target);
  };

  const displayName = profile?.name || sessionUser?.name || 'Thành viên';
  const displayEmail = sessionUser?.email ?? profile?.email ?? '';
  const displayStudentId = profile?.studentId || sessionUser?.studentId || '';
  const initials = getInitials(displayName, displayEmail);
  const reputationScore = quota && quota.limit > 0 ? quota.reputationScore : profile?.reputation;
  const reputationSummary =
    typeof reputationScore === 'number' ? formatReputationSummary(reputationScore) : null;

  const status = profile ? statusLabel(profile) : null;
  const statusTone =
    status?.tone === 'ok' ? 'success' : status?.tone === 'danger' ? 'danger' : 'warning';

  const rows: [string, string | null][] = profile
    ? [
      ['Họ tên', profile.name],
      ['MSSV', profile.studentId],
      // Đổi email ở Cài đặt thì phiên đã mới nhưng hồ sơ vừa tải còn cũ: lấy theo phiên.
      ['Email', sessionUser?.email ?? profile.email],
      ['Số điện thoại', profile.phone],
      ['Trường', profile.school],
      ['Cơ sở', profile.campus],
      ['Ngành học', profile.major],
      ['Niên khóa', profile.cohort],
      ['Tình trạng học tập', studyLabel(profile.studyStatus)],
    ]
    : [];

  return (
    <View style={styles.screen}>
      {/* Branded Terracotta Identity Header */}
      <View style={[styles.heroHeader, { paddingTop: (insets?.top ?? 0) + primitive.space[3] }]}>
        <Text accessibilityRole="header" style={styles.heroTitle}>
          Hồ sơ của bạn
        </Text>

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
              {displayName}
            </Text>
            {displayEmail ? (
              <Text style={styles.emailText} numberOfLines={1}>
                {displayEmail}
              </Text>
            ) : null}
            {displayStudentId ? (
              <Text style={styles.studentIdText}>MSSV · {displayStudentId}</Text>
            ) : null}
          </View>
        </View>
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
          {loading ? (
            <View style={styles.centerState}>
              <ActivityIndicator size="small" color={semantic.color.accent} />
              <Text style={styles.centerStateText}>Đang tải hồ sơ…</Text>
            </View>
          ) : !profile ? (
            <View style={styles.surfaceSection}>
              <RestrictedAccountNotice />
              <Notice message={error || 'Không tải được hồ sơ.'} error />
              <View style={styles.actionStack}>
                <Action title="Thử lại" onPress={() => void load()} />
                <Action
                  title="Về trang tin đăng"
                  variant="secondary"
                  onPress={() => nav.navigate('Listings')}
                />
              </View>
            </View>
          ) : (
            <>
              {/* Verification Status Bar */}
              <View style={styles.statusBand}>
                <View style={styles.statusRow}>
                  {status ? (
                    <StatusIndicator variant="dot" tone={statusTone} label={status.text} />
                  ) : null}
                  <StatusIndicator
                    variant="dot"
                    tone={profile.emailVerified ? 'success' : 'warning'}
                    label={profile.emailVerified ? 'Email đã xác minh' : 'Chưa xác minh email'}
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

              {/* Active Member Reputation & Quick Commerce Shortcuts */}
              {isActiveMember ? (
                <>
                  <View style={styles.surfaceSection} testID="profile-commerce-hub">
                    <SectionHeading
                      title="Hoạt động trao đổi"
                      subtitle="Theo dõi điểm uy tín, hạn mức đăng tin và quản lý đồ dùng."
                    />

                    {reputationSummary ? (
                      <View style={styles.statsRow}>
                        <View style={styles.statTile}>
                          <View style={styles.statIconRow}>
                            <Icon name="shield" size={14} color={semantic.color.accent} />
                            <Text style={styles.statValue}>{reputationScore}</Text>
                          </View>
                          <Text style={styles.statLabel}>{reputationSummary.tierLabel}</Text>
                        </View>
                        {quota && quota.limit > 0 ? (
                          <View style={styles.statTile}>
                            <View style={styles.statIconRow}>
                              <Icon name="tag" size={14} color={semantic.color.freeFg} />
                              <Text style={styles.statValue}>
                                {quota.activeCount}/{quota.limit}
                              </Text>
                            </View>
                            <Text style={styles.statLabel}>Hạn mức tin đang mở</Text>
                          </View>
                        ) : null}
                      </View>
                    ) : null}

                    <View style={styles.quickLinksRow}>
                      <Pressable
                        testID="profile-shortcut-my-listings"
                        accessibilityRole="button"
                        accessibilityLabel="Mở Tin của tôi"
                        onPress={() => nav.navigate('MyListings')}
                        style={({ pressed }) => [styles.quickLinkTile, pressed && styles.tilePressed]}
                      >
                        <View style={styles.quickLinkIcon}>
                          <Icon name="layers" size={18} color={semantic.color.accent} />
                        </View>
                        <View style={styles.quickLinkTextWrap}>
                          <Text style={styles.quickLinkTitle}>Tin của tôi</Text>
                          <Text style={styles.quickLinkSub}>Quản lý & gia hạn</Text>
                        </View>
                        <Icon name="chevron-right" size={15} color={semantic.color.textSecondary} />
                      </Pressable>

                      <Pressable
                        testID="profile-shortcut-inventory"
                        accessibilityRole="button"
                        accessibilityLabel="Mở Kho đồ cá nhân"
                        onPress={() => nav.navigate('InventoryList')}
                        style={({ pressed }) => [styles.quickLinkTile, pressed && styles.tilePressed]}
                      >
                        <View style={[styles.quickLinkIcon, styles.quickLinkIconEmerald]}>
                          <Icon name="package" size={18} color={semantic.color.freeFg} />
                        </View>
                        <View style={styles.quickLinkTextWrap}>
                          <Text style={styles.quickLinkTitle}>Kho đồ</Text>
                          <Text style={styles.quickLinkSub}>Đồ dùng cá nhân</Text>
                        </View>
                        <Icon name="chevron-right" size={15} color={semantic.color.textSecondary} />
                      </Pressable>
                    </View>

                    <Pressable
                      testID="profile-shortcut-orders"
                      accessibilityRole="button"
                      accessibilityLabel="Mở Giao dịch của tôi"
                      onPress={() => nav.navigate('Orders')}
                      style={({ pressed }) => [styles.quickLinkTile, pressed && styles.tilePressed]}
                    >
                      <View style={styles.quickLinkIcon}>
                        <Icon name="shopping-bag" size={18} color={semantic.color.accent} />
                      </View>
                      <View style={styles.quickLinkTextWrap}>
                        <Text style={styles.quickLinkTitle}>Giao dịch của tôi</Text>
                        <Text style={styles.quickLinkSub}>Giữ chỗ, lịch hẹn & theo dõi giao nhận</Text>
                      </View>
                      <Icon name="chevron-right" size={15} color={semantic.color.textSecondary} />
                    </Pressable>
                  </View>
                  <HairlineDivider />
                </>
              ) : null}

              {/* Account Alerts */}
              {hasRestriction ||
                status?.tone === 'danger' ||
                status?.tone === 'warn' ||
                (!isLocked && !profile.profileApproved) ||
                isLocked ||
                !profile.emailVerified ? (
                <View style={styles.noticeStack}>
                  <RestrictedAccountNotice />
                  {status?.tone === 'danger' ? (
                    <Notice
                      message={`Lý do từ chối: ${status.note || 'Kiểm duyệt viên chưa ghi lý do.'}`}
                      error
                    />
                  ) : null}
                  {status?.tone === 'warn' && status.note ? <Notice message={status.note} /> : null}
                  {!isLocked && !profile.profileApproved ? (
                    <Notice message="Bạn vẫn xem được mặt hàng và sửa hồ sơ. Cần được duyệt trước khi giao dịch." />
                  ) : null}
                  {isLocked ? (
                    <Notice
                      message="Tài khoản đang bị khóa nên không thể lưu thay đổi hồ sơ."
                      error
                    />
                  ) : null}
                  {!profile.emailVerified ? (
                    <Action
                      title="Xác minh email"
                      variant="secondary"
                      icon="mail"
                      disabled={busy || isLocked}
                      onPress={() => nav.navigate('AuthFlow', { mode: 'verify' })}
                    />
                  ) : null}
                </View>
              ) : (
                <View style={styles.sectionSpacer} />
              )}

              {/* Profile Details / Edit Section */}
              <View style={styles.surfaceSection}>
                <SectionHeading
                  title="Thông tin cá nhân"
                  subtitle={
                    editing
                      ? 'Cập nhật định danh sinh viên, thông tin liên hệ và ảnh thẻ.'
                      : 'Thông tin định danh dùng để xác thực tài khoản và trao đổi an toàn.'
                  }
                />

                {editing ? (
                  <>
                    <Field
                      label="Họ tên"
                      testID="profile-name"
                      maxLength={150}
                      value={draft.name}
                      onChangeText={(name) => setDraft({ ...draft, name })}
                      editable={!busy}
                    />
                    <Field
                      label="MSSV"
                      testID="profile-student-id"
                      maxLength={20}
                      value={draft.studentId}
                      onChangeText={(studentId) => setDraft({ ...draft, studentId })}
                      editable={!busy}
                    />
                    <Field
                      label="Số điện thoại"
                      testID="profile-phone"
                      maxLength={20}
                      keyboardType="phone-pad"
                      value={draft.phone}
                      onChangeText={(phone) => setDraft({ ...draft, phone })}
                      editable={!busy}
                      hint="Chỉ đổi số điện thoại thì lưu ngay, không cần duyệt lại."
                    />
                    <Field
                      label="Trường"
                      maxLength={150}
                      value={draft.school}
                      onChangeText={(school) => setDraft({ ...draft, school })}
                      editable={!busy}
                    />
                    <Field
                      label="Cơ sở"
                      maxLength={150}
                      value={draft.campus}
                      onChangeText={(campus) => setDraft({ ...draft, campus })}
                      editable={!busy}
                    />
                    <Field
                      label="Ngành học"
                      maxLength={150}
                      value={draft.major}
                      onChangeText={(major) => setDraft({ ...draft, major })}
                      editable={!busy}
                    />
                    <Field
                      label="Niên khóa"
                      maxLength={50}
                      value={draft.cohort}
                      onChangeText={(cohort) => setDraft({ ...draft, cohort })}
                      editable={!busy}
                      hint="Đổi định danh, học tập hoặc ảnh thẻ sẽ chuyển hồ sơ sang chờ duyệt."
                    />

                    <View style={styles.fieldBlock}>
                      <Text style={styles.fieldLabel}>Tình trạng học tập</Text>
                      <SegmentedControl
                        options={STUDY_OPTIONS}
                        value={
                          draft.studyStatus === 'DA_TOT_NGHIEP' ? 'DA_TOT_NGHIEP' : 'DANG_HOC'
                        }
                        onChange={(value) => setDraft({ ...draft, studyStatus: value })}
                        disabled={busy}
                      />
                    </View>

                    <View style={styles.fieldBlock}>
                      <Text style={styles.fieldLabel}>Ảnh thẻ sinh viên</Text>
                      {cardUri ? (
                        <Image
                          testID="profile-card-preview"
                          source={{ uri: cardUri }}
                          style={styles.cardPreview}
                          resizeMode="contain"
                          accessibilityLabel="Ảnh thẻ sinh viên"
                        />
                      ) : (
                        <Text style={styles.mutedHint}>Chưa có ảnh thẻ.</Text>
                      )}
                      <Action
                        title={pick ? 'Chọn ảnh khác' : 'Tải ảnh thẻ'}
                        variant="secondary"
                        icon="image"
                        disabled={busy}
                        onPress={() => void chooseCard()}
                      />
                      <Text style={styles.mutedHint}>JPEG hoặc PNG, tối đa 5MB.</Text>
                    </View>

                    <Notice message={message} tone="success" />
                    <Notice message={error} error />

                    <View style={styles.actionStack}>
                      <Action
                        title="Lưu"
                        testID="profile-save"
                        busy={busy}
                        disabled={isLocked}
                        onPress={() => void save()}
                      />
                      <Action title="Hủy" variant="secondary" disabled={busy} onPress={cancel} />
                    </View>
                  </>
                ) : (
                  <>
                    <View style={styles.detailList}>
                      {rows.map(([label, value], index) => (
                        <View
                          key={label}
                          style={[styles.detailRow, index > 0 && styles.detailRowBorder]}
                        >
                          <Text style={styles.detailLabel}>{label}</Text>
                          <Text style={styles.detailValue}>{value || 'Chưa cập nhật'}</Text>
                        </View>
                      ))}
                    </View>

                    <View style={styles.fieldBlock}>
                      <Text style={styles.fieldLabel}>Ảnh thẻ sinh viên</Text>
                      {cardUri ? (
                        <Image
                          testID="profile-card-preview"
                          source={{ uri: cardUri }}
                          style={styles.cardPreview}
                          resizeMode="contain"
                          accessibilityLabel="Ảnh thẻ sinh viên"
                        />
                      ) : (
                        <Text style={styles.mutedHint}>Chưa có ảnh thẻ sinh viên.</Text>
                      )}
                    </View>

                    <Notice message={message} tone="success" />
                    <Notice message={error} error />

                    <View style={styles.actionStack}>
                      <Action
                        title="Cập nhật hồ sơ"
                        testID="profile-edit"
                        icon="edit-2"
                        disabled={isLocked}
                        onPress={() => {
                          setEditing(true);
                          setMessage('');
                          setError('');
                        }}
                      />
                      <Action
                        title="Cài đặt tài khoản"
                        variant="secondary"
                        icon="settings"
                        disabled={busy}
                        onPress={() => nav.navigate('Settings')}
                      />
                      <Action
                        title="Tải lại hồ sơ"
                        variant="secondary"
                        icon="refresh-cw"
                        disabled={busy}
                        onPress={() => void load()}
                      />
                    </View>
                  </>
                )}
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <BottomNavBar activeTab="Profile" onNavigate={handleBottomNav} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.color.bgCanvas,
  },
  heroHeader: {
    backgroundColor: semantic.color.accent,
    paddingHorizontal: semantic.spacing.pageX,
    paddingBottom: primitive.space[5],
    gap: primitive.space[3],
  },
  heroTitle: {
    ...semantic.type.screenTitle,
    color: semantic.color.textInverse,
  },
  bodyWrap: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: primitive.space[8],
  },
  centerState: {
    paddingVertical: primitive.space[8],
    alignItems: 'center',
    justifyContent: 'center',
    gap: primitive.space[2.5],
  },
  centerStateText: {
    ...semantic.type.caption,
  },
  statusBand: {
    backgroundColor: semantic.color.bgSurface,
    paddingHorizontal: semantic.spacing.pageX,
    paddingVertical: primitive.space[3],
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
    width: 54,
    height: 54,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.bgSurface,
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
    fontSize: primitive.fontSize.lg,
    lineHeight: 24,
    fontWeight: primitive.fontWeight.bold,
    color: semantic.color.textInverse,
  },
  emailText: {
    ...semantic.type.caption,
    color: semantic.color.textInverseMuted,
  },
  studentIdText: {
    ...semantic.type.micro,
    color: semantic.color.textInverseMuted,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: primitive.space[3],
  },
  statsRow: {
    flexDirection: 'row',
    gap: primitive.space[2.5],
  },
  statTile: {
    flex: 1,
    backgroundColor: semantic.color.bgSubtle,
    borderRadius: primitive.radius.md,
    paddingHorizontal: primitive.space[3],
    paddingVertical: primitive.space[3],
    gap: 4,
  },
  statIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1.5],
  },
  statValue: {
    fontSize: primitive.fontSize.xl,
    lineHeight: 26,
    fontWeight: primitive.fontWeight.bold,
    fontVariant: ['tabular-nums'],
    color: semantic.color.textPrimary,
  },
  statLabel: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
  },
  quickLinksRow: {
    flexDirection: 'row',
    gap: primitive.space[2.5],
  },
  quickLinkTile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2],
    backgroundColor: semantic.color.bgSubtle,
    borderRadius: primitive.radius.md,
    paddingHorizontal: primitive.space[2.5],
    paddingVertical: primitive.space[2.5],
  },
  tilePressed: {
    opacity: primitive.opacity.pressed,
  },
  quickLinkIcon: {
    width: 34,
    height: 34,
    borderRadius: primitive.radius.md,
    backgroundColor: semantic.color.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLinkIconEmerald: {
    backgroundColor: semantic.color.freeBg,
  },
  quickLinkTextWrap: {
    flex: 1,
    gap: 1,
  },
  quickLinkTitle: {
    ...semantic.type.label,
    fontSize: primitive.fontSize.sm,
  },
  quickLinkSub: {
    fontSize: 11,
    lineHeight: 14,
    color: semantic.color.textSecondary,
  },
  noticeStack: {
    paddingHorizontal: semantic.spacing.pageX,
    paddingVertical: primitive.space[3],
    gap: primitive.space[2.5],
  },
  sectionSpacer: {
    height: primitive.space[2],
  },
  detailList: {
    gap: 0,
  },
  detailRow: {
    paddingVertical: primitive.space[2.5],
    gap: 2,
  },
  detailRowBorder: {
    borderTopWidth: 1,
    borderTopColor: semantic.color.borderHairline,
  },
  detailLabel: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
  },
  detailValue: {
    ...semantic.type.body,
    fontWeight: primitive.fontWeight.medium,
  },
  fieldBlock: {
    gap: primitive.space[2],
  },
  fieldLabel: {
    ...semantic.type.label,
    color: semantic.color.textSecondary,
  },
  cardPreview: {
    width: '100%',
    height: 200,
    borderRadius: primitive.radius.md,
    backgroundColor: semantic.color.bgSubtle,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
  },
  mutedHint: {
    ...semantic.type.caption,
  },
  actionStack: {
    gap: primitive.space[2.5],
  },
});

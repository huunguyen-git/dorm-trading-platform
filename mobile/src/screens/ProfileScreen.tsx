import { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import type { Nav } from '../navigation';
import { Action, AuthScreen, Field, Notice, ui } from '../components/AuthUI';
import { RestrictedAccountNotice } from '../components/RestrictedAccountNotice';
import { useSession, resolveUserRestriction, type User } from '../auth/session';
import { api } from '../api/client';
import { colors, space } from '../theme';
import { profileApi, statusLabel, type Profile, type ProfileUpdate } from '../profile/api';

type Draft = { [K in keyof Required<ProfileUpdate>]: string };
const empty: Draft = { name: '', studentId: '', phone: '', school: '', campus: '', major: '', cohort: '' };
const toDraft = (p: Profile): Draft => ({ name: p.name ?? '', studentId: p.studentId ?? '', phone: p.phone ?? '', school: p.school ?? '', campus: p.campus ?? '', major: p.major ?? '', cohort: p.cohort ?? '' });
const MAX_CARD_BYTES = 5 * 1024 * 1024;
const locked = (p: Profile) => p.accountStatus === 'BI_KHOA' || p.accountStatus === 'VO_HIEU_HOA';

export default function ProfileScreen() {
  const nav = useNavigation<Nav>();
  const sessionUser = useSession((s) => s.user);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [cardUri, setCardUri] = useState<string | null>(null);
  const [pick, setPick] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [draft, setDraft] = useState<Draft>(empty);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const fresh = await profileApi.me();
      setProfile(fresh); setDraft(toDraft(fresh));
      setCardUri(fresh.hasStudentCard ? await profileApi.cardUri(fresh.id) : null);
      // Hồ sơ đổi trạng thái thì quyền MEMBER cũng đổi: đồng bộ lại phiên để nút giao dịch bật/tắt đúng.
      const sessionFresh = await api<User>('/auth/me');
      useSession.setState({
        user: sessionFresh,
        restriction: resolveUserRestriction(sessionFresh),
        restrictionDismissed: false,
      });
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function chooseCard() {
    setError('');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > MAX_CARD_BYTES) { setError('Ảnh thẻ tối đa 5MB.'); return; }
    const type = asset.mimeType ?? 'image/jpeg';
    if (type !== 'image/jpeg' && type !== 'image/png') { setError('Ảnh thẻ chỉ nhận JPEG hoặc PNG.'); return; }
    setPick({ uri: asset.uri, name: asset.fileName ?? 'the-sinh-vien.jpg', type });
    setCardUri(asset.uri);
  }

  async function save() {
    setBusy(true); setError(''); setMessage('');
    try {
      if (!draft.name.trim() || !draft.studentId.trim()) throw new Error('Nhập họ tên và MSSV.');
      if (draft.phone.trim() && !/^\+?[0-9][0-9 -]{7,19}$/.test(draft.phone.trim())) throw new Error('Số điện thoại không hợp lệ.');
      // Gửi chuỗi rỗng cho trường tuỳ chọn để xoá được giá trị cũ (server hiểu null là "giữ nguyên").
      const body = Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value.trim()])) as ProfileUpdate;
      const updated = await profileApi.update(body);
      if (pick) { await profileApi.uploadCard(pick); setPick(null); }
      const fresh = pick ? await profileApi.me() : updated;
      setProfile(fresh); setDraft(toDraft(fresh));
      setCardUri(fresh.hasStudentCard ? await profileApi.cardUri(fresh.id) : null);
      setEditing(false);
      setMessage(fresh.profileStatus === 'CHO_DUYET' ? 'Đã lưu. Thông tin định danh đang chờ kiểm duyệt.' : 'Đã lưu hồ sơ.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  function cancel() { setDraft(profile ? toDraft(profile) : empty); setPick(null); setEditing(false); setError(''); setMessage(''); }

  if (loading) return <AuthScreen title="Hồ sơ của bạn"><Text style={ui.caption}>Đang tải hồ sơ…</Text></AuthScreen>;
  if (!profile) return <AuthScreen title="Hồ sơ của bạn">
    <RestrictedAccountNotice />
    <Notice message={error || 'Không tải được hồ sơ.'} error />
    <Action title="Thử lại" onPress={() => void load()} />
    <Action title="Về trang tin đăng" secondary onPress={() => nav.navigate('Listings')} />
  </AuthScreen>;

  const status = statusLabel(profile);
  const readOnly = locked(profile) || sessionUser?.accountStatus === 'BI_KHOA';
  const rows: [string, string | null][] = [
    ['Họ tên', profile.name], ['MSSV', profile.studentId], ['Email', profile.email], ['Số điện thoại', profile.phone],
    ['Trường', profile.school], ['Cơ sở', profile.campus], ['Ngành học', profile.major], ['Niên khóa', profile.cohort],
  ];
  return <AuthScreen title="Hồ sơ của bạn">
    <RestrictedAccountNotice />
    <View style={[ui.row, { alignItems: 'center' }]}>
      <Text style={[ui.badge, status.tone === 'ok' && { backgroundColor: '#eef3ec', color: '#36532c' }, status.tone === 'danger' && { backgroundColor: '#fff0ec', color: colors.danger }]}>{status.text}</Text>
      <Text style={ui.badge}>Điểm uy tín · {profile.reputation}</Text>
      <Text style={ui.badge}>{profile.emailVerified ? 'Email đã xác minh' : 'Chưa xác minh email'}</Text>
    </View>
    {status.tone === 'danger' && <Notice message={`Lý do từ chối: ${status.note || 'Kiểm duyệt viên chưa ghi lý do.'}`} error />}
    {status.tone === 'warn' && <Notice message={status.note} />}
    {!readOnly && !profile.profileApproved && <Notice message="Bạn vẫn xem được mặt hàng và sửa hồ sơ. Cần được duyệt trước khi giao dịch." />}
    {readOnly && <Notice message="Tài khoản đang bị khóa nên không thể lưu thay đổi hồ sơ." error />}
    {!profile.emailVerified && <Action title="Xác minh email" secondary disabled={busy} onPress={() => nav.navigate('AuthFlow', { mode: 'verify' })} />}

    {editing ? <>
      <Field label="Họ tên" testID="profile-name" maxLength={150} value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} editable={!busy} />
      <Field label="MSSV" testID="profile-student-id" maxLength={20} value={draft.studentId} onChangeText={(studentId) => setDraft({ ...draft, studentId })} editable={!busy} />
      <Field label="Số điện thoại" testID="profile-phone" maxLength={20} keyboardType="phone-pad" value={draft.phone} onChangeText={(phone) => setDraft({ ...draft, phone })} editable={!busy} hint="Chỉ đổi số điện thoại thì lưu ngay, không cần duyệt lại." />
      <Field label="Trường" maxLength={150} value={draft.school} onChangeText={(school) => setDraft({ ...draft, school })} editable={!busy} />
      <Field label="Cơ sở" maxLength={150} value={draft.campus} onChangeText={(campus) => setDraft({ ...draft, campus })} editable={!busy} />
      <Field label="Ngành học" maxLength={150} value={draft.major} onChangeText={(major) => setDraft({ ...draft, major })} editable={!busy} />
      <Field label="Niên khóa" maxLength={50} value={draft.cohort} onChangeText={(cohort) => setDraft({ ...draft, cohort })} editable={!busy} hint="Đổi định danh, học tập hoặc ảnh thẻ sẽ chuyển hồ sơ sang chờ duyệt." />
      <View style={{ gap: space.sm }}>
        <Text style={ui.label}>Ảnh thẻ sinh viên</Text>
        {cardUri ? <Image testID="profile-card-preview" source={{ uri: cardUri }} style={{ width: '100%', height: 200, borderRadius: 10, backgroundColor: '#f2ede4' }} resizeMode="contain" accessibilityLabel="Ảnh thẻ sinh viên" /> : <Text style={ui.caption}>Chưa có ảnh thẻ.</Text>}
        <Action title={pick ? 'Chọn ảnh khác' : 'Tải ảnh thẻ'} secondary disabled={busy} onPress={() => void chooseCard()} />
        <Text style={ui.caption}>JPEG hoặc PNG, tối đa 5MB.</Text>
      </View>
      <Notice message={message} /><Notice message={error} error />
      <Action title="Lưu" testID="profile-save" busy={busy} disabled={readOnly} onPress={() => void save()} />
      <Action title="Hủy" secondary disabled={busy} onPress={cancel} />
    </> : <>
      <View style={{ gap: space.sm }}>{rows.map(([label, value]) => <View key={label} style={{ borderTopWidth: 1, borderColor: colors.line, paddingTop: space.sm }}>
        <Text style={ui.caption}>{label}</Text><Text style={ui.label}>{value || 'Chưa cập nhật'}</Text>
      </View>)}</View>
      {cardUri ? <Image testID="profile-card-preview" source={{ uri: cardUri }} style={{ width: '100%', height: 200, borderRadius: 10, backgroundColor: '#f2ede4' }} resizeMode="contain" accessibilityLabel="Ảnh thẻ sinh viên" /> : <Text style={ui.caption}>Chưa có ảnh thẻ sinh viên.</Text>}
      <Notice message={message} /><Notice message={error} error />
      <Action title="Cập nhật hồ sơ" testID="profile-edit" disabled={readOnly} onPress={() => { setEditing(true); setMessage(''); setError(''); }} />
      <Action title="Cài đặt tài khoản" secondary disabled={busy} onPress={() => nav.navigate('Settings')} />
      <Action title="Tải lại hồ sơ" secondary disabled={busy} onPress={() => void load()} />
    </>}
  </AuthScreen>;
}

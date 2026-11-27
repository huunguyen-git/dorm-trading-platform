import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { Nav } from '../navigation';
import { useSession } from '../auth/session';
import { Action, AuthScreen, Field, Notice, PasswordField, ui } from '../components/AuthUI';
import { profileApi } from '../profile/api';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type Pending = { challengeId: string; expiresAt: number; resendAt: number };

export default function SettingsScreen() {
  const nav = useNavigation<Nav>();
  const user = useSession((state) => state.user);
  // Bổ sung phạm vi P1-05: tài khoản bị khóa/vô hiệu hoá không đổi email hay mật khẩu được.
  const readOnly = user?.accountStatus === 'BI_KHOA' || user?.accountStatus === 'VO_HIEU_HOA';
  const [currentPassword, setCurrent] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [challenge, setChallenge] = useState<Pending | null>(null);
  const [code, setCode] = useState('');
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const remaining = challenge ? Math.max(0, Math.ceil((challenge.expiresAt - now) / 1000)) : 0;
  const wait = challenge ? Math.max(0, Math.ceil((challenge.resendAt - now) / 1000)) : 0;

  // Một nguồn duy nhất cho email đã chuẩn hoá: hiển thị, gửi server và cập nhật phiên phải giống nhau.
  const wantedEmail = newEmail.trim().toLowerCase();

  async function run(action: () => Promise<void>) { setBusy(true); setError(''); setMessage(''); try { await action(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }

  function request() {
    return run(async () => {
      if (!emailPattern.test(wantedEmail)) throw new Error('Nhập email hợp lệ.');
      if (!currentPassword) throw new Error('Nhập mật khẩu hiện tại.');
      const started = await profileApi.changeEmail(currentPassword, wantedEmail);
      setChallenge({ challengeId: started.challengeId, expiresAt: Date.now() + started.expiresIn * 1000, resendAt: Date.now() + started.resendAfter * 1000 });
      setNow(Date.now()); setCode(''); setMessage(started.message);
    });
  }

  function verify() {
    return run(async () => {
      if (!challenge) return;
      if (!/^[0-9]{6}$/.test(code)) throw new Error('Nhập đủ 6 chữ số của mã xác minh.');
      if (!remaining) throw new Error('Mã đã hết hạn. Hãy gửi lại mã.');
      await profileApi.verifyEmail(challenge.challengeId, code);
      useSession.setState({ user: user ? { ...user, email: wantedEmail, emailVerified: true } : user });
      setChallenge(null); setCode(''); setNewEmail(''); setCurrent('');
      setMessage('Đã đổi email. Lần đăng nhập sau dùng email mới.');
    });
  }

  return <AuthScreen title="Cài đặt tài khoản">
    <Text style={ui.caption}>Email đang dùng: {user?.email ?? '—'}</Text>
    {readOnly && <Notice message="Tài khoản đang bị khóa nên không thể đổi email hay mật khẩu." error />}
    <View style={ui.divider}>
      <Text style={ui.label}>Đổi email</Text>
      <Text style={ui.caption}>Mã xác minh gửi tới email mới. Huỷ giữa chừng thì email cũ được giữ nguyên.</Text>
      {challenge ? <>
        <Text style={ui.caption}>Đã gửi mã tới {wantedEmail}. {remaining ? `Còn hiệu lực ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}.` : 'Mã đã hết hạn.'}</Text>
        <Field label="Mã xác minh" testID="settings-otp" placeholder="000000" keyboardType="number-pad" textContentType="oneTimeCode" maxLength={6} value={code} onChangeText={(value) => setCode(value.replace(/[^0-9]/g, ''))} editable={!busy} />
        <Notice message={message} /><Notice message={error} error />
        <Action title="Xác minh" testID="settings-verify" busy={busy} disabled={!remaining} onPress={() => void verify()} />
        <Action title={wait ? `Gửi lại sau ${wait}s` : 'Gửi lại mã'} secondary disabled={busy || wait > 0} onPress={() => void request()} />
        <Action title="Huỷ" secondary disabled={busy} onPress={() => { setChallenge(null); setCode(''); setCurrent(''); setMessage(''); setError(''); }} />
      </> : <>
        <PasswordField label="Mật khẩu hiện tại" testID="settings-password" autoComplete="current-password" value={currentPassword} onChangeText={setCurrent} editable={!busy} />
        <Field label="Email mới" testID="settings-email" placeholder="ban@truong.edu.vn" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" value={newEmail} onChangeText={setNewEmail} editable={!busy} />
        <Notice message={message} /><Notice message={error} error />
        <Action title="Gửi mã xác minh" testID="settings-request" busy={busy} disabled={readOnly} onPress={() => void request()} />
      </>}
    </View>
    <View style={ui.divider}>
      <Text style={ui.label}>Bảo mật khác</Text>
      <Action title="Đổi mật khẩu" secondary disabled={busy || readOnly} onPress={() => nav.navigate('AuthFlow', { mode: 'change' })} />
      <Action title="Đăng xuất thiết bị này" secondary disabled={busy} onPress={() => void run(async () => { await useSession.getState().logout(); nav.replace('Listings'); })} />
      <Action title="Về hồ sơ" secondary disabled={busy} onPress={() => nav.navigate('Profile')} />
    </View>
  </AuthScreen>;
}

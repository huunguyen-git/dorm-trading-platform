import { useState } from 'react';
import { View, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { Nav } from '../navigation';
import { login } from '../auth/login';
import { AuthScreen, Field, PasswordField, Action, Notice, ui } from '../components/AuthUI';
export default function LoginScreen() {
  const nav = useNavigation<Nav>();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit() {
    if (!email.trim() || !password) { setError('Nhập email và mật khẩu để tiếp tục.'); return; }
    setBusy(true); setError('');
    try { await login(email.trim(), password); setPassword(''); nav.replace('Listings'); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <AuthScreen title="Chào mừng trở lại" subtitle="Đăng nhập để quản lý hồ sơ và trao đổi đồ dùng với cộng đồng sinh viên.">
    <Field label="Email" testID="login-email" placeholder="ban@truong.edu.vn" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail} editable={!busy} />
    <PasswordField label="Mật khẩu" testID="login-password" placeholder="Nhập mật khẩu" autoComplete="current-password" value={password} onChangeText={setPassword} editable={!busy} onSubmitEditing={() => { if (!busy) void submit(); }} />
    <Notice message={error} error />
    <Action title={busy ? 'Đang đăng nhập…' : 'Đăng nhập'} testID="login-submit" busy={busy} onPress={() => void submit()} />
    <Action title="Quên mật khẩu" secondary disabled={busy} onPress={() => nav.navigate('AuthFlow', { mode: 'reset' })} />
    <View style={ui.divider}><Text style={ui.caption}>Bạn mới tham gia Dorm Trading?</Text>
      <Action title="Đăng ký" secondary disabled={busy} onPress={() => nav.navigate('AuthFlow', { mode: 'register' })} />
      <Action title="Gửi lại xác minh email" secondary disabled={busy} onPress={() => nav.navigate('AuthFlow', { mode: 'verify' })} />
      <Action title="Tiếp tục xem mặt hàng" secondary disabled={busy} onPress={() => nav.navigate('Listings')} />
    </View>
  </AuthScreen>;
}

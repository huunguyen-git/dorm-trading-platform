import { useState } from 'react';
import { Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { Nav } from '../navigation';
import { api } from '../api/client';
import { useSession, type User } from '../auth/session';
import { AuthScreen, Action, Field, Notice, ui } from '../components/AuthUI';
export default function ProfileScreen() {
  const nav = useNavigation<Nav>(); const user = useSession((s) => s.user);
  const [name, setName] = useState(user?.name ?? ''); const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<void>) { setBusy(true); setMessage(''); setError(''); try { await action(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  return <AuthScreen title="Hồ sơ của bạn" subtitle="Quản lý thông tin cá nhân và bảo mật tài khoản.">
    <Text style={ui.label}>{user?.email}</Text><Text style={ui.caption}>MSSV · {user?.studentId}</Text>
    <View style={ui.row}><Text style={ui.badge}>{user?.emailVerified ? 'Email đã xác minh' : 'Chưa xác minh email'}</Text><Text style={ui.badge}>{user?.profileApproved ? 'Hồ sơ đã duyệt' : 'Hồ sơ chờ duyệt'}</Text></View>
    {!user?.roles.includes('MEMBER') && <Notice message="Bạn có thể sửa hồ sơ và xem mặt hàng. Cần xác minh email và duyệt hồ sơ trước khi giao dịch." />}
    <Field label="Họ tên" testID="profile-name" maxLength={150} value={name} onChangeText={setName} editable={!busy} />
    <Notice message={message} /><Notice message={error} error />
    <Action title="Lưu họ tên" busy={busy} onPress={() => void run(async () => {
      if (!name.trim()) throw new Error('Họ tên không được để trống.');
      const updated = await api<User>('/auth/profile', { method: 'PATCH', body: JSON.stringify({ name: name.trim() }) }); useSession.setState({ user: updated }); setMessage('Đã lưu hồ sơ.');
    })} />
    {!user?.emailVerified && <Action title="Xác minh email" secondary disabled={busy} onPress={() => nav.navigate('AuthFlow', { mode: 'verify' })} />}
    <Action title="Cập nhật trạng thái hồ sơ" secondary disabled={busy} onPress={() => void run(async () => { const fresh = await api<User>('/auth/me'); useSession.setState({ user: fresh }); setMessage('Đã cập nhật trạng thái hồ sơ.'); })} />
    <View style={ui.divider}><Text style={ui.label}>Bảo mật tài khoản</Text><Text style={ui.caption}>Đổi mật khẩu giữ lại phiên này và đăng xuất các phiên khác.</Text>
      <Action title="Đổi mật khẩu" secondary disabled={busy} onPress={() => nav.navigate('AuthFlow', { mode: 'change' })} />
      <Action title="Đăng xuất thiết bị này" secondary disabled={busy} onPress={() => void run(async () => { await useSession.getState().logout(); nav.replace('Listings'); })} />
    </View>
  </AuthScreen>;
}

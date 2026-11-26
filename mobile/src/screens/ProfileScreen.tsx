import { useState } from 'react';
import { Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { Nav } from '../navigation';
import { api, RestrictedAccountError } from '../api/client';
import { resolveUserRestriction, useSession, type User } from '../auth/session';
import { AuthScreen, Action, Field, Notice, ui } from '../components/AuthUI';
import { RestrictedAccountNotice } from '../components/RestrictedAccountNotice';

export default function ProfileScreen() {
  const nav = useNavigation<Nav>();
  const user = useSession((s) => s.user);
  const isLocked = user?.accountStatus === 'BI_KHOA';
  const [name, setName] = useState(user?.name ?? '');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
        setError((e as Error).message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreen title="Hồ sơ của bạn" subtitle="Quản lý thông tin cá nhân và bảo mật tài khoản.">
      <Text style={ui.label}>{user?.email}</Text>
      <Text style={ui.caption}>MSSV · {user?.studentId}</Text>
      <View style={ui.row}>
        <Text style={ui.badge}>{user?.emailVerified ? 'Email đã xác minh' : 'Chưa xác minh email'}</Text>
        <Text style={ui.badge}>{user?.profileApproved ? 'Hồ sơ đã duyệt' : 'Hồ sơ chờ duyệt'}</Text>
      </View>
      <RestrictedAccountNotice />
      {!isLocked && !user?.roles.includes('MEMBER') && (
        <Notice message="Bạn có thể sửa hồ sơ và xem mặt hàng. Cần xác minh email và duyệt hồ sơ trước khi giao dịch." />
      )}
      <Field
        label="Họ tên"
        testID="profile-name"
        maxLength={150}
        value={name}
        onChangeText={setName}
        editable={!busy && !isLocked}
      />
      <Notice message={message} />
      <Notice message={error} error />
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
      {!user?.emailVerified && (
        <Action
          title="Xác minh email"
          secondary
          disabled={busy || isLocked}
          onPress={() => nav.navigate('AuthFlow', { mode: 'verify' })}
        />
      )}
      <Action
        title="Cập nhật trạng thái hồ sơ"
        secondary
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
      <View style={ui.divider}>
        <Text style={ui.label}>Bảo mật tài khoản</Text>
        <Text style={ui.caption}>Đổi mật khẩu sẽ đăng xuất tất cả thiết bị. Hãy đăng nhập lại sau khi đổi.</Text>
        <Action
          title="Đổi mật khẩu"
          secondary
          disabled={busy || isLocked}
          onPress={() => nav.navigate('AuthFlow', { mode: 'change' })}
        />
        <Action
          title="Đăng xuất thiết bị này"
          secondary
          disabled={busy}
          onPress={() =>
            void run(async () => {
              await useSession.getState().logout();
              nav.replace('Listings');
            })
          }
        />
      </View>
    </AuthScreen>
  );
}

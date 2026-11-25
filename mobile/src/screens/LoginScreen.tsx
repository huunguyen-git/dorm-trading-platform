import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { Nav } from '../navigation';
import { RestrictedAccountError } from '../api/client';
import { login } from '../auth/login';
import { useSession } from '../auth/session';
import { Action, AuthScreen, Field, Notice, PasswordField, ui } from '../components/AuthUI';
import { RestrictedAccountNotice } from '../components/RestrictedAccountNotice';
import { primitive } from '../theme';

function sanitizeAuthError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith('API ')) {
    return 'Không thể kết nối máy chủ. Vui lòng thử lại.';
  }
  return trimmed;
}

export default function LoginScreen() {
  const nav = useNavigation<Nav>();
  const restriction = useSession((state) => state.restriction);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!email.trim() || !password) {
      setError('Nhập email và mật khẩu để tiếp tục.');
      return;
    }
    setBusy(true);
    setError('');
    useSession.getState().clearRestriction();
    try {
      await login(email.trim(), password);
      setPassword('');
      nav.replace('Listings');
    } catch (e) {
      if (typeof RestrictedAccountError === 'function' && e instanceof RestrictedAccountError) {
        if (!useSession.getState().restriction) {
          useSession.setState({ restriction: e.restriction, restrictionDismissed: false });
        }
        setError('');
      } else {
        setError(sanitizeAuthError(e));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreen
      showBrand
      title="Chào mừng trở lại"
      subtitle="Đăng nhập để quản lý hồ sơ và trao đổi đồ dùng với cộng đồng sinh viên."
    >
      <Field
        label="Email"
        testID="login-email"
        placeholder="ban@truong.edu.vn"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
        value={email}
        onChangeText={setEmail}
        editable={!busy}
      />
      <PasswordField
        label="Mật khẩu"
        testID="login-password"
        placeholder="Nhập mật khẩu"
        autoComplete="current-password"
        value={password}
        onChangeText={setPassword}
        editable={!busy}
        onSubmitEditing={() => {
          if (!busy) void submit();
        }}
      />

      {restriction ? <RestrictedAccountNotice /> : null}
      <Notice message={error} error />

      <View style={styles.primaryGroup}>
        <Action
          title={busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
          testID="login-submit"
          busy={busy}
          onPress={() => void submit()}
        />
        <Action
          title="Quên mật khẩu"
          variant="ghost"
          compact
          disabled={busy}
          onPress={() => nav.navigate('AuthFlow', { mode: 'reset' })}
        />
      </View>

      <View style={ui.divider}>
        <Text style={ui.caption}>Chưa có tài khoản?</Text>
        <Action
          title="Đăng ký"
          variant="secondary"
          disabled={busy}
          onPress={() => nav.navigate('AuthFlow', { mode: 'register' })}
        />
        <View style={styles.utilityLinks}>
          <Action
            title="Gửi lại xác minh email"
            variant="ghost"
            compact
            disabled={busy}
            onPress={() => nav.navigate('AuthFlow', { mode: 'verify' })}
          />
          <Action
            title="Tiếp tục xem mặt hàng"
            variant="ghost"
            compact
            disabled={busy}
            onPress={() => nav.navigate('Listings')}
          />
        </View>
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  primaryGroup: {
    gap: primitive.space[2],
  },
  utilityLinks: {
    gap: primitive.space[1],
  },
});

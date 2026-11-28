import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { Nav, RootStack } from '../navigation';
import { api } from '../api/client';
import { useSession } from '../auth/session';
import { tokenStore } from '../auth/tokenStore';
import { Action, AuthScreen, Field, Notice, PasswordField, Steps, ui } from '../components/AuthUI';
import { primitive } from '../theme';

type Challenge = {
  challengeId: string;
  expiresIn: number;
  resendAfter: number;
  message: string;
};

function sanitizeAuthError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith('API ')) {
    return 'Không thể kết nối máy chủ. Vui lòng thử lại.';
  }
  return trimmed;
}

export default function AuthFlowScreen() {
  const nav = useNavigation<Nav>();
  const { mode } = useRoute<RouteProp<RootStack, 'AuthFlow'>>().params;
  const user = useSession((s) => s.user);

  const [email, setEmail] = useState(user?.email ?? '');
  const [name, setName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [currentPassword, setCurrent] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [registered, setRegistered] = useState(false);
  const [grant, setGrant] = useState('');
  const [resendAt, setResendAt] = useState(0);
  const [expiresAt, setExpiresAt] = useState(0);
  const [tick, setTick] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const purpose = mode === 'reset' ? 'RESET' : 'REGISTER';

  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const wait = Math.max(0, Math.ceil((resendAt - tick) / 1000));
  const remaining = Math.max(0, Math.ceil((expiresAt - tick) / 1000));

  const post = <T,>(path: string, body: object) =>
    api<T>(path, { method: 'POST', body: JSON.stringify(body) });

  function validatePassword() {
    const length = [...password.normalize('NFC')].length;
    if (length < 8 || length > 128) {
      throw new Error('Mật khẩu mới cần từ 8 đến 128 ký tự.');
    }
    if (password !== confirmation) {
      throw new Error('Mật khẩu xác nhận chưa khớp.');
    }
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(sanitizeAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!/^[^\s@]+@[^\s@]+\.edu\.vn$/i.test(email.trim())) {
      throw new Error('Nhập email sinh viên thuộc miền .edu.vn.');
    }
    if (mode === 'register' && !registered) {
      if (!name.trim() || !studentId.trim()) {
        throw new Error('Nhập họ tên và MSSV.');
      }
      validatePassword();
    }
    const response =
      mode === 'register' && !registered
        ? await post<Challenge>('/auth/register', {
          name: name.trim(),
          studentId: studentId.trim(),
          email: email.trim(),
          password,
        })
        : await post<Challenge>('/auth/otp/resend', { email: email.trim(), purpose });

    if (mode === 'register') setRegistered(true);
    setChallenge(response);
    setCode('');
    setPassword('');
    setConfirmation('');
    const now = Date.now();
    setTick(now);
    setResendAt(now + response.resendAfter * 1000);
    setExpiresAt(now + response.expiresIn * 1000);
    setMessage(response.message);
  }

  async function submit() {
    if (mode === 'change' || grant) validatePassword();
    if (mode === 'change') {
      if (!currentPassword) throw new Error('Nhập mật khẩu hiện tại.');
      await post<void>('/auth/password/change', { currentPassword, password });
      await tokenStore.clear();
      useSession.setState({
        token: null,
        user: null,
        loading: false,
        restriction: null,
        restrictionDismissed: false,
      });
      setMessage('Đã đổi mật khẩu. Hãy đăng nhập lại bằng mật khẩu mới.');
    } else if (grant) {
      if (!remaining) throw new Error('Quyền đặt lại mật khẩu đã hết hạn. Hãy yêu cầu mã mới.');
      await post('/auth/password/reset', { resetToken: grant, password });
      await tokenStore.clear();
      useSession.setState({
        token: null,
        user: null,
        loading: false,
        restriction: null,
        restrictionDismissed: false,
      });
      setMessage('Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới.');
    } else if (!challenge) {
      await send();
      return;
    } else {
      if (!/^[0-9]{6}$/.test(code)) throw new Error('Nhập đủ mã xác minh.');
      if (!remaining) throw new Error('Mã đã hết hạn. Hãy gửi lại mã.');
      const result = await post<{ resetToken: string | null }>('/auth/otp/verify', {
        challengeId: challenge.challengeId,
        email: email.trim(),
        purpose,
        code,
      });
      if (result.resetToken) {
        setGrant(result.resetToken);
        setCode('');
        setExpiresAt(Date.now() + 300000);
        setMessage('Đã xác minh. Bạn có thể đặt mật khẩu mới.');
        return;
      }
      if (user) useSession.setState({ user: { ...user, emailVerified: true } });
      setMessage('Đã xác minh email. Bạn có thể xem mặt hàng và quản lý hồ sơ trong khi chờ duyệt.');
    }
    setCurrent('');
    setPassword('');
    setConfirmation('');
    setGrant('');
    setCode('');
    setDone(true);
  }

  function restart() {
    setGrant('');
    setChallenge(null);
    setCode('');
    setPassword('');
    setConfirmation('');
    setMessage('');
    setError('');
  }

  const title =
    mode === 'register'
      ? 'Tạo tài khoản'
      : mode === 'change'
        ? 'Đổi mật khẩu'
        : mode === 'verify'
          ? 'Xác minh email'
          : 'Khôi phục tài khoản';

  const returnToProfile = ((mode === 'change' && !done) || mode === 'verify') && Boolean(user);

  const back = () => {
    if (returnToProfile) {
      nav.replace('Profile');
      return;
    }
    if ((mode === 'change' || mode === 'reset') && typeof nav.reset === 'function') {
      nav.reset({ index: 1, routes: [{ name: 'Listings' }, { name: 'Login' }] });
      return;
    }
    nav.replace('Login');
  };

  const labels = mode === 'reset' ? ['Email', 'Xác minh', 'Mật khẩu mới'] : ['Thông tin', 'Xác minh'];
  const stage = grant ? 2 : challenge ? 1 : 0;

  return (
    <AuthScreen
      title={done ? 'Hoàn tất' : title}
      subtitle={
        done
          ? 'Thông tin tài khoản của bạn đã được cập nhật.'
          : 'Bảo vệ tài khoản để an tâm trao đổi cùng cộng đồng.'
      }
    >
      {done ? (
        <View style={styles.doneGroup}>
          <Notice message={message} tone="success" />
          <Action
            title={mode === 'verify' && user ? 'Về hồ sơ' : 'Đăng nhập'}
            onPress={back}
            testID="auth-success-continue"
          />
        </View>
      ) : (
        <>
          {mode !== 'change' ? <Steps current={stage} labels={labels} /> : null}

          {mode !== 'change' ? (
            <Field
              label="Email"
              testID="auth-email"
              placeholder="ban@truong.edu.vn"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              editable={!challenge && !grant && !registered && !busy}
            />
          ) : null}

          {mode === 'register' && !challenge ? (
            <>
              <Field
                label="Họ tên"
                maxLength={150}
                value={name}
                onChangeText={setName}
                editable={!busy}
              />
              <Field
                label="MSSV"
                maxLength={20}
                value={studentId}
                onChangeText={setStudentId}
                editable={!busy}
              />
            </>
          ) : null}

          {mode === 'change' ? (
            <PasswordField
              label="Mật khẩu hiện tại"
              value={currentPassword}
              onChangeText={setCurrent}
              editable={!busy}
              autoComplete="current-password"
            />
          ) : null}

          {(mode === 'register' && !challenge) || mode === 'change' || Boolean(grant) ? (
            <>
              <PasswordField
                label="Mật khẩu mới"
                value={password}
                onChangeText={setPassword}
                editable={!busy}
                textContentType="newPassword"
              />
              <PasswordField
                label="Xác nhận mật khẩu mới"
                value={confirmation}
                onChangeText={setConfirmation}
                editable={!busy}
                textContentType="newPassword"
              />
              <Text style={ui.caption}>
                8–128 ký tự. Có thể dùng cụm từ có khoảng trắng; tránh mật khẩu phổ biến.
              </Text>
            </>
          ) : null}

          {challenge && !grant ? (
            <View style={styles.otpGroup}>
              <Field
                label="Mã xác minh"
                testID="auth-otp"
                placeholder="000000"
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                maxLength={6}
                value={code}
                onChangeText={(v) => setCode(v.replace(/[^0-9]/g, ''))}
                editable={!busy}
              />
              <Text style={ui.caption}>
                {remaining
                  ? `Mã còn hiệu lực ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`
                  : 'Mã đã hết hạn. Vui lòng gửi lại mã.'}
              </Text>
              <Action
                title={wait ? `Gửi lại sau ${wait}s` : 'Gửi lại mã'}
                variant="secondary"
                compact
                disabled={busy || wait > 0}
                onPress={() => void run(send)}
              />
            </View>
          ) : null}

          {Boolean(grant) ? (
            <Text style={ui.caption}>
              {remaining
                ? `Đặt mật khẩu trong ${Math.ceil(remaining / 60)} phút còn lại.`
                : 'Quyền đặt lại mật khẩu đã hết hạn.'}
            </Text>
          ) : null}

          <Notice message={message} />
          <Notice message={error} error />

          <View style={styles.actionsGroup}>
            <Action
              title={
                busy
                  ? 'Đang xử lý…'
                  : grant || mode === 'change'
                    ? 'Lưu mật khẩu'
                    : challenge
                      ? 'Xác minh'
                      : 'Tiếp tục'
              }
              testID="auth-submit"
              busy={busy}
              disabled={Boolean(challenge || grant) && !remaining}
              onPress={() => void run(submit)}
            />

            {mode === 'reset' && (challenge || grant) ? (
              <Action
                title={grant && !remaining ? 'Yêu cầu mã mới' : 'Dùng email khác'}
                variant="ghost"
                compact
                disabled={busy}
                onPress={restart}
              />
            ) : null}
          </View>

          <View style={ui.divider}>
            <Action
              title={returnToProfile ? 'Về hồ sơ' : 'Về đăng nhập'}
              variant="ghost"
              compact
              disabled={busy}
              onPress={back}
            />
          </View>
        </>
      )}
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  doneGroup: {
    gap: primitive.space[4],
  },
  otpGroup: {
    gap: primitive.space[2.5],
  },
  actionsGroup: {
    gap: primitive.space[2],
  },
});

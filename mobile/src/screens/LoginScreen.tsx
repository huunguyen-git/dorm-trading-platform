import { useState } from 'react';
import { Button, SafeAreaView, Text, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { Nav } from '../navigation';
import { login } from '../auth/login';
import { colors, space, text } from '../theme';

export default function LoginScreen() {
  const navigation = useNavigation<Nav>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError('');
    try { await login(email, password); navigation.replace('Listings'); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };
  return <SafeAreaView style={{ flex: 1, padding: space.xl, gap: space.md }}>
    <Text style={text.title}>Đăng nhập</Text>
    <TextInput accessibilityLabel="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="Email" />
    <TextInput accessibilityLabel="Mật khẩu" value={password} onChangeText={setPassword} placeholder="Mật khẩu" secureTextEntry />
    {error ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text> : null}
    <Button title={busy ? 'Đang đăng nhập…' : 'Đăng nhập'} onPress={() => void submit()} disabled={busy || !email || !password} />
  </SafeAreaView>;
}

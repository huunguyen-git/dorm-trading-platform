import { useState } from 'react';
import { Button, SafeAreaView, Text, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { Nav } from '../navigation';
import { login } from '../auth/login';

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
  return <SafeAreaView style={{ flex: 1, padding: 20, gap: 12 }}>
    <Text style={{ fontSize: 24, fontWeight: '700' }}>Đăng nhập</Text>
    <TextInput accessibilityLabel="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="Email" />
    <TextInput accessibilityLabel="Mật khẩu" value={password} onChangeText={setPassword} placeholder="Mật khẩu" secureTextEntry />
    {error ? <Text accessibilityRole="alert">{error}</Text> : null}
    <Button title={busy ? 'Đang đăng nhập…' : 'Đăng nhập'} onPress={() => void submit()} disabled={busy || !email || !password} />
  </SafeAreaView>;
}

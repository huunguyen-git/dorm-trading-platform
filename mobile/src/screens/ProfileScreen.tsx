import { Button, SafeAreaView, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { Nav } from '../navigation';
import { api } from '../api/client';
import { useSession } from '../auth/session';
import { space, text } from '../theme';

export default function ProfileScreen() {
  const logout = useSession((state) => state.logout);
  const navigation = useNavigation<Nav>();
  const user = useSession((state) => state.user);
  const signOut = async () => { await api('/auth/logout', { method: 'POST' }).catch(() => undefined); await logout(); navigation.replace('Listings'); };
  return <SafeAreaView style={{ padding: space.xl, gap: space.md }}>
    <Text style={text.title}>Hồ sơ</Text>
    <Text>{user?.name ?? 'Đã đăng nhập'}</Text>
    <Button title="Đăng xuất" onPress={() => void signOut()} />
  </SafeAreaView>;
}

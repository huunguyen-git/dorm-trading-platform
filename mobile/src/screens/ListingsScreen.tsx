import { useEffect, useState } from 'react';
import { Button, FlatList, SafeAreaView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { Nav } from '../navigation';
import { useSession } from '../auth/session';
import { useListings } from '../listings/store';
import { colors, space, text } from '../theme';

export default function ListingsScreen() {
  const navigation = useNavigation<Nav>();
  const { listings, loading, load } = useListings();
  const token = useSession((state) => state.token);
  const [error, setError] = useState('');
  useEffect(() => { void load().catch((cause: Error) => setError(cause.message)); }, [load]);

  return <SafeAreaView style={{ flex: 1, padding: space.lg }}>
    <Text style={text.title}>Tin đăng</Text>
    <View style={{ flexDirection: 'row', gap: space.md, marginVertical: space.md }}>
      <Button title="Đăng tin" onPress={() => navigation.navigate(token ? 'CreateListing' : 'Login')} />
      <Button title="Hồ sơ" onPress={() => navigation.navigate(token ? 'Profile' : 'Login')} />
      {!token && <Button title="Đăng nhập" onPress={() => navigation.navigate('Login')} />}
    </View>
    {error ? <Text accessibilityRole="alert">{error}</Text> : null}
    {loading ? <Text>Đang tải…</Text> : null}
    <FlatList data={listings} keyExtractor={(item) => item.id} ListEmptyComponent={<Text>Chưa có tin đăng.</Text>} renderItem={({ item }) => <View style={{ paddingVertical: space.md, borderBottomWidth: 1, borderColor: colors.line }}><Text style={{ fontWeight: '600', color: colors.ink }}>{item.title}</Text><Text style={text.body}>{item.price.toLocaleString()} ₫</Text><Button title="Xem chi tiết" onPress={() => navigation.navigate('Listing', { listing: item })} /></View>} />
  </SafeAreaView>;
}

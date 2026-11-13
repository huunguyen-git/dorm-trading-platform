import { useEffect, useState } from 'react';
import { FlatList, SafeAreaView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { Nav } from '../navigation';
import { useSession } from '../auth/session';
import { useListings } from '../listings/store';
import { Action, Notice, ui } from '../components/AuthUI';
import { colors, space, text } from '../theme';

export default function ListingsScreen() {
  const navigation = useNavigation<Nav>();
  const { listings, loading, load } = useListings();
  const user = useSession((state) => state.user);
  const token = useSession((state) => state.token);
  const [error, setError] = useState('');
  useEffect(() => { void load().catch((cause: Error) => setError(cause.message)); }, [load]);

  return <SafeAreaView style={{ flex: 1, padding: space.lg, backgroundColor: '#f5f4ef' }}>
    <Text style={ui.brand}>DORM TRADING</Text><Text style={[text.title, { marginTop: space.sm }]}>Tin đăng</Text><Text style={ui.caption}>Khám phá những món đồ đang chờ một chủ nhân mới.</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginVertical: space.lg }}>
      <Action secondary title="Đăng tin" disabled={!!token && !user?.roles.includes('MEMBER')} onPress={() => navigation.navigate(token ? 'CreateListing' : 'Login')} />
      <Action secondary title="Hồ sơ" onPress={() => navigation.navigate(token ? 'Profile' : 'Login')} />
      {!token && <Action secondary title="Đăng nhập" onPress={() => navigation.navigate('Login')} />}
    </View>
    {!!token && !user?.roles.includes('MEMBER') && <Notice message="Tài khoản đang chờ hoàn tất xác minh hoặc duyệt hồ sơ. Bạn vẫn có thể xem các mặt hàng công khai." />}
    {error ? <View style={{ gap: space.sm }}><Notice message={error} error /><Action title="Thử tải lại" secondary onPress={() => { setError(''); void load().catch((e: Error) => setError(e.message)); }} /></View> : null}
    {loading ? <Text>Đang tải…</Text> : null}
    <FlatList contentContainerStyle={{ gap: space.md, paddingTop: space.md }} data={listings} keyExtractor={(item) => item.id} ListEmptyComponent={<View style={ui.notice}><Text style={ui.label}>Chưa có tin đăng.</Text><Text style={ui.caption}>Các mặt hàng đã được công khai sẽ xuất hiện tại đây.</Text></View>} renderItem={({ item }) => <View style={{ padding: space.lg, gap: space.sm, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.line }}><Text style={{ fontWeight: '600', color: colors.ink }}>{item.title}</Text><Text style={text.body}>{item.price.toLocaleString()} ₫</Text><Action secondary title="Xem chi tiết" onPress={() => navigation.navigate('Listing', { listing: item })} /></View>} />
  </SafeAreaView>;
}

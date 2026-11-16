import { useState } from 'react';
import { Button, SafeAreaView, Text, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { Nav } from '../navigation';
import { useSession } from '../auth/session';
import { useListings } from '../listings/store';
import { colors, space, text } from '../theme';

export default function CreateListingScreen() {
  const navigation = useNavigation<Nav>();
  const addListing = useListings((state) => state.create);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [error, setError] = useState('');
  const allowed = useSession((state) => state.user?.roles.includes('MEMBER'));
  const submit = async () => {
    if (!allowed) { setError('Tài khoản chưa được phép đăng tin.'); return; }
    const amount = Number(price);
    if (!title.trim() || !description.trim() || !Number.isFinite(amount) || amount <= 0) {
      setError('Nhập tiêu đề, mô tả và giá hợp lệ.');
      return;
    }
    try { await addListing({ title: title.trim(), description: description.trim(), price: amount }); navigation.popToTop(); }
    catch (cause) { setError((cause as Error).message); }
  };
  return <SafeAreaView style={{ padding: space.xl, gap: space.md }}>
    <Text style={text.title}>Đăng tin</Text>
    <TextInput accessibilityLabel="Tiêu đề" placeholder="Tiêu đề" value={title} onChangeText={setTitle} />
    <TextInput accessibilityLabel="Mô tả" placeholder="Mô tả" value={description} onChangeText={setDescription} multiline />
    <TextInput accessibilityLabel="Giá" placeholder="Giá" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
    {error ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text> : null}
    <Button title="Đăng tin" onPress={() => void submit()} />
  </SafeAreaView>;
}

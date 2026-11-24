import { SafeAreaView, Text } from 'react-native';
import { ui } from '../components/AuthUI';
import { space, text } from '../theme';

export default function MyListingsScreen() {
  return (
    <SafeAreaView style={[ui.page, { padding: space.lg, gap: space.sm }]}>
      <Text style={ui.brand}>DORM TRADING</Text>
      <Text style={text.title}>Tin của tôi</Text>
      <Text style={ui.caption}>Quản lý tin đăng cá nhân và hạn mức đăng tin.</Text>
    </SafeAreaView>
  );
}

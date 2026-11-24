import { SafeAreaView, Text } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import type { RootStack } from '../navigation';
import { ui } from '../components/AuthUI';
import { space, text } from '../theme';

export default function EditListingScreen() {
  const { params } = useRoute<RouteProp<RootStack, 'EditListing'>>();
  return (
    <SafeAreaView style={[ui.page, { padding: space.lg, gap: space.sm }]}>
      <Text style={ui.brand}>DORM TRADING</Text>
      <Text style={text.title}>Sửa tin</Text>
      <Text style={ui.caption}>Đang chuẩn bị biểu mẫu chỉnh sửa cho tin #{params.id}.</Text>
    </SafeAreaView>
  );
}

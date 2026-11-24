import { SafeAreaView, Text } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import type { RootStack } from '../navigation';
import { formatVnd } from '../listings/types';
import { space, text } from '../theme';

export default function ListingScreen() {
  const { params } = useRoute<RouteProp<RootStack, 'Listing'>>();
  const item = params?.listing;
  if (!item) {
    return (
      <SafeAreaView style={{ padding: space.xl, gap: space.md }}>
        <Text style={text.title}>Chi tiết tin đăng</Text>
        <Text style={text.muted}>
          {params?.id ? `Đang tải tin đăng #${params.id}…` : 'Không tìm thấy thông tin tin đăng.'}
        </Text>
      </SafeAreaView>
    );
  }
  const priceText =
    'priceVnd' in item ? formatVnd(item.priceVnd) : `${item.price.toLocaleString()} ₫`;
  const sellerName = typeof item.seller === 'string' ? item.seller : item.seller.displayName;
  return (
    <SafeAreaView style={{ padding: space.xl, gap: space.md }}>
      <Text style={text.title}>{item.title}</Text>
      <Text style={text.body}>{priceText}</Text>
      <Text style={text.body}>{item.description}</Text>
      <Text style={text.muted}>Người bán: {sellerName}</Text>
    </SafeAreaView>
  );
}

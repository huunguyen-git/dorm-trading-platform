import { SafeAreaView, Text } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import type { RootStack } from '../navigation';

export default function ListingScreen() {
  const { params } = useRoute<RouteProp<RootStack, 'Listing'>>();
  const item = params.listing;
  return <SafeAreaView style={{ padding: 20, gap: 12 }}><Text style={{ fontSize: 24, fontWeight: '700' }}>{item.title}</Text><Text>{item.price.toLocaleString()} ₫</Text><Text>{item.description}</Text><Text>Người bán: {item.seller}</Text></SafeAreaView>;
}

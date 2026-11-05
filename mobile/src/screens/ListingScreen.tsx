import { SafeAreaView, Text } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import type { RootStack } from '../navigation';
import { space, text } from '../theme';

export default function ListingScreen() {
  const { params } = useRoute<RouteProp<RootStack, 'Listing'>>();
  const item = params.listing;
  return <SafeAreaView style={{ padding: space.xl, gap: space.md }}><Text style={text.title}>{item.title}</Text><Text style={text.body}>{item.price.toLocaleString()} ₫</Text><Text style={text.body}>{item.description}</Text><Text style={text.muted}>Người bán: {item.seller}</Text></SafeAreaView>;
}

import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import type { RootStack } from '../navigation';
import ListingsScreen from '../screens/ListingsScreen';
import LoginScreen from '../screens/LoginScreen';
import ListingScreen from '../screens/ListingScreen';
import CreateListingScreen from '../screens/CreateListingScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Stack = createNativeStackNavigator<RootStack>();

export default function AppNavigator() {
  return <NavigationContainer>
    <StatusBar />
    <Stack.Navigator>
      <Stack.Screen name="Listings" component={ListingsScreen} options={{ title: 'Tin đăng' }} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Listing" component={ListingScreen} options={{ title: 'Chi tiết tin' }} />
      <Stack.Screen name="CreateListing" component={CreateListingScreen} options={{ title: 'Đăng tin' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
    </Stack.Navigator>
  </NavigationContainer>;
}

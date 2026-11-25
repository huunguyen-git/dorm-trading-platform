import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import type { RootStack } from '../navigation';
import ListingsScreen from '../screens/ListingsScreen';
import AuthFlowScreen from '../screens/AuthFlowScreen';
import LoginScreen from '../screens/LoginScreen';
import ListingScreen from '../screens/ListingScreen';
import CreateListingScreen from '../screens/CreateListingScreen';
import MyListingsScreen from '../screens/MyListingsScreen';
import EditListingScreen from '../screens/EditListingScreen';
import ProfileScreen from '../screens/ProfileScreen';
import InventoryListScreen from '../screens/InventoryListScreen';
import InventoryDetailScreen from '../screens/InventoryDetailScreen';
import InventoryFormScreen from '../screens/InventoryFormScreen';
import { semantic } from '../theme';

const Stack = createNativeStackNavigator<RootStack>();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <StatusBar style="dark" backgroundColor={semantic.color.bgSurface} />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: semantic.color.bgSurface },
          headerTintColor: semantic.color.textPrimary,
          headerTitleStyle: {
            fontSize: semantic.type.sectionTitle.fontSize,
            fontWeight: semantic.type.sectionTitle.fontWeight,
            color: semantic.color.textPrimary,
          },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: semantic.color.bgPage },
        }}
      >
        <Stack.Screen
          name="Listings"
          component={ListingsScreen}
          options={{ title: 'Khám phá', headerShown: false }}
        />
        <Stack.Screen name="AuthFlow" component={AuthFlowScreen} options={{ title: 'Tài khoản' }} />
        <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Đăng nhập' }} />
        <Stack.Screen name="Listing" component={ListingScreen} options={{ title: 'Chi tiết tin' }} />
        <Stack.Screen
          name="CreateListing"
          component={CreateListingScreen}
          options={{ title: 'Đăng tin mới' }}
        />
        <Stack.Screen
          name="MyListings"
          component={MyListingsScreen}
          options={{ title: 'Tin của tôi', headerShown: false }}
        />
        <Stack.Screen
          name="EditListing"
          component={EditListingScreen}
          options={{ title: 'Chỉnh sửa tin' }}
        />
        <Stack.Screen
          name="Profile"
          component={ProfileScreen}
          options={{ title: 'Hồ sơ', headerShown: false }}
        />
        <Stack.Screen
          name="InventoryList"
          component={InventoryListScreen}
          options={{ title: 'Kho đồ cá nhân', headerShown: false }}
        />
        <Stack.Screen
          name="InventoryDetail"
          component={InventoryDetailScreen}
          options={{ title: 'Chi tiết đồ vật' }}
        />
        <Stack.Screen
          name="InventoryForm"
          component={InventoryFormScreen}
          options={({ route }) => ({
            title: route.params?.mode === 'edit' ? 'Sửa đồ vật' : 'Thêm đồ vật',
          })}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

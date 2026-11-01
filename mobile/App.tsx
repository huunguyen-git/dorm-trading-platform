import { useEffect } from 'react';
import { SafeAreaView, Text } from 'react-native';
import AppNavigator from './src/navigation/AppNavigator';
import { useSession } from './src/auth/session';

export default function App() {
  const restore = useSession((state) => state.restore);
  const loading = useSession((state) => state.loading);
  useEffect(() => { void restore(); }, [restore]);
  if (loading) return <SafeAreaView><Text>Đang khôi phục phiên…</Text></SafeAreaView>;
  return <AppNavigator />;
}

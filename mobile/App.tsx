import { useEffect } from 'react';
import { Text } from 'react-native';
import {
  initialWindowMetrics,
  SafeAreaProvider,
  SafeAreaView,
  type Metrics,
} from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { useSession } from './src/auth/session';

const FALLBACK_SAFE_AREA_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 0, height: 0 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

export default function App() {
  const restore = useSession((state) => state.restore);
  const loading = useSession((state) => state.loading);
  useEffect(() => { void restore(); }, [restore]);
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics ?? FALLBACK_SAFE_AREA_METRICS}>
      {loading ? (
        <SafeAreaView>
          <Text>Đang khôi phục phiên…</Text>
        </SafeAreaView>
      ) : (
        <AppNavigator />
      )}
    </SafeAreaProvider>
  );
}

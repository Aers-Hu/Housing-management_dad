import { Stack, useRouter, useSegments } from 'expo-router';
import { LogBox, View, ActivityIndicator } from 'react-native';
import { useEffect } from 'react';
import Toast from 'react-native-toast-message';
import { Provider } from '@/components/Provider';
import { OfflineBanner } from '@/components/OfflineBanner';
import { useAuth } from '@/contexts/AuthContext';

import '../global.css';

LogBox.ignoreLogs([
  "TurboModuleRegistry.getEnforcing(...): 'RNMapsAirModule' could not be found",
]);

// 根据登录态做路由守卫
function AuthGate() {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    const onLogin = segments[0] === 'login';
    if (!isAuthenticated && !onLogin) {
      router.replace('/login');
    } else if (isAuthenticated && onLogin) {
      router.replace('/');
    }
  }, [isAuthenticated, isLoading, segments, router]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F0F3' }}>
        <ActivityIndicator size="large" color="#6C63FF" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        animation: 'slide_from_right',
        gestureEnabled: true,
        gestureDirection: 'horizontal',
        headerShown: false,
      }}
    >
      <Stack.Screen name="login" options={{ title: '登录' }} />
      <Stack.Screen name="index" options={{ title: '房屋管家' }} />
      <Stack.Screen name="building" options={{ title: '楼房管理' }} />
      <Stack.Screen name="room" options={{ title: '房间详情' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <Provider>
      <AuthGate />
      <OfflineBanner />
      <Toast />
    </Provider>
  );
}

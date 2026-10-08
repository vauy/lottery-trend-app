import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LogBox, Text, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { Component, useEffect, type ReactNode } from 'react';
import Toast from 'react-native-toast-message';
import { Provider } from '@/components/Provider';

import '../global.css';

SplashScreen.preventAutoHideAsync().catch(() => {});

LogBox.ignoreLogs([
  "TurboModuleRegistry.getEnforcing(...): 'RNMapsAirModule' could not be found",
]);

class RootErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  componentDidCatch(err: Error) {
    console.error('[RootErrorBoundary]', err);
  }
  render() {
    if (this.state.err) {
      return (
        <View style={{ flex: 1, backgroundColor: '#fff', padding: 20, justifyContent: 'center' }}>
          <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#dc2626', marginBottom: 8 }}>
            启动失败
          </Text>
          <Text style={{ fontSize: 12, color: '#111827' }}>
            {String(this.state.err?.message || this.state.err)}
          </Text>
          <Text style={{ fontSize: 10, color: '#6b7280', marginTop: 12 }}>
            {this.state.err?.stack?.slice(0, 1500)}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function RootLayout() {
  useEffect(() => {
    // 3 秒后无论如何隐藏 splash，避免卡死
    const t1 = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, 500);
    const t2 = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, 3000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <RootErrorBoundary>
      <Provider>
        <Stack
          screenOptions={{
            animation: 'slide_from_right',
            gestureEnabled: true,
            gestureDirection: 'horizontal',
            headerShown: false,
          }}
        >
          <Stack.Screen name="(tabs)" />
        </Stack>
        <Toast />
      </Provider>
    </RootErrorBoundary>
  );
}

/**
 * 根布局
 */
import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View } from 'react-native';
import { semantic } from '../lib/theme';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: semantic.pageBg }}>
        <StatusBar style="light" backgroundColor={semantic.pageBg} />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: semantic.pageBg },
              animation: 'fade',
            }}
          />
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

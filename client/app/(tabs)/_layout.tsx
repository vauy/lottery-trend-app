import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome6 } from '@expo/vector-icons';
import { useCSSVariable } from 'uniwind';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const [background, muted, accent, border] = useCSSVariable([
    '--color-background',
    '--color-muted',
    '--color-accent',
    '--color-border',
  ]) as string[];

  let tabBarStyle: Record<string, unknown> = {
    backgroundColor: background,
    borderTopWidth: 1,
    borderTopColor: border,
  };
  if (Platform.OS === 'web') {
    tabBarStyle = { ...tabBarStyle, height: 'auto' as unknown as number };
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle,
        tabBarActiveTintColor: accent,
        tabBarInactiveTintColor: muted,
      }}
    >
      <Tabs.Screen
        name="analyze"
        options={{
          title: '分析',
          tabBarIcon: ({ color }) => <FontAwesome6 name="chart-simple" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="shrink"
        options={{
          title: '组号',
          tabBarIcon: ({ color }) => <FontAwesome6 name="filter" size={20} color={color} />,
        }}
      />
      {/* 隐藏其他页面（不显示在 Tab，但路由仍然可用） */}
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="omission" options={{ href: null }} />
      <Tabs.Screen name="picker" options={{ href: null }} />
    </Tabs>
  );
}

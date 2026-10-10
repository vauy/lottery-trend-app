/**
 * 底部 Tab 导航 —— 6 个功能页签
 */
import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { fontSize, semantic } from '../../lib/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function icon(name: IconName, color: string, size: number) {
  return <Ionicons name={name} size={size} color={color} />;
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: semantic.brand,
        tabBarInactiveTintColor: semantic.textFaint,
        tabBarStyle: {
          backgroundColor: semantic.panelBg,
          borderTopColor: semantic.panelBorder,
          borderTopWidth: 1,
          height: 56,
          paddingBottom: 4,
        },
        tabBarLabelStyle: {
          fontSize: fontSize.xs,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '走势',
          tabBarIcon: ({ color, size }) => icon('stats-chart', color, size),
        }}
      />
      <Tabs.Screen
        name="chart"
        options={{
          title: 'K线',
          tabBarIcon: ({ color, size }) => icon('analytics', color, size),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: '搜索',
          tabBarIcon: ({ color, size }) => icon('search', color, size),
        }}
      />
      <Tabs.Screen
        name="pick"
        options={{
          title: '选胆',
          tabBarIcon: ({ color, size }) => icon('bulb', color, size),
        }}
      />
      <Tabs.Screen
        name="shrink"
        options={{
          title: '组号',
          tabBarIcon: ({ color, size }) => icon('cut', color, size),
        }}
      />
      <Tabs.Screen
        name="omission"
        options={{
          title: '遗漏',
          tabBarIcon: ({ color, size }) => icon('grid', color, size),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '设置',
          tabBarIcon: ({ color, size }) => icon('settings', color, size),
        }}
      />
    </Tabs>
  );
}

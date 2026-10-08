import { Tabs, router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
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
  const [gameMenuOpen, setGameMenuOpen] = useState(false);

  let tabBarStyle: Record<string, unknown> = {
    backgroundColor: background,
    borderTopWidth: 1,
    borderTopColor: border,
  };
  if (Platform.OS === 'web') {
    tabBarStyle = { ...tabBarStyle, height: 'auto' as unknown as number };
  }

  const pickGame = (id: string) => {
    setGameMenuOpen(false);
    if (id === 'fc3d') router.push('/(tabs)/shrink');
    else if (id === 'pl5') router.push('/(tabs)/pl5-shrink');
    else if (id === 'kl8') router.push('/(tabs)/kl8-shrink');
  };

  return (
    <View style={{ flex: 1 }}>
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
        <Tabs.Screen name="pl5-shrink" options={{ href: null }} />
        <Tabs.Screen name="kl8-shrink" options={{ href: null }} />
        <Tabs.Screen
          name="shrink"
          options={{
            title: '组号',
            tabBarIcon: ({ color }) => <FontAwesome6 name="filter" size={20} color={color} />,
            tabBarLabel: ({ color, focused }) => (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ color, fontSize: 10, fontWeight: focused ? '600' : '400' }}>组号</Text>
                <Text style={{ color, fontSize: 7, marginLeft: 2 }}>▲</Text>
              </View>
            ),
          }}
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              setGameMenuOpen(true);
            },
          }}
        />
        <Tabs.Screen name="index" options={{ href: null }} />
        <Tabs.Screen name="omission" options={{ href: null }} />
        <Tabs.Screen name="picker" options={{ href: null }} />
      </Tabs>

      {gameMenuOpen && (
        <>
          <Pressable
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            onPress={() => setGameMenuOpen(false)}
          />
          <View
            style={{
              position: 'absolute',
              bottom: 70 + insets.bottom,
              right: 24,
            }}
          >
            {[
              { id: 'kl8', label: 'K8' },
              { id: 'pl5', label: 'P5' },
              { id: 'fc3d', label: '3D' },
            ].map((g) => (
              <Pressable
                key={g.id}
                onPress={() => pickGame(g.id)}
                style={{
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                  backgroundColor: 'rgba(37,99,235,0.95)',
                  borderRadius: 8,
                  marginBottom: 6,
                  alignItems: 'center',
                  minWidth: 60,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{g.label}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

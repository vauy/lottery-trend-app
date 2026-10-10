/**
 * 屏幕容器 —— 统一背景、安全区与滚动行为
 */
import React from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { semantic, space } from '../lib/theme';

export function Screen({
  children,
  scroll = true,
  style,
  contentStyle,
  padding = space.lg,
}: {
  children?: React.ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  padding?: number;
}) {
  return (
    <SafeAreaView style={[styles.root, style]}>
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[{ padding }, contentStyle]}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, { padding }, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: semantic.pageBg,
  },
  flex: {
    flex: 1,
  },
});

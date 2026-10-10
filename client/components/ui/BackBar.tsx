/**
 * 自绘返回行 —— tab 栏移除后，缩水/组号等二级屏的返回入口。
 * 纯文本按钮 + router.back()，不依赖原生 header。
 */
import { Pressable, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { fontSize as fs, semantic, space } from '@/lib/theme';

export function BackBar({ label = '返回' }: { label?: string }) {
  return (
    <Pressable style={styles.bar} onPress={() => router.back()} hitSlop={8}>
      <Text style={styles.text}>‹ {label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { paddingVertical: space.xs, alignSelf: 'flex-start' },
  text: { color: semantic.textDim, fontSize: fs.sm },
});

export default BackBar;

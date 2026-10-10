import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { Screen } from '../components/Screen';
import { semantic, fontSize } from '../lib/theme';

export default function NotFound() {
  return (
    <Screen scroll={false}>
      <View style={styles.center}>
        <Text style={styles.title}>页面不存在</Text>
        <Link href="/" style={styles.link}>
          返回首页
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  title: {
    color: semantic.text,
    fontSize: fontSize.xl,
    fontWeight: '700',
  },
  link: {
    color: semantic.brand,
    fontSize: fontSize.md,
  },
});

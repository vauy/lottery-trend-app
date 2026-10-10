import { Stack } from 'expo-router';

/**
 * 底部不再显示 分析 / 组号 tab 栏（对齐参考图全屏分析布局）。
 * 路由全部保留：组号（缩水）入口移到分析屏底部图型栏「更多」菜单里，
 * router.push 跳转后由缩水屏自带的返回行 router.back() 返回。
 */
export default function TabLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="analyze" />
      <Stack.Screen name="shrink" />
      <Stack.Screen name="pl5-shrink" />
      <Stack.Screen name="kl8-shrink" />
      <Stack.Screen name="omission" />
      <Stack.Screen name="picker" />
    </Stack>
  );
}

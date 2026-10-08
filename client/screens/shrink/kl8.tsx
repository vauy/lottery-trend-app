import { View, Text } from 'react-native';
import { Screen } from '@/components/Screen';

export default function Kl8ShrinkScreen() {
  return (
    <Screen safeAreaEdges={['top', 'left', 'right']}>
      <View className="flex-1 items-center justify-center">
        <Text className="text-lg font-bold text-foreground mb-2">快乐8 缩水</Text>
        <Text className="text-sm text-muted">开发中，敬请期待</Text>
      </View>
    </Screen>
  );
}

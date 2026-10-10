import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { BackBar } from '@/components/ui/BackBar';
import { Legend, Panel } from '@/components/ui/Kit';
import { fontSize as fs, semantic, space } from '@/lib/theme';

export default function Kl8ShrinkScreen() {
  return (
    <Screen
      safeAreaEdges={['top', 'left', 'right']}
      backgroundColor={semantic.pageBg}
      statusBarStyle="light"
    >
      <BackBar />
      <View style={styles.page}>
        <Panel label="快乐8 · 缩水">
          <Text style={styles.title}>快乐8 缩水</Text>
          <Text style={styles.hint}>开发中，敬请期待</Text>
          <Legend
            items={[
              { color: semantic.dan, label: '已选 / 胆码' },
              { color: semantic.cold, label: '组选号码' },
            ]}
          />
        </Panel>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: semantic.pageBg, padding: space.md },
  title: { fontSize: fs.lg, fontWeight: '700', color: semantic.text, marginBottom: space.sm },
  hint: { fontSize: fs.sm, color: semantic.textDim, marginBottom: space.md },
});

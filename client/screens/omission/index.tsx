/**
 * 遗漏页 —— 胆码遗漏走势（上下双联图） + 全号码遗漏汇总。
 * 视觉对齐 prototype/：深色 shell + Panel / Field / DigitGrid / BottomBar。
 */
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/Screen';
import { OmissionChart } from '@/components/charts/OmissionChart';
import { useLotteryAnalysis, useLotteryHistory, useGame } from '@/hooks/useLottery';
import { buildOmissionSeries } from '@/lib/lottery/analysis';
import type { TemperatureStatus } from '@/lib/lottery/types';
import {
  BottomBar,
  DigitGrid,
  Field,
  Panel,
  StatPill,
  type DigitMark,
} from '@/components/ui/Kit';
import { alpha, fontSize as fs, palette, radius, semantic, space } from '@/lib/theme';

const TEMP_LABEL: Record<TemperatureStatus, string> = { hot: '热', warm: '温', cold: '冷' };
const TEMP_COLOR: Record<TemperatureStatus, string> = {
  hot: semantic.hot,
  warm: palette.amber,
  cold: semantic.cold,
};

export default function OmissionScreen() {
  const [selectedDigit, setSelectedDigit] = useState<number | null>(null);

  const { width: screenW, height: screenH } = useWindowDimensions();
  const isLandscape = screenW > screenH;
  const insets = useSafeAreaInsets();

  const game = useGame('fc3d');
  const { records, loading, error } = useLotteryHistory(game.id, 120);
  const { digits, stats } = useLotteryAnalysis(game, records, 10);

  // 默认选中遗漏最大的数字（最冷的号）
  const activeDigit = useMemo(() => {
    if (selectedDigit !== null) return selectedDigit;
    if (stats.length === 0) return 0;
    return stats.reduce((a, b) => (b.omission > a.omission ? b : a)).digit;
  }, [selectedDigit, stats]);

  const tempMap = useMemo(() => {
    const m: Record<number, TemperatureStatus> = {};
    for (const s of stats) m[s.digit] = s.temperature;
    return m;
  }, [stats]);

  // 冷温热 → DigitGrid 的冷热标记
  const marks: Record<number, DigitMark> = {};
  for (const s of stats) {
    const t = tempMap[s.digit];
    marks[s.digit] = t === 'hot' ? 'hot' : t === 'cold' ? 'cold' : 'none';
  }

  // 一阶遗漏完整序列（每一期）
  const omissionSeries = useMemo(
    () => buildOmissionSeries(records, activeDigit),
    [records, activeDigit],
  );

  // 遗漏汇总表：按遗漏降序排列
  const sortedStats = useMemo(() => [...stats].sort((a, b) => b.omission - a.omission), [stats]);

  const bar = (
    <BottomBar
      vertical={isLandscape}
      primaryLabel="重置胆码"
      onPrimary={() => setSelectedDigit(null)}
      hint="理论遗漏 = (取值个数 - 位数) / 位数，福彩3D 为 (10-3)/3 ≈ 2.3 期。"
    />
  );

  return (
    <Screen
      safeAreaEdges={['top', 'left', 'right']}
      backgroundColor={semantic.pageBg}
      statusBarStyle="light"
    >
      <View style={styles.root}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* 品牌栏 */}
          <View style={styles.brand}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>奇</Text>
            </View>
            <View style={styles.brandText}>
              <Text style={styles.h1}>遗漏分析</Text>
              <Text style={styles.sub}>OMISSION · 胆码遗漏走势</Text>
            </View>
            <StatPill>
              <Text style={styles.pillText}>
                最新{' '}
                <Text style={styles.pillValue}>
                  {records.length > 0 ? records[records.length - 1].issue : '-'}
                </Text>
              </Text>
            </StatPill>
          </View>

          {loading ? (
            <View style={styles.state}>
              <ActivityIndicator color={semantic.brand} />
              <Text style={styles.stateText}>正在加载数据…</Text>
            </View>
          ) : error ? (
            <View style={styles.state}>
              <Text style={styles.stateError}>加载失败：{error}</Text>
            </View>
          ) : (
            <View style={[styles.body, isLandscape && styles.bodyRow]}>
              {/* 左栏：胆码选择 */}
              <View style={[styles.col, isLandscape && styles.colSide]}>
                <Panel label="选 号" right={<Text style={styles.panelMeta}>{game.name}</Text>}>
                  <Field caption="数字 0–9（点击切换胆码）">
                    <DigitGrid
                      digits={digits}
                      selected={[activeDigit]}
                      onToggle={setSelectedDigit}
                      marks={marks}
                      columns={5}
                    />
                  </Field>
                </Panel>
                {isLandscape ? bar : null}
              </View>

              {/* 右栏：图表 + 汇总 */}
              <View style={styles.col}>
                <Panel
                  label={`胆码 ${activeDigit} 遗漏分析`}
                  right={<Text style={styles.panelMeta}>{records.length} 期</Text>}
                >
                  <OmissionChart series={omissionSeries} height={340} />
                </Panel>

                <Panel label="全号码遗漏汇总（近10期）">
                  <View style={styles.tableHead}>
                    <Header text="号码" flex={0.8} />
                    <Header text="遗漏" flex={1} />
                    <Header text="频率" flex={1} />
                    <Header text="最大遗漏" flex={1.2} />
                    <Header text="冷温热" flex={1} />
                  </View>
                  {sortedStats.map((s, i) => (
                    <View key={s.digit} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
                      <Text style={[styles.cell, styles.cellStrong, { flex: 0.8 }]}>{s.digit}</Text>
                      <Text style={[styles.cell, { flex: 1 }]}>{s.omission}</Text>
                      <Text style={[styles.cell, { flex: 1 }]}>{s.frequency}</Text>
                      <Text style={[styles.cell, { flex: 1.2 }]}>{s.maxOmission}</Text>
                      <View style={[styles.tempCell, { flex: 1 }]}>
                        <View
                          style={[
                            styles.tempTag,
                            { backgroundColor: alpha(TEMP_COLOR[s.temperature], 0.16) },
                          ]}
                        >
                          <Text style={[styles.tempText, { color: TEMP_COLOR[s.temperature] }]}>
                            {TEMP_LABEL[s.temperature]}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </Panel>
              </View>
            </View>
          )}
        </ScrollView>

        {isLandscape ? null : (
          <View style={{ paddingBottom: insets.bottom }}>{bar}</View>
        )}
      </View>
    </Screen>
  );
}

function Header({ text, flex }: { text: string; flex: number }) {
  return <Text style={[styles.headCell, { flex }]}>{text}</Text>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semantic.pageBg },
  scrollView: { flex: 1 },
  scroll: { padding: space.lg, paddingBottom: space.xl, gap: space.lg },

  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    backgroundColor: semantic.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { fontWeight: '800', color: semantic.onBrand, fontSize: fs.md },
  brandText: { flex: 1 },
  h1: { fontSize: fs.lg, fontWeight: '700', letterSpacing: 0.6, lineHeight: 20 },
  sub: { fontSize: fs.micro, color: semantic.textFaint, letterSpacing: 1.6 },
  pillText: { fontSize: fs.micro, color: semantic.textFaint },
  pillValue: { color: palette.cyan, fontWeight: '600' },

  body: { gap: space.lg },
  bodyRow: { flexDirection: 'row', alignItems: 'flex-start' },
  col: { flex: 1, gap: space.lg },
  colSide: { flex: 0, width: 300, maxWidth: '34%' },

  panelMeta: { fontSize: fs.micro, color: semantic.textFaint },

  state: { alignItems: 'center', paddingVertical: 80, gap: space.sm },
  stateText: { fontSize: fs.sm, color: semantic.textDim },
  stateError: { fontSize: fs.sm, color: semantic.hot },

  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: semantic.controlBg,
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  headCell: { fontSize: fs.xs, fontWeight: '600', color: semantic.textDim },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  tableRowAlt: { backgroundColor: alpha(palette.ink, 0.03) },
  cell: { fontSize: fs.sm, color: semantic.text },
  cellStrong: { fontWeight: '700' },
  tempCell: { flexDirection: 'row' },
  tempTag: { paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.sm },
  tempText: { fontSize: fs.xs, fontWeight: '600' },
});

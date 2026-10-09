/**
 * 走势页 —— 选号 + 出次 + 算一次/算几次 + 3 种图表切换 + 横屏优化。
 * 视觉对齐 prototype/：深色 shell + Panel / Field / DigitGrid / Chip / Segmented / SubTabs / BottomBar。
 */
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/Screen';
import { StockChart } from '@/components/charts/StockChart';
import { OmissionLineChart } from '@/components/charts/OmissionLineChart';
import { useLotteryHistory, useGame } from '@/hooks/useLottery';
import type { TemperatureStatus } from '@/lib/lottery/types';
import {
  BottomBar,
  Chip,
  DigitGrid,
  Field,
  Panel,
  Segmented,
  StatPill,
  SubTabs,
  type DigitMark,
} from '@/components/ui/Kit';
import { fontSize as fs, palette, radius, semantic, space } from '@/lib/theme';

const COUNT_OPTIONS = [30, 60, 120, 300];
const COUNT_RANGE = [0, 1, 2, 3];
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

type ChartMode = 'frequency' | 'omission' | 'omissionLine';
type CountMode = 'once' | 'multi';

const CHART_TABS: { id: ChartMode; label: string }[] = [
  { id: 'frequency', label: '频率K线' },
  { id: 'omission', label: '遗漏K线' },
  { id: 'omissionLine', label: '遗漏图' },
];

export default function TrendScreen() {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const isLandscape = screenW > screenH;
  const chartHeight = isLandscape ? Math.floor(screenH * 0.65) : 300;
  const insets = useSafeAreaInsets();

  const [count, setCount] = useState(120);
  const [pendingDigits, setPendingDigits] = useState<Set<number>>(new Set());
  const [selectedDigits, setSelectedDigits] = useState<Set<number>>(new Set());
  const [pendingCounts, setPendingCounts] = useState<Set<number>>(new Set([3]));
  const [selectedCounts, setSelectedCounts] = useState<Set<number>>(new Set([3]));
  const [countOnce, setCountOnce] = useState(true);
  const [chartMode, setChartMode] = useState<ChartMode>('frequency');

  const game = useGame('fc3d');
  const { records, loading, refreshing, source, error, refresh } = useLotteryHistory(game.id, count);

  const isHit = (nums: number[], digits: Set<number>, counts: Set<number>, once: boolean): boolean => {
    if (digits.size === 0) return false;
    let total: number;
    if (once) {
      const uniqueInSet = new Set<number>();
      for (const n of nums) if (digits.has(n)) uniqueInSet.add(n);
      total = uniqueInSet.size;
    } else {
      total = nums.filter((n) => digits.has(n)).length;
    }
    return counts.has(total);
  };

  const trendPoints = useMemo(() => {
    if (records.length === 0 || selectedDigits.size === 0) return [];
    return records.map((r) => ({
      issue: r.issue,
      date: '',
      hit: isHit(r.nums, selectedDigits, selectedCounts, countOnce) ? 1 : 0,
      ma: {},
      boll: null,
    }));
  }, [records, selectedDigits, selectedCounts, countOnce]);

  const hitCount = useMemo(() => trendPoints.filter((p) => p.hit === 1).length, [trendPoints]);

  const coverage = useMemo(() => {
    if (selectedDigits.size === 0 || selectedCounts.size === 0) return 0;
    let hit = 0;
    for (let i = 0; i < 1000; i++) {
      const nums = [Math.floor(i / 100), Math.floor((i % 100) / 10), i % 10];
      if (isHit(nums, selectedDigits, selectedCounts, countOnce)) hit += 1;
    }
    return hit / 1000;
  }, [selectedDigits, selectedCounts, countOnce]);

  const currentMiss = useMemo(() => {
    let m = 0;
    for (let i = trendPoints.length - 1; i >= 0; i--) {
      if (trendPoints[i].hit === 1) break;
      m += 1;
    }
    return m;
  }, [trendPoints]);

  const togglePendingDigit = (d: number) => {
    setPendingDigits((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  };

  const togglePendingCount = (c: number) => {
    setPendingCounts((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  const handlePlot = () => {
    setSelectedDigits(new Set(pendingDigits));
    setSelectedCounts(new Set(pendingCounts));
  };

  const tempMap: Record<number, TemperatureStatus> = {};
  const marks: Record<number, DigitMark> = {};
  for (const d of Object.keys(tempMap)) {
    const t = tempMap[Number(d)];
    marks[Number(d)] = t === 'hot' ? 'hot' : t === 'cold' ? 'cold' : 'none';
  }

  const canPlot = pendingDigits.size > 0 && pendingCounts.size > 0;
  const selectedDigitsText = Array.from(selectedDigits).join(',');
  const selectedCountsText = Array.from(selectedCounts).join(',');

  const chartTitle =
    chartMode === 'frequency'
      ? `频率 K 线（覆盖率 ${(coverage * 100).toFixed(2)}%）`
      : chartMode === 'omission'
        ? `遗漏 K 线（当前遗漏 ${currentMiss}）`
        : `遗漏图（当前遗漏 ${currentMiss}）`;

  const bar = (
    <BottomBar
      vertical={isLandscape}
      primaryLabel={`出 图（已选 ${pendingDigits.size} 个号码）`}
      onPrimary={() => {
        if (!canPlot) return;
        handlePlot();
      }}
      hint={
        canPlot
          ? `出次 ${Array.from(pendingCounts).join(',')} · ${countOnce ? '算一次' : '算几次'} · 下拉可刷新数据`
          : '请选择号码与出次后点击「出图」'
      }
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        >
          {/* 品牌栏 */}
          <View style={styles.brand}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>奇</Text>
            </View>
            <View style={styles.brandText}>
              <Text style={styles.h1}>福彩3D 走势分析</Text>
              <Text style={styles.sub}>
                最近 {count} 期 · {isLandscape ? '横屏' : '竖屏'}
              </Text>
            </View>
            <StatPill>
              <Text style={styles.pillText}>
                数据源{' '}
                <Text style={styles.pillValue}>
                  {source === 'network' ? '已联网更新' : source === 'cache' ? '本地缓存' : '内置数据'}
                </Text>
              </Text>
            </StatPill>
          </View>

          <View style={[styles.body, isLandscape && styles.bodyRow]}>
            {/* 左栏：参数 */}
            <View style={[styles.col, isLandscape && styles.colSide]}>
              <Panel label="选 号" right={<Text style={styles.panelMeta}>{game.name}</Text>}>
                <Field caption="期数">
                  <View style={styles.chipRow}>
                    {COUNT_OPTIONS.map((o) => (
                      <Chip
                        key={o}
                        label={`${o} 期`}
                        active={o === count}
                        onPress={() => setCount(o)}
                      />
                    ))}
                  </View>
                </Field>

                <Field caption="数字 0–9（可多选）">
                  <DigitGrid
                    digits={DIGITS}
                    selected={Array.from(pendingDigits)}
                    onToggle={togglePendingDigit}
                    marks={marks}
                    columns={5}
                  />
                </Field>

                <Field caption="出现次数（可多选）">
                  <View style={styles.chipRow}>
                    {COUNT_RANGE.map((c) => (
                      <Chip
                        key={c}
                        label={String(c)}
                        active={pendingCounts.has(c)}
                        onPress={() => togglePendingCount(c)}
                      />
                    ))}
                  </View>
                </Field>

                <Field caption="计数方式">
                  <Segmented<CountMode>
                    options={[
                      { value: 'once', label: '算一次' },
                      { value: 'multi', label: '算几次' },
                    ]}
                    value={countOnce ? 'once' : 'multi'}
                    onChange={(v) => setCountOnce(v === 'once')}
                    equalWidth
                  />
                </Field>
              </Panel>

              {isLandscape ? bar : null}
            </View>

            {/* 右栏：图表 */}
            <View style={styles.col}>
              {loading ? (
                <View style={styles.state}>
                  <ActivityIndicator color={semantic.brand} />
                  <Text style={styles.stateText}>正在加载…</Text>
                </View>
              ) : error ? (
                <View style={styles.state}>
                  <Text style={styles.stateError}>加载失败：{error}</Text>
                </View>
              ) : selectedDigits.size === 0 || trendPoints.length === 0 ? (
                <View style={styles.state}>
                  <Text style={styles.stateText}>请选择号码后点击「出图」</Text>
                </View>
              ) : (
                <Panel
                  label={chartTitle}
                  right={
                    <Text style={styles.panelMeta}>
                      命中 {hitCount}/{trendPoints.length}
                    </Text>
                  }
                >
                  <SubTabs<ChartMode>
                    items={CHART_TABS}
                    value={chartMode}
                    onChange={setChartMode}
                  />
                  <Text style={styles.chartMeta}>
                    命中 {hitCount} / {trendPoints.length} 期 · 选中数字 {selectedDigitsText} · 出次{' '}
                    {selectedCountsText} · {countOnce ? '算一次' : '算几次'}
                  </Text>
                  {chartMode === 'omissionLine' ? (
                    <OmissionLineChart points={trendPoints} height={chartHeight + 60} />
                  ) : (
                    <StockChart
                      points={trendPoints}
                      title=""
                      height={chartHeight}
                      mode={chartMode}
                      coverage={coverage}
                    />
                  )}
                </Panel>
              )}
            </View>
          </View>
        </ScrollView>

        {isLandscape ? null : <View style={{ paddingBottom: insets.bottom }}>{bar}</View>}
      </View>
    </Screen>
  );
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
  sub: { fontSize: fs.micro, color: semantic.textFaint, letterSpacing: 1.2 },
  pillText: { fontSize: fs.micro, color: semantic.textFaint },
  pillValue: { color: palette.cyan, fontWeight: '600' },

  body: { gap: space.lg },
  bodyRow: { flexDirection: 'row', alignItems: 'flex-start' },
  col: { flex: 1, gap: space.lg },
  colSide: { flex: 0, width: 300, maxWidth: '34%' },

  panelMeta: { fontSize: fs.micro, color: semantic.textFaint },
  chartMeta: { fontSize: fs.micro, color: semantic.textFaint, marginTop: space.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },

  state: { alignItems: 'center', paddingVertical: 80, gap: space.sm },
  stateText: { fontSize: fs.sm, color: semantic.textDim },
  stateError: { fontSize: fs.sm, color: semantic.hot },
});

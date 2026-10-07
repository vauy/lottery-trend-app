/**
 * 走势页 —— 选号 + 出次 + 算一次/算几次 + 3 种图表切换 + 横屏优化。
 */
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { DigitSelectorMulti } from '@/components/DigitSelectorMulti';
import { StockChart } from '@/components/charts/StockChart';
import { OmissionLineChart } from '@/components/charts/OmissionLineChart';
import { useLotteryHistory, useGame } from '@/hooks/useLottery';
import type { TemperatureStatus } from '@/lib/lottery/types';

const COUNT_OPTIONS = [30, 60, 120, 300];
const COUNT_RANGE = [0, 1, 2, 3];

type ChartMode = 'frequency' | 'omission' | 'omissionLine';

export default function TrendScreen() {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const isLandscape = screenW > screenH;
  const chartHeight = isLandscape ? Math.floor(screenH * 0.65) : 300;

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

  return (
    <Screen safeAreaEdges={['top', 'left', 'right']}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <View className="mb-2">
          <Text className="text-lg font-bold text-foreground">福彩3D 走势分析</Text>
          <Text className="text-xs text-muted mt-1">
            最近 {count} 期 · 数据源：{source === 'network' ? '已联网更新' : source === 'cache' ? '本地缓存' : '内置数据'}
            {isLandscape ? ' · 横屏' : ''}
          </Text>
        </View>

        {/* 期数 */}
        <View className="flex-row gap-2 mb-2">
          {COUNT_OPTIONS.map((o) => (
            <Pressable
              key={o}
              onPress={() => setCount(o)}
              className={`flex-1 py-1.5 rounded border ${o === count ? 'bg-accent border-accent' : 'bg-white border-border'}`}
            >
              <Text className={`text-xs text-center ${o === count ? 'text-accent-foreground font-semibold' : 'text-foreground'}`}>
                {o}期
              </Text>
            </Pressable>
          ))}
        </View>

        {/* 选号 */}
        <View className="bg-white rounded-xl border border-border p-2 mb-2">
          <Text className="text-xs text-muted mb-1">选号（可多选）</Text>
          <DigitSelectorMulti
            digits={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]}
            selected={pendingDigits}
            onToggle={togglePendingDigit}
            temperatureMap={tempMap}
          />
        </View>

        {/* 出次 */}
        <View className="mb-2">
          <Text className="text-xs text-muted mb-1">出现次数（可多选）</Text>
          <View className="flex-row gap-2">
            {COUNT_RANGE.map((c) => (
              <Pressable
                key={c}
                onPress={() => togglePendingCount(c)}
                className={`flex-1 py-1.5 rounded border ${pendingCounts.has(c) ? 'bg-accent border-accent' : 'bg-white border-border'}`}
              >
                <Text className={`text-sm text-center ${pendingCounts.has(c) ? 'text-accent-foreground font-semibold' : 'text-foreground'}`}>
                  {c}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* 算一次/算几次 */}
        <View className="flex-row gap-2 mb-2">
          <Pressable
            onPress={() => setCountOnce(true)}
            className={`flex-1 py-1.5 rounded border ${countOnce ? 'bg-accent border-accent' : 'bg-white border-border'}`}
          >
            <Text className={`text-sm text-center ${countOnce ? 'text-accent-foreground font-semibold' : 'text-foreground'}`}>
              算一次
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setCountOnce(false)}
            className={`flex-1 py-1.5 rounded border ${!countOnce ? 'bg-accent border-accent' : 'bg-white border-border'}`}
          >
            <Text className={`text-sm text-center ${!countOnce ? 'text-accent-foreground font-semibold' : 'text-foreground'}`}>
              算几次
            </Text>
          </Pressable>
        </View>

        {/* 出图 */}
        <Pressable
          onPress={handlePlot}
          disabled={pendingDigits.size === 0 || pendingCounts.size === 0}
          className={`rounded-lg py-2.5 items-center mb-3 ${pendingDigits.size === 0 || pendingCounts.size === 0 ? 'bg-gray-300' : 'bg-accent'}`}
        >
          <Text className={`text-base font-bold ${pendingDigits.size === 0 || pendingCounts.size === 0 ? 'text-gray-500' : 'text-accent-foreground'}`}>
            出图（已选 {pendingDigits.size} 个号码）
          </Text>
        </Pressable>

        {loading ? (
          <View className="items-center py-20">
            <ActivityIndicator />
            <Text className="text-muted mt-3">正在加载…</Text>
          </View>
        ) : error ? (
          <View className="items-center py-20">
            <Text className="text-danger">加载失败：{error}</Text>
          </View>
        ) : selectedDigits.size === 0 || trendPoints.length === 0 ? (
          <View className="items-center py-20">
            <Text className="text-muted">请选择号码后点击「出图」</Text>
          </View>
        ) : (
          <View className="bg-white rounded-xl border border-border p-3 mb-4">
            {/* 三个 Tab */}
            <View className="flex-row bg-surface-secondary rounded-lg p-0.5 mb-2">
              <Pressable
                onPress={() => setChartMode('frequency')}
                className={`flex-1 py-1.5 rounded-md items-center ${chartMode === 'frequency' ? 'bg-white shadow-sm' : ''}`}
              >
                <Text className={`text-xs ${chartMode === 'frequency' ? 'font-semibold text-foreground' : 'text-muted'}`}>
                  频率K线
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setChartMode('omission')}
                className={`flex-1 py-1.5 rounded-md items-center ${chartMode === 'omission' ? 'bg-white shadow-sm' : ''}`}
              >
                <Text className={`text-xs ${chartMode === 'omission' ? 'font-semibold text-foreground' : 'text-muted'}`}>
                  遗漏K线
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setChartMode('omissionLine')}
                className={`flex-1 py-1.5 rounded-md items-center ${chartMode === 'omissionLine' ? 'bg-white shadow-sm' : ''}`}
              >
                <Text className={`text-xs ${chartMode === 'omissionLine' ? 'font-semibold text-foreground' : 'text-muted'}`}>
                  遗漏图
                </Text>
              </Pressable>
            </View>

            <Text className="text-sm font-semibold text-foreground mb-1">
              {chartMode === 'frequency' && `频率 K 线（覆盖率 ${(coverage * 100).toFixed(2)}%）`}
              {chartMode === 'omission' && `遗漏 K 线（当前遗漏 ${currentMiss}）`}
              {chartMode === 'omissionLine' && `遗漏图（当前遗漏 ${currentMiss}）`}
            </Text>
            <Text className="text-[10px] text-muted mb-2">
              命中 {hitCount} / {trendPoints.length} 期 · 选中数字 {Array.from(selectedDigits).join(',')} · 出次 {Array.from(selectedCounts).join(',')} · {countOnce ? '算一次' : '算几次'}
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
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

/**
 * 遗漏页 —— 胆码遗漏走势（上下双联图） + 全号码遗漏汇总。
 */
import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { DigitSelector } from '@/components/DigitSelector';
import { OmissionChart } from '@/components/charts/OmissionChart';
import { useLotteryAnalysis, useLotteryHistory, useGame } from '@/hooks/useLottery';
import { buildOmissionSeries } from '@/lib/lottery/analysis';
import type { TemperatureStatus } from '@/lib/lottery/types';

const TEMP_LABEL: Record<TemperatureStatus, string> = { hot: '热', warm: '温', cold: '冷' };
const TEMP_COLOR: Record<TemperatureStatus, string> = {
  hot: '#ef4444',
  warm: '#f59e0b',
  cold: '#3b82f6',
};

export default function OmissionScreen() {
  const [selectedDigit, setSelectedDigit] = useState<number | null>(null);

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

  // 一阶遗漏完整序列（每一期）
  const omissionSeries = useMemo(
    () => buildOmissionSeries(records, activeDigit),
    [records, activeDigit],
  );

  // 遗漏汇总表：按遗漏降序排列
  const sortedStats = useMemo(() => [...stats].sort((a, b) => b.omission - a.omission), [stats]);

  return (
    <Screen safeAreaEdges={['top', 'left', 'right']}>
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        <Text className="text-xl font-bold text-foreground mb-1">遗漏分析</Text>
        <Text className="text-xs text-muted mb-4">
          选择胆码查看其遗漏走势 · 最新 {records.length > 0 ? records[records.length - 1].issue : '-'}
        </Text>

        {loading ? (
          <View className="items-center py-20">
            <ActivityIndicator />
            <Text className="text-muted mt-3">正在加载数据…</Text>
          </View>
        ) : error ? (
          <View className="items-center py-20">
            <Text className="text-danger">加载失败：{error}</Text>
          </View>
        ) : (
          <>
            {/* 胆码选择 */}
            <View className="bg-white rounded-xl border border-border p-4 mb-4">
              <Text className="text-sm font-semibold text-foreground mb-3">选择胆码</Text>
              <DigitSelector
                digits={digits}
                selected={activeDigit}
                onSelect={setSelectedDigit}
                temperatureMap={tempMap}
              />
            </View>

            {/* 遗漏双联图 */}
            <View className="bg-white rounded-xl border border-border p-4 mb-4">
              <Text className="text-sm font-semibold text-foreground mb-3">
                胆码 {activeDigit} 遗漏分析
              </Text>
              <OmissionChart series={omissionSeries} height={340} />
            </View>

            {/* 全号码遗漏汇总 */}
            <View className="bg-white rounded-xl border border-border p-4">
              <Text className="text-sm font-semibold text-foreground mb-3">全号码遗漏汇总（近10期）</Text>
              <View className="flex-row bg-surface-secondary rounded-t-lg px-3 py-2">
                <Header text="号码" flex={0.8} />
                <Header text="遗漏" flex={1} />
                <Header text="频率" flex={1} />
                <Header text="最大遗漏" flex={1.2} />
                <Header text="冷温热" flex={1} />
              </View>
              {sortedStats.map((s, i) => (
                <View
                  key={s.digit}
                  className={`flex-row items-center px-3 py-2 ${i % 2 === 0 ? 'bg-surface' : 'bg-background'}`}
                >
                  <Text className="text-sm font-bold text-foreground" style={{ flex: 0.8 }}>
                    {s.digit}
                  </Text>
                  <Text className="text-sm text-foreground" style={{ flex: 1 }}>
                    {s.omission}
                  </Text>
                  <Text className="text-sm text-foreground" style={{ flex: 1 }}>
                    {s.frequency}
                  </Text>
                  <Text className="text-sm text-foreground" style={{ flex: 1.2 }}>
                    {s.maxOmission}
                  </Text>
                  <View style={{ flex: 1, flexDirection: 'row' }}>
                    <View
                      className="px-2 py-0.5 rounded"
                      style={{ backgroundColor: `${TEMP_COLOR[s.temperature]}22` }}
                    >
                      <Text className="text-xs font-semibold" style={{ color: TEMP_COLOR[s.temperature] }}>
                        {TEMP_LABEL[s.temperature]}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>

            <Text className="text-[10px] text-muted text-center mt-5 leading-4">
              理论遗漏 = (取值个数 - 位数) / 位数，福彩3D 为 (10-3)/3 ≈ 2.3 期。
            </Text>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Header({ text, flex }: { text: string; flex: number }) {
  return <Text className="text-xs font-semibold text-muted" style={{ flex }}>{text}</Text>;
}

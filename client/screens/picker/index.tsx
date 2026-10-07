/**
 * 选号页 —— 基于冷温热的智能胆码推荐 + 号码生成工具。
 * 生成结果仅作娱乐参考，不构成投注建议。
 */
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { useLotteryAnalysis, useLotteryHistory, useGame } from '@/hooks/useLottery';
import { calcSpan, calcSum } from '@/lib/lottery/analysis';

type Strategy = 'hot' | 'cold' | 'mix' | 'random';

const STRATEGIES: { id: Strategy; name: string; desc: string }[] = [
  { id: 'hot', name: '热号追踪', desc: '全部从热码中取号' },
  { id: 'cold', name: '冷号回补', desc: '全部从冷码中取号' },
  { id: 'mix', name: '冷热均衡', desc: '热码 + 温码混合' },
  { id: 'random', name: '完全随机', desc: '0-9 等概率随机' },
];

const GEN_COUNTS = [5, 10, 20];

export default function PickerScreen() {
  const game = useGame('fc3d');
  const { records, loading, error } = useLotteryHistory(game.id, 120);
  const { stats, coldWarmHot } = useLotteryAnalysis(game, records, 10);

  const [strategy, setStrategy] = useState<Strategy>('mix');
  const [genCount, setGenCount] = useState(10);
  const [results, setResults] = useState<number[][]>([]);

  const pool = useMemo(() => {
    switch (strategy) {
      case 'hot':
        return coldWarmHot.hot.length > 0 ? coldWarmHot.hot : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
      case 'cold':
        return coldWarmHot.cold.length > 0 ? coldWarmHot.cold : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
      case 'mix':
        return [...new Set([...coldWarmHot.hot, ...coldWarmHot.warm])];
      default:
        return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    }
  }, [strategy, coldWarmHot]);

  const generate = () => {
    if (pool.length === 0) return;
    const seen = new Set<string>();
    const out: number[][] = [];
    let guard = 0;
    while (out.length < genCount && guard < genCount * 20) {
      guard += 1;
      const nums = [
        pool[Math.floor(Math.random() * pool.length)],
        pool[Math.floor(Math.random() * pool.length)],
        pool[Math.floor(Math.random() * pool.length)],
      ];
      const key = nums.join('');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(nums);
    }
    setResults(out);
  };

  return (
    <Screen safeAreaEdges={['top', 'left', 'right']}>
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        <Text className="text-xl font-bold text-foreground mb-1">智能选号</Text>
        <Text className="text-xs text-muted mb-4">
          基于冷温热与遗漏的号码参考 · 仅作娱乐，理性对待
        </Text>

        {loading ? (
          <View className="items-center py-20">
            <ActivityIndicator />
          </View>
        ) : error ? (
          <View className="items-center py-20">
            <Text className="text-danger">加载失败：{error}</Text>
          </View>
        ) : (
          <>
            {/* 冷温热参考 */}
            <View className="bg-white rounded-xl border border-border p-4 mb-4">
              <Text className="text-sm font-semibold text-foreground mb-3">冷温热参考（近10期）</Text>
              <PoolRow label="热码" nums={coldWarmHot.hot} color="#ef4444" />
              <PoolRow label="温码" nums={coldWarmHot.warm} color="#f59e0b" />
              <PoolRow label="冷码" nums={coldWarmHot.cold} color="#3b82f6" />
            </View>

            {/* 遗漏 Top */}
            <View className="bg-white rounded-xl border border-border p-4 mb-4">
              <Text className="text-sm font-semibold text-foreground mb-3">遗漏观察</Text>
              <View className="flex-row flex-wrap gap-2">
                {[...stats]
                  .sort((a, b) => b.omission - a.omission)
                  .slice(0, 5)
                  .map((s) => (
                    <View key={s.digit} className="flex-row items-center gap-1.5 bg-surface-secondary rounded-lg px-2.5 py-1.5">
                      <Text className="text-sm font-bold text-foreground">{s.digit}</Text>
                      <Text className="text-xs text-muted">遗漏{s.omission}</Text>
                    </View>
                  ))}
              </View>
            </View>

            {/* 选号策略 */}
            <View className="bg-white rounded-xl border border-border p-4 mb-4">
              <Text className="text-sm font-semibold text-foreground mb-3">选号策略</Text>
              <View className="flex-row flex-wrap gap-2">
                {STRATEGIES.map((s) => (
                  <Pressable
                    key={s.id}
                    onPress={() => setStrategy(s.id)}
                    className={`px-3 py-2 rounded-lg border ${
                      strategy === s.id ? 'bg-accent border-accent' : 'bg-white border-border'
                    }`}
                  >
                    <Text
                      className={`text-sm font-semibold ${
                        strategy === s.id ? 'text-accent-foreground' : 'text-foreground'
                      }`}
                    >
                      {s.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text className="text-xs text-muted mt-2">
                {STRATEGIES.find((s) => s.id === strategy)?.desc}
              </Text>
            </View>

            {/* 生成数量 + 按钮 */}
            <View className="bg-white rounded-xl border border-border p-4 mb-4">
              <Text className="text-sm font-semibold text-foreground mb-3">生成数量</Text>
              <View className="flex-row gap-2 mb-4">
                {GEN_COUNTS.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => setGenCount(c)}
                    className={`flex-1 py-2 rounded-lg border ${
                      genCount === c ? 'bg-accent border-accent' : 'bg-white border-border'
                    }`}
                  >
                    <Text
                      className={`text-center text-sm font-semibold ${
                        genCount === c ? 'text-accent-foreground' : 'text-foreground'
                      }`}
                    >
                      {c} 注
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Pressable className="bg-accent rounded-lg py-3 items-center" onPress={generate}>
                <Text className="text-accent-foreground text-base font-bold">生成号码</Text>
              </Pressable>
            </View>

            {/* 结果 */}
            {results.length > 0 && (
              <View className="bg-white rounded-xl border border-border p-4">
                <Text className="text-sm font-semibold text-foreground mb-3">
                  生成结果（{results.length} 注）
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {results.map((nums, i) => (
                    <View
                      key={i}
                      className="bg-surface-secondary rounded-lg px-3 py-2 items-center"
                      style={{ minWidth: 92 }}
                    >
                      <View className="flex-row gap-1 mb-1">
                        {nums.map((n, j) => (
                          <View key={j} className="w-6 h-6 bg-accent rounded items-center justify-center">
                            <Text className="text-white text-xs font-bold">{n}</Text>
                          </View>
                        ))}
                      </View>
                      <Text className="text-[10px] text-muted">
                        和{calcSum(nums)} 跨{calcSpan(nums)}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <Text className="text-[10px] text-muted text-center mt-5 leading-4">
              免责声明：号码由随机算法生成，仅供娱乐参考，不构成任何投注建议。
              {'\n'}彩票开奖为独立随机事件，请理性购彩、量力而行。
            </Text>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function PoolRow({ label, nums, color }: { label: string; nums: number[]; color: string }) {
  return (
    <View className="flex-row items-center mt-2">
      <Text className="text-sm font-semibold w-12" style={{ color }}>{label}</Text>
      <View className="flex-row gap-1.5 flex-1">
        {nums.length === 0 ? (
          <Text className="text-muted text-sm">（无）</Text>
        ) : (
          nums.map((n) => (
            <View key={n} className="w-7 h-7 rounded items-center justify-center" style={{ backgroundColor: color }}>
              <Text className="text-white text-sm font-bold">{n}</Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}
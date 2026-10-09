/**
 * 选号页 —— 基于冷温热的智能胆码推荐 + 号码生成工具。
 * 生成结果仅作娱乐参考，不构成投注建议。
 * 视觉对齐 prototype/：深色 shell + Panel / Field / Segmented / Chip / CodePill / BottomBar。
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
import { useLotteryAnalysis, useLotteryHistory, useGame } from '@/hooks/useLottery';
import { calcSpan, calcSum } from '@/lib/lottery/analysis';
import {
  BottomBar,
  Chip,
  CodePill,
  Field,
  Panel,
  Segmented,
  StatPill,
} from '@/components/ui/Kit';
import { alpha, fontSize as fs, palette, radius, semantic, space } from '@/lib/theme';

type Strategy = 'hot' | 'cold' | 'mix' | 'random';

const STRATEGIES: { id: Strategy; name: string; desc: string }[] = [
  { id: 'hot', name: '热号追踪', desc: '全部从热码中取号' },
  { id: 'cold', name: '冷号回补', desc: '全部从冷码中取号' },
  { id: 'mix', name: '冷热均衡', desc: '热码 + 温码混合' },
  { id: 'random', name: '完全随机', desc: '0-9 等概率随机' },
];

const GEN_COUNTS = [5, 10, 20];

const POOL_COLOR = {
  hot: semantic.hot,
  warm: palette.amber,
  cold: semantic.cold,
} as const;

export default function PickerScreen() {
  const game = useGame('fc3d');
  const { records, loading, error } = useLotteryHistory(game.id, 120);
  const { stats, coldWarmHot } = useLotteryAnalysis(game, records, 10);

  const { width: screenW, height: screenH } = useWindowDimensions();
  const isLandscape = screenW > screenH;
  const insets = useSafeAreaInsets();

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

  // 遗漏 Top5
  const topOmission = useMemo(
    () => [...stats].sort((a, b) => b.omission - a.omission).slice(0, 5),
    [stats],
  );

  const strategyDesc = STRATEGIES.find((s) => s.id === strategy)?.desc ?? '';

  const bar = (
    <BottomBar
      vertical={isLandscape}
      ghostLabel="清空"
      onGhost={() => setResults([])}
      primaryLabel="生成号码"
      onPrimary={generate}
      hint="免责声明：号码由随机算法生成，仅供娱乐参考，不构成任何投注建议。彩票开奖为独立随机事件，请理性购彩、量力而行。"
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
              <Text style={styles.h1}>智能选号</Text>
              <Text style={styles.sub}>PICKER · 冷温热与遗漏</Text>
            </View>
            <StatPill>
              <Text style={styles.pillText}>
                号码池 <Text style={styles.pillValue}>{pool.length}</Text>
              </Text>
            </StatPill>
          </View>

          {loading ? (
            <View style={styles.state}>
              <ActivityIndicator color={semantic.brand} />
            </View>
          ) : error ? (
            <View style={styles.state}>
              <Text style={styles.stateError}>加载失败：{error}</Text>
            </View>
          ) : (
            <View style={[styles.body, isLandscape && styles.bodyRow]}>
              {/* 左栏：参考 + 参数 */}
              <View style={[styles.col, isLandscape && styles.colSide]}>
                <Panel label="冷温热参考（近10期）">
                  <PoolRow label="热码" nums={coldWarmHot.hot} color={POOL_COLOR.hot} />
                  <PoolRow label="温码" nums={coldWarmHot.warm} color={POOL_COLOR.warm} />
                  <PoolRow label="冷码" nums={coldWarmHot.cold} color={POOL_COLOR.cold} />
                </Panel>

                <Panel label="遗漏观察">
                  <View style={styles.pillWrap}>
                    {topOmission.map((s) => (
                      <View key={s.digit} style={styles.pillItem}>
                        <CodePill code={String(s.digit)} />
                        <Text style={styles.pillMeta}>遗漏{s.omission}</Text>
                      </View>
                    ))}
                  </View>
                </Panel>

                <Panel
                  label="选号策略"
                  right={<Text style={styles.panelMeta}>{game.name}</Text>}
                >
                  <Field>
                    <Segmented<Strategy>
                      options={STRATEGIES.map((s) => ({ value: s.id, label: s.name }))}
                      value={strategy}
                      onChange={setStrategy}
                    />
                  </Field>
                  <Text style={styles.hint}>{strategyDesc}</Text>
                </Panel>

                <Panel label="生成数量">
                  <Field>
                    <View style={styles.chipRow}>
                      {GEN_COUNTS.map((c) => (
                        <Chip
                          key={c}
                          label={`${c} 注`}
                          active={genCount === c}
                          onPress={() => setGenCount(c)}
                        />
                      ))}
                    </View>
                  </Field>
                </Panel>

                {isLandscape ? bar : null}
              </View>

              {/* 右栏：结果 */}
              <View style={styles.col}>
                {results.length > 0 ? (
                  <Panel label={`生成结果（${results.length} 注）`}>
                    <View style={styles.pillWrap}>
                      {results.map((nums, i) => (
                        <View key={i} style={styles.pillItem}>
                          <CodePill code={nums.join('')} />
                          <Text style={styles.pillMeta}>
                            和{calcSum(nums)} 跨{calcSpan(nums)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </Panel>
                ) : null}
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

function PoolRow({ label, nums, color }: { label: string; nums: number[]; color: string }) {
  return (
    <View style={styles.poolRow}>
      <Text style={[styles.poolLabel, { color }]}>{label}</Text>
      <View style={styles.poolNums}>
        {nums.length === 0 ? (
          <Text style={styles.poolEmpty}>（无）</Text>
        ) : (
          nums.map((n) => (
            <View
              key={n}
              style={[styles.poolDigit, { backgroundColor: alpha(color, 0.18) }]}
            >
              <Text style={[styles.poolDigitText, { color }]}>{n}</Text>
            </View>
          ))
        )}
      </View>
    </View>
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
  sub: { fontSize: fs.micro, color: semantic.textFaint, letterSpacing: 1.6 },
  pillText: { fontSize: fs.micro, color: semantic.textFaint },
  pillValue: { color: palette.cyan, fontWeight: '600' },

  body: { gap: space.lg },
  bodyRow: { flexDirection: 'row', alignItems: 'flex-start' },
  col: { flex: 1, gap: space.lg },
  colSide: { flex: 0, width: 320, maxWidth: '40%' },

  panelMeta: { fontSize: fs.micro, color: semantic.textFaint },

  state: { alignItems: 'center', paddingVertical: 80, gap: space.sm },
  stateError: { fontSize: fs.sm, color: semantic.hot },

  poolRow: { flexDirection: 'row', alignItems: 'center', marginTop: space.sm, gap: space.sm },
  poolLabel: { fontSize: fs.sm, fontWeight: '600', width: 44 },
  poolNums: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  poolEmpty: { fontSize: fs.sm, color: semantic.textFaint },
  poolDigit: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  poolDigitText: { fontSize: fs.sm, fontWeight: '700' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  pillItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pillMeta: { fontSize: fs.micro, color: semantic.textFaint },
  hint: { fontSize: fs.xs, color: semantic.textDim },
});

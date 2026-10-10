/**
 * 主页分析 —— 14 个子页签，手机优先版式。
 * 视觉骨架与 prototype/ 1:1：brand / 彩种 / 主导航 / 子页签 / content / bottombar。
 * 所有颜色取自 @/lib/theme，容器与版式取自 @/components/ui/Kit。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/Screen';
import { EChartsFreqKChart } from '@/components/charts/EChartsFreqKChart';
import { EChartsOmissionChart } from '@/components/charts/EChartsOmissionChart';
import { EChartsOmissionKChart } from '@/components/charts/EChartsOmissionKChart';
import { EChartsChuciChart } from '@/components/charts/EChartsChuciChart';
import { EChartsMissSumChart } from '@/components/charts/EChartsMissSumChart';
// 注：原 Skia 版原始值走势图已改用 EChartsRawChart（WebView 渲染），
// 以保证 App 可在 Expo Go（Termux 热更新）运行，不依赖自定义原生模块。
import { EChartsRawChart } from '@/components/charts/EChartsRawChart';
import { MultiPaneChart } from '@/components/charts/MultiPaneChart';
import { aggregate, buildBoll, buildOmissionBars, buildChuciSeries, buildChuciMoveSeries, lastBollTriple, missSumDropRate, MISS_SUM_REF, secondOrderFromTheory, type CycleAlign } from '@/components/charts/chartMath';
import { IndicatorPanel } from '@/components/ui/IndicatorPanel';
import {
  DEFAULT_MA,
  INDICATOR_META,
  type IndicatorId,
  type MaConfig,
} from '@/lib/charts/indicators';
import { buildRawSeries, buildShapeCodes, getTargetLabel, posIndex, SET_ATTRS, type SetAttrKey, type Kl8Play, type ShapeMainMode, type ShapeFilter } from '@/lib/lottery/targets';
import { useLotteryHistory, useGame } from '@/hooks/useLottery';
import { fetchAllAndVerify, verifyLocalData } from '@/lib/lottery/datasource';
import { buildTargetSeries, getTheoryMiss, type Target, type Position, type SamplingMode, type TargetPoint } from '@/lib/lottery/targets';
import { generateDanTuo } from '@/lib/lottery/danTuo';
import { buildDigitStats } from '@/lib/lottery/analysis';
import { PickSheet, PEEK_H } from '@/components/ui/PickSheet';
import {
  BottomBar,
  ChartCard,
  Chip,
  DensityProvider,
  DigitGrid,
  Field,
  Legend,
  Panel,
  Segmented,
  StatPill,
  SubTabs,
  TongCell,
  TongGrid,
  type DigitMark,
} from '@/components/ui/Kit';
import {
  alpha,
  chartSize,
  fontSize as fs,
  palette,
  radius,
  semantic,
  space,
  touch,
} from '@/lib/theme';

/**
 * 图表模式 —— 对齐官方《K线模式》家族。
 * freq 周期 > 1 时按官方定义为「周期K线」（同一套 OHLC 聚合，只是加了影线）。
 */
type ChartMode =
  | 'freq'
  | 'omissionK'
  | 'omissionLine'
  | 'omissionLine2'
  | 'chuci'        // 出次图（分段出次）
  | 'chuciMove'    // 出次移动统计
  | 'missSum';     // 遗漏和
type TabId =
  | 'common' | 'dan' | 'dantuo' | 'pos' | 'multi'
  | 'heji' | 'amp' | 'random1' | 'random2' | 'group'
  | 'combo' | 'fushi' | 'kl8seq' | 'kl8dt';

const TABS: { id: TabId; label: string }[] = [
  { id: 'common', label: '常用' },
  { id: 'dan', label: '毒胆' },
  { id: 'dantuo', label: '胆拖' },
  { id: 'pos', label: '定位' },
  { id: 'multi', label: '复式' },
  { id: 'heji', label: '胆合积跨' },
  { id: 'amp', label: '振幅' },
  { id: 'random1', label: '组内随机' },
  { id: 'random2', label: '随机交并' },
  { id: 'group', label: '分组胆' },
  { id: 'combo', label: '组合' },
  { id: 'fushi', label: '复式' },
  { id: 'kl8seq', label: '连号' },
  { id: 'kl8dt', label: '胆拖' },
];

/** 原型 .gamebar 里的彩种列表 */
const GAMES: { id: string; label: string }[] = [
  { id: 'fc3d', label: '福彩3D' },
  { id: 'pl3', label: '排列3' },
  { id: 'pl5', label: '排列5' },
  { id: 'kl8', label: '快乐8' },
];

/** 原型 .prinav 主导航分段 */
type PrinavId = 'analyze' | 'group';
const PRINAV_OPTIONS: { value: PrinavId; label: string }[] = [
  { value: 'analyze', label: '分析' },
  { value: 'group', label: '组号 ▲' },
];
const PRINAV_VALUE: PrinavId = 'analyze';

/** 图表模式选择项（对齐官方《K线模式》家族） */
const CHART_MODES: { id: ChartMode; label: string }[] = [
  { id: 'freq', label: '频率K' },
  { id: 'omissionK', label: '遗漏K' },
  { id: 'omissionLine', label: '遗漏图' },
  { id: 'omissionLine2', label: '二阶遗漏' },
  { id: 'chuci', label: '出次图' },
  { id: 'chuciMove', label: '出次移动' },
  { id: 'missSum', label: '遗漏和' },
];

const POS_OPTIONS: Position[] = ['any', 'bai', 'shi', 'ge'];

/**
 * 遗漏和统计 —— 官方:「当本期开出 ≥ 均值 11 的遗漏和时，下期 90% 的机会向下掉头，
 * 开出 11 以下的值，尤其是 6 以下的值居多」
 * 这句经验值是针对**不定位胆（组选）**口径的；直选/全胆量纲不同，只给均值参考。
 */
function MissSumStat({ values, kind }: { values: number[]; kind: 'direct' | 'group' | 'all' }) {
  const st = useMemo(() => missSumDropRate(values), [values]);
  const mean = useMemo(
    () => (values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0),
    [values],
  );
  if (values.length === 0) return null;
  if (kind !== 'group') {
    return (
      <Text style={styles.hint} numberOfLines={2}>
        {`共 ${values.length} 期 · 均值 ${mean.toFixed(2)} · 当前 ${values[values.length - 1]}（官方的 11 经验值只适用于组选口径）`}
      </Text>
    );
  }
  if (st.total === 0) return null;
  return (
    <Text style={styles.hint} numberOfLines={3}>
      {`共 ${values.length} 期 · 均值 ${mean.toFixed(2)} · ≥${MISS_SUM_REF} 出现 ${st.total} 次 → 次期回落至 ${MISS_SUM_REF} 以下 ${st.belowRef} 次（${(st.rate * 100).toFixed(1)}%，官方称 90%），其中 ≤6 有 ${st.belowSix} 次（${((st.belowSix / st.total) * 100).toFixed(1)}%，官方称居多）`}
    </Text>
  );
}

const POS_LABEL_MAP: Record<Position, string> = {
  any: '不定位', wan: '万位', qian: '千位', bai: '百位', shi: '十位', ge: '个位',
};
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

// 对码组：05 16 27 38 49
const PAIR_GROUPS: number[][] = [[0, 5], [1, 6], [2, 7], [3, 8], [4, 9]];
function pairGroup(d: number): number[] {
  return PAIR_GROUPS.find((g) => g.includes(d)) ?? [d];
}

// 全部两码组合（C(D,2)），适配任意位数：排列三=D3 得 3 组，排列五=D5 得 10 组
function allPairSums(nums: number[]): Set<number> {
  const s = new Set<number>();
  for (let i = 0; i < nums.length; i += 1)
    for (let j = i + 1; j < nums.length; j += 1) s.add((nums[i] + nums[j]) % 10);
  return s;
}

// 全部两码差（绝对值）
function allPairDiffs(nums: number[]): Set<number> {
  const s = new Set<number>();
  for (let i = 0; i < nums.length; i += 1)
    for (let j = i + 1; j < nums.length; j += 1) s.add(Math.abs(nums[i] - nums[j]));
  return s;
}

/** 两个数字集合是否有交集 */
function setIntersects(a: Set<number>, b: Set<number>): boolean {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

/** 递归枚举所有 D 位号码（每位 0-9），对命中的调用 cb（通用位数，支撑排列五五位） */
function eachNumber(D: number, cb: (nums: number[]) => void): void {
  const cur = new Array<number>(D).fill(0);
  const rec = (i: number): void => {
    if (i === D) {
      cb(cur);
      return;
    }
    for (let d = 0; d <= 9; d += 1) {
      cur[i] = d;
      rec(i + 1);
    }
  };
  rec(0);
}

/** 确定性随机：相同 seed 产出相同序列，避免每次渲染抖动 */
function seededRng(seed: number): () => number {
  let s = (seed + 1) >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/** 组内随机：每位从允许池里随机取一个，组成 D 位号码，生成 count 注 */
function genRandomCodes(D: number, pool: number[], count: number, seed: number): string[] {
  const digits = pool.length > 0 ? pool : DIGITS;
  const rnd = seededRng(seed);
  const out: string[] = [];
  for (let k = 0; k < count; k += 1) {
    let code = '';
    for (let i = 0; i < D; i += 1) code += String(digits[Math.floor(rnd() * digits.length)]);
    out.push(code);
  }
  return out;
}

// 按类型判断单个号码是否命中
function matchFilter(type: string, nums: number[], dan: number[], pei: number[]): boolean {
  if (dan.length === 0) return false;

  /** 一组数字的「两两和尾」集合 */
  function sumSet(arr: number[]): Set<number> {
    const s = new Set<number>();
    if (arr.length === 1) { s.add(arr[0]); return s; }
    for (let i = 0; i < arr.length; i += 1) {
      for (let j = i + 1; j < arr.length; j += 1) {
        s.add((arr[i] + arr[j]) % 10);
      }
    }
    return s;
  }

  /** 一组数字的「两两差」集合 */
  function diffSet(arr: number[]): Set<number> {
    const s = new Set<number>();
    if (arr.length === 1) { s.add(arr[0]); return s; }
    for (let i = 0; i < arr.length; i += 1) {
      for (let j = i + 1; j < arr.length; j += 1) {
        s.add(Math.abs(arr[i] - arr[j]));
      }
    }
    return s;
  }

  switch (type) {
    case 'draw': {
      // 开奖号：含任意一个胆码即可（OR 语义）
      if (!dan.some((d) => nums.includes(d))) return false;
      if (pei.length > 0 && !pei.some((p) => nums.includes(p))) return false;
      return true;
    }
    case 'pair': {
      // 对码：任意一个胆码的对码组命中即可（OR 语义）
      if (!dan.some((d) => pairGroup(d).some((x) => nums.includes(x)))) return false;
      if (pei.length > 0 && !pei.some((p) => pairGroup(p).some((x) => nums.includes(x))))
        return false;
      return true;
    }
    case 'sum': {
      // 两码合：号码两码和尾 与 胆码两两和尾 有交集
      const s = allPairSums(nums);
      const danTargets = sumSet(dan);
      if (!setIntersects(s, danTargets)) return false;
      if (pei.length > 0) {
        const peiTargets = sumSet(pei);
        if (!setIntersects(s, peiTargets)) return false;
      }
      return true;
    }
    case 'diff': {
      // 两码差：号码两码差 与 胆码本身（或胆码两两差）有交集
      const s = allPairDiffs(nums);
      const danTargets = diffSet(dan);
      if (!setIntersects(s, danTargets)) return false;
      if (pei.length > 0) {
        const peiTargets = diffSet(pei);
        if (!setIntersects(s, peiTargets)) return false;
      }
      return true;
    }
    case 'span': {
      // 两码跨：同两码差
      const s = allPairDiffs(nums);
      const danTargets = diffSet(dan);
      if (!setIntersects(s, danTargets)) return false;
      if (pei.length > 0) {
        const peiTargets = diffSet(pei);
        if (!setIntersects(s, peiTargets)) return false;
      }
      return true;
    }
  }
  return false;
}

const MAX_BARS = 200;

export default function AnalyzeScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ codes?: string }>();

  const [gameId, setGameId] = useState('fc3d');
  const [tab, setTab] = useState<TabId>('dan');
  const [shapeMainMode, setShapeMainMode] = useState<ShapeMainMode>('zhixuan');
  const [shapeFilters, setShapeFilters] = useState<ShapeFilter[]>([]);
  const [shapeDigits, setShapeDigits] = useState<number[]>([]);
  const game = useGame(gameId);

  const [countInput, setCountInput] = useState('500');
  const [countMap, setCountMap] = useState<Record<string, number>>({
    common: 500, dan: 500, dantuo: 500, pos: 500, multi: 500,
    heji: 500, amp: 80, random1: 500, random2: 500, group: 500,
    combo: 200, fushi: 200, kl8seq: 200, kl8dt: 200,
  });
  const loadCount = countMap[tab] ?? 500;

  const { records, allRecords, loading, refreshing, error, source, refresh } = useLotteryHistory(
    game.id, loadCount,
  );

  const didRefresh = useRef(false);
  useEffect(() => {
    if (!didRefresh.current && !loading) {
      didRefresh.current = true;
      void refresh();
    }
  }, [loading, refresh]);

  const [externalCodes, setExternalCodes] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (params.codes && typeof params.codes === 'string') {
      const arr = params.codes.split(',').map((s) => s.trim()).filter(Boolean);
      if (arr.length > 0) { setExternalCodes(new Set(arr)); setTab('dan'); }
    }
  }, [params.codes]);

  const [type, setType] = useState('draw');
  const [commonDigit, setCommonDigit] = useState(5);
  const [kl8ComboCodes, setKl8ComboCodes] = useState<number[]>([]);
  const [kl8MatchMode, setKl8MatchMode] = useState<'all' | 'any' | 'exact'>('all');
  const [kl8MatchCount, setKl8MatchCount] = useState(2);
  const [kl8FushiCodes, setKl8FushiCodes] = useState<number[]>([]);
  const [kl8FushiPlaySize, setKl8FushiPlaySize] = useState(10);
  const [kl8CommonMode, setKl8CommonMode] = useState<'digit' | 'tail' | 'road' | 'zone4' | 'zone8'>('digit');
  const [kl8CommonValue, setKl8CommonValue] = useState(0);
  const [kl8CommonMatchCount, setKl8CommonMatchCount] = useState(2);
  const [kl8SeqType, setKl8SeqType] = useState<'connum'|'odd'|'even'|'prime'|'comp'|'road0'|'road1'|'road2'>('connum');
  const [kl8SeqLen, setKl8SeqLen] = useState(4);
  const [kl8SeqIndex, setKl8SeqIndex] = useState(0);
  const [kl8SeqMenuOpen, setKl8SeqMenuOpen] = useState(false);
  const [kl8DtDan, setKl8DtDan] = useState<number[]>([]);
  const [kl8DtTuo, setKl8DtTuo] = useState<number[]>([]);
  const [kl8DtDanCounts, setKl8DtDanCounts] = useState<number[]>([1, 2, 3]);
  const [kl8DtTuoCounts, setKl8DtTuoCounts] = useState<number[]>([2, 3]);
  const [kl8DtDanMenuOpen, setKl8DtDanMenuOpen] = useState(false);
  const [kl8DtTuoMenuOpen, setKl8DtTuoMenuOpen] = useState(false);
  const [commonMode, setCommonMode] = useState<'digit' | 'front2' | 'back2'>('digit');
  const [commonFront2, setCommonFront2] = useState(9);
  const [commonBack2, setCommonBack2] = useState(9);
  const [dan, setDan] = useState<number[]>([1]);
  const [pei, setPei] = useState<number[]>([]);
  const [dtDan, setDtDan] = useState<number[]>([1]);
  const [dtTuo, setDtTuo] = useState<number[]>([2, 3]);
  const [pos, setPos] = useState<Position>('bai');
  const [posDigit, setPosDigit] = useState(5);
  const posOptions: Position[] = useMemo(() => {
    if (game.digitCount === 3) return ['any', 'bai', 'shi', 'ge'];
    if (game.digitCount === 5) return ['any', 'wan', 'qian', 'bai', 'shi', 'ge'];
    return ['any'];
  }, [game.digitCount]);
  const [bai, setBai] = useState<number[]>([]);
  const [shi, setShi] = useState<number[]>([]);
  const [ge, setGe] = useState<number[]>([]);
  // 排列五：万位 / 千位
  const [wan, setWan] = useState<number[]>([]);
  const [qian, setQian] = useState<number[]>([]);

  // ── 选号工具补全：组内随机 / 随机交并 / 分组胆 ──
  const [random1Pool, setRandom1Pool] = useState<number[]>([]); // 允许数字池（空=0-9 全选）
  const [random1Count, setRandom1Count] = useState(10);
  const [random1Seed, setRandom1Seed] = useState(0); // 自增以重新随机
  const [random2Count, setRandom2Count] = useState(10);
  const [random2Mode, setRandom2Mode] = useState<'inter' | 'union'>('union');
  const [random2Seed, setRandom2Seed] = useState(0);
  const [groupPos, setGroupPos] = useState<Position>('any');
  const [groupAttr, setGroupAttr] = useState<SetAttrKey>('oddEven');
  const [groupValue, setGroupValue] = useState<string>('奇');
  const [importText, setImportText] = useState(''); // 粘贴导入框

  /** 定位（复式倍数）按位选择的位置槽：3 位=百/十/个，5 位=万/千/百/十/个 */
  const posSlots = useMemo(() => {
    const slots: { key: string; label: string; arr: number[]; setArr: (v: number[]) => void }[] = [
      { key: 'bai', label: '百位', arr: bai, setArr: setBai },
      { key: 'shi', label: '十位', arr: shi, setArr: setShi },
      { key: 'ge', label: '个位', arr: ge, setArr: setGe },
    ];
    if (game.digitCount >= 5) {
      slots.unshift(
        { key: 'qian', label: '千位', arr: qian, setArr: setQian },
        { key: 'wan', label: '万位', arr: wan, setArr: setWan },
      );
    }
    return slots;
  }, [game.digitCount, bai, shi, ge, wan, qian]);
  const [multiMode, setMultiMode] = useState<'pos' | 'nopos'>('pos');
  const [noposNums, setNoposNums] = useState<number[]>([]);
  const [hejiKey, setHejiKey] = useState<string>('sum');
  const [ampKey, setAmpKey] = useState<string>('sumAmp');
  const [ampMax, setAmpMax] = useState(9);
  const [hejiValue, setHejiValue] = useState(13);
  const [period, setPeriod] = useState(1);
  /** 周期基准（官方《周期K线》1.1 左对齐 / 1.2 右对齐） */
  const [cycleAlign, setCycleAlign] = useState<CycleAlign>('left');
  /** 出次图/遗漏型的分段周期（步长） */
  const [stepPeriod, setStepPeriod] = useState(10);
  /** 退期：把最后一点的期号往前推的期数 */
  const [drawBack, setDrawBack] = useState(0);
  /** 遗漏和口径：直选(定位胆) / 组选(不定位胆) / 全胆 */
  const [missSumKind, setMissSumKind] = useState<'direct' | 'group' | 'all'>('direct');
  const [chartModes, setChartModes] = useState<ChartMode[]>(['freq']);
  const [compareTargets, setCompareTargets] = useState<Target[] | null>(null);
  const [gameMenuOpen, setGameMenuOpen] = useState(false);
  const [dataTaskRunning, setDataTaskRunning] = useState(false);
  const [dataTaskMsg, setDataTaskMsg] = useState('');
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
  /** 图表缩放倍率（放大/缩小按钮调整图表高度） */
  const [chartZoom, setChartZoom] = useState(1);
  /** 选号抽屉是否展开（用于决定图表可用高度） */
  const [pickExpanded, setPickExpanded] = useState(false);
  /** 全屏：隐藏品牌栏/彩种/导航等 chrome，把整屏留给图表 */
  const [fullscreen, setFullscreen] = useState(false);
  /** 横屏时收起顶部 chrome（品牌栏 + 主导航 + 子页签），保留彩种与操作栏 */
  const [chromeCollapsed, setChromeCollapsed] = useState(false);

  // ── 副图指标 ──
  /** 主图叠加的均线（6 组，可在指标设置里改周期 / 颜色 / 开关） */
  const [maConfigs, setMaConfigs] = useState<MaConfig[]>(DEFAULT_MA);
  /** 副图槽位：每个槽位单选一个指标；'none' = 不画该槽 */
  const [sub1, setSub1] = useState<IndicatorId>('macd');
  const [sub2, setSub2] = useState<IndicatorId>('none');
  const [indicatorOpen, setIndicatorOpen] = useState(false);
  /** 底部操作栏实测高度：抽屉要避让它，否则会盖住「出图 / 重置」 */
  const [bottomBarH, setBottomBarH] = useState(64);

  const V = game.digitMax - game.digitMin + 1;
  const DD = game.digitCount;
  const samplingMode: SamplingMode = gameId === 'kl8' ? 'hypergeometric' : 'independent';
  const sumMax = game.digitMax * game.digitCount;

  const HEJI_KEYS: readonly { id: string; label: string; min: number; max: number }[] = useMemo(() => [
    { id: 'sum', label: '和值', min: 0, max: sumMax },
    { id: 'sumTail', label: '合值', min: 0, max: 9 },
    { id: 'span', label: '跨度', min: 0, max: 9 },
    { id: 'pairSumMax', label: '二码合最大', min: 0, max: 9 },
    { id: 'pairDiffMax', label: '二码差最大', min: 0, max: 9 },
    { id: 'front2Sum', label: '前二和值', min: 0, max: 18 },
    { id: 'back2Sum', label: '后二和值', min: 0, max: 18 },
  ], [sumMax]);

  const AMP_KEYS: readonly { id: string; label: string; min: number; max: number }[] = useMemo(() => {
    const keys = [
      { id: 'sumAmp', label: '和值振幅', min: 0, max: sumMax },
      { id: 'sumTailAmp', label: '合值振幅', min: 0, max: 9 },
      { id: 'spanAmp', label: '跨度振幅', min: 0, max: 9 },
      { id: 'baiAmp', label: '百位振幅', min: 0, max: 9 },
      { id: 'shiAmp', label: '十位振幅', min: 0, max: 9 },
      { id: 'geAmp', label: '个位振幅', min: 0, max: 9 },
    ];
    if (game.digitCount >= 4) keys.push({ id: 'qianAmp', label: '千位振幅', min: 0, max: 9 });
    if (game.digitCount >= 5) keys.push({ id: 'wanAmp', label: '万位振幅', min: 0, max: 9 });
    return keys;
  }, [game.digitCount, sumMax]);

  useEffect(() => {
    if (game.digitCount === 3 && (pos === 'wan' || pos === 'qian')) setPos('bai');
    if (hejiValue > sumMax) setHejiValue(Math.floor(sumMax / 2));
  }, [gameId]);

  const kl8SeqPool = useMemo(() => {
    const isPrimeNum = (n: number) => n === 2 || n === 3 || n === 5 || n === 7 || n === 11 || n === 13
      || n === 17 || n === 19 || n === 23 || n === 29 || n === 31 || n === 37
      || n === 41 || n === 43 || n === 47 || n === 53 || n === 59 || n === 61
      || n === 67 || n === 71 || n === 73 || n === 79;
    const pool: number[] = [];
    if (kl8SeqType === 'connum') { for (let i = 1; i <= 80; i++) pool.push(i); }
    else if (kl8SeqType === 'odd') { for (let i = 1; i <= 79; i += 2) pool.push(i); }
    else if (kl8SeqType === 'even') { for (let i = 2; i <= 80; i += 2) pool.push(i); }
    else if (kl8SeqType === 'prime') { for (let i = 2; i <= 80; i++) if (isPrimeNum(i)) pool.push(i); }
    else if (kl8SeqType === 'comp') { for (let i = 4; i <= 80; i++) if (!isPrimeNum(i)) pool.push(i); }
    else if (kl8SeqType === 'road0') { for (let i = 3; i <= 80; i += 3) pool.push(i); }
    else if (kl8SeqType === 'road1') { for (let i = 1; i <= 80; i += 3) pool.push(i); }
    else if (kl8SeqType === 'road2') { for (let i = 2; i <= 80; i += 3) pool.push(i); }
    return pool;
  }, [kl8SeqType]);

  const kl8SeqOptions = useMemo(() => {
    const opts: number[][] = [];
    for (let i = 0; i + kl8SeqLen <= kl8SeqPool.length; i += 1) {
      opts.push(kl8SeqPool.slice(i, i + kl8SeqLen));
    }
    return opts;
  }, [kl8SeqPool, kl8SeqLen]);

  const kl8SeqCodes = kl8SeqOptions[kl8SeqIndex] ?? [];

  // ── 选号工具补全：三个 tab 的结果集（供分析） ──
  const random1Codes = useMemo(
    () => genRandomCodes(DD, random1Pool, random1Count, random1Seed),
    [DD, random1Pool, random1Count, random1Seed],
  );
  const random2A = useMemo(
    () => genRandomCodes(DD, [], random2Count, random2Seed * 2 + 1),
    [DD, random2Count, random2Seed],
  );
  const random2B = useMemo(
    () => genRandomCodes(DD, [], random2Count, random2Seed * 2 + 2),
    [DD, random2Count, random2Seed],
  );
  const random2Result = useMemo(() => {
    const A = new Set(random2A);
    const res = new Set<string>(random2Mode === 'union' ? A : []);
    for (const c of random2B) {
      if (random2Mode === 'union' || A.has(c)) res.add(c);
    }
    return [...res];
  }, [random2A, random2B, random2Mode]);
  const groupCodes = useMemo(() => {
    const set = SET_ATTRS[groupAttr].values[groupValue];
    if (!set) return [] as string[];
    const idx = groupPos === 'any' ? -1 : posIndex(groupPos, DD);
    const out: string[] = [];
    eachNumber(DD, (nums) => {
      if (groupPos === 'any') {
        if (nums.some((n) => set.has(n))) out.push(nums.join(''));
      } else if (idx >= 0 && idx < nums.length && set.has(nums[idx])) {
        out.push(nums.join(''));
      }
    });
    return out;
  }, [groupAttr, groupValue, groupPos, DD]);

  const target: Target = useMemo(() => {
    // 形态模式：按 tab 提取数字，多选形态取并集
    const shapeActive = shapeMainMode === 'zuxuan' || shapeFilters.length > 0;
    if (shapeActive && (gameId === 'fc3d' || gameId === 'pl3')) {
      let digitsForShape: number[] = [];
      if (tab === 'dan') digitsForShape = dan;
      else if (tab === 'dantuo') digitsForShape = [...new Set([...dtDan, ...dtTuo])];
      else if (tab === 'common') digitsForShape = commonMode === 'digit' ? [commonDigit] : [];
      else if (tab === 'pos') digitsForShape = [posDigit];
      else if (tab === 'multi') {
        digitsForShape = multiMode === 'pos'
          ? [...new Set(posSlots.flatMap((s) => s.arr))]
          : [...noposNums];
      }
      else digitsForShape = shapeDigits;
      const codes = buildShapeCodes(digitsForShape, shapeMainMode, shapeFilters);
      const parts: string[] = [shapeMainMode === 'zuxuan' ? '组选' : '直选'];
      if (shapeFilters.length > 0) {
        parts.push(shapeFilters.map((m) => m === 'zusan' ? '组三' : '组六').join('+'));
      }
      return { kind: 'shapeSet', codes: new Set(codes), shapeLabel: parts.join('·') };
    }
    if (externalCodes && externalCodes.size > 0 && tab === 'dan')
      return { kind: 'set', codes: externalCodes };
    if (tab === 'fushi') {
      return { kind: 'kl8Fushi', codes: [...kl8FushiCodes].sort((a, b) => a - b), playSize: kl8FushiPlaySize };
    }
    if (tab === 'kl8dt') {
      return {
        kind: 'kl8Dantuo',
        dan: [...kl8DtDan].sort((a, b) => a - b),
        tuo: [...kl8DtTuo].sort((a, b) => a - b),
        danCounts: [...kl8DtDanCounts].sort((a, b) => a - b),
        tuoCounts: [...kl8DtTuoCounts].sort((a, b) => a - b),
      };
    }
    if (tab === 'kl8seq') {
      return { kind: 'kl8Combo', codes: kl8SeqCodes, matchMode: 'all' };
    }
    if (tab === 'combo') {
      return { kind: 'kl8Combo', codes: [...kl8ComboCodes].sort((a, b) => a - b), matchMode: kl8MatchMode, matchCount: kl8MatchCount };
    }
    if (tab === 'common') {
      if (gameId === 'kl8') {
        if (kl8CommonMode === 'digit') return { kind: 'digit', digit: kl8CommonValue, pos: 'any' };
        // 分类模式：映射成号集合，按"中N个"分析
        const codes: number[] = [];
        for (let n = 1; n <= 80; n += 1) {
          let match = false;
          if (kl8CommonMode === 'tail') match = n % 10 === kl8CommonValue;
          else if (kl8CommonMode === 'road') match = n % 3 === kl8CommonValue;
          else if (kl8CommonMode === 'zone4') match = Math.floor((n - 1) / 20) === kl8CommonValue;
          else if (kl8CommonMode === 'zone8') match = Math.floor((n - 1) / 10) === kl8CommonValue;
          if (match) codes.push(n);
        }
        return { kind: 'kl8Combo', codes, matchMode: 'exact', matchCount: kl8CommonMatchCount };
      }
      if (commonMode === 'digit') return { kind: 'digit', digit: commonDigit, pos: 'any' };
      if (commonMode === 'front2') return { kind: 'calcAttr', calcKey: 'front2Sum', value: commonFront2 };
      return { kind: 'calcAttr', calcKey: 'back2Sum', value: commonBack2 };
    }
    if (tab === 'dan') {
      if (dan.length === 0) return { kind: 'set', codes: new Set() };
      // 按类型筛选全部 10^D 个号码（D=位数，排列五=5 位也正确）
      const codes = new Set<string>();
      eachNumber(DD, (nums) => {
        if (matchFilter(type, nums, dan, pei)) codes.add(nums.join(''));
      });
      return { kind: 'set', codes };
    }
    if (tab === 'dantuo') {
      if (dtDan.length === 0) return { kind: 'set', codes: new Set() };
      const { zhixuan } = generateDanTuo(dtDan, dtTuo, DD);
      return { kind: 'set', codes: new Set(zhixuan) };
    }
    if (tab === 'pos') return { kind: 'digit', digit: posDigit, pos };
    if (tab === 'multi') {
      if (multiMode === 'pos') {
        if (posSlots.some((s) => s.arr.length === 0)) return { kind: 'set', codes: new Set() };
        // 按位置做笛卡尔积：3 位 → 百十百；5 位 → 万千百十全
        let codes: string[] = [''];
        for (const s of posSlots) {
          const next: string[] = [];
          for (const prefix of codes) for (const d of s.arr) next.push(prefix + String(d));
          codes = next;
        }
        return { kind: 'set', codes: new Set(codes) };
      } else {
        // 不定位复式：每位从 noposNums 里选，可重复（D 位通用）
        if (noposNums.length === 0) return { kind: 'set', codes: new Set() };
        const allowed = new Set(noposNums);
        const codes = new Set<string>();
        eachNumber(DD, (nums) => {
          if (nums.every((d) => allowed.has(d))) codes.add(nums.join(''));
        });
        return { kind: 'set', codes };
      }
    }
    if (tab === 'heji') return { kind: 'calcAttr', calcKey: hejiKey as any, value: hejiValue };
    if (tab === 'amp') return { kind: 'calcAttr', calcKey: hejiKey as any, value: hejiValue };
    if (tab === 'random1') return { kind: 'set', codes: new Set(random1Codes) };
    if (tab === 'random2') return { kind: 'set', codes: new Set(random2Result) };
    if (tab === 'group') return { kind: 'set', codes: new Set(groupCodes) };
    return { kind: 'set', codes: new Set() };
  }, [tab, type, externalCodes, shapeMainMode, shapeFilters, shapeDigits, dan, commonDigit, commonMode, kl8CommonMode, kl8CommonValue, kl8CommonMatchCount, kl8ComboCodes, kl8MatchMode, kl8MatchCount, kl8SeqCodes, kl8DtDan, kl8DtTuo, kl8DtDanCounts, kl8DtTuoCounts, kl8FushiCodes, kl8FushiPlaySize, gameId, dan, pei, dtDan, dtTuo, pos, posDigit,
    bai, shi, ge, wan, qian, posSlots, multiMode, noposNums, hejiKey, hejiValue, random1Codes, random2Result, groupCodes]);

  const codesCount = useMemo(() => {
    if (target.kind === 'set') return target.codes.size;
    return 1;
  }, [target]);

  const series = useMemo(() => {
    if (records.length === 0) return [];
    const rawLimit = 500 * Math.max(1, period);
    const sliced = records.length > rawLimit ? records.slice(-rawLimit) : records;
    return buildTargetSeries(sliced, target, V, DD, samplingMode);
  }, [records, target, V, DD, period, samplingMode]);

  // 振幅等原始值序列
  const rawData = useMemo(() => {
    if (tab !== 'amp') return null;
    const sliced = records.length > 500 ? records.slice(-500) : records;
    return buildRawSeries(sliced, ampKey as any);
  }, [records, tab, ampKey, ampMax]);

  const theoryMiss = useMemo(() => getTheoryMiss(target, V, DD, samplingMode), [target, V, DD, samplingMode]);

  /**
   * 遗漏和 —— 官方《遗漏和》原文：
   *   「指一个指标里面所有元素的各项遗漏值的和」
   *   - 不定位胆（组选遗漏和）：开奖号码各数字的遗漏值之和
   *   - 全胆遗漏和：0-9 各码当前遗漏之和
   *   - 定位胆（直选遗漏和）：百/十/个 三位各自遗漏值之和
   * 遗漏值取官方《开出遗漏》口径 —— 本期开出号码的**上次遗漏**：
   *   上次出现在第 j 期、本期是第 i 期，则上次遗漏 = i − j − 1（从未出现过则 = i）。
   */
  const missSum = useMemo(() => {
    if (records.length === 0) {
      return { title: '遗漏和', issues: [] as string[], values: [] as number[] };
    }
    const Vv = Math.max(1, V);
    const issues: string[] = [];
    const direct: number[] = [];
    const group: number[] = [];
    const all: number[] = [];
    // 上一次出现的期索引；-1 表示还没出现过
    const posPrev = Array.from({ length: Math.max(1, DD) }, () => new Array(Vv).fill(-1));
    const digPrev = new Array(Vv).fill(-1);
    const omOf = (prev: number, i: number) => (prev < 0 ? i : i - prev - 1);

    records.forEach((r, i) => {
      issues.push(r.issue);
      const nums = (r.nums ?? []).filter((d: number) => d >= 0 && d < Vv);

      // 定位胆（直选）：按位置求和
      let dSum = 0;
      nums.forEach((d: number, pos: number) => {
        dSum += omOf(posPrev[Math.min(pos, posPrev.length - 1)][d], i);
      });
      direct.push(dSum);

      // 不定位胆（组选）：号码去重后求和
      let gSum = 0;
      for (const d of Array.from(new Set(nums))) gSum += omOf(digPrev[d], i);
      group.push(gSum);

      // 全胆：全部码的当前遗漏之和
      let aSum = 0;
      for (let d = 0; d < Vv; d += 1) aSum += omOf(digPrev[d], i);
      all.push(aSum);

      nums.forEach((d: number, pos: number) => {
        posPrev[Math.min(pos, posPrev.length - 1)][d] = i;
        digPrev[d] = i;
      });
    });

    const kind = missSumKind;
    const values = kind === 'direct' ? direct : kind === 'group' ? group : all;
    const title =
      kind === 'direct'
        ? '定位胆遗漏和（直选）'
        : kind === 'group'
          ? '不定位胆遗漏和（组选）'
          : '全胆遗漏和';
    return { title, issues, values };
  }, [records, V, DD, missSumKind]);
  const chartMeta = useMemo(() => {
    const m: Record<ChartMode, { title: string; meta: string }> = {
      freq: period > 1
        ? { title: '周期K线', meta: `周期${period} · OHLC + 影线` }
        : { title: '频率K线', meta: 'diff 累计实出−理论' },
      omissionK: { title: '遗漏K线', meta: '二阶遗漏 · 爬楼梯' },
      omissionLine: { title: '遗漏图', meta: '逐期遗漏值' },
      omissionLine2: { title: '二阶遗漏图', meta: '遗漏范围内再筛选' },
      chuci: { title: '出次图', meta: `分段${stepPeriod}期出次` },
      chuciMove: { title: '出次移动统计', meta: '统计期内出次渐变' },
      missSum: { title: '遗漏和', meta: '各元素遗漏值之和' },
    };
    return m;
  }, [period, stepPeriod]);

  // 全历史最大遗漏（用未截断的 allRecords 计算）
  const historyMaxMiss = useMemo(() => {
    if (allRecords.length === 0) return undefined;
    try {
      const fullSeries = buildTargetSeries(allRecords, target, V, DD);
      let maxMiss = 0;
      let lastOpen = -1;
      for (let i = 0; i < fullSeries.length; i += 1) {
        if (fullSeries[i].omission === 0) {
          const gap = lastOpen >= 0 ? i - lastOpen - 1 : 0;
          if (gap > maxMiss) maxMiss = gap;
          lastOpen = i;
        }
      }
      // 尾部尚未开出的持续遗漏也算
      if (lastOpen >= 0) {
        const tail = fullSeries.length - lastOpen - 1;
        if (tail > maxMiss) maxMiss = tail;
      } else {
        maxMiss = fullSeries.length;
      }
      return maxMiss > 0 ? maxMiss : undefined;
    } catch {
      return undefined;
    }
  }, [allRecords, target, V, DD]);
  const omissionSeries = useMemo(
    () => series.map((p) => ({ issue: p.issue, omission: p.omission })),
    [series],
  );

  /** 当前遗漏（原型 .status-pill 用） */
  const currentOmission = omissionSeries.length > 0
    ? omissionSeries[omissionSeries.length - 1].omission
    : 0;

  /** 数字冷热标记：原型 heatMark()，热号红环 / 冷号青环 */
  const digitMarks = useMemo<Record<number, DigitMark>>(() => {
    const marks: Record<number, DigitMark> = {};
    if (records.length === 0) return marks;
    try {
      const stats = buildDigitStats(records, DIGITS, records.length, DD, V);
      for (const s of stats) {
        marks[s.digit] = s.temperature === 'hot' ? 'hot' : s.temperature === 'cold' ? 'cold' : 'none';
      }
    } catch {
      /* 数据不足时不做标记 */
    }
    return marks;
  }, [records, DD, V]);

  const applyCount = () => {
    const n = parseInt(countInput, 10);
    if (!Number.isNaN(n) && n >= 50 && n <= 10000) {
      setCountMap((prev) => ({ ...prev, [tab]: n }));
    } else {
      setCountInput(String(loadCount));
    }
  };

  const toggleChart = (m: ChartMode) => {
    setChartModes((prev) => {
      if (prev.includes(m)) {
        if (prev.length === 1) return prev;
        return prev.filter((x) => x !== m);
      }
      if (prev.length >= 4) return prev;
      return [...prev, m];
    });
  };

  const toggle = (arr: number[], set: (v: number[]) => void, d: number) => {
    setExternalCodes(null);
    set(arr.includes(d) ? arr.filter((x) => x !== d) : [...arr, d]);
  };

  // ============ 响应式：横屏 / 宽屏 ============
  const isLandscape = width >= 860 || width > height;
  /**
   * 内容区左右留白。
   * 原来竖屏横屏都写死 16dp，加上卡片内边距 12dp 和 ECharts grid 的
   * left 36 / right 60，一条 ~500dp 宽的图表实际只剩不到 380dp 能画，
   * 左右各留出一大条空白（用户截图反馈的「两边还有空隙」）。
   * 现在：外留白 16→8，卡片内边距 12→8，grid 交给 containLabel 自适应。
   */
  const contentPad = isLandscape ? space.sm : space.sm;
  const contentW = Math.max(240, width - contentPad * 2);
  /**
   * 主图基准高度。
   * 竖屏沿用原型 200；横屏从 240 起，并按实际宽度反推（上限 320），
   * 避免平板/宽屏下单列满宽图表被压成 4:1 的扁条。
   * 用户还可用缩放按钮在 0.6x~3x 之间继续微调。
   */
  const chartH = isLandscape
    ? Math.round(Math.max(chartSize.hLandscape, Math.min(320, (contentW - 24) / 2.8)))
    : chartSize.h;
  /**
   * 主图 / 多图同屏的绘制宽度。
   * 之前按「横屏两列」取半宽，但多图同屏已改成横竖屏都一列一表，
   * 半宽会让图表只占屏幕左半边、右侧留大片空白，故统一取满内容宽度。
   */
  /** 图表卡片边框 1dp ×2 + 内边距 8dp ×2 */
  const CHART_CARD_INSET = 18;
  const chartW = Math.max(160, contentW - CHART_CARD_INSET);

  /**
   * 带副图指标时的主图高度：按用户要求「频率K线 / 遗漏图高度再增加一半」。
   * 副图要吃掉 22%~26% 的高度，主图不加成就会被压成一条缝。
   * 用 1.5 倍并夹上限，避免横屏下整屏塞不进一张图。
   */
  const chartHBig = Math.round(Math.min(chartH * 1.5, isLandscape ? 420 : 340));

  /** 当前生效的副图指标（去掉 'none'，最多 2 个） */
  const activeSubs = useMemo(
    () => [sub1, sub2].filter((i): i is Exclude<IndicatorId, 'none'> => i !== 'none'),
    [sub1, sub2],
  );

  /**
   * 毒胆同屏布局。
   * 竖屏：1 列 × 10 行（0-9 竖着排），单格撑满内容宽度；
   * 横屏：2 列 × 5 行，单格取半宽。
   * 单格高度按宽度反推，保证宽高比落在 2.2~3.3，避免「宽度大、高度小」把 K 线压扁失真。
   */
  const tongColumns = isLandscape ? 2 : 1;
  const tongGap = 8;
  const tongW = Math.max(
    160,
    Math.floor((contentW - (tongColumns - 1) * tongGap) / tongColumns) - 14,
  );
  /**
   * 单格内图表高度：
   * - 竖屏单列：宽度约一屏，140 已能给出约 2.3 的宽高比；
   * - 横屏两列：单格宽度接近半屏（手机横屏约 356dp），固定 88 会压出 4.0 的极度扁平，
   *   故按宽度 /2.8 反推并夹在 [110,160]，实测宽高比落在 2.7~3.0。
   */
  const tongH = isLandscape
    ? Math.round(Math.min(160, Math.max(110, tongW / 2.8)))
    : 140;

  /**
   * 选号已搬进底部抽屉，页面内不再有「选号面板折叠」这回事。
   * 抽屉收起时只占 12% 高度，图表拿走剩下的全部空间。
   */
  const pickCollapsed = !pickExpanded;

  // 图表可用高度（同屏放大 / 振幅图用）
  // 全屏时只剩顶部一条 34px 的操作条，可用高度接近整屏
  const TOP_BAR_H = fullscreen ? 34 : pickCollapsed ? 44 : 180;
  const availH = Math.max(140, height - TOP_BAR_H);

  /** 竖屏紧凑：按钮/页签降一档，把省下的高度让给图表 */
  const dense = !isLandscape;

  // ============ 图表缩放 / 全屏 ============
  const ZOOM_STEP = 0.2;
  const ZOOM_MIN = 0.6;
  const ZOOM_MAX = 3;
  const stepZoom = (delta: number) =>
    setChartZoom((z) => {
      const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z + delta));
      // 规避浮点累积误差（0.1+0.2 问题），统一保留两位
      return Math.round(next * 100) / 100;
    });

  /**
   * 选号内容（供底部抽屉复用）。
   * 原来内联在页面滚动区里，选号一展开就把图表挤没了；
   * 现在整块搬进 PickSheet，页面主体只留图表与数据。
   */
  const renderPickContent = () => (
    <>
      {tab === 'common' && renderCommon()}
      {(tab === 'dan' || tab === 'dantuo') && renderTypeRow()}
      {tab === 'dan' && renderDan()}
      {tab === 'dantuo' && renderDantuo()}
      {tab === 'pos' && renderPos()}
      {tab === 'multi' && renderMulti()}
      {tab === 'heji' && renderHeji()}
      {tab === 'amp' && renderAmp()}
      {tab === 'combo' && renderCombo()}
      {tab === 'fushi' && renderFushi()}
      {tab === 'kl8seq' && renderKl8Seq()}
      {tab === 'kl8dt' && renderKl8Dt()}
      {gameId !== 'kl8' && renderPasteImport()}
      {tab === 'random1' && renderRandom1()}
      {tab === 'random2' && renderRandom2()}
      {tab === 'group' && renderGroup()}
      {/* 形态（仅 3D / 排列3） */}
      {(gameId === 'fc3d' || gameId === 'pl3') && (
        <Field caption="形态（主模式 / 过滤）">
          <View style={styles.chipRow}>
            <Chip
              label="组选"
              active={shapeMainMode === 'zuxuan'}
              onPress={() => setShapeMainMode(shapeMainMode === 'zuxuan' ? 'zhixuan' : 'zuxuan')}
            />
            <Chip
              label="组三"
              active={shapeFilters.includes('zusan')}
              onPress={() => setShapeFilters((prev) => prev.includes('zusan') ? prev.filter((x) => x !== 'zusan') : [...prev, 'zusan'])}
            />
            <Chip
              label="组六"
              active={shapeFilters.includes('zuliu')}
              onPress={() => setShapeFilters((prev) => prev.includes('zuliu') ? prev.filter((x) => x !== 'zuliu') : [...prev, 'zuliu'])}
            />
          </View>
        </Field>
      )}
    </>
  );

  /** 图表缩放 + 全屏操作条 */
  const renderZoomBar = () => (
    <View style={styles.zoomBar}>
      <Chip label="−" active={false} onPress={() => stepZoom(-ZOOM_STEP)} />
      <Text style={styles.zoomText}>{Math.round(chartZoom * 100)}%</Text>
      <Chip label="+" active={false} onPress={() => stepZoom(ZOOM_STEP)} />
      <Chip label="重置" active={false} onPress={() => setChartZoom(1)} />
      <Chip
        label={fullscreen ? '退出全屏' : '全屏'}
        active={fullscreen}
        onPress={() => setFullscreen((v) => !v)}
      />
    </View>
  );

  // ============ 行渲染 ============
  const runFullFetch = () => {
    Alert.alert(
      '全量数据',
      `将重新从主源拉取「${game.name}」全量数据，并与备源校验。\n\n已有数据会先备份，失败自动回滚。\n\n继续？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '开始',
          onPress: async () => {
            setDataTaskRunning(true);
            setDataTaskMsg('准备中…');
            try {
              const stats = await fetchAllAndVerify(game.id, (m) => setDataTaskMsg(m));
              setDataTaskRunning(false);
              Alert.alert(
                '完成',
                `总期数：${stats.total}\n主源：${stats.fromPrimary}\n备源：${stats.fromBackup}\n校验通过：${stats.verified}\n冲突：${stats.conflicts}`,
              );
              await refresh();
            } catch (e) {
              setDataTaskRunning(false);
              Alert.alert('失败', e instanceof Error ? e.message : '未知错误');
            }
          },
        },
      ],
    );
  };

  const runVerify = () => {
    Alert.alert(
      '校验数据',
      `对比本地「${game.name}」数据与远程备源，标记冲突期。\n\n继续？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '开始',
          onPress: async () => {
            setDataTaskRunning(true);
            setDataTaskMsg('准备中…');
            try {
              const r = await verifyLocalData(game.id, (m) => setDataTaskMsg(m));
              setDataTaskRunning(false);
              Alert.alert('完成', `对比期数：${r.checked}\n冲突：${r.conflicts}`);
              await refresh();
            } catch (e) {
              setDataTaskRunning(false);
              Alert.alert('失败', e instanceof Error ? e.message : '未知错误');
            }
          },
        },
      ],
    );
  };

  /** 子页签切换（保留原 tab 切换副作用） */
  const onTabChange = (t: TabId) => {
    setTab(t);
    setCountInput(String(countMap[t] ?? 500));
    setCompareTargets(null);
    if (t === 'amp') {
      setCountInput(String(countMap.amp ?? 80));
    }
  };

  const visibleTabs: { id: TabId; label: string }[] = gameId === 'kl8'
    ? TABS.filter((t) => ['common', 'combo', 'fushi', 'kl8seq', 'kl8dt'].includes(t.id))
    : TABS.filter((t) => !['combo', 'fushi', 'kl8seq', 'kl8dt'].includes(t.id));

  const TYPE_OPTIONS = [
    { id: 'draw', label: '开奖号' },
    { id: 'pair', label: '对码' },
    { id: 'sum', label: '两码合' },
    { id: 'diff', label: '两码差' },
    { id: 'span', label: '两码跨' },
  ];

  const renderTypeRow = () => (
    <Field caption="类型">
      <View style={styles.chipRow}>
        {TYPE_OPTIONS.map((t) => (
          <Chip
            key={t.id}
            label={t.label}
            active={type === t.id}
            onPress={() => { setType(t.id); setDan([]); setPei([]); }}
          />
        ))}
      </View>
    </Field>
  );

  const renderDigitRow = (
    label: string, arr: number[], setArr: (v: number[]) => void, extra?: React.ReactNode,
  ) => (
    <Field caption={label}>
      <DigitGrid
        digits={(tab === 'dan' || tab === 'dantuo') && type === 'pair' ? [0, 1, 2, 3, 4] : DIGITS}
        selected={arr}
        onToggle={(d) => toggle(arr, setArr, d)}
        marks={digitMarks}
        columns={6}
      />
      <View style={styles.chipRow}>
        <Chip label="清" active={false} onPress={() => { setArr([]); setExternalCodes(null); }} />
        {extra}
      </View>
    </Field>
  );

  const renderKl8Dt = () => {
    const rows: number[][] = [];
    for (let r = 0; r < 2; r += 1) {
      const row: number[] = [];
      for (let c = 1; c <= 40; c += 1) row.push(r * 40 + c);
      rows.push(row);
    }
    const toggleDan = (v: number) => {
      setKl8DtDan((prev) => {
        if (prev.includes(v)) return prev.filter((x) => x !== v);
        if (prev.length >= 9) return prev;
        setKl8DtTuo((t) => t.filter((x) => x !== v));
        return [...prev, v];
      });
    };
    const toggleTuo = (v: number) => {
      setKl8DtTuo((prev) => {
        if (prev.includes(v)) return prev.filter((x) => x !== v);
        return [...prev, v];
      });
    };
    const toggleTuoCount = (n: number) => {
      setKl8DtTuoCounts((prev) => prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]);
    };
    const renderGrid = (active: number[], onToggle: (v: number) => void, disabled: number[] = []) => (
      <View>
        {rows.map((row, ri) => (
          <View key={ri} style={styles.kl8Row}>
            <Text style={styles.kl8RowLabel}>
              {String(row[0]).padStart(2, '0')}-
            </Text>
            {row.map((v) => {
              const isActive = active.includes(v);
              const isDisabled = disabled.includes(v);
              return (
                <Pressable key={v}
                  onPress={() => { if (!isDisabled) onToggle(v); }}
                  style={[
                    styles.kl8Cell,
                    isActive && styles.kl8CellOn,
                    isDisabled && styles.kl8CellOff,
                  ]}>
                  <Text style={[
                    styles.kl8CellText,
                    isActive && styles.kl8CellTextOn,
                    isDisabled && styles.kl8CellTextOff,
                  ]}>
                    {String(v).padStart(2, '0')}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    );
    return (
      <>
        {/* 胆行 */}
        <Field caption="胆码（必含）">
          <View style={styles.rowBetween}>
            <Chip
              label={kl8DtDan.length > 0 ? kl8DtDan.map((n) => String(n).padStart(2, '0')).join(' ') : '点此选胆'}
              active={kl8DtDan.length > 0}
              onPress={() => setKl8DtDanMenuOpen(true)}
            />
          </View>
          <Text style={styles.fieldNote}>中</Text>
          <DigitGrid
            digits={DIGITS}
            selected={kl8DtDanCounts}
            onToggle={(n) => setKl8DtDanCounts((prev) => prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n])}
            columns={6}
          />
        </Field>

        {/* 拖行 */}
        <Field caption="拖码（至少含一）">
          <View style={styles.rowBetween}>
            <Chip
              label={kl8DtTuo.length > 0 ? kl8DtTuo.map((n) => String(n).padStart(2, '0')).join(' ') : '点此选拖'}
              active={kl8DtTuo.length > 0}
              onPress={() => setKl8DtTuoMenuOpen(true)}
            />
          </View>
          <Text style={styles.fieldNote}>中</Text>
          <DigitGrid
            digits={Array.from({ length: 16 }, (_, i) => i)}
            selected={kl8DtTuoCounts}
            onToggle={toggleTuoCount}
            columns={6}
          />
        </Field>

        {/* 胆码网格弹窗 */}
        <Modal visible={kl8DtDanMenuOpen} transparent animationType="fade" onRequestClose={() => setKl8DtDanMenuOpen(false)}>
          <View style={styles.modalMask}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>
                选胆码（最多 9 个，已选 {kl8DtDan.length}）
              </Text>
              {renderGrid(kl8DtDan, toggleDan)}
              <Pressable onPress={() => setKl8DtDanMenuOpen(false)} style={styles.modalBtn}>
                <Text style={styles.modalBtnText}>确定</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        {/* 拖码网格弹窗 */}
        <Modal visible={kl8DtTuoMenuOpen} transparent animationType="fade" onRequestClose={() => setKl8DtTuoMenuOpen(false)}>
          <View style={styles.modalMask}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>
                选拖码（已选 {kl8DtTuo.length}）
              </Text>
              {renderGrid(kl8DtTuo, toggleTuo, kl8DtDan)}
              <Pressable onPress={() => setKl8DtTuoMenuOpen(false)} style={styles.modalBtn}>
                <Text style={styles.modalBtnText}>确定</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </>
    );
  };

  const renderKl8Seq = () => {
    const types: { id: typeof kl8SeqType; label: string }[] = [
      { id: 'connum', label: '连' },
      { id: 'odd',    label: '奇' },
      { id: 'even',   label: '偶' },
      { id: 'prime',  label: '质' },
      { id: 'comp',   label: '合' },
      { id: 'road0',  label: '0路' },
      { id: 'road1',  label: '1路' },
      { id: 'road2',  label: '2路' },
    ];
    return (
      <>
        <Field caption="类型">
          <Segmented
            options={types.map((t) => ({ value: t.id, label: t.label }))}
            value={kl8SeqType}
            onChange={(v) => { setKl8SeqType(v); setKl8SeqIndex(0); }}
          />
        </Field>
        <Field caption="长度">
          <Segmented
            options={[2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: String(n), label: String(n) }))}
            value={String(kl8SeqLen)}
            onChange={(v) => { setKl8SeqLen(Number(v)); setKl8SeqIndex(0); }}
          />
        </Field>
        <Field caption="已选">
          <View style={styles.rowBetween}>
            <Chip
              label={kl8SeqCodes.map((n) => String(n).padStart(2, '0')).join(' ')}
              active
              onPress={() => setKl8SeqMenuOpen(true)}
            />
            <Text style={styles.hint}>
              （共 {kl8SeqOptions.length} 组 · 第 {kl8SeqIndex + 1} 组）
            </Text>
          </View>
        </Field>

        <Modal visible={kl8SeqMenuOpen} transparent animationType="fade" onRequestClose={() => setKl8SeqMenuOpen(false)}>
          <Pressable
            style={styles.modalMask}
            onPress={() => setKl8SeqMenuOpen(false)}
          >
            <View style={[styles.modalCard, { width: 240, maxHeight: 360 }]}>
              <Text style={styles.modalTitle}>选择组合</Text>
              <ScrollView>
                {kl8SeqOptions.map((opt, i) => {
                  const active = i === kl8SeqIndex;
                  return (
                    <Pressable
                      key={i}
                      onPress={() => { setKl8SeqIndex(i); setKl8SeqMenuOpen(false); }}
                      style={[styles.modalOption, active && styles.modalOptionOn]}
                    >
                      <Text style={[styles.modalOptionText, active && styles.modalOptionTextOn]}>
                        {opt.map((n) => String(n).padStart(2, '0')).join(' ')}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </Pressable>
        </Modal>
      </>
    );
  };

  const renderCombo = () => {
    const rows: number[][] = [];
    for (let r = 0; r < 2; r += 1) {
      const row: number[] = [];
      for (let c = 1; c <= 40; c += 1) row.push(r * 40 + c);
      rows.push(row);
    }
    const toggleCombo = (v: number) => {
      setExternalCodes(null);
      setKl8ComboCodes((prev) => {
        if (prev.includes(v)) return prev.filter((x) => x !== v);
        if (prev.length >= 20) return prev;
        return [...prev, v];
      });
    };
    return (
      <>
        <Field caption="号码（最多 20 个）">
          {rows.map((row, ri) => (
            <View key={ri} style={styles.kl8Row}>
              <Text style={styles.kl8RowLabel}>
                {String(row[0]).padStart(2, '0')}-
              </Text>
              {row.map((v) => {
                const active = kl8ComboCodes.includes(v);
                return (
                  <Pressable
                    key={v}
                    onPress={() => toggleCombo(v)}
                    style={[styles.kl8Cell, active && styles.kl8CellOn]}
                  >
                    <Text style={[styles.kl8CellText, active && styles.kl8CellTextOn]}>
                      {String(v).padStart(2, '0')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </Field>

        <Field caption="命中">
          <Segmented
            options={[
              { value: 'all', label: '全中' },
              { value: 'any', label: '任意中1' },
              { value: 'exact', label: '中N个' },
            ]}
            value={kl8MatchMode}
            onChange={setKl8MatchMode}
          />
          {kl8MatchMode === 'exact' && (
            <>
              <Text style={styles.fieldNote}>N=</Text>
              <DigitGrid
                digits={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
                selected={[kl8MatchCount]}
                onToggle={setKl8MatchCount}
                columns={6}
              />
            </>
          )}
          <View style={styles.rowBetween}>
            <Chip label="清空" active={false} onPress={() => setKl8ComboCodes([])} />
            <Text style={[styles.hint, kl8ComboCodes.length > 0 && styles.hintOn]}>
              已选 {kl8ComboCodes.length}
            </Text>
          </View>
        </Field>
      </>
    );
  };

  const renderCommon = () => {
    const digitRow = (label: string, maxV: number, cur: number, onSelect: (v: number) => void) => (
      <Field caption={label}>
        <DigitGrid
          digits={Array.from({ length: maxV + 1 }, (_, i) => i)}
          selected={[cur]}
          onToggle={(v) => { setExternalCodes(null); onSelect(v); }}
          columns={6}
        />
      </Field>
    );

    // KL8 专用：模式行 + 值行
    if (gameId === 'kl8') {
      const modes: { id: typeof kl8CommonMode; label: string }[] = [
        { id: 'digit', label: '数字' },
        { id: 'tail', label: '尾号' },
        { id: 'road', label: '012路' },
        { id: 'zone4', label: '4区' },
        { id: 'zone8', label: '8区' },
      ];
      const isDigit = kl8CommonMode === 'digit';
      const valueCount = kl8CommonMode === 'digit' ? 80
        : kl8CommonMode === 'tail' ? 10
        : kl8CommonMode === 'road' ? 3
        : kl8CommonMode === 'zone4' ? 4
        : 8;
      const valueLabel = (v: number): string => {
        if (kl8CommonMode === 'digit') return String(v).padStart(2, '0');
        if (kl8CommonMode === 'tail') return `尾${v}`;
        if (kl8CommonMode === 'road') return `${v}路`;
        if (kl8CommonMode === 'zone4') return ['01-20', '21-40', '41-60', '61-80'][v] ?? String(v);
        return `${String(v * 10 + 1).padStart(2, '0')}-${String(v * 10 + 10).padStart(2, '0')}`;
      };
      const valueStart = isDigit ? 1 : 0;

      return (
        <>
          {/* 模式行 */}
          <Field caption="模式">
            <Segmented
              options={modes.map((m) => ({ value: m.id, label: m.label }))}
              value={kl8CommonMode}
              onChange={(m) => {
                setKl8CommonMode(m);
                setKl8CommonValue(m === 'digit' ? 1 : 0);
                setKl8CommonMatchCount(2);
              }}
            />
          </Field>

          {/* 号码网格（digit 模式 2×40）*/}
          {isDigit && (
            (() => {
              const rows: number[][] = [];
              for (let r = 0; r < 2; r += 1) {
                const row: number[] = [];
                for (let c = 1; c <= 40; c += 1) row.push(r * 40 + c);
                rows.push(row);
              }
              return (
                <Field caption="数字">
                  {rows.map((row, ri) => (
                    <View key={ri} style={styles.kl8Row}>
                      <Text style={styles.kl8RowLabel}>
                        {String(row[0]).padStart(2, '0')}-
                      </Text>
                      {row.map((v) => {
                        const active = kl8CommonValue === v;
                        return (
                          <Pressable key={v}
                            onPress={() => { setExternalCodes(null); setKl8CommonValue(v); }}
                            style={[styles.kl8Cell, active && styles.kl8CellOn]}>
                            <Text style={[styles.kl8CellText, active && styles.kl8CellTextOn]}>
                              {String(v).padStart(2, '0')}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                </Field>
              );
            })()
          )}

          {/* 值行（非 digit 模式）*/}
          {!isDigit && (
            <>
              <Field caption="值">
                <View style={styles.chipRow}>
                  {Array.from({ length: valueCount }, (_, i) => i + valueStart).map((v) => (
                    <Chip key={v} label={valueLabel(v)} active={kl8CommonValue === v} onPress={() => setKl8CommonValue(v)} />
                  ))}
                </View>
              </Field>
              <Field caption="中N个">
                <DigitGrid
                  digits={[0, 2, 3, 4, 5, 6, 7, 8, 9]}
                  selected={[kl8CommonMatchCount]}
                  onToggle={setKl8CommonMatchCount}
                  columns={6}
                />
              </Field>
            </>
          )}
        </>
      );
    }

    return (
      <>
        {/* 模式选择 */}
        <Field caption="模式">
          <Segmented
            options={[
              { value: 'digit', label: '数字' },
              { value: 'front2', label: '前二' },
              { value: 'back2', label: '后二' },
            ]}
            value={commonMode}
            onChange={(v) => setCommonMode(v)}
          />
          <View style={styles.rowBetween}>
            <Text style={styles.fieldNote}>周期</Text>
            <Chip label={`${period}`} active onPress={() => setPeriodMenuOpen(true)} />
          </View>
        </Field>

        {/* 数值行 */}
        {commonMode === 'digit' && digitRow('数字', 9, commonDigit, setCommonDigit)}
        {commonMode === 'front2' && digitRow('前二和', 18, commonFront2, setCommonFront2)}
        {commonMode === 'back2' && digitRow('后二和', 18, commonBack2, setCommonBack2)}
      </>
    );
  };

  /** 生成"毒胆同屏"目标：每个胆码一张图 */
  const doDanCompare = () => {
    if (dan.length === 0) return;
    const sorted = [...dan].sort((a, b) => a - b);
    const targets: Target[] = sorted.map((d) => ({ kind: 'digit', digit: d, pos: 'any' }));
    setCompareTargets(targets);
    setPickExpanded(false);
  };

  /** 生成"毒胆对码同屏"：每个胆码 + 对码各一张 */
  const doDanPairCompare = () => {
    if (dan.length === 0) return;
    const targets: Target[] = [];
    for (const d of [...dan].sort((a, b) => a - b)) {
      targets.push({ kind: 'digit', digit: d, pos: 'any' });
      const pairNum = d < 5 ? d + 5 : d - 5;
      targets.push({ kind: 'digit', digit: pairNum, pos: 'any' });
    }
    setCompareTargets(targets);
    setPickExpanded(false);
  };

  /** 二码合、二码差同屏 */
  const doTwoMaCompare = () => {
    if (dan.length === 0) return;
    const targets: Target[] = [
      { kind: 'calcAttr', calcKey: 'pairSumMax', value: dan[0] },
      { kind: 'calcAttr', calcKey: 'pairDiffMax', value: dan[0] },
    ];
    setCompareTargets(targets);
    setPickExpanded(false);
  };

  const renderDan = () => (
    <>
      {renderDigitRow('胆码', dan, setDan, (
        <>
          <Chip label="毒胆同屏" active={false} onPress={doDanCompare} />
          <Chip label="毒胆对码同屏" active={false} onPress={doDanPairCompare} />
        </>
      ))}
      {renderDigitRow('配码', pei, setPei, (
        <>
          <Chip label="胆配对码同屏" active={false} onPress={doDanPairCompare} />
          <Chip label="二码同屏" active={false} onPress={doTwoMaCompare} />
          <Chip
            label="退出同屏"
            active={false}
            onPress={() => { setCompareTargets(null); setPickExpanded(false); setFocusedIdx(null); }}
          />
        </>
      ))}
    </>
  );

  const renderDantuo = () => (
    <>
      {renderDigitRow('胆码', dtDan, setDtDan)}
      {renderDigitRow('拖码', dtTuo, setDtTuo)}
    </>
  );

  const renderPos = () => (
    <>
      <Field caption="位置">
        <Segmented
          options={posOptions.map((p) => ({ value: p, label: POS_LABEL_MAP[p] }))}
          value={pos}
          onChange={setPos}
        />
      </Field>
      <Field caption="数字">
        <DigitGrid
          digits={DIGITS}
          selected={[posDigit]}
          onToggle={(d) => { setExternalCodes(null); setPosDigit(d); }}
          marks={digitMarks}
          columns={6}
        />
      </Field>
    </>
  );

  const renderMulti = () => (
    <>
      {/* 模式切换 */}
      <Field caption="模式">
        <Segmented
          options={[
            { value: 'pos', label: '定位' },
            { value: 'nopos', label: '不定位' },
          ]}
          value={multiMode}
          onChange={(v) => setMultiMode(v)}
        />
      </Field>

      {multiMode === 'pos' ? (
        <>
          {posSlots.map((s) => (
            <View key={s.key}>{renderDigitRow(s.label, s.arr, s.setArr)}</View>
          ))}
        </>
      ) : (
        renderDigitRow('号码', noposNums, setNoposNums)
      )}
    </>
  );

  const renderHejiGeneric = (keys: readonly { id: string; label: string; min: number; max: number }[]) => {
    const meta = keys.find((k) => k.id === hejiKey) ?? keys[0];
    return (
      <>
        <Field caption="属性">
          <Segmented
            options={keys.map((k) => ({ value: k.id, label: k.label }))}
            value={hejiKey}
            onChange={(v) => {
              const k = keys.find((x) => x.id === v) ?? keys[0];
              setHejiKey(k.id);
              setHejiValue(Math.floor((k.min + k.max) / 2));
            }}
          />
        </Field>
        <Field caption="值">
          <DigitGrid
            digits={Array.from({ length: meta.max - meta.min + 1 }, (_, i) => meta.min + i)}
            selected={[hejiValue]}
            onToggle={(v) => { setExternalCodes(null); setHejiValue(v); }}
            columns={6}
          />
        </Field>
      </>
    );
  };

  const renderHeji = () => renderHejiGeneric(HEJI_KEYS);
  const renderAmp = () => {
    return (
      <>
        <Field caption="属性">
          <Segmented
            options={AMP_KEYS.map((k) => ({ value: k.id, label: k.label }))}
            value={ampKey}
            onChange={(v) => setAmpKey(v)}
          />
        </Field>
        <Field caption="值范围">
          <DigitGrid
            digits={DIGITS}
            selected={[ampMax]}
            onToggle={setAmpMax}
            columns={6}
          />
          <Text style={styles.hint}>≤ {ampMax}</Text>
        </Field>
      </>
    );
  };

  const renderFushi = () => {
    const rows: number[][] = [];
    for (let r = 0; r < 2; r += 1) {
      const row: number[] = [];
      for (let c = 1; c <= 40; c += 1) row.push(r * 40 + c);
      rows.push(row);
    }
    const toggleFushi = (v: number) => {
      setExternalCodes(null);
      setKl8FushiCodes((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]);
    };
    return (
      <>
        <Field caption="玩法">
          <Segmented
            options={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({ value: String(n), label: `选${n}` }))}
            value={String(kl8FushiPlaySize)}
            onChange={(v) => setKl8FushiPlaySize(Number(v))}
          />
        </Field>
        <Field caption="号码">
          {rows.map((row, ri) => (
            <View key={ri} style={styles.kl8Row}>
              <Text style={styles.kl8RowLabel}>
                {String(row[0]).padStart(2, '0')}-
              </Text>
              {row.map((v) => {
                const active = kl8FushiCodes.includes(v);
                return (
                  <Pressable key={v} onPress={() => toggleFushi(v)}
                    style={[styles.kl8Cell, active && styles.kl8CellOn]}>
                    <Text style={[styles.kl8CellText, active && styles.kl8CellTextOn]}>
                      {String(v).padStart(2, '0')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </Field>
        <Field caption="结果">
          <View style={styles.rowBetween}>
            <Text style={styles.hint}>
              已选 {kl8FushiCodes.length} 个 · 命中 ≥{kl8FushiPlaySize} 个算中
            </Text>
            <Chip label="清空" active={false} onPress={() => setKl8FushiCodes([])} />
          </View>
        </Field>
      </>
    );
  };

  const renderPlaceholder = (label: string) => (
    <View style={styles.placeholder}>
      <Text style={styles.hint}>{label} · 开发中</Text>
    </View>
  );

  /** 号码预览框（固定高度滚动，避免长串撑破布局） */
  const renderCodePreview = (codes: string[]) => (
    <View style={{ maxHeight: 120, borderWidth: 1, borderColor: semantic.panelBorder, borderRadius: radius.sm, padding: space.xs, backgroundColor: semantic.panelBg }}>
      <ScrollView nestedScrollEnabled>
        <Text style={[styles.hint, { lineHeight: 20 }]}>{codes.join('  ')}</Text>
      </ScrollView>
    </View>
  );

  /** 复制/粘贴导入号码（数字彩）：解析后按毒胆方式分析命中走势 */
  const renderPasteImport = () => (
    <Field caption="粘贴导入号码">
      <TextInput
        style={[styles.numInput, { height: 64, textAlignVertical: 'top' }]}
        value={importText}
        onChangeText={setImportText}
        placeholder="如 123 456 789（空格/逗号分隔，排列五用 5 位）"
        placeholderTextColor={semantic.textFaint}
        multiline
      />
      <View style={styles.chipRow}>
        <Chip
          label="导入并分析"
          active={false}
          onPress={() => {
            const arr = importText.split(/[\s,，、]+/).map((s) => s.trim()).filter(Boolean);
            if (arr.length > 0) {
              setExternalCodes(new Set(arr));
              setTab('dan');
              setFocusedIdx(null);
              setPickExpanded(false);
            }
          }}
        />
        <Chip label="清空" active={false} onPress={() => setImportText('')} />
      </View>
      <Text style={styles.hint}>导入后按「毒胆」方式分析这些号码的命中走势（仅数字彩）</Text>
    </Field>
  );

  /** 组内随机（分组随机 N中1）：每位从允许池各取一个，生成 count 注 */
  const renderRandom1 = () => (
    <>
      <Field caption="允许数字池">
        <DigitGrid
          digits={DIGITS}
          selected={random1Pool}
          onToggle={(d) => setRandom1Pool((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))}
          columns={6}
        />
        <View style={styles.chipRow}>
          <Chip label="全清(=0-9全选)" active={false} onPress={() => setRandom1Pool([])} />
        </View>
        <Text style={styles.hint}>空池=0-9 全允许；组内随机=每位各从中取一个，组成 {DD} 位号码</Text>
      </Field>
      <Field caption="生成注数">
        <DigitGrid
          digits={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 30]}
          selected={[random1Count]}
          onToggle={setRandom1Count}
          columns={6}
        />
      </Field>
      <Field caption="结果">
        <View style={styles.rowBetween}>
          <Text style={styles.hint}>共 {random1Codes.length} 注 · 已切入分析</Text>
          <Chip label="重新生成" active={false} onPress={() => setRandom1Seed((s) => s + 1)} />
        </View>
        {renderCodePreview(random1Codes)}
      </Field>
    </>
  );

  /** 随机交并：生成两套随机号，取交集或并集 */
  const renderRandom2 = () => (
    <>
      <Field caption="每组注数">
        <DigitGrid
          digits={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20]}
          selected={[random2Count]}
          onToggle={setRandom2Count}
          columns={6}
        />
      </Field>
      <Field caption="结果取">
        <Segmented
          options={[{ value: 'union', label: '并集' }, { value: 'inter', label: '交集' }]}
          value={random2Mode}
          onChange={(v) => setRandom2Mode(v as 'union' | 'inter')}
        />
      </Field>
      <Field caption="随机集 A（{random2A.length} 注）">{renderCodePreview(random2A)}</Field>
      <Field caption="随机集 B（{random2B.length} 注）">{renderCodePreview(random2B)}</Field>
      <Field caption={random2Mode === 'union' ? '并集结果' : '交集结果'}>
        <View style={styles.rowBetween}>
          <Text style={styles.hint}>共 {random2Result.length} 注 · 已切入分析</Text>
          <Chip label="重新生成" active={false} onPress={() => setRandom2Seed((s) => s + 1)} />
        </View>
        {renderCodePreview(random2Result)}
      </Field>
    </>
  );

  /** 分组胆：按位置 + 属性分组筛选，产出命中的全部号码集合 */
  const GROUP_ATTR_KEYS: { id: SetAttrKey; label: string }[] = (
    Object.keys(SET_ATTRS) as SetAttrKey[]
  ).map((k) => ({ id: k, label: SET_ATTRS[k].label }));
  const renderGroup = () => {
    const attrDef = SET_ATTRS[groupAttr];
    const values = Object.keys(attrDef.values);
    return (
      <>
        <Field caption="位置">
          <Segmented
            options={posOptions.map((p) => ({ value: p, label: POS_LABEL_MAP[p] }))}
            value={groupPos}
            onChange={(v) => setGroupPos(v as Position)}
          />
        </Field>
        <Field caption="属性">
          <Segmented
            options={GROUP_ATTR_KEYS.map((a) => ({ value: a.id, label: a.label }))}
            value={groupAttr}
            onChange={(v) => {
              const k = v as SetAttrKey;
              setGroupAttr(k);
              setGroupValue(Object.keys(SET_ATTRS[k].values)[0]);
            }}
          />
        </Field>
        <Field caption="取值">
          <View style={styles.chipRow}>
            {values.map((val) => (
              <Chip key={val} label={val} active={groupValue === val} onPress={() => setGroupValue(val)} />
            ))}
          </View>
          <Text style={styles.hint}>
            分组胆：该位置数字属于所选属性即命中，共 {groupCodes.length} 注 · 已切入分析
          </Text>
        </Field>
      </>
    );
  };


  /** 原型 .bottombar：左侧重置 + 右侧主按钮 */
  const handleReset = () => {
    setShapeMainMode('zhixuan');
    setShapeFilters([]);
    setCompareTargets(null);
    setFocusedIdx(null);
    setExternalCodes(null);
  };

  const handleExport = () => {
    Alert.alert(
      '出图',
      `${game.name} · ${getTargetLabel(target)}\n集合 ${codesCount} 注 · 理论遗漏 ${theoryMiss.toFixed(2)}\n当前遗漏 ${currentOmission}`,
    );
  };

  /** 数据 / 期数面板（原底部工具栏） */
  const renderDataBar = () => (
    <>
      {/* 彩种切换已由顶部 gamebar 提供，这里不再重复放一份 */}
      {/* 官方《周期K线》：频率K线 + 周期>1 = 周期K线，具备上下影线 */}
      <Field caption={period > 1 ? '周期K线' : '周期'}>
        <View style={styles.chipRow}>
          {[1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20].map((p) => (
            <Chip key={`pd-${p}`} label={String(p)} active={period === p} pill onPress={() => setPeriod(p)} />
          ))}
        </View>
        {period > 1 && (
          <>
            <Text style={styles.hint} numberOfLines={2}>
              周期值&gt;1 即为周期K线：具备上下影线，线段长度错落不一
            </Text>
            <Segmented
              options={[
                { value: 'left', label: '左对齐·开奖首期基准' },
                { value: 'right', label: '右对齐·投注期基准' },
              ]}
              value={cycleAlign}
              onChange={(v) => setCycleAlign(v as CycleAlign)}
            />
          </>
        )}
      </Field>

      {/* 官方《出次图》：分段周期 + 退期 */}
      {(chartModes.includes('chuci') || chartModes.includes('chuciMove')) && (
        <Field caption="分段周期（步长）">
          <View style={styles.chipRow}>
            {[5, 10, 15, 20, 25, 30, 50].map((p) => (
              <Chip key={`sp-${p}`} label={String(p)} active={stepPeriod === p} pill onPress={() => setStepPeriod(p)} />
            ))}
          </View>
          <View style={styles.rowBetween}>
            <Text style={styles.fieldNote}>退期（最后一点前推的期数）</Text>
            <Chip label={String(drawBack)} active onPress={() => setDrawBack(drawBack >= 30 ? 0 : drawBack + 5)} />
          </View>
          <Text style={styles.hint} numberOfLines={2}>
            退期用来只对历史数据做验证，看这一段时间内号码已出现的次数
          </Text>
        </Field>
      )}

      {/* 官方《遗漏和》：不定位胆（组选）/ 全胆 / 定位胆（直选） */}
      {chartModes.includes('missSum') && (
        <Field caption="遗漏和口径">
          <Segmented
            options={[
              { value: 'direct', label: '定位胆（直选）' },
              { value: 'group', label: '不定位胆（组选）' },
              { value: 'all', label: '全胆' },
            ]}
            value={missSumKind}
            onChange={(v) => setMissSumKind(v as 'direct' | 'group' | 'all')}
          />
          <MissSumStat values={missSum.values} kind={missSumKind} />
        </Field>
      )}
      <Field caption="期数 / 分析窗口">
        <View style={styles.rowBetween}>
          <TextInput
            value={countInput}
            onChangeText={setCountInput}
            onEndEditing={applyCount}
            onSubmitEditing={applyCount}
            keyboardType="numeric"
            style={styles.numInput}
            placeholderTextColor={semantic.textFaint}
            placeholder="500"
          />
          <Chip label="应用" active onPress={applyCount} />
          <Chip label={refreshing ? '刷新中…' : '刷新'} active={false} onPress={() => void refresh()} />
        </View>
        <Text style={styles.hint} numberOfLines={2}>
          {game.name} · 集合 {codesCount} 注 · 理论 {theoryMiss.toFixed(2)} · {source} {records.length}期 / 共{allRecords.length}期
        </Text>
      </Field>
    </>
  );

  /**
   * 图表渲染：只统一容器，组件 props 与原来一致。
   * 频率K线 / 遗漏K线在有副图指标时改走 MultiPaneChart：
   * 主图 + 副图放同一个 WebView（多 grid），x 轴天然对齐，也最省性能。
   * 遗漏图 / 二阶遗漏图是折线，没有 K 线实体，副图无从计算，保持原组件。
   */
  const renderChart = (
    m: ChartMode,
    w: number,
    h: number,
    s: TargetPoint[],
    oS: { issue: string; omission: number }[],
    tMiss: number,
    label: string,
    historyMax?: number,
  ) => {
    // 出次图 / 出次移动统计 / 遗漏和 —— 官方遗漏分析家族，走各自的折线组件
    if (m === 'chuci' || m === 'chuciMove') {
      const issues = s.map((p) => p.issue);
      const hitFlags = s.map((p) => p.hit);
      const pts =
        m === 'chuci'
          ? buildChuciSeries(issues, hitFlags, stepPeriod, drawBack)
          : buildChuciMoveSeries(issues, hitFlags, stepPeriod, drawBack);
      return (
        <EChartsChuciChart
          points={pts}
          height={h}
          width={w}
          moveMode={m === 'chuciMove'}
          targetLabel={`${chartMeta[m].title} · ${label}`}
        />
      );
    }
    if (m === 'missSum') {
      const vs = missSum.values;
      const mean = vs.length > 0 ? vs.reduce((a, b) => a + b, 0) / vs.length : 0;
      // 官方那句「≥11 时下期 90% 回落」是针对**组选**口径说的；
      // 直选/全胆的量纲完全不同（均值分别约 27 / 27），用各自均值当参考线才有意义。
      const refValue = missSumKind === 'group' ? MISS_SUM_REF : Math.round(mean);
      return (
        <EChartsMissSumChart
          issues={missSum.issues}
          values={vs}
          height={h}
          width={w}
          targetLabel={`${missSum.title} · ${label}`}
          refValue={refValue}
          tip={`当前 ${vs.length > 0 ? vs[vs.length - 1] : 0}  均值 ${mean.toFixed(1)}  参考线 ${refValue}`}
        />
      );
    }
    if (activeSubs.length > 0 && (m === 'freq' || m === 'omissionK')) {
      const bars =
        m === 'freq'
          ? aggregate(s, period, cycleAlign)
          : buildOmissionBars(s, tMiss, secondOrderFromTheory(tMiss));
      // 右上角「上轨 / 中轨 / 下轨」数值行（参考图的指标栏）
      const cv = bars.map((b) => b.c);
      const bl = cv.length >= 2
        ? buildBoll(cv, Math.min(20, Math.max(2, cv.length)), 2)
        : null;
      const tri = bl ? lastBollTriple(bl) : {};
      const fmt = (v?: number) => (v === undefined ? '—' : v.toFixed(2));
      return (
        <MultiPaneChart
          bars={bars}
          maConfigs={maConfigs}
          showBoll
          indicators={activeSubs}
          height={h}
          width={w}
          title={`${chartMeta[m].title} · ${label}`}
          metaLine={`上轨 ${fmt(tri.upper)} 中轨 ${fmt(tri.mid)} 下轨 ${fmt(tri.lower)}`}
        />
      );
    }
    if (m === 'freq') {
      return (
        <EChartsFreqKChart
          series={s}
          height={h}
          width={w}
          period={period}
          align={cycleAlign}
          // 周期>1 即官方「周期K线」：画上下影线，实体给足宽度
          barWidth={period > 1 ? Math.max(3, Math.min(8, 40 / period)) : 1.5}
          hideShadow={period <= 1}
          heightScale={1}
          targetLabel={label}
        />
      );
    }
    if (m === 'omissionK') {
      return (
        <EChartsOmissionKChart
          series={s}
          height={h}
          width={w}
          theoryMiss={tMiss}
          secondOrderP={secondOrderFromTheory(tMiss)}
          targetLabel={label}
        />
      );
    }
    if (m === 'omissionLine') {
      return (
        <EChartsOmissionChart
          series={oS}
          height={h}
          width={w}
          theoryMiss={tMiss}
          targetLabel={label}
          historyMaxMiss={historyMax}
          mode="level1"
        />
      );
    }
    if (m === 'omissionLine2') {
      return (
        <EChartsOmissionChart
          series={oS}
          height={h}
          width={w}
          theoryMiss={tMiss}
          targetLabel={label}
          historyMaxMiss={historyMax}
          mode="level2"
        />
      );
    }
    return null;
  };

  /** 毒胆同屏：竖屏 1 列 × 10 行；点按放大单图 */
  const renderCompare = () => {
    if (!compareTargets || compareTargets.length === 0) return null;
    const list = compareTargets
      .map((ct, idx) => ({ ct, idx }))
      .filter(({ idx }) => focusedIdx === null || focusedIdx === idx);

    // 满屏模式：单张大图（水平居中）
    if (focusedIdx !== null && list.length > 0) {
      const { ct } = list[0];
      const sliceN = records.length;
      const s = buildTargetSeries(records.slice(-sliceN), ct, V, DD);
      const tMiss = getTheoryMiss(ct, V, DD);
      const oSeries = s.map((p) => ({ issue: p.issue, omission: p.omission }));
      const m = chartModes[0]; // 同屏只显示第一种图
      return (
        <>
          {!fullscreen && renderZoomBar()}
          <View style={styles.chartCenter}>
            <ChartCard title={getTargetLabel(ct)} meta={chartMeta[m].title}>
              <Pressable onPress={() => setFocusedIdx(null)}>
                {renderChart(
                  m,
                  chartW,
                  Math.round(Math.max(chartSize.h * 2, availH - 40) * chartZoom),
                  s,
                  oSeries,
                  tMiss,
                  getTargetLabel(ct),
                )}
              </Pressable>
            </ChartCard>
          </View>
          <View style={{ height: space.md }} />
          <View style={styles.chipRow}>
            <Chip
              label="退出同屏"
              active={false}
              onPress={() => { setCompareTargets(null); setPickExpanded(false); setFocusedIdx(null); }}
            />
          </View>
        </>
      );
    }

    return (
      <>
        {!fullscreen && renderZoomBar()}
        <TongGrid columns={tongColumns}>
          {list.map(({ ct, idx }) => {
            const sliceN = Math.min(records.length, 300);
            const s = buildTargetSeries(records.slice(-sliceN), ct, V, DD);
            const tMiss = getTheoryMiss(ct, V, DD);
            const oSeries = s.map((p) => ({ issue: p.issue, omission: p.omission }));
            // 胆码标签
            const label = ct.kind === 'digit' ? String(ct.digit) : String(idx);
            const m = chartModes[0]; // 同屏只显示第一种图
            const cellW = tongColumns === 1 ? chartW : tongW;
            return (
              <TongCell key={idx} digit={label} width={tongColumns === 1 ? undefined : tongW}>
                <Pressable onPress={() => setFocusedIdx(focusedIdx === idx ? null : idx)}>
                  {renderChart(
                    m,
                    cellW,
                    Math.round(tongH * chartZoom),
                    s,
                    oSeries,
                    tMiss,
                    getTargetLabel(ct),
                  )}
                </Pressable>
              </TongCell>
            );
          })}
        </TongGrid>
      </>
    );
  };

  /** 顶栏收缩态：横屏手动收起，或全屏自动收起 */
  const chromeHidden = fullscreen || chromeCollapsed;
  return (
    <Screen
      safeAreaEdges={['top', 'left', 'right']}
      backgroundColor={semantic.pageBg}
      statusBarStyle="light"
    >
      <DensityProvider value={dense ? 'compact' : 'regular'}>
      <View style={styles.shell}>
        {/* ───── 全屏：只留一条细操作条，整屏都给图表 ───── */}
        {fullscreen ? (
          <View style={styles.fsBar}>
            <Text style={styles.fsTitle} numberOfLines={1}>
              {game.name} · {getTargetLabel(target)}
            </Text>
            {renderZoomBar()}
          </View>
        ) : (
          <>
            {/* ───── brand 品牌栏 ───── */}
            <View
              style={[
                styles.brand,
                isLandscape && styles.brandLandscape,
                chromeCollapsed && styles.brandCollapsed,
              ]}
            >
              <View style={[styles.logo, chromeCollapsed && styles.logoCollapsed]}>
                <Text style={styles.logoText}>奇</Text>
              </View>
              {!chromeCollapsed && (
                <View style={{ flex: 1 }}>
                  <Text style={styles.brandTitle}>臻奇妙趋势分析</Text>
                  <Text style={styles.brandSub}>TREND · 手机原型</Text>
                </View>
              )}
              {/* 横屏：收起/展开顶部 chrome（主导航 + 子页签），把纵向空间让给图表 */}
              {isLandscape && (
                <Pressable
                  onPress={() => setChromeCollapsed((v) => !v)}
                  style={[styles.iconBtn, isLandscape && styles.iconBtnLandscape]}
                  accessibilityState={{ expanded: !chromeCollapsed }}
                >
                  <Text style={styles.iconBtnText}>{chromeCollapsed ? '▤' : '▬'}</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => setPickExpanded((v) => !v)}
                style={[styles.iconBtn, isLandscape && styles.iconBtnLandscape]}
                accessibilityState={{ expanded: !pickCollapsed }}
              >
                <Text style={styles.iconBtnText}>{pickCollapsed ? '▼' : '▲'}</Text>
              </Pressable>
            </View>

            {/* ───── gamebar 彩种 ───── */}
            <View style={[styles.gamebar, isLandscape && styles.gamebarLandscape]}>
              <View style={styles.gameList}>
                {GAMES.map((g) => {
                  const on = gameId === g.id;
                  return (
                    <Pressable
                      key={g.id}
                      onPress={() => setGameId(g.id)}
                      style={[
                        styles.game,
                        (dense || isLandscape) && styles.gameCompact,
                        on && styles.gameOn,
                      ]}
                      accessibilityState={{ selected: on }}
                    >
                      <View style={[styles.gameDot, on && styles.gameDotOn]} />
                      <Text
                        style={[
                          styles.gameText,
                          (dense || isLandscape) && styles.gameTextCompact,
                          on && styles.gameTextOn,
                        ]}
                      >
                        {g.label}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  onPress={() => setGameMenuOpen(true)}
                  style={[styles.gameMore, (dense || isLandscape) && styles.gameCompact]}
                >
                  <Text style={styles.gameMoreText}>⋯</Text>
                </Pressable>
              </View>
              <StatPill>
                <Text style={styles.statusText}>
                  数据 <Text style={styles.statusBold}>{allRecords.length}</Text> 期 · 当前遗漏{' '}
                  <Text style={styles.statusBold}>{currentOmission}</Text>
                </Text>
              </StatPill>
            </View>

            {/* ───── prinav 主导航 ───── */}
            {!chromeHidden && (
              <View style={[styles.prinav, isLandscape && styles.prinavLandscape]}>
                <Segmented
                  options={PRINAV_OPTIONS}
                  value={PRINAV_VALUE}
                  onChange={(v) => {
                    if (v === 'group') Alert.alert('组号', '组号功能开发中，敬请期待');
                  }}
                  equalWidth
                />
              </View>
            )}

            {/* ───── subtabs 子页签（吸顶可横滚） ───── */}
            {!chromeHidden && (
              <View style={[styles.subtabs, isLandscape && styles.subtabsLandscape]}>
                <SubTabs items={visibleTabs} value={tab} onChange={onTabChange} />
              </View>
            )}
          </>
        )}

        {/* ───── content 内容区 ───── */}
        <ScrollView
          style={styles.content}
          contentContainerStyle={[
            styles.contentInner,
            {
              paddingHorizontal: contentPad,
              // 底部抽屉收起时仍露出一条把手，内容要给它让位，否则最后一行被压住
              paddingBottom: fullscreen ? space.md : PEEK_H + bottomBarH,
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* 图表类型 + 缩放 + 图例
              图表整体上移到数据面板之上：用户明确要求「四个主要图表不要放到最下面」。
              选号已搬进底部抽屉，所以图表上面只剩这一条控制栏。 */}
          {!fullscreen && tab !== 'amp' && (
            <Panel label="图 表">
              <View style={styles.chipRow}>
                {CHART_MODES.map((c) => (
                  <Chip
                    key={c.id}
                    label={c.label}
                    active={chartModes.includes(c.id)}
                    pill
                    onPress={() => toggleChart(c.id)}
                  />
                ))}
                {/* 副图指标 + 均线参数 */}
                <Chip
                  label="指标"
                  active={activeSubs.length > 0}
                  pill
                  onPress={() => setIndicatorOpen(true)}
                />
              </View>
              {activeSubs.length > 0 && (
                <Text style={styles.hint}>
                  副图 {activeSubs.map((i) => INDICATOR_META[i].label).join(' / ')}
                  {' · 均线 '}
                  {maConfigs.filter((c) => c.enabled).map((c) => `MA${c.period}`).join(' ') || '关'}
                </Text>
              )}
              {/* 放大 / 缩小 / 重置 / 全屏 */}
              {renderZoomBar()}
              <Legend
                items={[
                  { color: palette.accent, label: '频率 / 实出' },
                  { color: palette.amber, label: '均线 / 胆码' },
                  { color: palette.cyan, label: '遗漏' },
                ]}
              />
            </Panel>
          )}

          {/* 振幅专用图 */}
          {tab === 'amp' && (
            <View style={styles.chartCenter}>
              {!fullscreen && renderZoomBar()}
              <ChartCard
                title={`${AMP_KEYS.find((k) => k.id === ampKey)?.label ?? ''} 走势`}
                meta={`≤ ${ampMax}`}
              >
                {rawData && (
                  <EChartsRawChart
                    data={rawData}
                    height={Math.round(Math.max(chartSize.h, availH - 8) * chartZoom)}
                    width={chartW}
                    title={`${AMP_KEYS.find((k) => k.id === ampKey)?.label ?? ''} 走势`}
                    yMax={ampMax}
                  />
                )}
              </ChartCard>
            </View>
          )}

          {loading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator color={palette.accent} />
              <Text style={styles.hint}>加载中…</Text>
            </View>
          ) : error ? (
            <View style={styles.centerBox}>
              <Text style={styles.errorText}>加载失败：{error}</Text>
            </View>
          ) : compareTargets && compareTargets.length > 0 ? (
            renderCompare()
          ) : tab === 'amp' ? null : codesCount === 0 ? (
            <View style={styles.centerBox}>
              <Text style={styles.hint}>请在上方选择号码</Text>
            </View>
          ) : (
            <View
              style={[
                styles.chartsGrid,
                isLandscape && styles.chartsGridLandscape,
                styles.chartCenter,
              ]}
            >
              {chartModes.map((m) => (
                // 横竖屏都是一列一表，故统一用 100% 宽度，不再按 chartColW 取半宽
                <View key={m} style={styles.chartCell}>
                  <ChartCard title={chartMeta[m].title} meta={chartMeta[m].meta}>
                    {renderChart(
                      m,
                      chartW,
                      Math.round(chartHBig * chartZoom),
                      series,
                      omissionSeries,
                      theoryMiss,
                      getTargetLabel(target),
                      historyMaxMiss,
                    )}
                  </ChartCard>
                </View>
              ))}
            </View>
          )}

          {/* 数据 / 期数面板：图表看完再往下翻参数（全屏时隐藏） */}
          {!fullscreen && <Panel label="数 据">{renderDataBar()}</Panel>}
        </ScrollView>

        {/* ───── 选号抽屉：从底部上下拉开，内容可上下滑动 ───── */}
        {!fullscreen && (
          <PickSheet
            tabLabel={TABS.find((t) => t.id === tab)?.label ?? '选号'}
            gameName={game.name}
            expanded={pickExpanded}
            onChange={setPickExpanded}
            bottomOffset={bottomBarH}
          >
            {renderPickContent()}
          </PickSheet>
        )}

        {/* ───── bottombar 底部操作栏（全屏时隐藏） ───── */}
        {!fullscreen && (
          <View
            style={{ paddingBottom: isLandscape ? 0 : insets.bottom }}
            onLayout={(e) => setBottomBarH(e.nativeEvent.layout.height)}
          >
            <BottomBar
              primaryLabel="出 图"
              onPrimary={handleExport}
              ghostLabel="重置"
              onGhost={handleReset}
              hint={`${game.name} · 集合 ${codesCount} 注 · 理论 ${theoryMiss.toFixed(2)}`}
            />
          </View>
        )}
      </View>
      </DensityProvider>

      {/* 彩种选择 / 数据任务 Modal */}
      <Modal visible={gameMenuOpen} transparent animationType="fade" onRequestClose={() => setGameMenuOpen(false)}>
        <Pressable
          style={styles.modalMask}
          onPress={() => setGameMenuOpen(false)}
        >
          <View style={[styles.modalCard, { minWidth: 200 }]}>
            {[
              { id: 'fc3d', label: '福彩3D', enabled: true },
              { id: 'pl3', label: '排列3', enabled: true },
              { id: 'pl5', label: '排列5', enabled: true },
              { id: 'kl8', label: '快乐8', enabled: true },
            ].map((g) => (
              <Pressable
                key={g.id}
                onPress={() => {
                  if (!g.enabled) return;
                  setGameId(g.id);
                  setGameMenuOpen(false);
                }}
                style={[styles.modalOption, { opacity: g.enabled ? 1 : 0.4 }]}
              >
                <Text style={[styles.modalOptionText, gameId === g.id && styles.modalOptionTextOn]}>
                  {g.label}{!g.enabled ? '  (开发中)' : ''}
                </Text>
              </Pressable>
            ))}
            <View style={styles.modalDivider} />
            <Pressable
              onPress={() => { setGameMenuOpen(false); void runFullFetch(); }}
              style={styles.modalOption}
            >
              <Text style={[styles.modalOptionText, { color: semantic.brand, fontWeight: '700' }]}>全量数据</Text>
              <Text style={styles.hint}>重新拉取并多源校验</Text>
            </Pressable>
            <Pressable
              onPress={() => { setGameMenuOpen(false); void runVerify(); }}
              style={styles.modalOption}
            >
              <Text style={[styles.modalOptionText, { color: semantic.cold, fontWeight: '700' }]}>校验数据</Text>
              <Text style={styles.hint}>对比本地与远程，标记冲突</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* 数据任务进度 Modal */}
      <Modal visible={dataTaskRunning} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={styles.modalMaskSolid}>
          <View style={styles.modalCardCenter}>
            <ActivityIndicator size="large" color={palette.accent} />
            <Text style={styles.modalTitle}>处理中…</Text>
            <Text style={styles.hint}>{dataTaskMsg}</Text>
          </View>
        </View>
      </Modal>

      {/* 周期选择 Modal */}
      <Modal visible={periodMenuOpen} transparent animationType="fade" onRequestClose={() => setPeriodMenuOpen(false)}>
        <Pressable
          style={styles.modalMask}
          onPress={() => setPeriodMenuOpen(false)}
        >
          <View style={[styles.modalCard, { flexDirection: 'row', flexWrap: 'wrap', maxWidth: 280 }]}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((p) => (
              <Pressable
                key={p}
                onPress={() => {
                  setPeriod(p);
                  setPeriodMenuOpen(false);
                }}
                style={[styles.modalGridCell, period === p && styles.modalGridCellOn]}
              >
                <Text style={[styles.modalOptionText, period === p && styles.modalOptionTextOn]}>
                  {p}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* 指标设置：副图 MACD/KDJ/RSI/CCI/ADX/SAR 单选 + MA 均线参数 */}
      <IndicatorPanel
        visible={indicatorOpen}
        onClose={() => setIndicatorOpen(false)}
        maConfigs={maConfigs}
        onMaChange={setMaConfigs}
        sub1={sub1}
        sub2={sub2}
        onSubChange={(slot, id) => (slot === 1 ? setSub1(id) : setSub2(id))}
        onReset={() => {
          setMaConfigs(DEFAULT_MA);
          setSub1('macd');
          setSub2('none');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: semantic.pageBg },

  /* brand */
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    backgroundColor: semantic.contentBg,
  },
  logo: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { fontWeight: '800', color: semantic.onBrand, fontSize: fs.md },
  brandTitle: { fontSize: fs.lg, fontWeight: '700', letterSpacing: 0.6, lineHeight: 20 },
  brandSub: { fontSize: fs.micro, color: semantic.textFaint, letterSpacing: 2.4 },
  /** 横屏收起态：只剩图标高度，纵向空间全让给图表 */
  brandCollapsed: { paddingTop: 4, paddingBottom: 4, gap: space.sm },
  logoCollapsed: { width: 24, height: 24 },
  /** 横屏常规态：屏幕只有 ~360dp 高，品牌栏压到 34dp */
  brandLandscape: { paddingTop: 3, paddingBottom: 3, gap: space.sm },
  iconBtnLandscape: {
    minWidth: 32,
    minHeight: 32,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  /** 横屏彩种栏压到 34dp */
  gamebarLandscape: { paddingTop: 0, paddingBottom: 2, gap: 6 },
  /** 横屏主导航去掉上下留白 */
  prinavLandscape: { paddingBottom: 2 },
  /** 横屏子页签去掉下边框那条额外留白 */
  subtabsLandscape: { paddingBottom: 2 },
  iconBtn: {
    minWidth: touch.min,
    minHeight: touch.min,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: semantic.panelBorder,
    backgroundColor: semantic.panelBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnText: { fontSize: fs.base, color: semantic.textDim, fontWeight: '700' },

  /* gamebar */
  gamebar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
    backgroundColor: semantic.contentBg,
  },
  gameList: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', flex: 1 },
  game: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 8,
    paddingHorizontal: space.md,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: semantic.panelBorder,
    backgroundColor: semantic.panelBg,
  },
  gameOn: {
    backgroundColor: alpha(palette.accent, 0.18),
    borderColor: semantic.brand,
  },
  /** 竖屏紧凑档：彩种按钮降一档，给图表腾高度 */
  gameCompact: { paddingVertical: 5, paddingHorizontal: space.sm },
  gameTextCompact: { fontSize: fs.xs },
  gameDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: semantic.textFaint },
  gameDotOn: { backgroundColor: semantic.brand },
  gameText: { fontSize: fs.sm, color: semantic.textDim },
  gameTextOn: { color: semantic.brand, fontWeight: '600' },
  gameMore: {
    paddingVertical: 8,
    paddingHorizontal: space.md,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: semantic.panelBorder,
    backgroundColor: semantic.panelBg,
  },
  gameMoreText: { fontSize: fs.sm, color: semantic.textDim, fontWeight: '700' },
  statusText: { fontSize: fs.micro, color: semantic.textFaint },
  statusBold: { color: semantic.cold, fontWeight: '500' },

  /* prinav / subtabs */
  prinav: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  subtabs: {
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: semantic.divider,
    backgroundColor: semantic.contentBg,
  },

  /* content */
  content: { flex: 1, backgroundColor: semantic.contentBg },
  // 注意：这里不能加 alignItems:'center'，否则 Panel 等子块会收缩到内容宽度而不再撑满。
  // 图表居中由 chartCenter 单独负责。
  // 左右留白由 contentPad 动态控制（见上方响应式区块），这里只给纵向
  contentInner: { paddingVertical: space.md, gap: space.md },
  /** 图表卡片/同屏网格：占满内容宽度但整体居中 */
  chartCenter: { width: '100%', alignItems: 'center' },
  panelRight: { fontSize: fs.micro, color: semantic.textDim },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: space.sm,
    flexWrap: 'wrap',
  },
  fieldNote: { fontSize: fs.xs, color: semantic.textDim, marginBottom: space.xs },
  hint: { fontSize: fs.xs, color: semantic.textFaint, lineHeight: 18 },
  hintOn: { color: semantic.brand, fontWeight: '700' },
  errorText: { fontSize: fs.sm, color: semantic.hot },
  numInput: {
    width: 84,
    paddingVertical: 9,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: semantic.panelBorder,
    backgroundColor: semantic.controlBg,
    color: semantic.text,
    fontSize: fs.base,
    textAlign: 'center',
  },
  placeholder: { paddingVertical: space.sm, alignItems: 'center' },
  expandBar: {
    minHeight: touch.min,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: semantic.panelBorder,
    backgroundColor: semantic.panelBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandText: { fontSize: fs.sm, color: semantic.textDim },

  /* KL8 1–80 紧凑网格 */
  kl8Row: { flexDirection: 'row', alignItems: 'center', gap: 1, marginBottom: 2 },
  kl8RowLabel: { fontSize: fs.micro, color: semantic.textFaint, width: 22 },
  kl8Cell: {
    flex: 1,
    height: 22,
    borderRadius: 3,
    backgroundColor: semantic.controlBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kl8CellOn: { backgroundColor: semantic.brand },
  kl8CellOff: { backgroundColor: semantic.panelBorder, opacity: 0.4 },
  kl8CellText: { fontSize: fs.micro, color: semantic.text },
  kl8CellTextOn: { color: semantic.onBrand, fontWeight: '700' },
  kl8CellTextOff: { color: semantic.textFaint },

  /* 图表缩放 / 全屏 */
  /** 缩放操作条：− / 百分比 / + / 重置 / 全屏 */
  zoomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.sm,
    marginBottom: space.sm,
  },
  zoomText: {
    minWidth: 46,
    textAlign: 'center',
    fontSize: fs.xs,
    color: semantic.textDim,
    fontWeight: '700',
  },
  /** 全屏态顶部细条：只放标题 + 缩放操作 */
  fsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: 4,
    backgroundColor: semantic.contentBg,
  },
  fsTitle: { flex: 1, fontSize: fs.xs, color: semantic.textDim, fontWeight: '600' },

  /* charts */
  /**
   * 多图（频率K / 遗漏K / 遗漏图 / 二阶遗漏）同屏显示。
   * 横竖屏都保持一列一表：图表种类不多，竖着排每张都能占满宽度，
   * 两列会把每张压窄一半、K 线挤成一团。
   */
  chartsGrid: { flexDirection: 'column', gap: space.lg },
  chartsGridLandscape: { flexDirection: 'column', gap: space.md },
  chartCell: { width: '100%' },
  centerBox: {
    minHeight: 160,
    justifyContent: 'center',
    alignItems: 'center',
    gap: space.sm,
  },

  /* modals */
  modalMask: {
    flex: 1,
    backgroundColor: alpha(palette.bg2, 0.72),
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalMaskSolid: {
    flex: 1,
    backgroundColor: alpha(palette.bg2, 0.88),
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    backgroundColor: semantic.panelBg,
    borderWidth: 1,
    borderColor: semantic.panelBorder,
    borderRadius: radius.md,
    padding: space.md,
  },
  modalCardCenter: {
    backgroundColor: semantic.panelBg,
    borderWidth: 1,
    borderColor: semantic.panelBorder,
    borderRadius: radius.md,
    padding: space.xxl,
    alignItems: 'center',
    minWidth: 220,
  },
  modalTitle: {
    fontSize: fs.sm,
    fontWeight: '700',
    color: semantic.text,
    marginBottom: space.md,
    textAlign: 'center',
  },
  modalOption: {
    paddingVertical: 10,
    paddingHorizontal: space.lg,
    borderRadius: radius.sm,
  },
  modalOptionOn: { backgroundColor: semantic.brand },
  modalOptionText: { fontSize: fs.sm, color: semantic.text, textAlign: 'center' },
  modalOptionTextOn: { color: semantic.brand, fontWeight: '700' },
  modalDivider: {
    height: 1,
    backgroundColor: semantic.divider,
    marginVertical: space.sm,
  },
  modalGridCell: {
    width: 40,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: semantic.controlBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalGridCellOn: { backgroundColor: semantic.brand },
  modalBtn: {
    marginTop: space.md,
    minHeight: 36,
    borderRadius: radius.sm,
    backgroundColor: semantic.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnText: { fontSize: fs.sm, color: semantic.onBrand, fontWeight: '700' },
});

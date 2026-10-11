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
import { useLocalSearchParams, router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { EChartsFreqKChart } from '@/components/charts/EChartsFreqKChart';
import { EChartsOmissionChart } from '@/components/charts/EChartsOmissionChart';
import { EChartsOmissionKChart } from '@/components/charts/EChartsOmissionKChart';
import { EChartsChuciChart } from '@/components/charts/EChartsChuciChart';
import { EChartsMissSumChart } from '@/components/charts/EChartsMissSumChart';
import { EChartsKl8Heatmap, type Kl8HeatMode } from '@/components/charts/EChartsKl8Heatmap';
// 注：原 Skia 版原始值走势图已改用 EChartsRawChart（WebView 渲染），
// 以保证 App 可在 Expo Go（Termux 热更新）运行，不依赖自定义原生模块。
import { EChartsRawChart } from '@/components/charts/EChartsRawChart';
import { MultiPaneChart } from '@/components/charts/MultiPaneChart';
import { aggregate, buildBoll, buildOmissionBars, buildChuciSeries, buildChuciMoveSeries, lastBollTriple, missSumDropRate, MISS_SUM_REF, secondOrderFromTheory, type CycleAlign } from '@/components/charts/chartMath';
import { IndicatorPanel } from '@/components/ui/IndicatorPanel';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_MA,
  type IndicatorId,
  type MaConfig,
} from '@/lib/charts/indicators';
import { buildRawSeries, buildShapeCodes, getTargetLabel, posIndex, SET_ATTRS, type SetAttrKey, type Kl8Play, type ShapeMainMode, type ShapeFilter } from '@/lib/lottery/targets';
import { useLotteryHistory, useGame } from '@/hooks/useLottery';
import { fetchAllAndVerify, verifyLocalData } from '@/lib/lottery/datasource';
import { buildTargetSeries, getTheoryMiss, getProbability, windowStats, type Target, type Position, type SamplingMode, type TargetPoint } from '@/lib/lottery/targets';
import { generateDanTuo } from '@/lib/lottery/danTuo';
import { buildDigitStats } from '@/lib/lottery/analysis';
import * as Clipboard from 'expo-clipboard';
import { PickSheet, PEEK_H } from '@/components/ui/PickSheet';
import {
  ChartCard,
  Chip,
  DensityProvider,
  DigitGrid,
  Field,
  Panel,
  Segmented,
  SubTabs,
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
  | 'missSum'      // 遗漏和
  | 'kl8dist';     // 快乐8 分布图形（仅 kl8）
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

/** 图表模式选择项（对齐官方《K线模式》家族） */
const CHART_MODES: { id: ChartMode; label: string }[] = [
  { id: 'freq', label: '频率K' },
  { id: 'omissionK', label: '遗漏K' },
  { id: 'omissionLine', label: '遗漏图' },
  { id: 'omissionLine2', label: '二阶遗漏' },
  { id: 'chuci', label: '出次图' },
  { id: 'chuciMove', label: '出次移动' },
  { id: 'missSum', label: '遗漏和' },
  { id: 'kl8dist', label: '分布' },
];

const POS_OPTIONS: Position[] = ['any', 'bai', 'shi', 'ge'];

/** 胆码同屏格可切换的图型（对齐官方下拉：频率K / 遗漏图 / 遗漏K） */
const CELL_MODES: { id: ChartMode; label: string }[] = [
  { id: 'freq', label: '频率K' },
  { id: 'omissionLine', label: '遗漏图' },
  { id: 'omissionK', label: '遗漏K' },
];

/** 同屏格「更多」菜单项（对齐官方：号码/复制/加入缩水/分割/等分/二阶） */
const CELL_MENU: { key: string; label: string }[] = [
  { key: 'codes', label: '号码' },
  { key: 'copy', label: '复制' },
  { key: 'shrink', label: '加入缩水' },
  { key: 'split', label: '分割' },
  { key: 'equal', label: '等分' },
  { key: 'second', label: '二阶' },
];

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
/** 共享空集合：快速枚举里代替「无配码」的目标集，避免每号建新 Set */
const EMPTY_SET: Set<number> = new Set();

/** 一组数字的「两两和尾」集合（模块级：供 matchFilter 与快速枚举复用） */function sumSet(arr: number[]): Set<number> {
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

function matchFilter(type: string, nums: number[], dan: number[], pei: number[]): boolean {
  if (dan.length === 0) return false;
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
      if (!setIntersects(s, sumSet(dan))) return false;
      if (pei.length > 0 && !setIntersects(s, sumSet(pei))) return false;
      return true;
    }
    case 'diff': {
      // 两码差：号码两码差 与 胆码本身（或胆码两两差）有交集
      const s = allPairDiffs(nums);
      if (!setIntersects(s, diffSet(dan))) return false;
      if (pei.length > 0 && !setIntersects(s, diffSet(pei))) return false;
      return true;
    }
    case 'span': {
      // 两码跨：同两码差
      const s = allPairDiffs(nums);
      if (!setIntersects(s, diffSet(dan))) return false;
      if (pei.length > 0 && !setIntersects(s, diffSet(pei))) return false;
      return true;
    }
  }
  return false;
}

/**
 * 毒胆快速枚举判断：目标集合在循环外预计算一次，10 万次枚举内零分配。
 * （排列五 D=5 时旧实现每个号码都重建 sumSet/diffSet/pairGroup，是切彩种卡死的主因）
 * 语义与 matchFilter 完全一致。
 */
function matchFilterFast(
  type: string,
  nums: number[],
  dan: number[],
  pei: number[],
  danPair: Set<number>,
  peiPair: Set<number>,
  danSums: Set<number>,
  peiSums: Set<number>,
  danDiffs: Set<number>,
  peiDiffs: Set<number>,
): boolean {
  const n = nums.length;
  switch (type) {
    case 'draw': {
      let ok = false;
      for (let a = 0; a < dan.length && !ok; a += 1) {
        const d = dan[a];
        for (let k = 0; k < n; k += 1) if (nums[k] === d) { ok = true; break; }
      }
      if (!ok) return false;
      if (pei.length > 0) {
        let ok2 = false;
        for (let a = 0; a < pei.length && !ok2; a += 1) {
          const q = pei[a];
          for (let k = 0; k < n; k += 1) if (nums[k] === q) { ok2 = true; break; }
        }
        if (!ok2) return false;
      }
      return true;
    }
    case 'pair': {
      let ok = false;
      for (let k = 0; k < n && !ok; k += 1) if (danPair.has(nums[k])) ok = true;
      if (!ok) return false;
      if (peiPair.size > 0) {
        let ok2 = false;
        for (let k = 0; k < n && !ok2; k += 1) if (peiPair.has(nums[k])) ok2 = true;
        if (!ok2) return false;
      }
      return true;
    }
    case 'sum': {
      let ok = false;
      for (let i = 0; i < n && !ok; i += 1)
        for (let j = i + 1; j < n; j += 1)
          if (danSums.has((nums[i] + nums[j]) % 10)) { ok = true; break; }
      if (!ok) return false;
      if (peiSums.size > 0) {
        let ok2 = false;
        for (let i = 0; i < n && !ok2; i += 1)
          for (let j = i + 1; j < n; j += 1)
            if (peiSums.has((nums[i] + nums[j]) % 10)) { ok2 = true; break; }
        if (!ok2) return false;
      }
      return true;
    }
    case 'diff':
    case 'span': {
      let ok = false;
      for (let i = 0; i < n && !ok; i += 1)
        for (let j = i + 1; j < n; j += 1)
          if (danDiffs.has(Math.abs(nums[i] - nums[j]))) { ok = true; break; }
      if (!ok) return false;
      if (peiDiffs.size > 0) {
        let ok2 = false;
        for (let i = 0; i < n && !ok2; i += 1)
          for (let j = i + 1; j < n; j += 1)
            if (peiDiffs.has(Math.abs(nums[i] - nums[j]))) { ok2 = true; break; }
        if (!ok2) return false;
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

  const [chartModes, setChartModes] = useState<ChartMode[]>(['freq']);
  /** 分布图形口径：freq=近N期出现次数 / omission=当前遗漏 */
  const [kl8HeatMode, setKl8HeatMode] = useState<Kl8HeatMode>('freq');
  /** 当前主图型（同屏/多图时以第一张为准）——周期/窗口记忆的键之一 */
  const mainMode = chartModes[0] ?? 'freq';

  const [countInput, setCountInput] = useState('500');
  const [countMap, setCountMap] = useState<Record<string, number>>({
    common: 500, dan: 500, dantuo: 500, pos: 500, multi: 500,
    heji: 500, amp: 80, random1: 500, random2: 500, group: 500,
    combo: 200, fushi: 200, kl8seq: 200, kl8dt: 200,
  });
  /** 记忆键：页签 + 图型 —— 不同图表各自记住自己的分析窗口与周期 */
  const memKey = `${tab}:${mainMode}`;
  const loadCount = countMap[memKey] ?? countMap[tab] ?? 500;

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
  /** 中出个数（毒胆）：对齐官方「中出条件」——开奖号包含胆码的个数口径 */
  const [danCount, setDanCount] = useState<'all' | 'c0' | 'c1' | 'c2' | 'allhit'>('all');
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
  /** 周期按「页签+图型」分别记忆 */
  const [periodMap, setPeriodMap] = useState<Record<string, number>>({});
  const period = periodMap[`${tab}:${mainMode}`] ?? 1;
  const setPeriod = (p: number) =>
    setPeriodMap((v) => ({ ...v, [`${tab}:${mainMode}`]: p }));
  /** 周期基准（官方《周期K线》1.1 左对齐 / 1.2 右对齐） */
  const [cycleAlign, setCycleAlign] = useState<CycleAlign>('left');
  /** 出次图/遗漏型的分段周期（步长） */
  const [stepPeriod, setStepPeriod] = useState(10);
  /** 退期：把最后一点的期号往前推的期数 */
  const [drawBack, setDrawBack] = useState(0);
  /** 遗漏和口径：直选(定位胆) / 组选(不定位胆) / 全胆 */
  const [missSumKind, setMissSumKind] = useState<'direct' | 'group' | 'all'>('direct');
  const [compareTargets, setCompareTargets] = useState<Target[] | null>(null);
  /** 同屏每格图型（idx → ChartMode），未设置的跟随 chartModes[0] */
  const [cellModes, setCellModes] = useState<Record<number, ChartMode>>({});
  /** 同屏每格水平参考线（更多菜单「分割/等分」） */
  const [cellOverlay, setCellOverlay] = useState<Record<number, 'none' | 'split' | 'equal'>>({});
  /** 下拉（图型）/竖排菜单（更多）展开的格 idx */
  const [cellDropIdx, setCellDropIdx] = useState<number | null>(null);
  const [cellMenuIdx, setCellMenuIdx] = useState<number | null>(null);
  /** 「查看号码」弹窗 */
  const [codesModal, setCodesModal] = useState<{ label: string; codes: string[]; total: number } | null>(null);

  /** 同屏状态整体复位（换胆码组合 / 退出同屏时调用） */
  const resetCellUi = () => {
    setCellModes({});
    setCellOverlay({});
    setCellDropIdx(null);
    setCellMenuIdx(null);
  };
  const [gameMenuOpen, setGameMenuOpen] = useState(false);
  const [dataTaskRunning, setDataTaskRunning] = useState(false);
  const [dataTaskMsg, setDataTaskMsg] = useState('');
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false);
  /** 区间统计弹窗（对齐官方「区间统计」） */
  const [statsOpen, setStatsOpen] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
  /** 同屏下拉面板（对齐官方「选择单个/多个指标」：选码 + 中出 + 交集/并集出图） */
  const [cmpOpen, setCmpOpen] = useState(false);
  const [cmpMulti, setCmpMulti] = useState(false);
  const [cmpSel, setCmpSel] = useState<number[]>([]);
  const [cmpCount, setCmpCount] = useState<'off' | '0' | '1' | '2' | '3' | 'zhong'>('off');

  /** 同屏滚动容器（点开某格后要滚到它的位置） */
  const scrollRef = useRef<ScrollView>(null);
  /** 同屏网格容器相对滚动内容的 y */
  const gridYRef = useRef(0);
  /** 每个同屏格相对网格容器的 y / 高度（idx → y、h） */
  const cellYRef = useRef<Record<number, number>>({});
  const cellHRef = useRef<Record<number, number>>({});
  /** 同屏滚动视口高度：state 供渲染（单列「占满」用），ref 供滚动回调即时读取 */
  const [viewportH, setViewportH] = useState(0);
  const viewportHRef = useRef(0);
  const onViewportLayout = (h: number) => {
    viewportHRef.current = h;
    setViewportH((prev) => (Math.abs(prev - h) > 1 ? h : prev));
  };

  /**
   * 点开某格（切成 1 列）后，等布局落定再把该格「居中」滚到屏幕。
   * 双列 → 单列时每格高度都会变，所以延迟一点读最新的 onLayout 结果。
   */
  useEffect(() => {
    if (focusedIdx === null) return;
    let cancelled = false;
    const t = setTimeout(() => {
      if (cancelled) return;
      const y = gridYRef.current + (cellYRef.current[focusedIdx] ?? 0);
      const h = cellHRef.current[focusedIdx] ?? 0;
      const vh = viewportHRef.current;
      // 居中：该格中线对齐视口中线；上方空间不足时贴顶
      const target = Math.max(0, y - Math.max(0, (vh - h) / 2));
      scrollRef.current?.scrollTo({ y: target, animated: true });
    }, 160);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [focusedIdx]);
  /** 图表缩放倍率（放大/缩小按钮调整图表高度） */
  const [chartZoom, setChartZoom] = useState(1);
  /** 选号抽屉是否展开（用于决定图表可用高度） */
  const [pickExpanded, setPickExpanded] = useState(false);
  /** 全屏：隐藏品牌栏/彩种/导航等 chrome，把整屏留给图表 */
  const [fullscreen, setFullscreen] = useState(false);
  /** 「•••」更多菜单：补充图型 / 缩放 / 全屏 / 出图 / 重置 */
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  // ── 副图指标 ──
  /** 主图叠加的均线（6 组，可在指标设置里改周期 / 颜色 / 开关） */
  const [maConfigs, setMaConfigs] = useState<MaConfig[]>(DEFAULT_MA);
  /** 裸K模式：只画 K 线，隐藏 MA 与布林（对齐官方 avgType「裸K」） */
  const [bareK, setBareK] = useState(false);
  /** 副图槽位：每个槽位单选一个指标；'none' = 不画该槽 */
  const [sub1, setSub1] = useState<IndicatorId>('macd');
  const [sub2, setSub2] = useState<IndicatorId>('none');
  const [indicatorOpen, setIndicatorOpen] = useState(false);

  // ── 指标设置持久化（MA 配置 + 裸K开关），启动恢复、变更写回 ──
  const chartIndLoadedRef = useRef(false);
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('chart.indicator.v1');
        if (raw) {
          const saved = JSON.parse(raw);
          if (Array.isArray(saved?.maConfigs) && saved.maConfigs.length > 0) {
            setMaConfigs(saved.maConfigs);
          }
          if (typeof saved?.bareK === 'boolean') setBareK(saved.bareK);
        }
      } catch {}
      chartIndLoadedRef.current = true;
    })();
  }, []);
  useEffect(() => {
    if (!chartIndLoadedRef.current) return;
    AsyncStorage.setItem('chart.indicator.v1', JSON.stringify({ maConfigs, bareK })).catch(() => {});
  }, [maConfigs, bareK]);
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
      // 中出个数模式：覆盖类型（draw/pair/…）语义，按「包含胆码个数 ∈ [start,end]」命中
      if (danCount !== 'all') {
        const [start, end, dedupe] =
          danCount === 'c0' ? [0, 0, false]
          : danCount === 'c1' ? [1, 1, false]
          : danCount === 'c2' ? [2, 2, false]
          : [dan.length, dan.length, true];
        return { kind: 'countOfDan', dan, pei, start, end, dedupe };
      }
      // 目标集合循环外预计算一次；D=5（排列五）10 万次枚举内零分配
      const danPair = new Set<number>();
      for (const d of dan) for (const x of pairGroup(d)) danPair.add(x);
      const peiPair = new Set<number>();
      for (const q of pei) for (const x of pairGroup(q)) peiPair.add(x);
      const dSums = sumSet(dan);
      const pSums = pei.length > 0 ? sumSet(pei) : EMPTY_SET;
      const dDiffs = diffSet(dan);
      const pDiffs = pei.length > 0 ? diffSet(pei) : EMPTY_SET;
      const codes = new Set<string>();
      eachNumber(DD, (nums) => {
        if (matchFilterFast(type, nums, dan, pei, danPair, peiPair, dSums, pSums, dDiffs, pDiffs))
          codes.add(nums.join(''));
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
    // 中出个数：满足区间的号码注数 = 概率 × 总注数
    if (target.kind === 'countOfDan') {
      return Math.round(getProbability(target, V, DD, samplingMode) * Math.pow(V, DD));
    }
    return 1;
  }, [target, V, DD, samplingMode]);

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
  /** 区间统计：当前窗口序列的中出/连开/遗漏/开出率（对齐官方「区间统计」） */
  const winStats = useMemo(() => windowStats(series, theoryMiss), [series, theoryMiss]);

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
      kl8dist: { title: '分布图形', meta: '80号热力 · 冷热/遗漏' },
    };
    return m;
  }, [period, stepPeriod]);

  /**
   * 图卡信息行（对齐官方口径，KLineAdapter 的 caption/tvPro/tvMiss 文案）：
   * - 频率K（period=1）：`理论周期:x.x  遗漏:n  概率:p%`
   * - 周期K线（period>1）：`遗漏:n  已出次:x  当期期号:xxx  概率:p%`（官方多周期信息行）
   * - 遗漏K：`遗漏周期:x.x  当前遗漏:n`
   * - 出次类：`理论出次:x.x  统计周期:N`
   */
  /**
   * 图卡信息行（对齐官方口径）。
   * tMiss/last 必须来自**当前这张图自己的序列**：
   * 主图传 theoryMiss/series 末点，同屏格传格的 tMiss/格序列末点——
   * 否则概率与图形不匹配（实测毒胆2 图配出 44.1% 的失真 bug）。
   * 概率从理论周期反推：p = 1/(1+tMiss)。
   */
  const chartHeaderMeta = (m: ChartMode, tMiss: number, last?: TargetPoint): string => {
    const prob = tMiss > 0 ? 1 / (1 + tMiss) : 0;
    const pct = `${(prob * 100).toFixed(1)}%`;
    const om = last?.omission ?? 0;
    if (m === 'freq') {
      return period > 1
        ? `遗漏:${om}  已出次:${last?.cumHit ?? 0}  当期期号:${last?.issue ?? '—'}  概率:${pct}`
        : `理论周期:${tMiss.toFixed(2)}  遗漏:${om}  概率:${pct}`;
    }
    if (m === 'omissionK') return `遗漏周期:${tMiss.toFixed(2)}  当前遗漏:${om}`;
    if (m === 'omissionLine') return `遗漏周期:${tMiss.toFixed(2)}`;
    if (m === 'chuci' || m === 'chuciMove') return `理论出次:${tMiss.toFixed(2)}  统计周期:${stepPeriod}`;
    return chartMeta[m].meta;
  };

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

  /** 快乐8 分布图形数据：80 号的出现次数与当前遗漏（近全部已加载期） */
  const kl8Heat = useMemo(() => {
    if (gameId !== 'kl8' || records.length === 0) return null;
    const N = records.length;
    const counts = new Array<number>(80).fill(0);
    const lastHit = new Array<number>(80).fill(-1);
    records.forEach((r, i) => {
      for (const d of (r.nums ?? []) as number[]) {
        if (d >= 1 && d <= 80) { counts[d - 1] += 1; lastHit[d - 1] = i; }
      }
    });
    const omissions = counts.map((_, i) => (lastHit[i] < 0 ? N : N - 1 - lastHit[i]));
    return { counts, omissions, lastN: N };
  }, [gameId, records]);

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
      setCountMap((prev) => ({ ...prev, [memKey]: n }));
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
   * 选号已搬进底部抽屉，页面内不再有「选号面板折叠」这回事。
   * 抽屉收起时只占 12% 高度，图表拿走剩下的全部空间。
   */
  const pickCollapsed = !pickExpanded;

  // 图表可用高度（同屏放大 / 振幅图用）
  // 全屏时只剩顶部一条 34px 的操作条，可用高度接近整屏
  const TOP_BAR_H = fullscreen ? 34 : pickCollapsed ? 44 : 180;
  const availH = Math.max(140, height - TOP_BAR_H);

  /**
   * 毒胆同屏布局（对齐参考图：竖屏默认 2 列 × 5 行）。
   * 点按某格后转「1 列 × 10 行」，仍是全部同屏，只是单列显示并定位到该格。
   * 单格图表高度按宽度反推：主图 + 副图挤在太矮的格里会糊成一团
   * （旧值竖屏仅 170dp，主图被压到 ~60dp），这里抬高到 ≥200dp。
   */
  const tongColumns = focusedIdx === null ? 2 : 1;
  const tongGap = 8;
  /** 2 列取半宽（留格间距与内边距）；1 列铺满内容宽（横屏限宽防扁条） */
  const tongW = Math.max(
    140,
    Math.min(
      tongColumns === 1
        ? contentW - 10
        : Math.floor((contentW - tongGap) / 2) - 14,
      tongColumns === 1 ? 600 : 9999,
    ),
  );
  /**
   * 单格图表高度。
   * - 1 列（点开某格）：取滚动视口高 −（头部 + padding），让该格基本「占满」屏幕；
   * - 2 列：按格宽反推，保证 K 线比例不失真。
   */
  const singleViewH = isLandscape ? availH : viewportH || availH;
  const tongH = tongColumns === 1
    ? Math.round(
        // 占满视口的同时限制高宽比 ≤1.25，否则 K 线在窄格中被纵向拉伸失真
        Math.min(
          isLandscape ? 320 : 760,
          Math.max(240, Math.min(singleViewH - (isLandscape ? 40 : 58), tongW * 1.25)),
        ),
      )
    : isLandscape
      ? Math.round(Math.min(250, Math.max(180, tongW / 1.7)))
      : Math.round(Math.min(280, Math.max(210, tongW * 1.35)));

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
  /**
   * 抽屉固定区：分组页签行（对齐参考图「常用 / 系统 / 定制」）。
   * 固定在把手下方、不随内容滚动；图型栏则固定在抽屉下方（bottomOffset 让位）。
   */
  const renderDrawerGroups = () => (
    <View style={styles.drawerGroups}>
      {drawerGroups.map((g) => {
        const on = activeDrawerGroup.id === g.id;
        return (
          <Pressable
            key={g.id}
            onPress={() => { if (g.tabs[0]) onTabChange(g.tabs[0].id); }}
            style={[styles.dgTab, on && styles.dgTabOn]}
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.dgTabText, on && styles.dgTabTextOn]}>
              {g.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  const renderPickContent = () => (
    <>
      {/* 组内子页签（分组行已上移到抽屉固定区） */}
      {activeDrawerGroup.tabs.length > 0 ? (
        <SubTabs items={activeDrawerGroup.tabs} value={tab} onChange={onTabChange} />
      ) : (
        <Text style={styles.hint}>本彩种该分组暂无条件</Text>
      )}
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
      <Chip label="统计" active={false} onPress={() => setStatsOpen(true)} />
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

  /** 子页签切换（保留原 tab 切换副作用；输入框由 loadCount effect 统一恢复） */
  const onTabChange = (t: TabId) => {
    setTab(t);
    setCompareTargets(null);
  };

  /** 切页签 / 切图型 / 应用窗口后，输入框恢复为该「页签+图型」记住的窗口值 */
  useEffect(() => {
    setCountInput(String(loadCount));
  }, [loadCount]);

  /**
   * 抽屉分组页签（对齐参考图「常用 / 系统 / 定制」三段）。
   * 组内再显示原来的子页签，选中组时自动切到该组第一个页签。
   */
  const drawerGroups: { id: string; label: string; tabs: { id: TabId; label: string }[] }[] = gameId === 'kl8'
    ? [
        { id: 'common', label: '常用', tabs: TABS.filter((t) => t.id === 'common') },
        { id: 'sys', label: '系统', tabs: TABS.filter((t) => ['combo', 'fushi', 'kl8seq', 'kl8dt'].includes(t.id)) },
      ]
    : [
        { id: 'common', label: '常用', tabs: TABS.filter((t) => ['common', 'pos'].includes(t.id)) },
        { id: 'sys', label: '系统', tabs: TABS.filter((t) => ['dan', 'dantuo', 'multi', 'heji', 'amp'].includes(t.id)) },
        { id: 'custom', label: '定制', tabs: TABS.filter((t) => ['random1', 'random2', 'group'].includes(t.id)) },
      ];
  const activeDrawerGroup =
    drawerGroups.find((g) => g.tabs.some((t) => t.id === tab)) ?? drawerGroups[0];

  /** 顶栏左侧：当前页签 + 已选条件摘要（参考图「万千百 ▼」位置） */
  const topLeftLabel = (() => {
    const label = TABS.find((t) => t.id === tab)?.label ?? '选号';
    if (tab === 'dan' && dan.length > 0) return `毒胆 ${dan.join(' ')}`;
    if (tab === 'dantuo' && dtDan.length > 0) return `胆拖 ${dtDan.join(' ')}`;
    if (tab === 'pos') return POS_LABEL_MAP[pos];
    return label;
  })();

  /** 图型栏「同屏」开关：按当前页签的胆码生成每码一张图，其余页签提示 */
  const toggleCompareFromBar = () => {
    if (compareTargets) {
      setCompareTargets(null);
      setFocusedIdx(null);
      return;
    }
    // 对齐官方：点「同屏」默认出 0-9 全部十码；选码/中出/交并集在同屏顶部下拉面板操作
    setCompareTargets(
      Array.from({ length: 10 }, (_, d) => ({ kind: 'digit', digit: d, pos: 'any' }) as Target),
    );
    setFocusedIdx(null);
    setCmpOpen(false);
    setPickExpanded(false);
  };

  // ── 同屏下拉面板（对齐官方「选择单个/多个指标」：选码 + 中出 + 交集/并集出图） ──
  const cmpDigitTarget = (d: number): Target => ({ kind: 'digit', digit: d, pos: 'any' });
  const toggleCmpSel = (d: number) =>
    setCmpSel((v) => (v.includes(d) ? v.filter((x) => x !== d) : [...v, d]));
  /** 选中出图：勾选的码每码一张 */
  const doCmpSelected = () => {
    if (cmpSel.length === 0) return;
    setCompareTargets([...cmpSel].sort((a, b) => a - b).map(cmpDigitTarget));
    setFocusedIdx(null);
  };
  /** 全选出图：0-9 每码一张 */
  const doCmpAll = () => {
    setCompareTargets(Array.from({ length: 10 }, (_, d) => cmpDigitTarget(d)));
    setFocusedIdx(null);
  };
  /** 并集：开奖号含勾选码任一（合并成一张图） */
  const doCmpUnion = () => {
    if (cmpSel.length === 0) return;
    const s = [...cmpSel].sort((a, b) => a - b);
    setCompareTargets([{ kind: 'countOfDan', dan: s, pei: [], start: 1, end: 9, dedupe: false }]);
    setFocusedIdx(null);
  };
  /** 交集：开奖号同时含勾选码全部（「重」口径去重计） */
  const doCmpIntersect = () => {
    if (cmpSel.length === 0) return;
    const s = [...cmpSel].sort((a, b) => a - b);
    setCompareTargets([{ kind: 'countOfDan', dan: s, pei: [], start: s.length, end: s.length, dedupe: true }]);
    setFocusedIdx(null);
  };
  /** 中出档（0/1/2/3/重）：勾选码的个数口径合并出一张图 */
  const doCmpCount = (v: '0' | '1' | '2' | '3' | 'zhong') => {
    if (cmpSel.length === 0) return;
    const s = [...cmpSel].sort((a, b) => a - b);
    const [start, end, dedupe] =
      v === '0' ? [0, 0, false]
      : v === '1' ? [1, 1, false]
      : v === '2' ? [2, 2, false]
      : v === '3' ? [3, 3, false]
      : [s.length, s.length, true];
    setCompareTargets([{ kind: 'countOfDan', dan: s, pei: [], start, end, dedupe }]);
    setFocusedIdx(null);
  };

  const TYPE_OPTIONS = [
    { id: 'draw', label: '开奖号' },
    { id: 'pair', label: '对码' },
    { id: 'sum', label: '两码合' },
    { id: 'diff', label: '两码差' },
    { id: 'span', label: '两码跨' },
  ];

  const renderTypeRow = () => (
    <>
      <Field caption="类型">
        <View style={styles.chipRow}>
          {TYPE_OPTIONS.map((t) => (
            <Chip
              key={t.id}
              label={t.label}
              active={type === t.id}
              onPress={() => { setType(t.id); setDan([]); setPei([]); setDanCount('all'); }}
            />
          ))}
        </View>
      </Field>
      {/* 中出个数（对齐官方「中出条件」）：开奖号包含胆码的个数口径；仅毒胆 tab 提供 */}
      {tab === 'dan' && (
        <Field caption="中出个数">
          <View style={styles.chipRow}>
            {([
              ['all', '全部'],
              ['c0', '0个'],
              ['c1', '1个'],
              ['c2', '2个'],
              ['allhit', '全出(重)'],
            ] as [typeof danCount, string][]).map(([v, label]) => (
              <Chip key={v} label={label} active={danCount === v} onPress={() => setDanCount(v)} />
            ))}
          </View>
          {danCount !== 'all' && (
            <Text style={styles.hint} numberOfLines={2}>
              中出条件：开奖号中包含所选胆码的个数满足所选档位即命中
              {danCount === 'allhit' ? '（对子/豹子按 1 个号计）' : ''}
            </Text>
          )}
        </Field>
      )}
    </>
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
    // 对齐官方：毒胆同屏固定 0-9 全部十码（不随所选胆码），逐码对比冷热趋势
    const targets: Target[] = [];
    for (let d = 0; d <= 9; d += 1) targets.push({ kind: 'digit', digit: d, pos: 'any' });
    setCompareTargets(targets);
    setPickExpanded(false);
    resetCellUi();
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
    resetCellUi();
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
    resetCellUi();
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
    /** 水平参考线（同屏格「分割/等分」） */
    overlay: 'none' | 'split' | 'equal' = 'none',
    /** 副图覆盖：同屏格固定 MACD+KDJ（对齐官方三段式格），不传则用指标面板设置 */
    subsOverride?: IndicatorId[],
  ) => {
    // 快乐8 分布图形：80 号热力图（与目标序列无关，走游戏级数据）
    if (m === 'kl8dist') {
      if (!kl8Heat) return null;
      return (
        <EChartsKl8Heatmap
          counts={kl8Heat.counts}
          omissions={kl8Heat.omissions}
          mode={kl8HeatMode}
          lastN={kl8Heat.lastN}
          height={h}
          width={w}
          targetLabel={`${chartMeta[m].title}`}
        />
      );
    }
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
    const subs = subsOverride ?? activeSubs;
    if (subs.length > 0 && (m === 'freq' || m === 'omissionK')) {
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
          maConfigs={bareK ? [] : maConfigs}
          showBoll={!bareK}
          indicators={subs}
          subToggle
          height={h}
          width={w}
          title={`${chartMeta[m].title} · ${label}`}
          metaLine={[
            chartHeaderMeta(m, tMiss, s.length > 0 ? s[s.length - 1] : undefined),
            `上轨 ${fmt(tri.upper)} 中轨 ${fmt(tri.mid)} 下轨 ${fmt(tri.lower)}`,
          ].filter(Boolean).join('  ')}
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
          overlay={overlay}
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
          overlay={overlay}
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
          overlay={overlay}
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
          overlay={overlay}
        />
      );
    }
    return null;
  };

  /** digit 目标命中的号码集合（D 位枚举，含该数字 / 定位等于该数字） */
  const cellCodesOf = (ct: Target): string[] => {
    if (ct.kind !== 'digit') return [];
    const out: string[] = [];
    eachNumber(DD, (nums) => {
      const hitOk =
        ct.pos === 'any' ? nums.includes(ct.digit) : nums[posIndex(ct.pos, DD)] === ct.digit;
      if (hitOk) out.push(nums.join(''));
    });
    return out;
  };

  /** 「查看号码」弹窗（>400 注截断展示，标题给总数） */
  const openCodesModal = (label: string, ct: Target) => {
    setCellDropIdx(null);
    setCellMenuIdx(null);
    const codes = cellCodesOf(ct);
    setCodesModal({ label, codes: codes.slice(0, 400), total: codes.length });
  };

  /** 同屏格「更多」菜单动作 */
  const handleCellMenu = (idx: number, ct: Target, key: string) => {
    setCellMenuIdx(null);
    if (key === 'codes') {
      openCodesModal(getTargetLabel(ct), ct);
      return;
    }
    if (key === 'copy') {
      if (gameId === 'kl8') {
        Alert.alert('复制', '快乐8 目标不适用号码复制');
        return;
      }
      const codes = cellCodesOf(ct);
      Clipboard.setStringAsync(codes.join(' ')).then(() =>
        Alert.alert('复制', `已复制 ${codes.length} 注号码`),
      );
      return;
    }
    if (key === 'shrink') {
      if (gameId === 'kl8') {
        Alert.alert('加入缩水', '快乐8 号码不适用数字彩缩水');
        return;
      }
      const codes = cellCodesOf(ct);
      Clipboard.setStringAsync(codes.join(' ')).then(() => {
        const path = gameId === 'pl5' ? '/(tabs)/pl5-shrink' : '/(tabs)/shrink';
        router.push({ pathname: path, params: { importCodes: codes.join(' ') } });
      });
      return;
    }
    if (key === 'split' || key === 'equal') {
      const next = key as 'split' | 'equal';
      setCellOverlay((v) => ({ ...v, [idx]: v[idx] === next ? 'none' : next }));
      return;
    }
    if (key === 'second') {
      // 二阶：当前格在 频率K/遗漏图 ↔ 遗漏K(二阶) 间切换
      const cur = cellModes[idx] ?? chartModes[0];
      setCellModes((v) => ({ ...v, [idx]: cur === 'omissionK' ? 'freq' : 'omissionK' }));
      return;
    }
  };

  /**
   * 同屏格头部三行（对齐官方参考图）：
   * 标题行「毒胆·N·直选X注 | 更多」、控制行「图型 ▾ | MA摘要 | 查看号码」、信息行「遗漏周期/当前遗漏/概率」。
   * 图型下拉与更多菜单为绝对定位浮层，展开时覆盖在本格图表上方。
   */
  const renderCellHeader = (
    idx: number,
    ct: Target,
    tMiss: number,
    oS: { issue: string; omission: number }[],
    label: string,
  ) => {
    const cur = cellModes[idx] ?? chartModes[0];
    const modeLabel = CELL_MODES.find((c) => c.id === cur)?.label ?? chartMeta[cur]?.title ?? cur;
    const prob = getProbability(ct, V, DD);
    return (
      /* 单行头部（对齐官方：频率K 毒胆 0 27.1% | 号码 | 更多），
         点标题切图型下拉，把高度全部让给三段式图表 */
      <View style={styles.cellHead}>
        <Pressable
          style={{ flex: 1 }}
          onPress={() => {
            setCellMenuIdx(null);
            setCellDropIdx(cellDropIdx === idx ? null : idx);
          }}
        >
          <Text style={styles.cellTitle} numberOfLines={1}>
            {`${modeLabel} 毒胆 ${label} ${(prob * 100).toFixed(1)}% ▾`}
          </Text>
        </Pressable>
        <Pressable onPress={() => openCodesModal(getTargetLabel(ct), ct)}>
          <Text style={styles.cellView}>号码</Text>
        </Pressable>
        <Pressable
          style={styles.cellMore}
          onPress={() => {
            setCellDropIdx(null);
            setCellMenuIdx(cellMenuIdx === idx ? null : idx);
          }}
        >
          <Text style={styles.cellMoreText}>更多</Text>
        </Pressable>
      </View>
    );
  };

  /** 同屏格浮层：图型下拉 + 更多竖排菜单（必须在图表 WebView 之后渲染才能盖住它） */
  const renderCellOverlays = (idx: number, ct: Target) => {
    const cur = cellModes[idx] ?? chartModes[0];
    return (
      <View pointerEvents="box-none">
        {/* 图型下拉浮层 */}
        {cellDropIdx === idx && (
          <View style={styles.cellDrop}>
            {CELL_MODES.map((c) => (
              <Pressable
                key={c.id}
                style={styles.cellDropItem}
                onPress={() => {
                  setCellModes((v) => ({ ...v, [idx]: c.id }));
                  setCellDropIdx(null);
                }}
              >
                <Text style={[styles.cellDropText, cur === c.id && styles.cellDropTextOn]}>
                  {c.label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
        {/* 更多竖排菜单浮层 */}
        {cellMenuIdx === idx && (
          <View style={styles.cellMenu}>
            {CELL_MENU.map((it) => (
              <Pressable
                key={it.key}
                style={styles.cellDropItem}
                onPress={() => handleCellMenu(idx, ct, it.key)}
              >
                <Text
                  style={[
                    styles.cellDropText,
                    (it.key === 'split' || it.key === 'equal') &&
                      cellOverlay[idx] === it.key &&
                      styles.cellDropTextOn,
                    it.key === 'second' && cur === 'omissionK' && styles.cellDropTextOn,
                  ]}
                >
                  {it.label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    );
  };

  /**
   * 毒胆同屏：默认 2 列 × 5 行。
   * 点按某格 → 转「1 列 × 10 行」并把该格滚到屏幕（对齐参考图：满屏后仍是同屏状态，
   * 只是二列五行变一列十行、屏幕定位到点击的那张），再点同一格还原双列。
   */
  const renderCompare = () => {
    if (!compareTargets || compareTargets.length === 0) return null;
    const single = focusedIdx !== null;
    return (
      <>
        {!fullscreen && renderZoomBar()}
        {/* 同屏选码面板：默认收起，点把手展开（对齐官方「下拉才出现」） */}
        <Pressable style={styles.cmpHandle} onPress={() => setCmpOpen((v) => !v)}>
          <Text style={styles.cmpHandleTxt}>{cmpOpen ? '▴ 收起选码面板' : '▾ 同屏选指标'}</Text>
        </Pressable>
        {cmpOpen && (
          <View style={styles.cmpPanel}>
            <View style={styles.cmpTabs}>
              <Chip label="选择单个指标" active={!cmpMulti} onPress={() => setCmpMulti(false)} />
              <Chip label="选择多个指标" active={cmpMulti} onPress={() => setCmpMulti(true)} />
              <Chip label="收起 ▴" active={false} onPress={() => setCmpOpen(false)} />
            </View>
            <DigitGrid
              digits={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]}
              selected={cmpSel}
              onToggle={(d) => {
                if (cmpMulti) {
                  toggleCmpSel(d);
                } else {
                  // 单指标：对齐官方——选码后退出同屏，该码作为毒胆主图满屏显示
                  setDan([d]);
                  setCompareTargets(null);
                  setFocusedIdx(null);
                  setCmpOpen(false);
                }
              }}
            />
              {cmpMulti && (
                <>
                  <View style={styles.chipRow}>
                    <Text style={styles.fieldNote}>中出</Text>
                    {([['0', '0'], ['1', '1'], ['2', '2'], ['3', '3'], ['zhong', '重']] as ['off' | '0' | '1' | '2' | '3' | 'zhong', string][]).map(([v, label]) => (
                      <Chip
                        key={v}
                        label={label}
                        active={cmpCount === v}
                        onPress={() => {
                          const nv = cmpCount === v ? 'off' : v;
                          setCmpCount(nv);
                          if (nv !== 'off') doCmpCount(nv as '0' | '1' | '2' | '3' | 'zhong');
                        }}
                      />
                    ))}
                  </View>
                  <View style={styles.chipRow}>
                    <Chip label="交集" active={false} onPress={doCmpIntersect} />
                    <Chip label="并集" active={false} onPress={doCmpUnion} />
                    <Chip label="选中出图" active onPress={doCmpSelected} />
                    <Chip label="全选出图" active={false} onPress={doCmpAll} />
                    <Chip label="清" active={false} onPress={() => setCmpSel([])} />
                  </View>
                </>
              )}
          </View>
        )}
        <View onLayout={(e) => { gridYRef.current = e.nativeEvent.layout.y; }}>
          <TongGrid columns={tongColumns}>
            {compareTargets.map((ct, idx) => {
              // 单列时格子大，可多看几期；双列窄格只画 80 期避免糊成一片
              const sliceN = Math.min(records.length, single ? 160 : 80);
              const s = buildTargetSeries(records.slice(-sliceN), ct, V, DD);
              const tMiss = getTheoryMiss(ct, V, DD);
              const oSeries = s.map((p) => ({ issue: p.issue, omission: p.omission }));
              const label = ct.kind === 'digit' ? String(ct.digit) : String(idx);
              const m = cellModes[idx] ?? chartModes[0];
              return (
                <View
                  key={idx}
                  style={[
                    styles.cellBox,
                    { width: tongW },
                    single && { alignSelf: 'center' },
                  ]}
                  onLayout={(e) => {
                    const { y, height } = e.nativeEvent.layout;
                    cellYRef.current[idx] = y;
                    cellHRef.current[idx] = height;
                  }}
                >
                  {renderCellHeader(idx, ct, tMiss, oSeries, label)}
                  <Pressable onPress={() => setFocusedIdx(focusedIdx === idx ? null : idx)}>
                    {renderChart(
                      m,
                      tongW,
                      Math.round(tongH * chartZoom),
                      s,
                      oSeries,
                      tMiss,
                      getTargetLabel(ct),
                      historyMaxMiss,
                      cellOverlay[idx] ?? 'none',
                      // 对齐官方三段式格：MACD + KDJ 双副图
                      ['macd', 'kdj'],
                    )}
                  </Pressable>
                  {renderCellOverlays(idx, ct)}
                </View>
              );
            })}
          </TongGrid>
        </View>
      </>
    );
  };

  /** 顶栏收缩态：横屏手动收起，或全屏自动收起 */
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
            {/* ───── 顶栏（对齐参考图：位置▼ · 彩种▼ · 期数 · 奖 · ＋ 单行） ───── */}
            <View style={[styles.topbar, isLandscape && styles.topbarLandscape]}>
              <Pressable
                style={styles.topBtn}
                onPress={() => setPickExpanded((v) => !v)}
                accessibilityState={{ expanded: pickExpanded }}
              >
                <Text style={styles.topBtnText} numberOfLines={1}>
                  {topLeftLabel} ▼
                </Text>
              </Pressable>
              <Pressable style={styles.topBtn} onPress={() => setGameMenuOpen(true)}>
                <Text style={styles.topBtnText} numberOfLines={1}>
                  {game.name} ▼
                </Text>
              </Pressable>
              <View style={styles.topSpacer} />
              <Text style={styles.topInfo}>{allRecords.length}期</Text>
              <Pressable style={styles.topPrize} onPress={() => setGameMenuOpen(true)}>
                <Text style={styles.topPrizeText}>奖</Text>
              </Pressable>
              <Pressable style={styles.topPlus} onPress={() => void runFullFetch()}>
                <Text style={styles.topPlusText}>＋</Text>
              </Pressable>
            </View>
          </>
        )}

        {/* ───── content 内容区 ───── */}
        <ScrollView
          ref={scrollRef}
          onLayout={(e) => onViewportLayout(e.nativeEvent.layout.height)}
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
          {/* 图表类型 / 指标 / 缩放已移到底部固定图型栏（对齐参考图），
              滚动区只留图表本身与数据面板，图表視野最大化。 */}

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
                  <ChartCard
                    title={chartMeta[m].title}
                    meta={chartHeaderMeta(m, theoryMiss, series.length > 0 ? series[series.length - 1] : undefined)}
                  >
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

          {/* 数据 / 期数面板已移除：期数输入在「周期」弹层，分段周期/遗漏和口径在 ••• 更多菜单 */}
        </ScrollView>

        {/* ───── 选号抽屉：从底部上下拉开，内容可上下滑动 ───── */}
        {!fullscreen && (
          <PickSheet
            tabLabel={TABS.find((t) => t.id === tab)?.label ?? '选号'}
            gameName={game.name}
            expanded={pickExpanded}
            onChange={setPickExpanded}
            bottomOffset={bottomBarH}
            fixedHeader={renderDrawerGroups()}
          >
            {renderPickContent()}
          </PickSheet>
        )}

        {/* ───── 底部固定图型栏（对齐参考图：频率K 遗漏图 遗漏K 指标 出次 周期 同屏 •••）
            固定显示在抽屉上方：层级高于抽屉（zIndex/elevation），抽屉从其上沿拉开 ───── */}
        {!fullscreen && (
          <View
            style={[
              { paddingBottom: isLandscape ? 0 : insets.bottom, backgroundColor: semantic.pageBg },
              styles.chartBarFixed,
            ]}
            onLayout={(e) => setBottomBarH(e.nativeEvent.layout.height)}
          >
            <View style={styles.chartBar}>
              <Pressable
                style={[styles.barChip, chartModes.includes('freq') && styles.barChipOn]}
                onPress={() => setChartModes(['freq'])}
                accessibilityState={{ selected: chartModes.includes('freq') }}
              >
                <Text style={[styles.barChipText, chartModes.includes('freq') && styles.barChipTextOn]}>频率K</Text>
              </Pressable>
              <Pressable
                style={[styles.barChip, chartModes.includes('omissionLine') && styles.barChipOn]}
                onPress={() => setChartModes(['omissionLine'])}
                accessibilityState={{ selected: chartModes.includes('omissionLine') }}
              >
                <Text style={[styles.barChipText, chartModes.includes('omissionLine') && styles.barChipTextOn]}>遗漏图</Text>
              </Pressable>
              <Pressable
                style={[styles.barChip, styles.barChipWarn, chartModes.includes('omissionK') && styles.barChipWarnOn]}
                onPress={() => setChartModes(['omissionK'])}
                accessibilityState={{ selected: chartModes.includes('omissionK') }}
              >
                <Text style={[styles.barChipText, styles.barChipWarnText, chartModes.includes('omissionK') && styles.barChipWarnTextOn]}>遗漏K</Text>
              </Pressable>
              <Pressable
                style={[styles.barChip, activeSubs.length > 0 && styles.barChipOn]}
                onPress={() => setIndicatorOpen(true)}
              >
                <Text style={[styles.barChipText, activeSubs.length > 0 && styles.barChipTextOn]}>指标</Text>
              </Pressable>
              <Pressable
                style={[styles.barChip, chartModes.includes('chuci') && styles.barChipOn]}
                onPress={() => setChartModes(['chuci'])}
                accessibilityState={{ selected: chartModes.includes('chuci') }}
              >
                <Text style={[styles.barChipText, chartModes.includes('chuci') && styles.barChipTextOn]}>出次</Text>
              </Pressable>
              <Pressable style={styles.barChip} onPress={() => setPeriodMenuOpen(true)}>
                <Text style={styles.barChipText}>周期{period > 1 ? ` ${period}` : ''}</Text>
              </Pressable>
              <Pressable
                style={[styles.barChip, compareTargets && styles.barChipOn]}
                onPress={toggleCompareFromBar}
                accessibilityState={{ selected: !!compareTargets }}
              >
                <Text style={[styles.barChipText, compareTargets && styles.barChipTextOn]}>同屏</Text>
              </Pressable>
              {gameId === 'kl8' && (
                <Pressable
                  style={[styles.barChip, chartModes.includes('kl8dist') && styles.barChipOn]}
                  onPress={() => {
                    if (chartModes.includes('kl8dist')) {
                      setKl8HeatMode((v) => (v === 'freq' ? 'omission' : 'freq'));
                    } else {
                      setChartModes(['kl8dist']);
                    }
                  }}
                  accessibilityState={{ selected: chartModes.includes('kl8dist') }}
                >
                  <Text style={[styles.barChipText, chartModes.includes('kl8dist') && styles.barChipTextOn]}>
                    分布{chartModes.includes('kl8dist') ? (kl8HeatMode === 'freq' ? '·热' : '·遗') : ''}
                  </Text>
                </Pressable>
              )}
              <Pressable style={styles.barChip} onPress={() => setMoreMenuOpen(true)}>
                <Text style={styles.barChipText}>•••</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
      </DensityProvider>

      {/* 查看号码弹窗（同屏格「号码 / 查看号码」） */}
      <Modal
        visible={codesModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setCodesModal(null)}
      >
        <Pressable style={styles.modalMask} onPress={() => setCodesModal(null)}>
          <Pressable style={styles.codesSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.codesHead}>
              <Text style={styles.codesTitle} numberOfLines={1}>
                {codesModal?.label} · 共 {codesModal?.total ?? 0} 注{((codesModal?.total ?? 0) > (codesModal?.codes.length ?? 0)) ? '（展示前 400 注）' : ''}
              </Text>
              <Pressable onPress={() => setCodesModal(null)}>
                <Text style={styles.codesClose}>关闭</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.codesList} nestedScrollEnabled>
              <Text style={styles.codesText}>{codesModal?.codes.join('  ')}</Text>
            </ScrollView>
            <Pressable
              style={styles.codesCopyBtn}
              onPress={() => {
                if (!codesModal) return;
                Clipboard.setStringAsync(codesModal.codes.join(' '));
                Alert.alert('复制', `已复制 ${codesModal.total} 注号码`);
              }}
            >
              <Text style={styles.codesCopyText}>复制全部</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

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
                  // 切彩种：清同屏/同屏格状态并收起抽屉，避免旧目标在新彩种下重算卡顿
                  setCompareTargets(null);
                  setFocusedIdx(null);
                  resetCellUi();
                  setPickExpanded(false);
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

      {/* 周期 / 期数 Modal：周期选择 + 期数（分析窗口）输入。
          期数输入框已从图表下方的「数据」卡片移到这里（对齐参考图：图表区只留图） */}
      <Modal visible={periodMenuOpen} transparent animationType="fade" onRequestClose={() => setPeriodMenuOpen(false)}>
        <Pressable
          style={styles.modalMask}
          onPress={() => setPeriodMenuOpen(false)}
        >
          <View style={[styles.modalCard, { maxWidth: 300, marginBottom: 110 }]}>
            <Text style={styles.modalTitle}>周期</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((p) => (
                <Pressable
                  key={p}
                  onPress={() => setPeriod(p)}
                  style={[styles.modalGridCell, period === p && styles.modalGridCellOn]}
                >
                  <Text style={[styles.modalOptionText, period === p && styles.modalOptionTextOn]}>
                    {p}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* 周期>1 = 周期K线：对齐基准选择（原「数据」卡片迁入） */}
            {period > 1 && (
              <>
                <View style={styles.modalDivider} />
                <Text style={styles.fieldNote}>周期K线对齐</Text>
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

            <View style={styles.modalDivider} />
            <Text style={styles.fieldNote}>期数 / 分析窗口</Text>
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
              <Chip
                label="应用"
                active
                onPress={() => {
                  applyCount();
                  setPeriodMenuOpen(false);
                }}
              />
              <Chip label={refreshing ? '刷新中…' : '刷新'} active={false} onPress={() => void refresh()} />
            </View>
            <Text style={styles.hint} numberOfLines={2}>
              {game.name} · {source} {records.length}期 / 共{allRecords.length}期
            </Text>
          </View>
        </Pressable>
      </Modal>

      {/* 区间统计 Modal（对齐官方「区间统计」：中出个数/最大连开/最大遗漏/开出率/理论周期内外） */}
      <Modal visible={statsOpen} transparent animationType="fade" onRequestClose={() => setStatsOpen(false)}>
        <Pressable style={styles.modalMask} onPress={() => setStatsOpen(false)}>
          <View style={[styles.modalCard, { minWidth: 290 }]}>
            <Text style={styles.modalTitle}>区间统计</Text>
            <Text style={styles.hint} numberOfLines={2}>
              {getTargetLabel(target)} · {winStats.firstIssue} ~ {winStats.lastIssue}
            </Text>
            <View style={styles.statGrid}>
              {([
                ['区间期数', winStats.total],
                ['中出次数', winStats.hits],
                ['理论中出', winStats.theoryHits],
                ['最大连开', winStats.maxRun],
                ['最大遗漏', winStats.maxOmission],
                ['当前遗漏', winStats.curOmission],
                ['开出率', `${(winStats.rate * 100).toFixed(1)}%`],
                ['理论周期', winStats.theoryMiss.toFixed(2)],
              ] as [string, string | number][]).map(([k, v]) => (
                <View key={k} style={styles.statCell}>
                  <Text style={styles.statVal}>{v}</Text>
                  <Text style={styles.statKey}>{k}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.hint} numberOfLines={2}>
              实际中出比理论{winStats.hits >= winStats.theoryHits ? '偏多' : '偏少'} {Math.abs(winStats.hits - winStats.theoryHits).toFixed(1)} 次（{winStats.hits >= winStats.theoryHits ? '走热' : '走冷'}）
            </Text>
          </View>
        </Pressable>
      </Modal>

      {/* ••• 更多菜单：补充图型 / 缩放 / 全屏 / 出图 / 重置 */}
      <Modal visible={moreMenuOpen} transparent animationType="fade" onRequestClose={() => setMoreMenuOpen(false)}>
        <Pressable style={styles.modalMask} onPress={() => setMoreMenuOpen(false)}>
          <View style={[styles.modalCard, { minWidth: 240 }]}>
            <Text style={styles.modalTitle}>更多</Text>
            <View style={styles.chipRow}>
              {CHART_MODES.filter((c) => !['freq', 'omissionLine', 'omissionK', 'chuci'].includes(c.id) && (gameId === 'kl8' || c.id !== 'kl8dist')).map((c) => (
                <Chip
                  key={c.id}
                  label={c.label}
                  active={chartModes.includes(c.id)}
                  pill
                  onPress={() => toggleChart(c.id)}
                />
              ))}
            </View>
            {/* 出次图：分段周期 + 退期（原「数据」卡片迁入） */}
            {(chartModes.includes('chuci') || chartModes.includes('chuciMove')) && (
              <>
                <View style={styles.modalDivider} />
                <Text style={styles.fieldNote}>分段周期（步长）</Text>
                <View style={styles.chipRow}>
                  {[5, 10, 15, 20, 25, 30, 50].map((p) => (
                    <Chip key={`sp-${p}`} label={String(p)} active={stepPeriod === p} pill onPress={() => setStepPeriod(p)} />
                  ))}
                </View>
                <View style={styles.rowBetween}>
                  <Text style={styles.fieldNote}>退期（最后一点前推的期数）</Text>
                  <Chip label={String(drawBack)} active onPress={() => setDrawBack(drawBack >= 30 ? 0 : drawBack + 5)} />
                </View>
              </>
            )}
            {/* 遗漏和口径（原「数据」卡片迁入） */}
            {chartModes.includes('missSum') && (
              <>
                <View style={styles.modalDivider} />
                <Text style={styles.fieldNote}>遗漏和口径</Text>
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
              </>
            )}
            <View style={styles.modalDivider} />
            <View style={styles.chipRow}>
              <Chip label="−" active={false} onPress={() => stepZoom(-ZOOM_STEP)} />
              <Text style={styles.zoomText}>{Math.round(chartZoom * 100)}%</Text>
              <Chip label="＋" active={false} onPress={() => stepZoom(ZOOM_STEP)} />
              <Chip label="重置缩放" active={false} onPress={() => setChartZoom(1)} />
              <Chip
                label={fullscreen ? '退出全屏' : '全屏'}
                active={fullscreen}
                onPress={() => { setFullscreen((v) => !v); setMoreMenuOpen(false); }}
              />
            </View>
            {compareTargets && (
              <>
                <View style={styles.modalDivider} />
                <Chip
                  label="退出同屏"
                  active={false}
                  onPress={() => { setCompareTargets(null); setFocusedIdx(null); setMoreMenuOpen(false); }}
                />
              </>
            )}
            <View style={styles.modalDivider} />
            <View style={styles.chipRow}>
              {/* 组号（原底部 tab 入口移到这里）：按当前彩种跳对应组号/缩水屏 */}
              <Chip
                label="组号"
                active={false}
                onPress={() => {
                  setMoreMenuOpen(false);
                  const path =
                    gameId === 'pl5'
                      ? '/(tabs)/pl5-shrink'
                      : gameId === 'kl8'
                        ? '/(tabs)/kl8-shrink'
                        : '/(tabs)/shrink';
                  router.push({ pathname: path as never, params: {} });
                }}
              />
            </View>
            <View style={styles.modalDivider} />
            <View style={[styles.chipRow, { justifyContent: 'flex-end' }]}>
              <Chip label="出图" active onPress={handleExport} />
              <Chip label="重置" active={false} onPress={handleReset} />
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* 指标设置：副图 MACD/KDJ/RSI/CCI/ADX/SAR 单选 + MA 均线参数 */}
      <IndicatorPanel
        visible={indicatorOpen}
        onClose={() => setIndicatorOpen(false)}
        maConfigs={maConfigs}
        onMaChange={setMaConfigs}
        bareK={bareK}
        onBareKChange={setBareK}
        sub1={sub1}
        sub2={sub2}
        onSubChange={(slot, id) => (slot === 1 ? setSub1(id) : setSub2(id))}
        onReset={() => {
          setMaConfigs(DEFAULT_MA);
          setBareK(false);
          setSub1('macd');
          setSub2('none');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: semantic.pageBg },

  /* ── 胆码同屏格头部（对齐参考图：毒胆·N·直选X注 | 更多 / 图型▾ | MA | 查看号码 / 信息行） ── */
  /** 图型栏固定层：盖过抽屉（zIndex 30 > 抽屉 20），始终贴底可见 */
  chartBarFixed: { zIndex: 30, elevation: 10 },
  /* ── 区间统计弹窗 ── */
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: space.sm },
  statCell: { width: '25%', alignItems: 'center', paddingVertical: 8 },
  statVal: { color: semantic.text, fontSize: fs.md, fontWeight: '700' },
  statKey: { color: semantic.textDim, fontSize: fs.xs, marginTop: 2 },
  /* ── 同屏下拉面板（对齐官方） ── */
  cmpPanel: {
    backgroundColor: semantic.panelBg,
    borderWidth: 1,
    borderColor: semantic.panelBorder,
    borderRadius: radius.sm,
    padding: space.xs,
    marginBottom: space.sm,
  },
  cmpTabs: { flexDirection: 'row', gap: space.xs, marginBottom: space.xs },
  cmpHandle: {
    alignItems: 'center',
    paddingVertical: 6,
    marginBottom: space.sm,
    backgroundColor: semantic.panelBg,
    borderWidth: 1,
    borderColor: semantic.panelBorder,
    borderRadius: radius.sm,
  },
  cmpHandleTxt: { color: semantic.textDim, fontSize: fs.xs },
  cellBox: {
    position: 'relative',
    borderWidth: 1,
    borderColor: semantic.panelBorder,
    borderRadius: radius.sm,
    padding: space.xs,
    backgroundColor: semantic.panelBg,
  },
  cellHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cellTitle: { color: semantic.text, fontSize: fs.sm, fontWeight: '700', flex: 1 },
  cellMore: {
    backgroundColor: semantic.panelBorder,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: space.xs,
  },
  cellMoreText: { color: semantic.textDim, fontSize: fs.xs },
  cellCtl: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: 1 },
  cellMode: { color: palette.accent, fontSize: fs.xs, fontWeight: '700' },
  cellMa: { color: palette.amber, fontSize: fs.xs, flex: 1 },
  cellView: { color: semantic.textDim, fontSize: fs.xs },
  cellDrop: {
    position: 'absolute',
    left: space.xs,
    top: 64,
    zIndex: 30,
    elevation: 30,
    backgroundColor: semantic.panelBg,
    borderWidth: 1,
    borderColor: semantic.panelBorder,
    borderRadius: radius.sm,
    minWidth: 88,
  },
  cellMenu: {
    position: 'absolute',
    right: space.xs,
    top: 24,
    zIndex: 30,
    elevation: 30,
    backgroundColor: semantic.panelBg,
    borderWidth: 1,
    borderColor: semantic.panelBorder,
    borderRadius: radius.sm,
    minWidth: 96,
  },
  cellDropItem: { paddingHorizontal: space.sm, paddingVertical: 7 },
  cellDropText: { color: semantic.textDim, fontSize: fs.sm },
  cellDropTextOn: { color: palette.accent, fontWeight: '700' },
  codesSheet: {
    alignSelf: 'stretch',
    marginHorizontal: space.lg,
    marginTop: '22%',
    maxHeight: '60%',
    backgroundColor: semantic.panelBg,
    borderWidth: 1,
    borderColor: semantic.panelBorder,
    borderRadius: radius.md,
    padding: space.sm,
  },
  codesHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xs },
  codesTitle: { color: semantic.text, fontSize: fs.sm, fontWeight: '700', flex: 1 },
  codesClose: { color: palette.accent, fontSize: fs.sm, marginLeft: space.sm },
  codesList: { maxHeight: 320 },
  codesText: { color: semantic.textDim, fontSize: fs.xs, lineHeight: 18 },
  codesCopyBtn: {
    marginTop: space.xs,
    alignItems: 'center',
    backgroundColor: semantic.panelBorder,
    borderRadius: radius.sm,
    paddingVertical: 8,
  },
  codesCopyText: { color: semantic.text, fontSize: fs.sm, fontWeight: '700' },


  /* ── 顶栏（对齐参考图单行：位置▼ 彩种▼ · 期数 · 奖 · ＋） ── */
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    backgroundColor: semantic.contentBg,
    borderBottomWidth: 1,
    borderBottomColor: semantic.divider,
  },
  topbarLandscape: { paddingVertical: 3 },
  topBtn: {
    maxWidth: 150,
    minHeight: 32,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBtnText: { fontSize: fs.base, fontWeight: '700', color: semantic.text },
  topSpacer: { flex: 1 },
  topInfo: { fontSize: fs.sm, color: semantic.textDim },
  topPrize: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topPrizeText: { fontSize: fs.xs, fontWeight: '800', color: semantic.onBrand },
  topPlus: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: semantic.panelBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topPlusText: { fontSize: fs.base, fontWeight: '700', color: semantic.textDim, lineHeight: 20 },

  /* ── 底部固定图型栏（频率K 遗漏图 遗漏K 指标 出次 周期 同屏 •••） ── */
  chartBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.sm,
    paddingVertical: 6,
    backgroundColor: semantic.contentBg,
    borderTopWidth: 1,
    borderTopColor: semantic.divider,
  },
  barChip: {
    flex: 1,
    minHeight: 30,
    paddingHorizontal: 6,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semantic.controlBg,
  },
  barChipOn: { backgroundColor: semantic.brand },
  barChipText: { fontSize: fs.xs, color: semantic.textDim, fontWeight: '600' },
  barChipTextOn: { color: semantic.onBrand, fontWeight: '700' },
  /** 遗漏K：参考图里的红色描边样式 */
  barChipWarn: { borderWidth: 1, borderColor: palette.accent },
  barChipWarnOn: { backgroundColor: alpha(palette.accent, 0.22) },
  barChipWarnText: { color: palette.accent },
  barChipWarnTextOn: { color: palette.accent, fontWeight: '800' },

  /* ── 抽屉分组页签（常用 / 系统 / 定制） ── */
  drawerGroups: {
    flexDirection: 'row',
    gap: space.md,
    paddingHorizontal: space.xs,
    paddingBottom: space.xs,
    borderBottomWidth: 1,
    borderBottomColor: semantic.divider,
  },
  dgTab: {
    minHeight: 30,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dgTabOn: { backgroundColor: alpha(palette.accent, 0.18) },
  dgTabText: { fontSize: fs.sm, color: semantic.textDim, fontWeight: '600' },
  dgTabTextOn: { color: palette.accent, fontWeight: '800' },

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

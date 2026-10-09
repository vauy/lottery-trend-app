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
// 注：原 SkiaRawChart 已改用 EChartsRawChart，
// 以保证 App 可在 Expo Go（Termux 热更新）运行，不依赖自定义原生模块。
import { EChartsRawChart } from '@/components/charts/EChartsRawChart';
import { buildRawSeries, buildShapeCodes, getTargetLabel, type Kl8Play, type ShapeMainMode, type ShapeFilter } from '@/lib/lottery/targets';
import { useLotteryHistory, useGame } from '@/hooks/useLottery';
import { fetchAllAndVerify, verifyLocalData } from '@/lib/lottery/datasource';
import { buildTargetSeries, getTheoryMiss, type Target, type Position, type SamplingMode, type TargetPoint } from '@/lib/lottery/targets';
import { generateDanTuo } from '@/lib/lottery/danTuo';
import { buildDigitStats } from '@/lib/lottery/analysis';
import {
  BottomBar,
  ChartCard,
  Chip,
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

type ChartMode = 'freq' | 'omissionK' | 'omissionLine' | 'omissionLine2';
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

/** 图表卡片标题 / 副标题（对齐原型 .chart-card .ctitle） */
const CHART_META: Record<ChartMode, { title: string; meta: string }> = {
  freq: { title: '频率K线', meta: 'diff 累计实出−理论' },
  omissionK: { title: '遗漏K线', meta: '爬楼梯遗漏' },
  omissionLine: { title: '遗漏图', meta: '逐期遗漏值' },
  omissionLine2: { title: '二阶遗漏图', meta: '逐期遗漏值' },
};

const CHART_MODES: { id: ChartMode; label: string }[] = [
  { id: 'freq', label: '频率K' },
  { id: 'omissionK', label: '遗漏K' },
  { id: 'omissionLine', label: '遗漏图' },
  { id: 'omissionLine2', label: '二阶遗漏图' },
];

const POS_OPTIONS: Position[] = ['any', 'bai', 'shi', 'ge'];
const POS_LABEL_MAP: Record<Position, string> = {
  any: '不定位', wan: '万位', qian: '千位', bai: '百位', shi: '十位', ge: '个位',
};
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

// 对码组：05 16 27 38 49
const PAIR_GROUPS: number[][] = [[0, 5], [1, 6], [2, 7], [3, 8], [4, 9]];
function pairGroup(d: number): number[] {
  return PAIR_GROUPS.find((g) => g.includes(d)) ?? [d];
}

// 三个两码和尾
function twoSums(nums: number[]): number[] {
  return [(nums[0] + nums[1]) % 10, (nums[0] + nums[2]) % 10, (nums[1] + nums[2]) % 10];
}

// 三个两码差
function twoDiffs(nums: number[]): number[] {
  return [
    Math.abs(nums[0] - nums[1]),
    Math.abs(nums[0] - nums[2]),
    Math.abs(nums[1] - nums[2]),
  ];
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
      const s = twoSums(nums);
      const danTargets = sumSet(dan);
      if (!s.some((x) => danTargets.has(x))) return false;
      if (pei.length > 0) {
        const peiTargets = sumSet(pei);
        if (!s.some((x) => peiTargets.has(x))) return false;
      }
      return true;
    }
    case 'diff': {
      // 两码差：号码两码差 与 胆码本身（或胆码两两差）有交集
      const s = twoDiffs(nums);
      const danTargets = diffSet(dan);
      if (!s.some((x) => danTargets.has(x))) return false;
      if (pei.length > 0) {
        const peiTargets = diffSet(pei);
        if (!s.some((x) => peiTargets.has(x))) return false;
      }
      return true;
    }
    case 'span': {
      // 两码跨：同两码差
      const s = twoDiffs(nums);
      const danTargets = diffSet(dan);
      if (!s.some((x) => danTargets.has(x))) return false;
      if (pei.length > 0) {
        const peiTargets = diffSet(pei);
        if (!s.some((x) => peiTargets.has(x))) return false;
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
  const [chartModes, setChartModes] = useState<ChartMode[]>(['freq']);
  const [compareTargets, setCompareTargets] = useState<Target[] | null>(null);
  const [topCollapsed, setTopCollapsed] = useState(false);
  const [gameMenuOpen, setGameMenuOpen] = useState(false);
  const [dataTaskRunning, setDataTaskRunning] = useState(false);
  const [dataTaskMsg, setDataTaskMsg] = useState('');
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);

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
      // 按类型筛选全部 1000 个号码
      const codes = new Set<string>();
      for (let a = 0; a <= 9; a += 1) {
        for (let b = 0; b <= 9; b += 1) {
          for (let c = 0; c <= 9; c += 1) {
            const nums = [a, b, c];
            if (matchFilter(type, nums, dan, pei)) codes.add(`${a}${b}${c}`);
          }
        }
      }
      return { kind: 'set', codes };
    }
    if (tab === 'dantuo') {
      if (dtDan.length === 0) return { kind: 'set', codes: new Set() };
      const { zhixuan } = generateDanTuo(dtDan, dtTuo);
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
        // 不定位复式：每位从 noposNums 里选，可重复
        if (noposNums.length === 0) return { kind: 'set', codes: new Set() };
        const codes = new Set<string>();
        for (const a of noposNums) for (const b of noposNums) for (const c of noposNums)
          codes.add(`${a}${b}${c}`);
        return { kind: 'set', codes };
      }
    }
    if (tab === 'heji') return { kind: 'calcAttr', calcKey: hejiKey as any, value: hejiValue };
    if (tab === 'amp') return { kind: 'calcAttr', calcKey: hejiKey as any, value: hejiValue };
    return { kind: 'set', codes: new Set() };
  }, [tab, type, externalCodes, shapeMainMode, shapeFilters, shapeDigits, dan, commonDigit, commonMode, kl8CommonMode, kl8CommonValue, kl8CommonMatchCount, kl8ComboCodes, kl8MatchMode, kl8MatchCount, kl8SeqCodes, kl8DtDan, kl8DtTuo, kl8DtDanCounts, kl8DtTuoCounts, kl8FushiCodes, kl8FushiPlaySize, gameId, dan, pei, dtDan, dtTuo, pos, posDigit,
    bai, shi, ge, wan, qian, posSlots, multiMode, noposNums, hejiKey, hejiValue]);

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
  const contentW = Math.max(240, width - space.lg * 2);
  const chartH = isLandscape ? chartSize.hLandscape : chartSize.h;
  const chartColW = isLandscape ? Math.floor((contentW - space.lg) / 2) : contentW;
  const chartW = Math.max(160, chartColW - 24);
  const tongW = Math.max(120, Math.floor(contentW * 0.48) - 12);

  // 图表可用高度（同屏放大 / 振幅图用）
  const TOP_BAR_H = topCollapsed ? 30 : 180;
  const availH = Math.max(140, height - TOP_BAR_H);

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
    setTopCollapsed(true);
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
    setTopCollapsed(true);
  };

  /** 二码合、二码差同屏 */
  const doTwoMaCompare = () => {
    if (dan.length === 0) return;
    const targets: Target[] = [
      { kind: 'calcAttr', calcKey: 'pairSumMax', value: dan[0] },
      { kind: 'calcAttr', calcKey: 'pairDiffMax', value: dan[0] },
    ];
    setCompareTargets(targets);
    setTopCollapsed(true);
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
            onPress={() => { setCompareTargets(null); setTopCollapsed(false); setFocusedIdx(null); }}
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
      <Field caption="彩种 / 周期">
        <View style={styles.chipRow}>
          {[{ id: 'fc3d', label: '福彩3D' }, { id: 'pl3', label: '排列3' }].map((g) => (
            <Chip
              key={g.id}
              label={g.label}
              active={gameId === g.id}
              onPress={() => setGameId(g.id)}
            />
          ))}
        </View>
        <View style={styles.chipRow}>
          {[1, 2, 3, 5, 10].map((p) => (
            <Chip key={`pd-${p}`} label={String(p)} active={period === p} onPress={() => setPeriod(p)} />
          ))}
        </View>
      </Field>
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

  /** 图表渲染：只统一容器，组件 props 与原来一致 */
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
    if (m === 'freq') {
      return (
        <EChartsFreqKChart
          series={s}
          height={h}
          width={w}
          period={period}
          barWidth={1.5}
          hideShadow={true}
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

  /** 毒胆同屏：原型 .tong-grid 两列；点按放大单图 */
  const renderCompare = () => {
    if (!compareTargets || compareTargets.length === 0) return null;
    const list = compareTargets
      .map((ct, idx) => ({ ct, idx }))
      .filter(({ idx }) => focusedIdx === null || focusedIdx === idx);

    // 满屏模式：单张大图
    if (focusedIdx !== null && list.length > 0) {
      const { ct } = list[0];
      const sliceN = records.length;
      const s = buildTargetSeries(records.slice(-sliceN), ct, V, DD);
      const tMiss = getTheoryMiss(ct, V, DD);
      const oSeries = s.map((p) => ({ issue: p.issue, omission: p.omission }));
      const m = chartModes[0]; // 同屏只显示第一种图
      return (
        <>
          <ChartCard title={getTargetLabel(ct)} meta={CHART_META[m].title}>
            <Pressable onPress={() => setFocusedIdx(null)}>
              {renderChart(
                m,
                chartW,
                Math.max(chartSize.h * 2, availH - 40),
                s,
                oSeries,
                tMiss,
                getTargetLabel(ct),
              )}
            </Pressable>
          </ChartCard>
          <View style={{ height: space.md }} />
          <View style={styles.chipRow}>
            <Chip
              label="退出同屏"
              active={false}
              onPress={() => { setCompareTargets(null); setTopCollapsed(false); setFocusedIdx(null); }}
            />
          </View>
        </>
      );
    }

    return (
      <TongGrid>
        {list.map(({ ct, idx }) => {
          const sliceN = Math.min(records.length, 300);
          const s = buildTargetSeries(records.slice(-sliceN), ct, V, DD);
          const tMiss = getTheoryMiss(ct, V, DD);
          const oSeries = s.map((p) => ({ issue: p.issue, omission: p.omission }));
          // 胆码标签
          const label = ct.kind === 'digit' ? String(ct.digit) : String(idx);
          const m = chartModes[0]; // 同屏只显示第一种图
          return (
            <TongCell key={idx} digit={label}>
              <Pressable onPress={() => setFocusedIdx(focusedIdx === idx ? null : idx)}>
                {renderChart(m, tongW, chartSize.tongCell, s, oSeries, tMiss, getTargetLabel(ct))}
              </Pressable>
            </TongCell>
          );
        })}
      </TongGrid>
    );
  };

  return (
    <Screen
      safeAreaEdges={['top', 'left', 'right']}
      backgroundColor={semantic.pageBg}
      statusBarStyle="light"
    >
      <View style={styles.shell}>
        {/* ───── brand 品牌栏 ───── */}
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>奇</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.brandTitle}>臻奇妙趋势分析</Text>
            <Text style={styles.brandSub}>TREND · 手机原型</Text>
          </View>
          <Pressable
            onPress={() => setTopCollapsed((v) => !v)}
            style={styles.iconBtn}
            accessibilityState={{ expanded: !topCollapsed }}
          >
            <Text style={styles.iconBtnText}>{topCollapsed ? '▼' : '▲'}</Text>
          </Pressable>
        </View>

        {/* ───── gamebar 彩种 ───── */}
        <View style={styles.gamebar}>
          <View style={styles.gameList}>
            {GAMES.map((g) => {
              const on = gameId === g.id;
              return (
                <Pressable
                  key={g.id}
                  onPress={() => setGameId(g.id)}
                  style={[styles.game, on && styles.gameOn]}
                  accessibilityState={{ selected: on }}
                >
                  <View style={[styles.gameDot, on && styles.gameDotOn]} />
                  <Text style={[styles.gameText, on && styles.gameTextOn]}>{g.label}</Text>
                </Pressable>
              );
            })}
            <Pressable onPress={() => setGameMenuOpen(true)} style={styles.gameMore}>
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
        <View style={styles.prinav}>
          <Segmented
            options={PRINAV_OPTIONS}
            value={PRINAV_VALUE}
            onChange={(v) => {
              if (v === 'group') Alert.alert('组号', '组号功能开发中，敬请期待');
            }}
            equalWidth
          />
        </View>

        {/* ───── subtabs 子页签（吸顶可横滚） ───── */}
        <View style={styles.subtabs}>
          <SubTabs items={visibleTabs} value={tab} onChange={onTabChange} />
        </View>

        {/* ───── content 内容区 ───── */}
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentInner}
          showsVerticalScrollIndicator={false}
        >
          {/* 选号面板（收起时只留展开条） */}
          {topCollapsed ? (
            <Pressable onPress={() => setTopCollapsed(false)} style={styles.expandBar}>
              <Text style={styles.expandText}>▼ 展开选号</Text>
            </Pressable>
          ) : (
            <Panel label="选 号" right={<Text style={styles.panelRight}>{game.name}</Text>}>
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
              {tab === 'random1' && renderPlaceholder('组内随机')}
              {tab === 'random2' && renderPlaceholder('随机交并')}
              {tab === 'group' && renderPlaceholder('分组胆')}
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
            </Panel>
          )}

          {/* 数据 / 期数面板 */}
          <Panel label="数 据">{renderDataBar()}</Panel>

          {/* 图表类型 + 图例 */}
          {tab !== 'amp' && (
            <Panel label="图 表">
              <View style={styles.chipRow}>
                {CHART_MODES.map((c) => (
                  <Chip
                    key={c.id}
                    label={c.label}
                    active={chartModes.includes(c.id)}
                    onPress={() => toggleChart(c.id)}
                  />
                ))}
              </View>
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
            <ChartCard
              title={`${AMP_KEYS.find((k) => k.id === ampKey)?.label ?? ''} 走势`}
              meta={`≤ ${ampMax}`}
            >
              {rawData && (
                <EChartsRawChart
                  data={rawData}
                  height={Math.max(chartSize.h, availH - 8)}
                  width={chartW}
                  title={`${AMP_KEYS.find((k) => k.id === ampKey)?.label ?? ''} 走势`}
                  yMax={ampMax}
                />
              )}
            </ChartCard>
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
            <View style={[styles.chartsGrid, isLandscape && styles.chartsGridLandscape]}>
              {chartModes.map((m) => (
                <View key={m} style={[styles.chartCell, isLandscape && { width: chartColW }]}>
                  <ChartCard title={CHART_META[m].title} meta={CHART_META[m].meta}>
                    {renderChart(
                      m,
                      chartW,
                      chartH,
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
        </ScrollView>

        {/* ───── bottombar 底部操作栏 ───── */}
        <View style={{ paddingBottom: insets.bottom }}>
          <BottomBar
            primaryLabel="出 图"
            onPrimary={handleExport}
            ghostLabel="重置"
            onGhost={handleReset}
            hint={`${game.name} · 集合 ${codesCount} 注 · 理论 ${theoryMiss.toFixed(2)}`}
            vertical={isLandscape}
          />
        </View>
      </View>

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
  contentInner: { padding: space.lg, gap: space.lg },
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

  /* charts */
  chartsGrid: { flexDirection: 'column', gap: space.lg },
  chartsGridLandscape: { flexDirection: 'row', flexWrap: 'wrap' },
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

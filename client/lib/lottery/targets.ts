/**
 * 分析目标抽象层
 */
import type { DrawRecord } from './types';

// ==================== 基础类型 ====================

export type Position = 'any' | 'wan' | 'qian' | 'bai' | 'shi' | 'ge';

/** 抽样模式：独立（3D/PL3/PL5）| 超几何（快乐8） */
export type SamplingMode = 'independent' | 'hypergeometric';

/** 从右往左数：ge=1, shi=2, bai=3, qian=4, wan=5；返回从左往右的索引 */
export function posIndex(pos: Exclude<Position, 'any'>, digitCount: number): number {
  const fromRight = pos === 'ge' ? 1 : pos === 'shi' ? 2 : pos === 'bai' ? 3 : pos === 'qian' ? 4 : 5;
  return digitCount - fromRight;
}

/** 兼容旧代码：3 位时的固定映射 */
export const POS_IDX: Record<Exclude<Position, 'any'>, number> = {
  wan: -2,
  qian: -1,
  bai: 0,
  shi: 1,
  ge: 2,
};

export const POS_LABEL: Record<Position, string> = {
  any: '不定位',
  wan: '万位',
  qian: '千位',
  bai: '百位',
  shi: '十位',
  ge: '个位',
};

// ==================== 属性集合定义 ====================

export type SetAttrKey =
  | 'bigSmall'
  | 'oddEven'
  | 'primeComp'
  | 'yinYang'
  | 'quZhi'
  | 'bigMidSmall'
  | 'road012'
  | 'pairCode';

export type SetAttrDef = {
  label: string;
  values: Record<string, Set<number>>;
};

export const SET_ATTRS: Record<SetAttrKey, SetAttrDef> = {
  bigSmall: {
    label: '大小',
    values: {
      大: new Set([5, 6, 7, 8, 9]),
      小: new Set([0, 1, 2, 3, 4]),
    },
  },
  oddEven: {
    label: '奇偶',
    values: {
      奇: new Set([1, 3, 5, 7, 9]),
      偶: new Set([0, 2, 4, 6, 8]),
    },
  },
  primeComp: {
    label: '质合',
    values: {
      质: new Set([1, 2, 3, 5, 7]),
      合: new Set([0, 4, 6, 8, 9]),
    },
  },
  yinYang: {
    label: '阴阳',
    values: {
      阴: new Set([0, 3, 4, 6, 7]),
      阳: new Set([1, 2, 5, 8, 9]),
    },
  },
  quZhi: {
    label: '曲直',
    values: {
      曲: new Set([0, 3, 6, 8, 9]),
      直: new Set([1, 2, 4, 5, 7]),
    },
  },
  bigMidSmall: {
    label: '大中小',
    values: {
      大: new Set([7, 8, 9]),
      中: new Set([3, 4, 5, 6]),
      小: new Set([0, 1, 2]),
    },
  },
  road012: {
    label: '012路',
    values: {
      '0路': new Set([0, 3, 6, 9]),
      '1路': new Set([1, 4, 7]),
      '2路': new Set([2, 5, 8]),
    },
  },
  pairCode: {
    label: '对码',
    values: {
      '0-5': new Set([0, 5]),
      '1-6': new Set([1, 6]),
      '2-7': new Set([2, 7]),
      '3-8': new Set([3, 8]),
      '4-9': new Set([4, 9]),
    },
  },
};

// ==================== 计算属性定义 ====================

export type CalcAttrKey =
  | 'sum'
  | 'sumTail'
  | 'span'
  | 'pairSumMax'
  | 'pairDiffMax'
  | 'sumAmp'
  | 'spanAmp'
  | 'baiAmp'
  | 'shiAmp'
  | 'geAmp'
  | 'qianAmp'    // 千位振幅 (0-9)
  | 'wanAmp'     // 万位振幅 (0-9)
  | 'sumTailAmp'  // 合值振幅 (0-9)
  | 'front2Sum'  // 前二和值 = 百 + 十 (0-18)
  | 'back2Sum';  // 后二和值 = 十 + 个 (0-18)

export const CALC_ATTRS: Record<CalcAttrKey, { label: string; min: number; max: number }> = {
  sum: { label: '和值', min: 0, max: 27 },
  sumTail: { label: '合值', min: 0, max: 9 },
  span: { label: '跨度', min: 0, max: 9 },
  pairSumMax: { label: '二码合最大值', min: 0, max: 9 },
  pairDiffMax: { label: '二码差最大值', min: 0, max: 9 },
  sumAmp: { label: '和值振幅', min: 0, max: 27 },
  spanAmp: { label: '跨度振幅', min: 0, max: 9 },
  baiAmp: { label: '百位振幅', min: 0, max: 9 },
  shiAmp: { label: '十位振幅', min: 0, max: 9 },
  geAmp: { label: '个位振幅', min: 0, max: 9 },
  qianAmp: { label: '千位振幅', min: 0, max: 9 },
  wanAmp: { label: '万位振幅', min: 0, max: 9 },
  sumTailAmp: { label: '合值振幅', min: 0, max: 9 },
  front2Sum: { label: '前二和值', min: 0, max: 18 },
  back2Sum: { label: '后二和值', min: 0, max: 18 },
};

// ==================== 目标定义 ====================

export type Kl8MatchMode = 'all' | 'any' | 'exact';

export type Kl8Play =
  | '选一' | '选二' | '选三' | '选四' | '选五'
  | '选六' | '选七' | '选八' | '选九' | '选十';

export const KL8_PLAY_SIZE: Record<Kl8Play, number> = {
  '选一': 1, '选二': 2, '选三': 3, '选四': 4, '选五': 5,
  '选六': 6, '选七': 7, '选八': 8, '选九': 9, '选十': 10,
};

export type Target =
  | { kind: 'digit'; digit: number; pos: Position }
  | { kind: 'setAttr'; attrKey: SetAttrKey; attrValue: string; pos: Position }
  | { kind: 'calcAttr'; calcKey: CalcAttrKey; value: number }
  | { kind: 'set'; codes: Set<string> }
  | { kind: 'kl8Combo'; codes: number[]; matchMode: Kl8MatchMode; matchCount?: number }
  | { kind: 'kl8Dantuo'; dan: number[]; tuo: number[]; danCounts: number[]; tuoCounts: number[] }
  | { kind: 'kl8Fushi'; codes: number[]; playSize: number }
  | { kind: 'shapeSet'; codes: Set<string>; shapeLabel: string }
  /**
   * 中出个数（对齐官方「中出条件」）：开奖号中包含 dan 的个数 ∈ [start, end]。
   * dedupe=true 表示「重」口径——对子/豹子按 1 个号计算（unique 去重）；
   * dedupe=false 按出现次数计。pei 为配码（任一命中才整条命中，沿用 draw 语义）。
   */
  | { kind: 'countOfDan'; dan: number[]; pei: number[]; start: number; end: number; dedupe: boolean };

// ==================== 命中判定 ====================

/** 组合数 C(n,k) 的对数（防溢出） */
function logComb(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity;
  k = Math.min(k, n - k);
  let s = 0;
  for (let i = 0; i < k; i += 1) s += Math.log(n - i) - Math.log(i + 1);
  return s;
}

function calcAttrValue(nums: number[], key: CalcAttrKey, prevNums?: number[]): number {
  const sum = (arr: number[]) => arr.reduce((s, v) => s + v, 0);
  const span = (arr: number[]) => Math.max(...arr) - Math.min(...arr);
  switch (key) {
    case 'sum':
      return sum(nums);
    case 'sumTail':
      return sum(nums) % 10;
    case 'span':
      return span(nums);
    case 'pairSumMax': {
      let mx = 0;
      for (let i = 0; i < nums.length; i += 1)
        for (let j = i + 1; j < nums.length; j += 1)
          mx = Math.max(mx, (nums[i] + nums[j]) % 10);
      return mx;
    }
    case 'pairDiffMax': {
      let mx = 0;
      for (let i = 0; i < nums.length; i += 1)
        for (let j = i + 1; j < nums.length; j += 1)
          mx = Math.max(mx, Math.abs(nums[i] - nums[j]));
      return mx;
    }
    case 'sumAmp':
      if (!prevNums) return 0;
      return Math.abs(sum(nums) - sum(prevNums));
    case 'spanAmp':
      if (!prevNums) return 0;
      return Math.abs(span(nums) - span(prevNums));
    case 'baiAmp':
      if (!prevNums || nums.length < 3) return 0;
      return Math.abs(nums[posIndex('bai', nums.length)] - prevNums[posIndex('bai', prevNums.length)]);
    case 'shiAmp':
      if (!prevNums || nums.length < 2) return 0;
      return Math.abs(nums[posIndex('shi', nums.length)] - prevNums[posIndex('shi', prevNums.length)]);
    case 'geAmp':
      if (!prevNums || nums.length < 1) return 0;
      return Math.abs(nums[posIndex('ge', nums.length)] - prevNums[posIndex('ge', prevNums.length)]);
    case 'qianAmp':
      if (!prevNums || nums.length < 4) return 0;
      return Math.abs(nums[posIndex('qian', nums.length)] - prevNums[posIndex('qian', prevNums.length)]);
    case 'wanAmp':
      if (!prevNums || nums.length < 5) return 0;
      return Math.abs(nums[posIndex('wan', nums.length)] - prevNums[posIndex('wan', prevNums.length)]);
    case 'sumTailAmp':
      if (!prevNums) return 0;
      return Math.abs(sum(nums) % 10 - sum(prevNums) % 10);
    case 'front2Sum':
      return nums[0] + nums[1];
    case 'back2Sum':
      return nums[nums.length - 2] + nums[nums.length - 1];
  }
}

export function isHit(record: DrawRecord, target: Target, prevRecord?: DrawRecord): boolean {
  const prevNums = prevRecord?.nums;
  const nums = record.nums;
  switch (target.kind) {
    case 'digit': {
      if (target.pos === 'any') return nums.includes(target.digit);
      return nums[posIndex(target.pos, nums.length)] === target.digit;
    }
    case 'setAttr': {
      const set = SET_ATTRS[target.attrKey].values[target.attrValue];
      if (!set) return false;
      if (target.pos === 'any') return nums.some((n) => set.has(n));
      return set.has(nums[posIndex(target.pos, nums.length)]);
    }
    case 'calcAttr': {
      return calcAttrValue(nums, target.calcKey, prevNums) === target.value;
    }
    case 'set': {
      // 直选集合：精确匹配（123 与 321 是不同注）
      const code = nums.join('');
      return target.codes.has(code);
    }
    case 'kl8Combo': {
      const codeSet = new Set(target.codes);
      let hitCount = 0;
      for (const n of nums) if (codeSet.has(n)) hitCount += 1;
      if (target.matchMode === 'all') return hitCount === target.codes.length;
      if (target.matchMode === 'any') return hitCount >= 1;
      return hitCount === (target.matchCount ?? 1);
    }
    case 'kl8Dantuo': {
      const danSet = new Set(target.dan);
      const tuoSet = new Set(target.tuo);
      let danHit = 0, tuoHit = 0;
      for (const n of nums) {
        if (danSet.has(n)) danHit += 1;
        else if (tuoSet.has(n)) tuoHit += 1;
      }
      return target.danCounts.includes(danHit) && target.tuoCounts.includes(tuoHit);
    }
    case 'kl8Fushi': {
      const codeSet = new Set(target.codes);
      let hit = 0;
      for (const n of nums) if (codeSet.has(n)) hit += 1;
      return hit >= target.playSize;
    }
    case 'countOfDan': {
      // 中出个数：开奖号包含胆码的个数落在 [start, end] 才命中
      const danSet = new Set(target.dan);
      let c: number;
      if (target.dedupe) {
        // 「重」口径：对子/豹子按 1 个号计算
        const seen = new Set<number>();
        for (const n of nums) if (danSet.has(n)) seen.add(n);
        c = seen.size;
      } else {
        c = 0;
        for (const n of nums) if (danSet.has(n)) c += 1;
      }
      if (c < target.start || c > target.end) return false;
      if (target.pei.length > 0 && !target.pei.some((p) => nums.includes(p))) return false;
      return true;
    }
    case 'shapeSet': {
      const sorted = [...nums].sort((a, b) => a - b).join('');
      return target.codes.has(sorted);
    }
  }
}

// ==================== 概率计算 ====================

function countCombinations(
  V: number,
  D: number,
  predicate: (nums: number[]) => boolean,
): number {
  let count = 0;
  const nums = new Array(D).fill(0);
  const recurse = (idx: number) => {
    if (idx === D) {
      if (predicate(nums)) count += 1;
      return;
    }
    for (let v = 0; v < V; v += 1) {
      nums[idx] = v;
      recurse(idx + 1);
    }
  };
  recurse(0);
  return count;
}

export function getProbability(
  target: Target,
  V: number,
  D: number,
  mode: SamplingMode = 'independent',
): number {
  switch (target.kind) {
    case 'digit': {
      if (mode === 'hypergeometric') {
        // 快乐8：从 V 个号中开 D 个不重复号，命中任一固定号的概率 = D/V
        if (target.pos === 'any') return D / V;
        return 1 / V;
      }
      if (target.pos === 'any') return 1 - Math.pow((V - 1) / V, D);
      return 1 / V;
    }
    case 'setAttr': {
      const set = SET_ATTRS[target.attrKey].values[target.attrValue];
      if (!set) return 0;
      const k = set.size;
      if (target.pos === 'any') return 1 - Math.pow((V - k) / V, D);
      return k / V;
    }
    case 'calcAttr': {
      const cnt = countCombinations(V, D, (nums) => calcAttrValue(nums, target.calcKey) === target.value);
      return cnt / Math.pow(V, D);
    }
    case 'set': {
      return target.codes.size / Math.pow(V, D);
    }
    case 'countOfDan': {
      // 仅数字型游戏（V≤10 位枚举）；kl8 等大号池不提供该口径
      if (V > 10) return D / V;
      const cnt = countCombinations(V, D, (nums) => isHit({ nums } as unknown as DrawRecord, target));
      return cnt / Math.pow(V, D);
    }
    case 'kl8Combo': {
      // 超几何分布：从 V 个号开 D 个；选 N 个号
      const N = target.codes.length;
      const logTotal = logComb(V, D);
      if (target.matchMode === 'all') {
        if (N > D) return 0;
        return Math.exp(logComb(V - N, D - N) - logTotal);
      }
      if (target.matchMode === 'any') {
        return 1 - Math.exp(logComb(V - N, D) - logTotal);
      }
      const K = target.matchCount ?? 1;
      if (K > N || K > D || K < 0) return 0;
      return Math.exp(logComb(N, K) + logComb(V - N, D - K) - logTotal);
    }
    case 'kl8Dantuo': {
      const danSize = target.dan.length;
      const tuoSize = target.tuo.length;
      const N = danSize + tuoSize;
      if (N > V || N > 80) return 0;
      const logTotal = logComb(V, D);
      let p = 0;
      for (const dk of target.danCounts) {
        if (dk < 0 || dk > danSize || dk > D) continue;
        for (const tk of target.tuoCounts) {
          if (tk < 0 || tk > tuoSize) continue;
          if (dk + tk > D) continue;
          const rem = D - dk - tk;
          if (rem > V - N) continue;
          const lp = logComb(danSize, dk) + logComb(tuoSize, tk) + logComb(V - N, rem) - logTotal;
          p += Math.exp(lp);
        }
      }
      return p;
    }
    case 'kl8Fushi': {
      const N = target.codes.length;
      const K = target.playSize;
      if (K > N || K > D) return 0;
      const logTotal = logComb(V, D);
      let p = 0;
      for (let hit = K; hit <= Math.min(N, D); hit += 1) {
        const rem = D - hit;
        if (rem > V - N) continue;
        const lp = logComb(N, hit) + logComb(V - N, rem) - logTotal;
        p += Math.exp(lp);
      }
      return p;
    }
    case 'shapeSet': {
      // 统计集合覆盖的直选号码数
      let covered = 0;
      for (const code of target.codes) {
        const uniq = new Set(code).size;
        if (uniq === 1) covered += 1;      // 豹子
        else if (uniq === 2) covered += 3; // 组三
        else covered += 6;                 // 组六
      }
      return covered / Math.pow(V, D);
    }
  }
}

export function getTheoryMiss(
  target: Target,
  V: number,
  D: number,
  mode: SamplingMode = 'independent',
): number {
  const p = getProbability(target, V, D, mode);
  return p > 0 ? (1 - p) / p : 0;
}

// ==================== 序列构建 ====================

export type TargetPoint = {
  issue: string;
  hit: 0 | 1;
  omission: number;
  cumHit: number;
  cumTheory: number;
  diff: number;
};

export function buildTargetSeries(
  records: DrawRecord[],
  target: Target,
  V: number,
  D: number,
  mode: SamplingMode = 'independent',
): TargetPoint[] {
  const p = getProbability(target, V, D, mode);
  const out: TargetPoint[] = [];
  let omission = 0;
  let cumHit = 0;
  for (let i = 0; i < records.length; i += 1) {
    const hit = isHit(records[i], target, i > 0 ? records[i - 1] : undefined) ? 1 : 0;
    if (hit) {
      omission = 0;
      cumHit += 1;
    } else {
      omission += 1;
    }
    const cumTheory = (i + 1) * p;
    out.push({
      issue: records[i].issue,
      hit,
      omission,
      cumHit,
      cumTheory: Number(cumTheory.toFixed(4)),
      diff: Number((cumHit - cumTheory).toFixed(4)),
    });
  }
  return out;
}

// ==================== 区间统计（对齐官方「区间统计」） ====================

export type WindowStats = {
  /** 区间期数 */
  total: number;
  /** 中出次数 */
  hits: number;
  /** 理论中出次数 = 期数 / 理论周期 */
  theoryHits: number;
  /** 最大连开 */
  maxRun: number;
  /** 最大遗漏 */
  maxOmission: number;
  /** 当前遗漏（区间最后一点） */
  curOmission: number;
  /** 开出率 */
  rate: number;
  /** 理论周期 */
  theoryMiss: number;
  /** 区间首期 / 末期期号 */
  firstIssue: string;
  lastIssue: string;
};

/**
 * 对一段目标序列做区间统计：
 * 对齐官方「点击右键框定区间 → 区间统计」给出的
 * 中出个数、最大遗漏、最大连开、开出率、理论周期内外等数据。
 */
export function windowStats(series: TargetPoint[], theoryMiss: number): WindowStats {
  let hits = 0;
  let maxRun = 0;
  let run = 0;
  let maxOmission = 0;
  for (const p of series) {
    if (p.hit) {
      hits += 1;
      run += 1;
      if (run > maxRun) maxRun = run;
    } else {
      run = 0;
    }
    if (p.omission > maxOmission) maxOmission = p.omission;
  }
  const total = series.length;
  const p = theoryMiss > 0 ? 1 / theoryMiss : 0;
  return {
    total,
    hits,
    theoryHits: Number((total * p).toFixed(1)),
    maxRun,
    maxOmission,
    curOmission: total > 0 ? series[total - 1].omission : 0,
    rate: total > 0 ? hits / total : 0,
    theoryMiss,
    firstIssue: total > 0 ? series[0].issue : '',
    lastIssue: total > 0 ? series[total - 1].issue : '',
  };
}

// ==================== 标签生成 ====================

export function getTargetLabel(target: Target): string {
  switch (target.kind) {
    case 'digit':
      return target.pos === 'any'
        ? `数字 ${target.digit}`
        : `${POS_LABEL[target.pos]}数字 ${target.digit}`;
    case 'setAttr':
      return target.pos === 'any'
        ? `${SET_ATTRS[target.attrKey].label} · ${target.attrValue}`
        : `${POS_LABEL[target.pos]}${SET_ATTRS[target.attrKey].label} · ${target.attrValue}`;
    case 'calcAttr':
      return `${CALC_ATTRS[target.calcKey].label} = ${target.value}`;
    case 'set':
      return `缩水集合（${target.codes.size}注）`;
    case 'countOfDan': {
      const span = target.start === target.end ? `${target.start}个` : `${target.start}-${target.end}个`;
      return `中出${span}${target.dedupe ? '(重)' : ''} · 胆[${target.dan.join('')}]`;
    }
    case 'kl8Combo': {
      const codes = target.codes.map((c) => String(c).padStart(2, '0')).join(' ');
      const mode = target.matchMode === 'all' ? '全中'
        : target.matchMode === 'any' ? '至少中1'
        : `中${target.matchCount ?? 1}个`;
      return `${mode} · ${codes}`;
    }
    case 'kl8Dantuo': {
      const danS = target.dan.map((c) => String(c).padStart(2, '0')).join(' ');
      const tuoS = target.tuo.map((c) => String(c).padStart(2, '0')).join(' ');
      return `胆中[${target.danCounts.join(',')}] 拖中[${target.tuoCounts.join(',')}] · 胆[${danS}] 拖[${tuoS}]`;
    }
    case 'kl8Fushi': {
      const codes = target.codes.map((c) => String(c).padStart(2, '0')).join(' ');
      return `选${target.playSize} 复式 · ${codes}`;
    }
    case 'shapeSet': {
      return `${target.shapeLabel} · ${target.codes.size} 注`;
    }
  }
}

export function getTargetShortLabel(target: Target): string {
  switch (target.kind) {
    case 'digit':
      return target.pos === 'any' ? `胆${target.digit}` : `${POS_LABEL[target.pos]}${target.digit}`;
    case 'setAttr':
      return target.pos === 'any'
        ? `${SET_ATTRS[target.attrKey].label}${target.attrValue}`
        : `${POS_LABEL[target.pos]}${SET_ATTRS[target.attrKey].label}${target.attrValue}`;
    case 'calcAttr':
      return `${CALC_ATTRS[target.calcKey].label}${target.value}`;
    case 'set':
      return `集合(${target.codes.size})`;
    case 'countOfDan':
      return `中出${target.start}个`;
    case 'kl8Combo': {
      const mode = target.matchMode === 'all' ? '全中'
        : target.matchMode === 'any' ? '任意'
        : `中${target.matchCount ?? 1}`;
      return `${mode}${target.codes.length}选`;
    }
    case 'kl8Dantuo':
      return `胆${target.danCounts.length}档 拖${target.tuoCounts.length}档`;
    case 'kl8Fushi':
      return `选${target.playSize}${target.codes.length}复式`;
    case 'shapeSet':
      return `${target.shapeLabel}${target.codes.size}注`;
  }
}


// ==================== 原始值序列（用于振幅等） ====================

export type RawPoint = {
  issue: string;
  value: number;
};

/**
 * 生成每个 CalcAttrKey 的原始值序列（不做命中判断）。
 * 用于"振幅"这类值走势图。
 */
export type Kl8Category = 'tail' | 'road' | 'zone4' | 'zone8';

function kl8CategoryMatch(n: number, category: Kl8Category, value: number): boolean {
  switch (category) {
    case 'tail':
      return n % 10 === value;
    case 'road':
      return n % 3 === value;
    case 'zone4':
      return Math.floor((n - 1) / 20) === value;
    case 'zone8':
      return Math.floor((n - 1) / 10) === value;
  }
}

/** 快乐8 分类统计：每期 20 个号里，属于该分类的号有几个（0-D） */
export function buildKl8CategorySeries(
  records: DrawRecord[],
  category: Kl8Category,
  value: number,
): RawPoint[] {
  const out: RawPoint[] = [];
  for (const r of records) {
    let cnt = 0;
    for (const n of r.nums) {
      if (kl8CategoryMatch(n, category, value)) cnt += 1;
    }
    out.push({ issue: r.issue, value: cnt });
  }
  return out;
}

export function buildRawSeries(
  records: DrawRecord[],
  calcKey: CalcAttrKey,
): RawPoint[] {
  const out: RawPoint[] = [];
  for (let i = 0; i < records.length; i += 1) {
    const prev = i > 0 ? records[i - 1] : undefined;
    const v = calcAttrValue(records[i].nums, calcKey, prev?.nums);
    out.push({ issue: records[i].issue, value: v });
  }
  return out;
}


export type ShapeMainMode = 'zhixuan' | 'zuxuan';
export type ShapeFilter = 'zusan' | 'zuliu';
export type ShapeMode = ShapeMainMode | ShapeFilter;

/**
 * 按形态生成号码集合（字符串数组，如 ['223','232',...]）
 *   zhixuan: 全部 1000 注（默认，不筛选）
 *   zuxuan:  组三 + 组六（去重形式），约 270 注
 *   zusan:   组三（有对子），90 种组合 × 3 位置 = 270 注（直选展开）
 *   zuliu:   组六（三不同），120 种组合 × 6 位置 = 720 注（直选展开）
 *
 * digits 为空时用全 0-9；有值时只在 digits 内组合。
 */
export function buildShapeCodes(
  digits: number[],
  mainMode: ShapeMainMode,
  shapeFilters: ShapeFilter[],
): string[] {
  const out = new Set<string>();
  const S = new Set(digits);
  const n = digits.length;
  const shapeActive = shapeFilters.length > 0;
  const allowZusan = !shapeActive || shapeFilters.includes('zusan');
  const allowZuliu = !shapeActive || shapeFilters.includes('zuliu');
  const allowLeopard = !shapeActive;

  for (let a = 0; a <= 9; a += 1)
    for (let b = a; b <= 9; b += 1)
      for (let c = b; c <= 9; c += 1) {
        const nums = [a, b, c];
        const uniq = new Set(nums).size;

        if (uniq === 1 && !allowLeopard) continue;
        if (uniq === 2 && !allowZusan) continue;
        if (uniq === 3 && !allowZuliu) continue;

        if (n > 0) {
          if (n <= 3) {
            if (!digits.every((d) => nums.includes(d))) continue;
          } else {
            if (!nums.every((d) => S.has(d))) continue;
          }
        }

        // 统一返回组选形式（排序后）
        out.add(`${a}${b}${c}`);
      }

  return [...out];
}

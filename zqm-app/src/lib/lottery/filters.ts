/**
 * 号码属性与组号过滤
 *
 * 「组号工具」的全部过滤参数都在这里：数字类型、奇偶特征、组合形态、二码、
 * 定位、除N余数、计重胆、断组等。每个过滤器是一个纯函数 (nums, cfg) => boolean。
 */

/** ---------- 号码属性计算 ---------- */

/** 和值 */
export function sumOf(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}

/** 跨度 = 最大 − 最小 */
export function spanOf(nums: number[]): number {
  if (!nums.length) return 0;
  return Math.max(...nums) - Math.min(...nums);
}

/** 奇数个数 */
export function oddCount(nums: number[]): number {
  return nums.filter((n) => n % 2 === 1).length;
}

/** 大数个数（5-9 为大） */
export function bigCount(nums: number[]): number {
  return nums.filter((n) => n >= 5).length;
}

/** 质数个数（2,3,5,7） */
export function primeCount(nums: number[]): number {
  return nums.filter((n) => [2, 3, 5, 7].includes(n)).length;
}

/** 012路：每个数字 mod 3 */
export function roadOf(nums: number[]): number[] {
  return nums.map((n) => n % 3);
}

/** 各路个数统计 */
export function roadCount(nums: number[]): [number, number, number] {
  const r = roadOf(nums);
  return [
    r.filter((x) => x === 0).length,
    r.filter((x) => x === 1).length,
    r.filter((x) => x === 2).length,
  ];
}

/** AC 值 = 任意两数之差的绝对值的不同个数 − (位数 − 1) */
export function acValue(nums: number[]): number {
  const diffs = new Set<number>();
  for (let i = 0; i < nums.length; i += 1) {
    for (let j = i + 1; j < nums.length; j += 1) {
      diffs.add(Math.abs(nums[i] - nums[j]));
    }
  }
  return diffs.size - (nums.length - 1);
}

/** 与上一期的重号个数（同位同码） */
export function repeatCount(nums: number[], prev: number[]): number {
  let c = 0;
  for (let i = 0; i < nums.length; i += 1) {
    if (nums[i] === prev[i]) c += 1;
  }
  return c;
}

/** 与上一期的邻号个数（相差 1，0 与 9 视为相邻） */
export function adjacentCount(nums: number[], prev: number[]): number {
  const near = (a: number, b: number) => {
    if (a === b) return false;
    const d = Math.abs(a - b);
    return d === 1 || d === 9;
  };
  let c = 0;
  for (const n of nums) {
    if (prev.some((p) => near(n, p))) c += 1;
  }
  return c;
}

/** 组选形态：豹子 / 组三 / 组六 / 其它 */
export function groupForm(nums: number[]): 'baozi' | 'zusan' | 'zuliu' | 'other' {
  const counts = new Map<number, number>();
  for (const n of nums) counts.set(n, (counts.get(n) ?? 0) + 1);
  const uniq = counts.size;
  if (nums.length === 3) {
    if (uniq === 1) return 'baozi';
    if (uniq === 2) return 'zusan';
    return 'zuliu';
  }
  return uniq === 1 ? 'baozi' : 'other';
}

/** 升/降/凸/凹 形态（以 3 位为例） */
export function shapeForm(nums: number[]): string {
  if (nums.length < 3) return '-';
  const [a, b, c] = nums;
  if (a === b && b === c) return '豹子';
  if (a < b && b < c) return '上山';
  if (a > b && b > c) return '下山';
  if (b < a && b < c) return '凹';
  if (b > a && b > c) return '凸';
  return '其它';
}

/** 和值尾数（合值） */
export function tailOf(nums: number[]): number {
  return sumOf(nums) % 10;
}

/** 除 N 余数分布 */
export function moduloCount(nums: number[], n = 5): number[] {
  const out = new Array(n).fill(0);
  for (const v of nums) out[v % n] += 1;
  return out;
}

/** ---------- 过滤器定义 ---------- */

export interface FilterContext {
  /** 上一期号码（用于重号/邻号/孤号/传号判断） */
  prev?: number[];
  /** 上上期号码 */
  prev2?: number[];
}

export type FilterTest = (nums: number[], cfg: any, ctx: FilterContext) => boolean;

export interface FilterDef {
  id: string;
  name: string;
  /** 参数说明（界面提示用） */
  hint: string;
  test: FilterTest;
}

const inRange = (v: number, lo?: number, hi?: number) => {
  if (lo != null && v < lo) return false;
  if (hi != null && v > hi) return false;
  return true;
};

export const FILTERS: FilterDef[] = [
  {
    id: 'sum',
    name: '和值',
    hint: '和值落在 [小, 大] 区间',
    test: (nums, cfg) => inRange(sumOf(nums), cfg.min, cfg.max),
  },
  {
    id: 'span',
    name: '跨度',
    hint: '最大值与最小值之差',
    test: (nums, cfg) => inRange(spanOf(nums), cfg.min, cfg.max),
  },
  {
    id: 'tail',
    name: '合值',
    hint: '和值的个位数',
    test: (nums, cfg) => inRange(tailOf(nums), cfg.min, cfg.max),
  },
  {
    id: 'odd',
    name: '奇数个数',
    hint: '奇数个数落在区间',
    test: (nums, cfg) => inRange(oddCount(nums), cfg.min, cfg.max),
  },
  {
    id: 'big',
    name: '大数个数',
    hint: '5-9 视为大数',
    test: (nums, cfg) => inRange(bigCount(nums), cfg.min, cfg.max),
  },
  {
    id: 'prime',
    name: '质数个数',
    hint: '2/3/5/7 视为质数',
    test: (nums, cfg) => inRange(primeCount(nums), cfg.min, cfg.max),
  },
  {
    id: 'road',
    name: '012路个数',
    hint: '指定某一路（0/1/2）的个数',
    test: (nums, cfg) => {
      const c = roadCount(nums);
      return inRange(c[cfg.road ?? 0], cfg.min, cfg.max);
    },
  },
  {
    id: 'ac',
    name: 'AC 值',
    hint: '差值个数 −（位数−1）',
    test: (nums, cfg) => inRange(acValue(nums), cfg.min, cfg.max),
  },
  {
    id: 'repeat',
    name: '重号个数',
    hint: '与上一期同位相同的个数',
    test: (nums, cfg, ctx) => (ctx.prev ? inRange(repeatCount(nums, ctx.prev), cfg.min, cfg.max) : true),
  },
  {
    id: 'adjacent',
    name: '邻号个数',
    hint: '与上一期相差 1 的个数（0 与 9 相邻）',
    test: (nums, cfg, ctx) =>
      ctx.prev ? inRange(adjacentCount(nums, ctx.prev), cfg.min, cfg.max) : true,
  },
  {
    id: 'form',
    name: '组选形态',
    hint: '豹子 / 组三 / 组六',
    test: (nums, cfg) => {
      if (!cfg.forms?.length) return true;
      return cfg.forms.includes(groupForm(nums));
    },
  },
  {
    id: 'modulo',
    name: '除N余数',
    hint: '指定余数的个数落在区间',
    test: (nums, cfg) => {
      const c = moduloCount(nums, cfg.n ?? 5);
      return inRange(c[cfg.rem ?? 0], cfg.min, cfg.max);
    },
  },
  {
    id: 'pair',
    name: '二码组合',
    hint: '指定两个数字是否同时出现',
    test: (nums, cfg) => {
      if (!cfg.pairs?.length) return true;
      return cfg.pairs.some((p: number[]) => p.every((d: number) => nums.includes(d)));
    },
  },
  {
    id: 'fixed',
    name: '定位',
    hint: '指定某位必须是某数字',
    test: (nums, cfg) => {
      if (!cfg.slots?.length) return true;
      return cfg.slots.every((s: { index: number; digit: number }) => nums[s.index] === s.digit);
    },
  },
  {
    id: 'weight',
    name: '计重胆',
    hint: '指定数字出现个数落在区间',
    test: (nums, cfg) => {
      if (!cfg.digits?.length) return true;
      const c = nums.filter((n: number) => cfg.digits.includes(n)).length;
      return inRange(c, cfg.min, cfg.max);
    },
  },
  {
    id: 'break',
    name: '断组',
    hint: '指定数字最多出现 N 个',
    test: (nums, cfg) => {
      if (!cfg.digits?.length) return true;
      const c = nums.filter((n: number) => cfg.digits.includes(n)).length;
      return c <= (cfg.max ?? 1);
    },
  },
];

export function getFilter(id: string): FilterDef | undefined {
  return FILTERS.find((f) => f.id === id);
}

/**
 * 按位笛卡尔积生成全部组合。
 * @param slots 每个位上允许的数字数组，如 [[1,2],[3],[4,5]]
 * @returns 组合数字数组，如 [[1,3,4],[1,3,5],[2,3,4],[2,3,5]]
 */
export function cartesian(slots: number[][]): number[][] {
  if (!slots.length) return [];
  let out: number[][] = [[]];
  for (const slot of slots) {
    const next: number[][] = [];
    for (const prefix of out) {
      for (const d of slot) next.push([...prefix, d]);
    }
    out = next;
  }
  return out;
}

/** 组合总数（用于缩水前预估，避免一次性炸内存） */
export function cartesianSize(slots: number[][]): number {
  return slots.reduce((a, s) => a * (s?.length ?? 0), 1);
}

/**
 * 分析计算层 —— 纯函数，无副作用
 *
 * 约定：records 为「正序」数组（index 0 最旧，末尾最新）。
 * 所有函数默认分析最新一期（endIndex = records.length - 1）。
 */
import type {
  CycleCountPoint,
  DigitStat,
  DrawRecord,
  TemperatureStatus,
  TrendPoint,
} from './types';

/** 安全求和 */
function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}

/** 和值：百 + 十 + 个 */
export function calcSum(nums: number[]): number {
  return sum(nums);
}

/** 跨度：max - min */
export function calcSpan(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Math.max(...nums) - Math.min(...nums);
}

/** 和值尾（合值）：和值 % 10 */
export function calcSumTail(nums: number[]): number {
  return calcSum(nums) % 10;
}

/** 二码合：相邻两位和值尾，返回 [百十和尾, 十个和尾] */
export function calcTwoSum(nums: number[]): number[] {
  const res: number[] = [];
  for (let i = 0; i < nums.length - 1; i += 1) {
    res.push((nums[i] + nums[i + 1]) % 10);
  }
  return res;
}

/** 二码差：相邻两位差的绝对值 */
export function calcTwoDiff(nums: number[]): number[] {
  const res: number[] = [];
  for (let i = 0; i < nums.length - 1; i += 1) {
    res.push(Math.abs(nums[i] - nums[i + 1]));
  }
  return res;
}

/**
 * 计算某数字的当前遗漏（连续未开出的期数）。
 * 最新一期（endIndex）刚好开出则返回 0。
 * 若整个序列都未开出，返回 endIndex + 1。
 */
export function calcOmission(
  records: DrawRecord[],
  digit: number,
  endIndex: number = records.length - 1,
): number {
  let omission = 0;
  for (let i = endIndex; i >= 0; i -= 1) {
    if (records[i].nums.includes(digit)) break;
    omission += 1;
    if (i === 0) {
      // 从头到尾都未出现，遗漏等于已扫描期数
      break;
    }
  }
  return omission;
}

/** 计算某数字的历史最大遗漏（截至 endIndex） */
export function calcMaxOmission(
  records: DrawRecord[],
  digit: number,
  endIndex: number = records.length - 1,
): number {
  let max = 0;
  let current = 0;
  for (let i = 0; i <= endIndex; i += 1) {
    if (records[i].nums.includes(digit)) {
      current = 0;
    } else {
      current += 1;
      if (current > max) max = current;
    }
  }
  return max;
}

/** 计算某数字在窗口内的出现次数（同一期开出多次会累计，如 6,9,9 中 9 计 2 次） */
export function calcFrequency(
  records: DrawRecord[],
  digit: number,
  window: number,
  endIndex: number = records.length - 1,
): number {
  let count = 0;
  const start = Math.max(0, endIndex - window + 1);
  for (let i = start; i <= endIndex; i += 1) {
    for (const n of records[i].nums) {
      if (n === digit) count += 1;
    }
  }
  return count;
}

/**
 * 冷温热分类。
 * 期望出现次数 = 窗口期数 × 位数 ÷ 取值个数。
 * 高于期望 + 0.5 为热，低于期望 - 0.5 为冷，其余为温。
 */
export function classifyTemperature(
  frequency: number,
  window: number,
  digitCount: number,
  valueCount: number,
): TemperatureStatus {
  const expected = (window * digitCount) / valueCount;
  if (frequency > expected + 0.5) return 'hot';
  if (frequency < expected - 0.5) return 'cold';
  return 'warm';
}

/** 统计全部数字的遗漏/频率/冷温热，返回按数字排序的数组 */
export function buildDigitStats(
  records: DrawRecord[],
  digits: number[],
  window: number,
  digitCount: number,
  valueCount: number,
  endIndex: number = records.length - 1,
): DigitStat[] {
  return digits.map((digit) => {
    const omission = calcOmission(records, digit, endIndex);
    const frequency = calcFrequency(records, digit, window, endIndex);
    const temperature = classifyTemperature(frequency, window, digitCount, valueCount);
    const maxOmission = calcMaxOmission(records, digit, endIndex);
    return { digit, omission, frequency, temperature, maxOmission };
  });
}

/** 最近一期的冷码/温码/热码列表（按数字升序） */
export function getColdWarmHot(
  stats: DigitStat[],
): { cold: number[]; warm: number[]; hot: number[] } {
  const cold: number[] = [];
  const warm: number[] = [];
  const hot: number[] = [];
  for (const s of stats) {
    if (s.temperature === 'cold') cold.push(s.digit);
    else if (s.temperature === 'warm') warm.push(s.digit);
    else hot.push(s.digit);
  }
  return { cold, warm, hot };
}

/**
 * 构建号码走势序列（供 K 线图）。
 * hit = 本期该号码是否开出（同一期开出多次按 1 记，用于红蓝柱）。
 * ma[n] = 最近 n 期的开出率移动平均（0..1）。
 * boll = 基于固定窗口的布林通道。
 */
export function buildTrendSeries(
  records: DrawRecord[],
  digit: number,
  maPeriods: number[],
  bollPeriod: number,
  bollK: number,
  endIndex: number = records.length - 1,
): TrendPoint[] {
  const points: TrendPoint[] = [];

  for (let i = 0; i <= endIndex; i += 1) {
    const hit = records[i].nums.includes(digit) ? 1 : 0;
    const ma: Record<string, number | null> = {};
    for (const p of maPeriods) {
      const start = i - p + 1;
      const count = Math.min(p, i + 1);
      if (count <= 0) {
        ma[String(p)] = null;
        continue;
      }
      let s = 0;
      for (let j = Math.max(0, start); j <= i; j += 1) {
        s += records[j].nums.includes(digit) ? 1 : 0;
      }
      ma[String(p)] = s / count;
    }

    // 布林通道
    let boll: TrendPoint['boll'] = null;
    if (i + 1 >= bollPeriod) {
      const start = i - bollPeriod + 1;
      let s = 0;
      for (let j = start; j <= i; j += 1) {
        s += records[j].nums.includes(digit) ? 1 : 0;
      }
      const mid = s / bollPeriod;
      let variance = 0;
      for (let j = start; j <= i; j += 1) {
        const v = (records[j].nums.includes(digit) ? 1 : 0) - mid;
        variance += v * v;
      }
      const std = Math.sqrt(variance / bollPeriod);
      boll = { mid, upper: mid + bollK * std, lower: Math.max(0, mid - bollK * std) };
    }

    points.push({ issue: records[i].issue, date: records[i].date, hit, ma, boll });
  }
  return points;
}

/**
 * 周期出次统计（供遗漏图上部）。
 * 将最近 endIndex+1 期按 cycle 期分组，统计每组内数字出现次数。
 * 返回按时间正序的数组。
 */
export function buildCycleCount(
  records: DrawRecord[],
  digit: number,
  cycle: number,
  endIndex: number = records.length - 1,
): CycleCountPoint[] {
  const result: CycleCountPoint[] = [];
  const total = endIndex + 1;
  // 从最新一期往前分组，最后反转成正序
  const reversed: CycleCountPoint[] = [];
  let cursor = endIndex;
  while (cursor >= 0) {
    const start = Math.max(0, cursor - cycle + 1);
    let count = 0;
    for (let i = start; i <= cursor; i += 1) {
      for (const n of records[i].nums) {
        if (n === digit) count += 1;
      }
    }
    reversed.push({
      startIssue: records[start].issue,
      endIssue: records[cursor].issue,
      count,
    });
    cursor = start - 1;
  }
  return reversed.reverse();
}

/**
 * 遗漏序列（供遗漏图下部）：每期结束后该数字的遗漏值走势。
 * 返回数组元素为 { issue, omission }，正序。
 */
export function buildOmissionSeries(
  records: DrawRecord[],
  digit: number,
  endIndex: number = records.length - 1,
): { issue: string; omission: number }[] {
  const res: { issue: string; omission: number }[] = [];
  let omission = 0;
  for (let i = 0; i <= endIndex; i += 1) {
    if (records[i].nums.includes(digit)) {
      omission = 0;
    } else {
      omission += 1;
    }
    res.push({ issue: records[i].issue, omission });
  }
  return res;
}
/**
 * 构建「每一期」的遗漏走势数据（不只是开出点）。
 * 用于画完整的遗漏折线图。
 */
export function buildAllOmissionSeries(
  records: DrawRecord[],
  digit: number,
  endIndex: number = records.length - 1,
): { issue: string; omission: number }[] {
  const res: { issue: string; omission: number }[] = [];
  let omission = 0;
  for (let i = 0; i <= endIndex; i += 1) {
    if (records[i].nums.includes(digit)) {
      omission = 0;
    } else {
      omission += 1;
    }
    res.push({ issue: records[i].issue, omission });
  }
  return res;
}
/** 最近 N 期各数字出现次数（供频率统计图），键为数字 0-9 */
export function buildFrequencyMap(
  records: DrawRecord[],
  digits: number[],
  window: number,
  endIndex: number = records.length - 1,
): Record<number, number> {
  const map: Record<number, number> = {};
  for (const d of digits) {
    map[d] = calcFrequency(records, d, window, endIndex);
  }
  return map;
}

/** 移动平均（适用于任意数值序列），返回与输入等长的数组，数据不足处为 null */
export function movingAverage(
  values: number[],
  period: number,
): (number | null)[] {
  return values.map((_, i) => {
    if (i + 1 < period) return null;
    let s = 0;
    for (let j = i - period + 1; j <= i; j += 1) s += values[j];
    return s / period;
  });
}


/** 位置类型（同时支持 3 位 百/十/个 与 5 位 万/千/百/十/个） */
export type PosKey = 'any' | 'wan' | 'qian' | 'bai' | 'shi' | 'ge';

/**
 * 判断某期是否命中（按位置）。
 * 采用「从右往左」下标，自动适配位数：
 *   ge=末位, shi=末-1, bai=末-2, qian=末-3, wan=末-4
 * 3 位 → bai=0/shi=1/ge=2；5 位 → wan=0/qian=1/bai=2/shi=3/ge=4。
 */
export function isHitByPos(nums: number[], digit: number, pos: PosKey): boolean {
  if (pos === 'any') return nums.includes(digit);
  const fromRight: Record<Exclude<PosKey, 'any'>, number> = {
    ge: 0,
    shi: 1,
    bai: 2,
    qian: 3,
    wan: 4,
  };
  const idx = nums.length - 1 - fromRight[pos];
  return idx >= 0 && nums[idx] === digit;
}

/** 按位置构建趋势点（K线） */
export function buildTrendSeriesByPos(
  records: DrawRecord[],
  digit: number,
  pos: PosKey = 'any',
  maPeriods: number[] = [5, 10, 20],
  stdMultiplier = 2,
  limit = 120,
): TrendPoint[] {
  const recent = records.slice(-limit);
  const hitFlags = recent.map((r) => isHitByPos(r.nums, digit, pos));

  // 均线
  const maOf = (period: number, idx: number): number | null => {
    if (idx < period - 1) return null;
    let sum = 0;
    for (let i = idx - period + 1; i <= idx; i++) sum += hitFlags[i] ? 1 : 0;
    return sum / period;
  };

  // 布林通道（基于 hit 0/1 序列）
  const bollOf = (period: number, idx: number, std: number) => {
    if (idx < period - 1) return null;
    const window: number[] = [];
    for (let i = idx - period + 1; i <= idx; i++) window.push(hitFlags[i] ? 1 : 0);
    const avg = window.reduce((a, b) => a + b, 0) / period;
    const variance = window.reduce((a, b) => a + (b - avg) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    return {
      mid: avg,
      upper: avg + std * sd,
      lower: avg - std * sd,
    };
  };

  return recent.map((r, i) => {
    const ma: Record<string, number | null> = {};
    for (const p of maPeriods) ma[String(p)] = maOf(p, i);
    return {
      issue: r.issue,
      date: '',
      hit: hitFlags[i] ? 1 : 0,
      ma,
      boll: bollOf(20, i, stdMultiplier),
    };
  });
}


/** 按位置构建遗漏走势（每一期） */
export function buildOmissionSeriesByPos(
  records: DrawRecord[],
  digit: number,
  pos: PosKey = 'any',
  endIndex: number = records.length - 1,
): { issue: string; omission: number }[] {
  const res: { issue: string; omission: number }[] = [];
  let omission = 0;
  for (let i = 0; i <= endIndex; i++) {
    if (isHitByPos(records[i].nums, digit, pos)) {
      omission = 0;
    } else {
      omission += 1;
    }
    res.push({ issue: records[i].issue, omission });
  }
  return res;
}

/** 按位置构建遗漏序列（只包含开出点，用于红球标记） */
export function buildOmissionOnlyOpenByPos(
  records: DrawRecord[],
  digit: number,
  pos: PosKey = 'any',
  endIndex: number = records.length - 1,
): { issue: string; omission: number }[] {
  const res: { issue: string; omission: number }[] = [];
  let omission = 0;
  for (let i = 0; i <= endIndex; i++) {
    if (isHitByPos(records[i].nums, digit, pos)) {
      res.push({ issue: records[i].issue, omission });
      omission = 0;
    } else {
      omission += 1;
    }
  }
  return res;
}

/** 周期出次（按位置） */
export function buildCycleCountByPos(
  records: DrawRecord[],
  digit: number,
  pos: PosKey,
  step: number = 5,
): { startIssue: string; endIssue: string; count: number }[] {
  const series = buildOmissionSeriesByPos(records, digit, pos);
  const res: { startIssue: string; endIssue: string; count: number }[] = [];
  for (let i = 0; i < series.length; i += step) {
    const chunk = series.slice(i, i + step);
    const hits = chunk.filter((p) => p.omission === 0).length;
    res.push({
      startIssue: chunk[0].issue,
      endIssue: chunk[chunk.length - 1].issue,
      count: hits,
    });
  }
  return res;
  
}



/** 属性类型 */
export type AttrKey = 'sum' | 'span' | 'bigSmall' | 'oddEven' | 'primeComposite' | 'pairDiff' | 'pairSum' | 'sumTail';

export function buildAttrSeries(
  records: DrawRecord[],
  attr: AttrKey,
  endIndex?: number,
): { issue: string; value: number }[] {
  if (!records || records.length === 0) return [];
  const end = Math.min(
    endIndex ?? records.length - 1,
    records.length - 1,
  );
  const res: { issue: string; value: number }[] = [];
  for (let i = 0; i <= end; i++) {
    const r = records[i];
    if (!r || !r.nums) continue;
    const [a, b, c] = r.nums;
    let value = 0;
    switch (attr) {
      case 'sum':
        value = a + b + c;
        break;
      case 'span':
        value = Math.max(a, b, c) - Math.min(a, b, c);
        break;
      case 'sumTail':
        value = (a + b + c) % 10;
        break;
      case 'bigSmall':
        value = [a, b, c].filter((n) => n >= 5).length;
        break;
      case 'oddEven':
        value = [a, b, c].filter((n) => n % 2 !== 0).length;
        break;
      case 'primeComposite': {
        const isPrime = (n: number) => n === 1 || n === 2 || n === 3 || n === 5 || n === 7;
        value = [a, b, c].filter(isPrime).length;
        break;
      }
      case 'pairSum': {
        const s1 = (a + b) % 10;
        const s2 = (a + c) % 10;
        const s3 = (b + c) % 10;
        value = Math.max(s1, s2, s3);
        break;
      }
      case 'pairDiff': {
        const d1 = Math.abs(a - b);
        const d2 = Math.abs(a - c);
        const d3 = Math.abs(b - c);
        value = Math.max(d1, d2, d3);
        break;
      }
    }
    res.push({ issue: r.issue, value });
  }
  return res;
}


/**
 * 集合累积命中次数：从第 1 期开始，每期命中 +1，未命中 +0。
 * 返回每期的累积值。
 */
export function buildSetCumulativeHits(
  records: DrawRecord[],
  numberSet: Set<string>,
  endIndex?: number,
): { issue: string; cum: number; hit: boolean }[] {
  if (!records || records.length === 0) return [];
  const end = Math.min(endIndex ?? records.length - 1, records.length - 1);
  const res: { issue: string; cum: number; hit: boolean }[] = [];
  let cum = 0;
  for (let i = 0; i <= end; i++) {
    const r = records[i];
    if (!r || !r.nums) continue;
    const code = `${r.nums[0]}${r.nums[1]}${r.nums[2]}`;
    const hit = numberSet.has(code);
    if (hit) cum += 1;
    res.push({ issue: r.issue, cum, hit });
  }
  return res;
}

/**
 * 集合累积遗漏值：每期未命中 +1，命中归 0。
 */
export function buildSetCumulativeMiss(
  records: DrawRecord[],
  numberSet: Set<string>,
  endIndex?: number,
): { issue: string; miss: number; hit: boolean }[] {
  if (!records || records.length === 0) return [];
  const end = Math.min(endIndex ?? records.length - 1, records.length - 1);
  const res: { issue: string; miss: number; hit: boolean }[] = [];
  let miss = 0;
  for (let i = 0; i <= end; i++) {
    const r = records[i];
    if (!r || !r.nums) continue;
    const code = `${r.nums[0]}${r.nums[1]}${r.nums[2]}`;
    const hit = numberSet.has(code);
    if (hit) {
      res.push({ issue: r.issue, miss: 0, hit: true });
      miss = 0;
    } else {
      miss += 1;
      res.push({ issue: r.issue, miss, hit: false });
    }
  }
  return res;
}
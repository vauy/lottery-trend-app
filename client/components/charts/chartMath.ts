/**
 * 图表数值工具 —— 主图 / 副图共用。
 * 从 EChartsFreqKChart 里抽出来，避免多联图组件重复实现同一套聚合与布林逻辑。
 */
import type { TargetPoint } from '@/lib/lottery/targets';

/** K 线实体。h / l 存在时画上下影线（周期K线），缺省则视为实体两端 */
export type KBar = { issue: string; o: number; c: number; h?: number; l?: number };

/** 周期基准：官方《周期K线》1.1 左对齐 / 1.2 右对齐 */
export type CycleAlign = 'left' | 'right';

/**
 * 按周期把逐期序列聚合成 K 线。
 *
 * 官方《周期K线》「统计模式」逐字口径：
 *   开盘值 = 第一根单期K线的开盘值
 *   最高值 = 所有单期K线的最高值中的最大值
 *   最低值 = 所有单期K线的最低值中的最小值
 *   收盘值 = 最后一根单期K线的收盘值
 *   前周期的收盘值与后周期的开盘值是相接的
 *
 * period <= 1 时逐期成 K（无影线，h/l 退化为实体两端）。
 * align = 'left' 时从数据首期往后分段（官方「以开奖日期首期为基准」，
 *   新一期只影响最新那根，前面图形不变）；
 * align = 'right' 时从最后一期往前倒推分段（官方「以投注期为基准」，
 *   每来一期整张图重新按这个基准推算）。
 */
export function aggregate(
  series: TargetPoint[],
  period: number,
  align: CycleAlign = 'left',
): KBar[] {
  // 单期 K 线：o = 上一根的收盘，c = 本期 diff，保证线段首尾相接
  const unitOHLC = (i: number): KBar => {
    const o = i === 0 ? 0 : series[i - 1].diff;
    const c = series[i].diff;
    return { issue: series[i].issue, o, c, h: Math.max(o, c), l: Math.min(o, c) };
  };

  if (period <= 1) return series.map((_, i) => unitOHLC(i));

  const n = series.length;
  // 每段是 [start, end] 的闭区间；右对齐时先丢弃头部余数，保证最后一根以最新期收尾
  const head = align === 'right' ? n % period : 0;
  const out: KBar[] = [];
  for (let start = head; start < n; start += period) {
    const end = Math.min(start + period - 1, n - 1);
    if (end < start) continue;
    const first = unitOHLC(start);
    const last = unitOHLC(end);
    let h = first.h as number;
    let l = first.l as number;
    for (let i = start; i <= end; i += 1) {
      const u = unitOHLC(i);
      if ((u.h as number) > h) h = u.h as number;
      if ((u.l as number) < l) l = u.l as number;
    }
    out.push({ issue: last.issue, o: first.o, c: last.c, h, l });
  }
  return out;
}

/**
 * 遗漏 K 线的「爬楼梯」实体，供多联图复用。
 * 原来这段写在 EChartsOmissionKChart 内部，多联图要拿同一份数值算副图指标，
 * 若再抄一份就会两处漂移，故提到这里作为唯一来源。
 */
export type OmissionBar = KBar & { isRed: boolean; pending?: boolean };

/**
 * 二阶概率 —— 遗漏K线「阳线长度」的分母。
 *
 * 官方《遗漏K线》原文 1.3：
 *   「阴线长度为 −1，阳线长度为 1/理论概率 − 1」
 * 这里的「理论概率」不是一阶概率 p，而是**二阶概率 p₂**：
 * 遗漏K线统计的是「本次遗漏是否落在理论遗漏周期内」这一事件，
 * 该事件在每一轮（约一个理论遗漏周期长）里至少开出一次的概率为
 *   p₂ = 1 − (1 − p)^(m + 1)，m = floor(理论遗漏周期) = floor((1−p)/p)
 *
 * 以三星不定位毒胆为例（V=10, D=3）：
 *   p  = 1 − 0.9³      = 0.27100  → 官方界面「理论周期」栏显示 3.69
 *   m  = floor(2.6903) = 2
 *   p₂ = 1 − 0.729³    = 0.61258  → 官方遗漏K线页显示 61.26% ✅
 * 用 p₂ 算得阳线长 1/0.61258 − 1 = 0.6324，
 * 官方截图像素实测红/绿柱高比 0.60~0.667（中心 0.633），误差 1.9%。
 * 若误用一阶 p，阳线长会是 1/0.271 − 1 = 2.690，与截图差 4 倍，可排除。
 */
export function getSecondOrderProbability(p: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const theoryMiss = (1 - p) / p;
  const m = Math.max(0, Math.floor(theoryMiss));
  return 1 - Math.pow(1 - p, m + 1);
}

/** 只知道理论遗漏周期时反推二阶概率：theoryMiss = (1−p)/p ⇒ p = 1/(1+theoryMiss) */
export function secondOrderFromTheory(theoryMiss: number): number {
  if (!(theoryMiss > 0)) return 1;
  return getSecondOrderProbability(1 / (1 + theoryMiss));
}

/**
 * 单根遗漏K线的增量（即「实体高度」，带符号）。
 * 官方口径：红（阳）= 1/p₂ − 1；绿（阴）恒定 − 1。
 *
 * 之前的实现给绿柱按超出档数做了 −1/−2/−3 循环降档，
 * 与官方「阴线长度恒为 −1」矛盾：
 * 官方截图像素实测绿柱离散度 stdev/mean = 0.021（近乎单一值），
 * 而 −1/−2/−3 会让离散度飙到 0.4 以上，可直接排除。
 */
function calcDelta(prevMiss: number, theoryMiss: number, p2: number): number {
  if (!(p2 > 0)) return 1;
  return prevMiss <= theoryMiss ? 1 / p2 - 1 : -1;
}

/**
 * 只在「开出」的那期生成一根 K：
 * 未超出理论遗漏 → 阳线（红，爬升 1/p₂ − 1）；超出 → 阴线（绿，恒定回落 1）。
 * 与用户口径一致：「红绿都是号码开出，红色是理论周期内开出，绿色是理论周期外开出」。
 */
export function buildOmissionBars(
  series: TargetPoint[],
  theoryMiss: number,
  p2: number,
): OmissionBar[] {
  const out: OmissionBar[] = [];
  let score = 0;
  for (let i = 0; i < series.length; i += 1) {
    if (series[i].hit === 1) {
      const prevMiss = i === 0 ? 0 : series[i - 1].omission;
      const delta = calcDelta(prevMiss, theoryMiss, p2);
      out.push({ issue: series[i].issue, o: score, c: score + delta, isRed: delta > 0 });
      score += delta;
    }
  }
  // 官方《遗漏K线》1.1：
  //   「当查看号码的当前遗漏已经不在所设置的范围内的时候，遗漏K线预先画一根阴线」
  // 即：号码到现在还没开出，且当前遗漏已超出理论遗漏周期（范围），
  // 就先画一根「待定」的阴线，提示「这期若开出就是阴线」。
  const last = series[series.length - 1];
  if (last && last.hit !== 1 && last.omission > theoryMiss) {
    out.push({ issue: last.issue, o: score, c: score - 1, isRed: false, pending: true });
  }
  return out;
}

/* ─────────────── 出次图 / 出次移动统计 ─────────────── */

export type ChuciPoint = { issue: string; count: number };

/**
 * 官方《出次图》：「分段出现次数曲线」
 *   「圆圈内数值为当前横坐标对应的开奖期号（含）的前 N 期内
 *    （分段周期，可以自由设定）的号码出现次数」
 * 即每个点 = 该期往前看 stepPeriod 期（含本期）的命中次数。
 *
 * @param drawBack 退期：「把最后一点的期号往前推一定的期数」—— 尾部裁掉多少期
 */
export function buildChuciSeries(
  issues: string[],
  hits: (0 | 1)[],
  stepPeriod: number,
  drawBack = 0,
): ChuciPoint[] {
  const step = Math.max(1, Math.floor(stepPeriod));
  const end = Math.max(0, issues.length - Math.max(0, Math.floor(drawBack)));
  const out: ChuciPoint[] = [];
  for (let i = 0; i < end; i += 1) {
    const from = Math.max(0, i - step + 1);
    let c = 0;
    for (let t = from; t <= i; t += 1) c += hits[t];
    out.push({ issue: issues[i], count: c });
  }
  return out;
}

/**
 * 官方《出次移动统计》：从当前期往已开方向统计统计期内的出现次数，
 * 观察「出次渐变」。与分段出次同源，差别在于它把每个统计窗口的
 * 结果当作一个**独立样本**按窗口序号排列（每步一格，看渐变量），
 * 而不是贴在每一期的横坐标上。
 */
export function buildChuciMoveSeries(
  issues: string[],
  hits: (0 | 1)[],
  stepPeriod: number,
  drawBack = 0,
): ChuciPoint[] {
  const step = Math.max(1, Math.floor(stepPeriod));
  const end = Math.max(0, issues.length - Math.max(0, Math.floor(drawBack)));
  const out: ChuciPoint[] = [];
  for (let start = 0; start < end; start += step) {
    const stop = Math.min(start + step, end);
    let c = 0;
    for (let t = start; t < stop; t += 1) c += hits[t];
    out.push({ issue: issues[Math.min(stop - 1, end - 1)], count: c });
  }
  // 不反转：索引 0 是最旧的窗口，画在横轴最左；最后一个窗口以最新期收尾，在最右
  return out;
}

/**
 * 均线拐点值 —— 官方出次图的核心提示：
 *   「走向发生变化的一个点……它几乎就等同于告诉你未来遗漏在相应的什么范围内开出，
 *     比如 '5期均线拐点值12' 就表示未来遗漏将在 12 左右开出（包括 12）」
 * 实现：从最新值往回走，先定住最近的走向，再往回找第一个反向的位置，
 * 返回那个转折点的数值（局部极大/极小值）。
 */
export function findLastTurning(values: (number | null)[]): number | null {
  let end = values.length - 1;
  while (end >= 0 && values[end] === null) end -= 1;
  if (end < 2) return null;
  let dir = 0;
  for (let i = end; i > 0; i -= 1) {
    const cur = values[i];
    const prev = values[i - 1];
    if (cur === null || prev === null) continue;
    const d = Math.sign(cur - prev);
    if (d === 0) continue;
    if (dir === 0) {
      dir = d;
      continue;
    }
    if (d !== dir) return cur as number;
  }
  return null;
}

/* ─────────────── 遗漏和 ─────────────── */

/**
 * 官方《遗漏和》：「指一个指标里面所有元素的各项遗漏值的和」
 *  - 不定位胆遗漏和（组选遗漏和）：三星三个数字的遗漏值之和
 *  - 全胆遗漏和：0-9 各码当前遗漏之和
 *  - 定位胆遗漏和（直选遗漏和）：百/十/个 三个位置上的遗漏值之和
 *
 * 官方经验值：「组选遗漏和以 <=10 的居多；当本期开出大于或等于均值 11 的
 * 遗漏和时，下期 90% 的机会向下掉头，开出 11 以下的值，尤其是 6 以下的值居多」
 */
export const MISS_SUM_REF = 11;

/**
 * 逐期计算定位胆遗漏和序列：每期取各指定位上「该期开的那个数字」的遗漏值求和。
 * @param digitOmissions 每期、每个位置上各数字的遗漏快照：[期][位数][数字] = 遗漏值
 */
export function buildSumSeriesFromDigits(
  issues: string[],
  numsPerIssue: number[][],
  digitOmissions: number[][][],
): number[] {
  return issues.map((_, i) => {
    const row = digitOmissions[i] ?? [];
    const nums = numsPerIssue[i] ?? [];
    let s = 0;
    for (let d = 0; d < nums.length && d < row.length; d += 1) s += row[d][nums[d]] ?? 0;
    return s;
  });
}

/** 统计 w 期之后「次期是否回落」的比例，用于验证官方 90% 经验值 */
export function missSumDropRate(series: number[], ref = MISS_SUM_REF): {
  hit: number;
  total: number;
  belowRef: number;
  belowSix: number;
  rate: number;
} {
  let total = 0;
  let hit = 0;
  let belowRef = 0;
  let belowSix = 0;
  for (let i = 0; i + 1 < series.length; i += 1) {
    if (series[i] < ref) continue;
    total += 1;
    const next = series[i + 1];
    if (next < ref) belowRef += 1;
    if (next <= 6) belowSix += 1;
    hit += 1;
  }
  return {
    hit,
    total: total || 0,
    belowRef,
    belowSix,
    rate: total > 0 ? belowRef / total : 0,
  };
}

/** 布林通道（中轨 = SMA，上下轨 = ±k 倍标准差） */
export function buildBoll(
  values: number[],
  period: number,
  k: number,
): { mid: (number | null)[]; upper: (number | null)[]; lower: (number | null)[] } {
  const mid: (number | null)[] = [];
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i + 1 < period) {
      mid.push(null);
      upper.push(null);
      lower.push(null);
      continue;
    }
    let s = 0;
    for (let j = i - period + 1; j <= i; j += 1) s += values[j];
    const avg = s / period;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j += 1) variance += (values[j] - avg) ** 2;
    const std = Math.sqrt(variance / Math.max(1, period - 1));
    mid.push(avg);
    upper.push(avg + k * std);
    lower.push(avg - k * std);
  }
  return { mid, upper, lower };
}

/** 取布林通道最后一项的数值（用于右上角「上轨 / 中轨 / 下轨」显示） */
export function lastBollTriple(boll: {
  mid: (number | null)[];
  upper: (number | null)[];
  lower: (number | null)[];
}): { upper?: number; mid?: number; lower?: number } {
  const pick = (arr: (number | null)[]) => {
    for (let i = arr.length - 1; i >= 0; i -= 1) if (arr[i] !== null) return arr[i] as number;
    return undefined;
  };
  return { upper: pick(boll.upper), mid: pick(boll.mid), lower: pick(boll.lower) };
}

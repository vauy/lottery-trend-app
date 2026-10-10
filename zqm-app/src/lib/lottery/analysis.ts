/**
 * 分析引擎 —— K 线模式与遗漏计算
 *
 * 全部函数都是纯函数，输入 hits（0/1 序列，正序）输出可直接喂给图表的数据结构。
 *
 * 对应帮助文档（zqm168.com/webhelp）中的模式：
 *  - 频率K线   buildFrequencySeries + buildCandles(period=1)
 *  - 周期K线   buildCandles(period=N, align='left'|'right')
 *  - 遗漏K线   buildOmissionKLine（二阶，带遗漏范围过滤）
 *  - 遗漏图    buildOmissionNodes（节点 + MA5/10/25，extendToCurrent 控制均线延长）
 *  - 拐点值    findTurningPoints（均线局部极值）
 *  - 二阶遗漏  buildSecondOrderOmission（相邻符合范围节点的间隔期数）
 *  - 出次图    buildCountChart（step 分段，back 退期）
 *  - 出次移动  buildMovingCount
 *  - 开出遗漏  buildDrawOmission / buildDrawOmissionSeries
 *  - 遗漏和    buildOmissionSums（group 组选 / all 全胆 / straight 直选三口径）
 */
import type {
  Candle,
  CountPoint,
  DrawRecord,
  GameTypeDef,
  KLineSeries,
  OmissionNode,
  OmissionStat,
  PosKey,
  TemperatureStatus,
} from './types';
import { buildHitSeries, type Target } from './targets';
import { getDigits } from './games';

/** 简单的移动平均（返回 null 表示数据不足） */
export function movingAverage(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = [];
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

/**
 * 每期的「开出前遗漏」：距离上一次开出过了多少期。
 * 若某期本身开出，则值 = 上次开出到本次开出之间隔了多少期。
 */
export function buildOmissionSeries(hits: number[]): number[] {
  const out: number[] = [];
  let last = -1;
  for (let i = 0; i < hits.length; i += 1) {
    out.push(i - last - 1);
    if (hits[i] === 1) last = i;
  }
  return out;
}

/** 当前遗漏（从最新一期往回数，直到遇到开出） */
export function currentOmission(hits: number[]): number {
  let n = 0;
  for (let i = hits.length - 1; i >= 0; i -= 1) {
    if (hits[i] === 1) return n;
    n += 1;
  }
  return n;
}

/** 上期遗漏（上一次开出之前的遗漏期数） */
export function previousOmission(hits: number[]): number {
  // 找到最后一次开出的位置
  let last = -1;
  for (let i = hits.length - 1; i >= 0; i -= 1) {
    if (hits[i] === 1) {
      last = i;
      break;
    }
  }
  if (last < 0) return hits.length;
  // 再往前找倒数第二次开出
  let prev = -1;
  for (let i = last - 1; i >= 0; i -= 1) {
    if (hits[i] === 1) {
      prev = i;
      break;
    }
  }
  return last - prev - 1;
}

/** 历史最大遗漏 */
export function maxOmission(hits: number[]): number {
  let max = 0;
  let run = 0;
  for (let i = 0; i < hits.length; i += 1) {
    if (hits[i] === 1) {
      run = 0;
    } else {
      run += 1;
      if (run > max) max = run;
    }
  }
  return max;
}

/** 最大连出次数与当前连出次数 */
export function repeatStats(hits: number[]): { max: number; current: number } {
  let max = 0;
  let run = 0;
  for (let i = 0; i < hits.length; i += 1) {
    if (hits[i] === 1) {
      run += 1;
      if (run > max) max = run;
    } else {
      run = 0;
    }
  }
  let current = 0;
  for (let i = hits.length - 1; i >= 0; i -= 1) {
    if (hits[i] === 1) current += 1;
    else break;
  }
  return { max, current };
}

/**
 * 按「分析对象」计算理论中出概率。
 *
 * ⚠️ 关键：理论周期（=1/概率）必须随所选分析对象变化，不能用彩种固定值。
 *   官方帮助《遗漏图》原文举例（独胆/毒胆）：
 *     「以独胆为例，271 注号码，(1 − 0.271) / 0.271 = 2.69」
 *   即：不定位一个胆码时理论遗漏为 2.69，而定位某位某码时才是 9（理论周期 10）。
 *
 * 各口径的概率：
 *   - 不定位一个胆码（位置型）：p = 1 − (1 − 1/10)^位数
 *       福彩3D / 排列三（3 位）→ p = 1 − 0.9³ = 0.271 → 理论遗漏 ≈ 2.69
 *       排列五（5 位）        → p = 1 − 0.9⁵ = 0.40951 → 理论遗漏 ≈ 1.44
 *   - 定位某一位某码：p = 1/10 = 0.1 → 理论遗漏 = 9（理论周期 10）
 *   - 快乐8（1-80 中开 20 个，无位置）：p = 20/80 = 0.25 → 理论遗漏 = 3
 *
 * 这一处曾导致「频率K线看起来没有波动」：不定位时误用 0.1 会把振幅放大 3.6 倍，
 * 曲线被过度缩放后起伏形态失真。图表必须用本函数返回的 cycle。
 */
export function theoryCycleFor(game: GameTypeDef, pos: PosKey): number {
  if (game.style === 'keno') return 1 / game.hitProbability;
  // 定位某一位：单个数字概率 = 1 / 号码池大小
  const poolSize = game.digitMax - game.digitMin + 1;
  const single = 1 / poolSize;
  if (pos === 'any') {
    // 不定位：N 位中至少出现一次该数字
    const p = 1 - Math.pow(1 - single, game.drawCount);
    return 1 / p;
  }
  return 1 / single;
}

/** 理论遗漏值（= 理论周期 − 1），官方《遗漏图》里那条黑色理论均线 */
export function theoryOmissionFor(game: GameTypeDef, pos: PosKey): number {
  return theoryCycleFor(game, pos) - 1;
}

/**
 * 频率K线的累积值序列。
 *
 * 官方帮助《频率K线》原文：「我们将遗漏一次的线段长度为 -1，中出时线段长度为 9」，
 * 其中 9 = 理论周期 − 1（一星个位理论周期为 10）。
 * 参考图补充说明更直接：「概率为 20% 的号码，阳线的长度等于四根阴线的长度」——
 * 即 阳长 / 阴长 = (1/p) − 1，是「比值」而非固定整数。
 * 推广：中出一次 +(cycle − 1)，遗漏一次 −1，曲线围绕理论均值「平衡」波动。
 *
 * ⚠️ cycle − 1 必须保留小数、不能取整：如快乐8 某玩法理论周期 1.278 时，
 * 中出仅 +0.278、遗漏 −1，曲线才会呈现官方参考图那种大波段起伏；
 * 若强行钳制成 +1/−1 对称锯齿，图形就会失去趋势波动（曾踩过的坑）。
 *
 * 返回长度 = hits.length + 1，首元素为 0（起点）。
 */
export function buildFrequencySeries(hits: number[], cycle: number): number[] {
  const out: number[] = [0];
  let acc = 0;
  const up = cycle - 1;
  for (let i = 0; i < hits.length; i += 1) {
    acc += hits[i] === 1 ? up : -1;
    out.push(acc);
  }
  return out;
}

/**
 * 把累积值序列按周期 N 分段聚合成蜡烛图。
 *
 * 每段：开盘=段首值，收盘=段尾值，最高/最低=段内极值（含端点）。
 *
 * @param align left=从头对齐（图形不随新数据变化），right=从最新一期倒推对齐（做几期计划就设 N）
 * @param back 对应帮助文件周期K线「退期」：退期值不为 0 时，
 *             末端往前推 back 期，只看这一段（可同时看到退期期间已开次数）
 */
export function buildCandles(
  cum: number[],
  records: DrawRecord[],
  period: number,
  align: 'left' | 'right' = 'left',
  back = 0,
): KLineSeries {
  const n = Math.max(1, Math.floor(period));
  // cum 比 records 多一个起点元素，一期对应一个 delta
  const available = Math.min(records.length, cum.length - 1);
  const total = Math.max(0, available - Math.max(0, Math.floor(back)));
  const segments = Math.floor(total / n);
  if (segments <= 0) return { categories: [], candles: [], closes: [] };

  const offset = align === 'right' ? total - segments * n : 0;

  const categories: string[] = [];
  const candles: Candle[] = [];
  const closes: number[] = [];

  for (let s = 0; s < segments; s += 1) {
    const start = offset + s * n; // 第 start 期（delta 索引）
    const end = start + n; // 段尾（delta 索引，不含）
    const open = cum[start];
    const close = cum[end];
    let high = Math.max(open, close);
    let low = Math.min(open, close);
    for (let j = start + 1; j < end; j += 1) {
      if (cum[j] > high) high = cum[j];
      if (cum[j] < low) low = cum[j];
    }
    const first = records[start];
    const last = records[end - 1];
    categories.push(n === 1 ? first.issue : `${first.issue}~${last.issue}`);
    candles.push({ o: open, c: close, h: high, l: low });
    closes.push(close);
  }

  return { categories, candles, closes };
}

/**
 * 遗漏K线（二阶遗漏K线）—— 对齐官方帮助《遗漏K线》的「红格 / 蓝格」定义。
 *
 * 官方原文：
 *   「遗漏K线的红格和蓝格都是代表开出。红格子代表在你设置的遗漏范围内开出，
 *     蓝格子代表在你设置的遗漏范围以外开出。」
 *   「正面：只要当前遗漏值超出设置的遗漏范围，即使号码没开出，也会提前显示蓝格子。」
 *   「反面：必须在号码开出后，遗漏K线才有所变化。」
 *
 * 因此本函数返回「逐期增量 + 类型」，类型有四种：
 *   - red    范围内开出   → 阳线，长度 = 1/理论概率 − 1（cycle − 1，保留小数）
 *   - blue   范围外开出   → 阴线，长度 = −1
 *   - preBlue 当前遗漏已越界且本期未开出 → 提前预画的蓝格（长度 = −1）
 *   - none   范围内未开出 → 不画（等于 0，保持图形连续）
 *
 * 四种「遗漏范围」选项（官方）：
 *   1. 理论周期  范围 0 ~ ceil(理论遗漏)；前提是当前遗漏在该范围内，否则失去参考价值
 *   2. 当前遗漏  范围 = 当前遗漏 ~ 当前遗漏（看当期有无机会）
 *   3. 计划期    范围 = 当前遗漏 ~ 当前遗漏 + (计划期数 − 1)
 *   4. 自定义    直接给定 min ~ max
 */
export type OmissionKBarKind = 'red' | 'blue' | 'preBlue' | 'none';

export interface OmissionKBar {
  kind: OmissionKBarKind;
  /** 增量：red = cycle−1，blue / preBlue = −1，none = 0 */
  delta: number;
  /** 该期开奖前的遗漏值 */
  omit: number;
}

export function buildOmissionKLineDetailed(
  hits: number[],
  cycle: number,
  range: [number, number],
): OmissionKBar[] {
  const omits = buildOmissionSeries(hits);
  const [min, max] = range;
  const up = cycle - 1;
  const out: OmissionKBar[] = [];
  for (let i = 0; i < hits.length; i += 1) {
    const omit = omits[i];
    const inRange = omit >= min && omit <= max;
    if (hits[i] === 1) {
      out.push({ kind: inRange ? 'red' : 'blue', delta: inRange ? up : -1, omit });
    } else if (omit > max) {
      // 未开出但当前遗漏已超出范围 → 提前预画蓝格
      out.push({ kind: 'preBlue', delta: -1, omit });
    } else {
      out.push({ kind: 'none', delta: 0, omit });
    }
  }
  return out;
}

/** 兼容旧签名：只取增量序列（给 cumulative 用） */
export function buildOmissionKLine(
  hits: number[],
  cycle: number,
  range: [number, number],
): number[] {
  return buildOmissionKLineDetailed(hits, cycle, range).map((b) => b.delta);
}

/** 遗漏范围四选项 */
export type OmissionRangeMode = 'theory' | 'current' | 'plan' | 'custom';

/**
 * 趋势判断 —— 对齐官方对「上升 / 下降 / 水平」趋势的口径：
 *
 *  - 上升趋势：实际出次 > 理论出次（两个及以上依次上升的相对高点/低点）
 *  - 下降趋势：实际出次 < 理论出次（两个及以上依次下降的相对高点/低点）
 *  - 水平趋势：实际出次 ≈ 理论出次（高点/低点基本在同一水平）
 *
 * 这里用「近 1/3 段实际中出次数」与「该段理论中出次数（段长 ÷ 理论周期）」比较，
 * 并给出偏离度，便于在图上直接标注当前处在哪种趋势。
 */
export type TrendDirection = 'up' | 'down' | 'flat';

export interface TrendVerdict {
  direction: TrendDirection;
  label: string;
  /** 实际出次 */
  actual: number;
  /** 理论出次（段长 ÷ 理论周期） */
  expected: number;
  /** 偏离度 = (实际 − 理论) / 理论 */
  deviation: number;
}

export function judgeTrend(hits: number[], cycle: number, windowSize?: number): TrendVerdict {
  const n = hits.length;
  const win = Math.min(n, windowSize ?? Math.max(10, Math.round(n / 3)));
  const seg = n > 0 ? hits.slice(n - win) : [];
  const actual = seg.reduce((a, b) => a + b, 0);
  const expected = cycle > 0 ? win / cycle : 0;
  const deviation = expected > 0 ? (actual - expected) / expected : 0;
  // 偏离 15% 以内视为水平
  const direction: TrendDirection = deviation > 0.15 ? 'up' : deviation < -0.15 ? 'down' : 'flat';
  const label =
    direction === 'up' ? '上升趋势（实际出次 > 理论出次）'
      : direction === 'down' ? '下降趋势（实际出次 < 理论出次）'
        : '水平趋势（实际出次 ≈ 理论出次）';
  return { direction, label, actual, expected, deviation };
}

/**
 * 按官方四种选项计算遗漏范围。
 * @param current 当前遗漏
 * @param planPeriods 计划期数（plan 模式用）
 * @param custom 自定义范围（custom 模式用）
 */
export function resolveOmissionRange(
  mode: OmissionRangeMode,
  cycle: number,
  current: number,
  planPeriods = 3,
  custom: [number, number] = [0, 4],
): [number, number] {
  if (mode === 'theory') {
    // 理论周期：0 ~ 理论遗漏（当前遗漏超出则失去参考价值，仍按理论范围给出）
    return [0, Math.ceil(cycle - 1)];
  }
  if (mode === 'current') {
    return [current, current];
  }
  if (mode === 'plan') {
    return [current, current + Math.max(0, planPeriods - 1)];
  }
  return custom;
}

/**
 * 遗漏图节点：每次开出前的遗漏期数，配 5/10/25 期移动均线。
 *
 * @param extendToCurrent 对应帮助文件「均线延长到当前遗漏」：
 *        勾选后把「当前遗漏」作为一个额外点纳入均线计算，
 *        使各条均线延长到最新一期，便于对比预测。
 */
export function buildOmissionNodes(
  hits: number[],
  records: DrawRecord[],
  periods: number[] = [5, 10, 25],
  extendToCurrent = false,
): OmissionNode[] {
  const omits = buildOmissionSeries(hits);
  const values: number[] = [];
  const nodes: Omit<OmissionNode, 'ma'>[] = [];

  for (let i = 0; i < hits.length; i += 1) {
    if (hits[i] === 1) {
      values.push(omits[i]);
      nodes.push({ order: values.length, issue: records[i]?.issue ?? '', value: omits[i] });
    }
  }

  const source = extendToCurrent ? [...values, currentOmission(hits)] : values;

  const maMap: Record<string, Array<number | null>> = {};
  for (const p of periods) maMap[String(p)] = movingAverage(source, p);

  return nodes.map((n, idx) => {
    const ma: Record<string, number | null> = {};
    for (const p of periods) ma[String(p)] = maMap[String(p)][idx] ?? null;
    return { ...n, ma };
  });
}

/**
 * 均线拐点。
 *
 * 帮助文件定义：拐点 = 趋势线 / 移动平均线上「走向发生变化」的点。
 * 拐点值极具参考意义，等同于告诉你未来遗漏大致落在什么范围——
 * 例如「5 期均线拐点值 12」表示未来遗漏将在 12 左右开出（含 12）。
 */
export interface TurningPoint {
  /** 第几个遗漏节点（1 起） */
  order: number;
  issue: string;
  /** 哪条均线（5 / 10 / 25） */
  period: number;
  /** 拐点处的均线值 */
  value: number;
  /** 由升转降 = down；由降转升 = up */
  direction: 'up' | 'down';
}

export function findTurningPoints(
  nodes: OmissionNode[],
  periods: number[] = [5, 10, 25],
): TurningPoint[] {
  const out: TurningPoint[] = [];
  for (const p of periods) {
    const key = String(p);
    const series = nodes.map((n) => n.ma[key] ?? null);
    for (let i = 1; i < series.length - 1; i += 1) {
      const a = series[i - 1];
      const b = series[i];
      const c = series[i + 1];
      if (a === null || b === null || c === null) continue;
      if (a <= b && b > c) {
        out.push({ order: nodes[i].order, issue: nodes[i].issue, period: p, value: b, direction: 'down' });
      } else if (a >= b && b < c) {
        out.push({ order: nodes[i].order, issue: nodes[i].issue, period: p, value: b, direction: 'up' });
      }
    }
  }
  return out;
}

/**
 * 二阶遗漏：对遗漏图再筛一层。
 *
 * 帮助文件定义：仅当遗漏值落在设定范围（如 0–1）时，才写一次二阶遗漏值，
 * 这个二阶遗漏值 = **距离上一次符合范围的间隔期数**。
 *
 * 例：遗漏图从右往左第 6 期符合范围，它前一次符合范围与之相隔 3 期，
 *     则该点的二阶遗漏值记为 3。
 *
 * 与遗漏K线本质相同，都是对遗漏图的筛选，只是呈现形式不同。
 */
export function buildSecondOrderOmission(
  hits: number[],
  records: DrawRecord[],
  range: [number, number],
): Array<{ order: number; issue: string; value: number; gap: number }> {
  const omits = buildOmissionSeries(hits);
  const [min, max] = range;
  const out: Array<{ order: number; issue: string; value: number; gap: number }> = [];
  let prevIdx: number | null = null;

  for (let i = 0; i < hits.length; i += 1) {
    if (hits[i] !== 1) continue;
    const v = omits[i];
    if (v < min || v > max) continue;
    // 第一个符合点之前没有参照，用「从起点到该点的期数」记间隔
    const gap = prevIdx === null ? i + 1 : i - prevIdx;
    out.push({ order: out.length + 1, issue: records[i]?.issue ?? '', value: v, gap });
    prevIdx = i;
  }
  return out;
}

/**
 * 开出遗漏：当期开奖号码各位置的「上次遗漏」。
 *
 * 帮助文件定义：开出遗漏 = 当前期开奖号码的上次遗漏。
 * 直选口径按位置分别统计，组选口径不定位统计。
 */
export interface DrawOmissionItem {
  pos: string;
  posName: string;
  digit: number;
  /** 该数字上一次开出之前的遗漏期数 */
  lastOmission: number;
}

export function buildDrawOmission(
  records: DrawRecord[],
  game: GameTypeDef,
  index: number,
): DrawOmissionItem[] {
  const current = records[index];
  if (!current) return [];

  const slots: Array<{ id: string; name: string; index: number }> =
    game.style === 'keno'
      ? current.nums.map((d, i) => ({ id: `n${i}`, name: `${d}`, index: i }))
      : game.positions.map((p) => ({ id: p.id, name: p.name, index: p.index }));

  const out: DrawOmissionItem[] = [];
  for (const slot of slots) {
    const digit = current.nums[slot.index];
    if (!Number.isFinite(digit)) continue;

    // 往前找该位置上一次出现该数字的位置
    let last = -1;
    for (let k = index - 1; k >= 0; k -= 1) {
      if (records[k]?.nums[slot.index] === digit) {
        last = k;
        break;
      }
    }
    // lastOmission = 上一次开出之前的遗漏期数
    const lastOmission = last < 0 ? index : index - last - 1;
    out.push({ pos: slot.id, posName: slot.name, digit, lastOmission });
  }
  return out;
}

/**
 * 出次图：按步长分段统计出现次数。横轴期号区间，纵轴次数。
 */
export function buildCountChart(
  hits: number[],
  records: DrawRecord[],
  step = 10,
  back = 0,
): CountPoint[] {
  const out: CountPoint[] = [];
  const s = Math.max(1, Math.floor(step));
  // 退期：把末端往前推 back 期，只看这一段
  const end = Math.max(0, hits.length - Math.max(0, Math.floor(back)));
  for (let i = 0; i < end; i += s) {
    const end = Math.min(i + s, hits.length);
    let count = 0;
    for (let j = i; j < end; j += 1) count += hits[j];
    const a = records[i]?.issue ?? '';
    const b = records[end - 1]?.issue ?? '';
    out.push({ label: `${a}~${b}`, count });
  }
  return out;
}

/**
 * 出次移动统计：从当前期往回看，观察出次的渐变过程。
 * 返回与 records 等长的序列，第 i 项 = 截至第 i 期（含）最近 window 期内的出现次数。
 */
export function buildMovingCount(hits: number[], window = 10): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < hits.length; i += 1) {
    sum += hits[i];
    if (i >= window) sum -= hits[i - window];
    out.push(sum);
  }
  return out;
}

/** 判断冷温热：前 window 期出现 >hot 为热，>=warm 为温，否则冷 */
export function temperatureOf(hits: number[], window = 10, warm = 2, hot = 3): TemperatureStatus {
  const start = Math.max(0, hits.length - window);
  let count = 0;
  for (let i = start; i < hits.length; i += 1) count += hits[i];
  if (count > hot) return 'hot';
  if (count >= warm) return 'warm';
  return 'cold';
}

/**
 * 计算某个位置下全部号码的遗漏统计表（遗漏分析页使用）
 */
export function buildOmissionStats(
  records: DrawRecord[],
  game: GameTypeDef,
  targetBuilder: (digit: number) => Target,
  window = 10,
): OmissionStat[] {
  const cycle = 1 / game.hitProbability;
  const stats: OmissionStat[] = [];

  for (let d = game.digitMin; d <= game.digitMax; d += 1) {
    const hits = buildHitSeries(records, game, targetBuilder(d));
    const freq = hits.reduce((a, b) => a + b, 0);
    const cur = currentOmission(hits);
    const prev = previousOmission(hits);
    const avg = freq > 0 ? records.length / freq : records.length;
    const rep = repeatStats(hits);
    stats.push({
      digit: d,
      current: cur,
      previous: prev,
      frequency: freq,
      cycle,
      avgOmission: Number(avg.toFixed(2)),
      maxOmission: maxOmission(hits),
      maxRepeat: rep.max,
      currentRepeat: rep.current,
      wantRatio: avg > 0 ? Number((cur / avg).toFixed(2)) : 0,
      investRatio: Number((cur / cycle).toFixed(2)),
      coverRatio: Number(((prev - cur) / cycle).toFixed(2)),
      temperature: temperatureOf(hits, window),
    });
  }
  return stats;
}

/**
 * 遗漏和：一组标的当前遗漏值之和。
 * 官方经验：不定位胆遗漏和 ≥ 11 时下期 90% 概率回落。
 */
export function buildOmissionSum(
  records: DrawRecord[],
  game: GameTypeDef,
  targets: Target[],
): number {
  let sum = 0;
  for (const t of targets) {
    sum += currentOmission(buildHitSeries(records, game, t));
  }
  return sum;
}

/**
 * 遗漏和的三种口径（帮助文件《遗漏和》专文）：
 *
 *  - group（不定位胆遗漏和 / 组选遗漏和）：以三星为例，选定百十个位，
 *    等于当期开奖号码三个数字在不定位口径下的遗漏值之和。
 *  - all（全胆遗漏和）：不定位胆 0–9 各码当前遗漏之和。
 *  - straight（定位胆遗漏和 / 直选遗漏和）：当期开奖号码中百、十、个
 *    三个位置各自口径下的遗漏值之和。
 *    官方示例：排列五后三 2022137 期【24450】→ 3(百)+5(十)+13(个)=21。
 *
 * 均值参考：帮助文件给出组选遗漏和的均值约为 11，
 * 经验规律是「本期 ≥11 时，下期约 90% 概率回落至 11 以下」。
 */
export interface OmissionSums {
  group: number | null;
  all: number | null;
  straight: number | null;
}

export function buildOmissionSums(
  records: DrawRecord[],
  game: GameTypeDef,
  index: number,
): OmissionSums {
  const current = records[index];
  if (!current) return { group: null, all: null, straight: null };

  const digits = getDigits(game);

  /** 不定位口径下某数字的当前遗漏 */
  const anyOmission = (d: number) =>
    currentOmission(buildHitSeries(records, game, { kind: 'digit', pos: 'any', digit: d }));

  // 全胆遗漏和：0-9（快乐8 为 1-80）各码当前遗漏之和
  let all = 0;
  for (const d of digits) all += anyOmission(d);

  // 组选（不定位）遗漏和：当期开奖号各位数字在不定位口径下的遗漏之和
  let group = 0;
  for (const d of current.nums) group += anyOmission(d);

  // 直选（定位）遗漏和：当期开奖号各位置口径下的遗漏之和
  let straight = 0;
  if (game.style === 'keno') {
    straight = group; // 无位置概念，与组选一致
  } else {
    for (const p of game.positions) {
      const d = current.nums[p.index];
      if (!Number.isFinite(d)) continue;
      straight += currentOmission(
        buildHitSeries(records, game, { kind: 'digit', pos: p.id, digit: d }),
      );
    }
  }

  return { group, all, straight };
}

/**
 * 开出遗漏序列：逐期计算「本期开出的这个数字，上一次开出前遗漏了多少期」。
 *
 * 帮助文件《开出遗漏》：开出遗漏 = 当前开奖号码的上次遗漏。
 * 选中某个位置时按该位置口径；选中「不定位」时按整组号码口径（取各位之和）。
 */
export function buildDrawOmissionSeries(
  records: DrawRecord[],
  game: GameTypeDef,
  pos: PosKey,
): number[] {
  const out: number[] = [];
  const indexOf =
    game.style === 'keno' || pos === 'any'
      ? -1
      : game.positions.find((p) => p.id === pos)?.index ?? -1;

  /** 记录每个"值"上一次出现的位置 */
  const lastSeen = new Map<string, number>();

  for (let i = 0; i < records.length; i += 1) {
    const nums = records[i].nums;
    if (indexOf >= 0) {
      const d = nums[indexOf];
      const key = `p${indexOf}:${d}`;
      const last = lastSeen.get(key);
      out.push(last === undefined ? i : i - last - 1);
      lastSeen.set(key, i);
    } else {
      // 不定位 / 快乐8：先按各位分别求上次遗漏再求和，随后统一登记
      let sum = 0;
      for (let k = 0; k < nums.length; k += 1) {
        const key = `a${k}:${nums[k]}`;
        const last = lastSeen.get(key);
        sum += last === undefined ? i : i - last - 1;
      }
      for (let k = 0; k < nums.length; k += 1) {
        lastSeen.set(`a${k}:${nums[k]}`, i);
      }
      out.push(sum);
    }
  }
  return out;
}

/** 把增量序列（每期 delta）转成累积值序列，首元素为 0 */
export function cumulative(deltas: number[]): number[] {
  const out: number[] = [0];
  let acc = 0;
  for (const d of deltas) {
    acc += d;
    out.push(acc);
  }
  return out;
}

/** 把 hits 序列转成 ECharts 蜡烛图需要的 [open, close, low, high] 数组 */
export function toEchartsCandle(series: KLineSeries): number[][] {
  return series.candles.map((c) => [c.o, c.c, c.l, c.h]);
}

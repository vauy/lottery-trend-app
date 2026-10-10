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
 * 频率K线的累积值序列。
 *
 * 官方帮助《频率K线》原文：「我们将遗漏一次的线段长度为 -1，中出时线段长度为 9」，
 * 其中 9 = 理论周期 − 1（一星个位理论周期为 10）。
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
 * 遗漏K线（二阶遗漏K线）。
 *
 * 只统计「遗漏期数落在 [min,max] 区间内再开出」的情况：
 *  - 符合 → 阳线，长度 = 1/理论概率 − 1（= cycle − 1，保留小数）
 *  - 不符合 → 阴线，长度 = −1
 *
 * 可用于判断号码开出后后续几期是否还会再出。
 */
export function buildOmissionKLine(
  hits: number[],
  cycle: number,
  range: [number, number],
): number[] {
  const omits = buildOmissionSeries(hits);
  const [min, max] = range;
  const up = cycle - 1;
  const out: number[] = [];
  for (let i = 0; i < hits.length; i += 1) {
    const inRange = omits[i] >= min && omits[i] <= max;
    out.push(hits[i] === 1 && inRange ? up : -1);
  }
  return out;
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

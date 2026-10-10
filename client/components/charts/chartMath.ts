/**
 * 图表数值工具 —— 主图 / 副图共用。
 * 从 EChartsFreqKChart 里抽出来，避免多联图组件重复实现同一套聚合与布林逻辑。
 */
import type { TargetPoint } from '@/lib/lottery/targets';

/** 聚合后的 K 线实体（无上下影线，只画实体） */
export type KBar = { issue: string; o: number; c: number };

/**
 * 按周期把逐期序列聚合成 K 线。
 * period <= 1 时逐期成 K；否则每 period 期合成一根，
 * 开盘价取上一根的收盘价（首根取 0），保证线段连续。
 */
export function aggregate(series: TargetPoint[], period: number): KBar[] {
  if (period <= 1) {
    return series.map((p, i) => ({
      issue: p.issue,
      o: i === 0 ? 0 : series[i - 1].diff,
      c: p.diff,
    }));
  }
  const out: KBar[] = [];
  for (let i = 0; i < series.length; i += period) {
    const slice = series.slice(i, i + period);
    if (slice.length === 0) continue;
    const o = i === 0 ? 0 : series[i - 1].diff;
    const c = slice[slice.length - 1].diff;
    out.push({ issue: slice[slice.length - 1].issue, o, c });
  }
  return out;
}

/**
 * 遗漏 K 线的「爬楼梯」实体，供多联图复用。
 * 原来这段写在 EChartsOmissionKChart 内部，多联图要拿同一份数值算副图指标，
 * 若再抄一份就会两处漂移，故提到这里作为唯一来源。
 */
export type OmissionBar = KBar & { isRed: boolean };

function calcDelta(prevMiss: number, theoryMiss: number): number {
  if (theoryMiss <= 0) return 1;
  if (prevMiss <= theoryMiss) return 1;
  const level = Math.ceil(prevMiss / theoryMiss) - 1;
  const mult = ((level - 1) % 3) + 1;
  return -mult;
}

/**
 * 只在「开出」的那期生成一根 K：
 * 未超出理论遗漏 → 升 1 档（红）；超出 → 按超出档数循环降档（绿）。
 */
export function buildOmissionBars(series: TargetPoint[], theoryMiss: number): OmissionBar[] {
  const out: OmissionBar[] = [];
  let score = 0;
  for (let i = 0; i < series.length; i += 1) {
    if (series[i].hit === 1) {
      const prevMiss = i === 0 ? 0 : series[i - 1].omission;
      const delta = calcDelta(prevMiss, theoryMiss);
      out.push({ issue: series[i].issue, o: score, c: score + delta, isRed: delta > 0 });
      score += delta;
    }
  }
  return out;
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

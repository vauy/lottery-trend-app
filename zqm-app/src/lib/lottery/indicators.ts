/**
 * 技术指标引擎 —— 把股票技术指标映射到彩票「开出/遗漏」序列上
 *
 * 输入统一是「收盘序列 closes」（正序），来自频率K线/周期K线/遗漏K线的累积值。
 * 彩票序列没有真正的开高低收，因此 high/low 用滚动窗口内的极值近似。
 *
 * 覆盖：MA / EMA / EXPMA / BOLL / MACD / KDJ / CCI / DMI(ADX) / SAR / RSI / W&R / MTM / BBI / ATR
 *       + 指标共振（含容错）
 */
export type Num = number | null;

export interface IndicatorSeries {
  name: string;
  data: Num[];
  /** line / bar（MACD 柱用 bar） */
  type?: 'line' | 'bar';
  color?: string;
}

export interface IndicatorParamDef {
  key: string;
  label: string;
  def: number;
  min: number;
  max: number;
}

export interface IndicatorDef {
  id: string;
  name: string;
  /** 副图指标（MA/BOLL 这类叠在主图上为主图指标） */
  overlay?: boolean;
  params: IndicatorParamDef[];
  compute: (closes: number[], p: Record<string, number>) => IndicatorSeries[];
  /** 用于指标共振 / 指标搜索的信号判定 */
  signals?: (closes: number[], p: Record<string, number>) => { bull: boolean; bear: boolean };
}

/** ---------- 基础工具 ---------- */

/** 滚动窗口内的最高/最低值序列（窗口不足时返回 null） */
function rollingExtreme(values: number[], period: number): { high: Num[]; low: Num[] } {
  const high: Num[] = [];
  const low: Num[] = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i < period - 1) {
      high.push(null);
      low.push(null);
      continue;
    }
    let h = -Infinity;
    let l = Infinity;
    for (let j = i - period + 1; j <= i; j += 1) {
      if (values[j] > h) h = values[j];
      if (values[j] < l) l = values[j];
    }
    high.push(h);
    low.push(l);
  }
  return { high, low };
}

/** 简单移动平均 SMA */
export function sma(values: number[], period: number): Num[] {
  const out: Num[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

/** 指数移动平均 EMA */
export function ema(values: number[], period: number): Num[] {
  const out: Num[] = [];
  const k = 2 / (Math.max(1, period) + 1);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i += 1) {
    prev = prev === null ? values[i] : values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

/** EXPMA 等同 EMA 的另一种叫法，保留语义 */
export function expma(values: number[], period: number): Num[] {
  return ema(values, period);
}

/** 布林通道 */
export function boll(
  values: number[],
  period = 20,
  mult = 2,
): { mid: Num[]; upper: Num[]; lower: Num[] } {
  const mid = sma(values, period);
  const upper: Num[] = [];
  const lower: Num[] = [];
  for (let i = 0; i < values.length; i += 1) {
    const m = mid[i];
    if (m === null) {
      upper.push(null);
      lower.push(null);
      continue;
    }
    let sq = 0;
    for (let j = i - period + 1; j <= i; j += 1) sq += (values[j] - m) ** 2;
    const sd = Math.sqrt(sq / period);
    upper.push(m + mult * sd);
    lower.push(m - mult * sd);
  }
  return { mid, upper, lower };
}

/** MACD */
export function macd(
  values: number[],
  fast = 12,
  slow = 26,
  signal = 9,
): { diff: Num[]; dea: Num[]; bar: Num[] } {
  const ef = ema(values, fast);
  const es = ema(values, slow);
  const diff: Num[] = ef.map((v, i) => (v !== null && es[i] !== null ? v - es[i] : null));
  const flat = diff.map((v) => v ?? 0);
  const dea = ema(flat, signal);
  const bar: Num[] = diff.map((v, i) => (v !== null && dea[i] !== null ? (v - dea[i]) * 2 : null));
  return { diff, dea, bar };
}

/** BBI 多空均线 */
export function bbi(values: number[], periods: number[] = [3, 6, 12, 24]): Num[] {
  const lists = periods.map((p) => sma(values, p));
  return values.map((_, i) => {
    let sum = 0;
    let cnt = 0;
    for (const l of lists) {
      const v = l[i];
      if (v !== null) {
        sum += v;
        cnt += 1;
      }
    }
    return cnt ? sum / cnt : null;
  });
}

/** MTM 动量 */
export function mtm(values: number[], period = 6): Num[] {
  return values.map((v, i) => (i >= period ? v - values[i - period] : null));
}

/** RSI */
export function rsi(values: number[], period = 14): Num[] {
  const out: Num[] = [null];
  let gain = 0;
  let loss = 0;
  const p = Math.max(1, period);
  for (let i = 1; i < values.length; i += 1) {
    const diff = values[i] - values[i - 1];
    const up = diff > 0 ? diff : 0;
    const down = diff < 0 ? -diff : 0;
    if (i <= p) {
      gain += up / p;
      loss += down / p;
      if (i === p) {
        out.push(loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
      } else {
        out.push(null);
      }
    } else {
      gain = (gain * (p - 1) + up) / p;
      loss = (loss * (p - 1) + down) / p;
      out.push(loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
    }
  }
  return out;
}

/** KDJ（由单序列构造 high/low） */
export function kdjFromSeries(values: number[], n = 9): { k: Num[]; d: Num[]; j: Num[] } {
  const { high, low } = rollingExtreme(values, Math.max(2, n));
  const rsv: Num[] = values.map((c, i) => {
    const h = high[i];
    const l = low[i];
    if (h === null || l === null || h === l) return null;
    return ((c - l) / (h - l)) * 100;
  });
  const k: Num[] = [];
  const d: Num[] = [];
  let prevK = 50;
  let prevD = 50;
  for (let i = 0; i < rsv.length; i += 1) {
    const r = rsv[i];
    if (r === null) {
      k.push(null);
      d.push(null);
      continue;
    }
    prevK = (2 * prevK + r) / 3;
    prevD = (2 * prevD + prevK) / 3;
    k.push(prevK);
    d.push(prevD);
  }
  const j = k.map((v, i) => (v !== null && d[i] !== null ? 3 * v - 2 * d[i] : null));
  return { k, d, j };
}

/** CCI（由单序列构造 high/low，tp = close） */
export function cciFromSeries(values: number[], period = 14): Num[] {
  const p = Math.max(2, period);
  const tp = values.slice();
  const ma = sma(tp, p);
  const md: Num[] = [];
  for (let i = 0; i < tp.length; i += 1) {
    const m = ma[i];
    if (m === null) {
      md.push(null);
      continue;
    }
    let s = 0;
    for (let j = i - p + 1; j <= i; j += 1) s += Math.abs(tp[j] - m);
    md.push(s / p);
  }
  return tp.map((v, i) => {
    const m = ma[i];
    const d = md[i];
    if (m === null || d === null) return null;
    return d === 0 ? 0 : (v - m) / (0.015 * d);
  });
}

/** W&R 威廉指标 */
export function wprFromSeries(values: number[], period = 14): Num[] {
  const { high, low } = rollingExtreme(values, Math.max(2, period));
  return values.map((c, i) => {
    const h = high[i];
    const l = low[i];
    if (h === null || l === null || h === l) return null;
    return ((h - c) / (h - l)) * 100;
  });
}

/** ATR 真实波幅（由单序列近似：|c[i]-c[i-1]|） */
export function atrFromSeries(values: number[], period = 14): Num[] {
  const tr: Num[] = [null];
  for (let i = 1; i < values.length; i += 1) tr.push(Math.abs(values[i] - values[i - 1]));
  const seeded = tr.map((v, i) => (v === null ? (i > 0 ? 0 : 0) : v));
  return ema(seeded, Math.max(1, period));
}

/** DMI / ADX（由单序列近似） */
export function dmiFromSeries(
  values: number[],
  period = 14,
): { pdi: Num[]; mdi: Num[]; adx: Num[] } {
  const p = Math.max(2, period);
  const plusDm: number[] = [0];
  const minusDm: number[] = [0];
  const tr: number[] = [0];

  for (let i = 1; i < values.length; i += 1) {
    const upMove = values[i] - values[i - 1];
    const downMove = values[i - 1] - values[i];
    plusDm.push(upMove > 0 && upMove > downMove ? upMove : 0);
    minusDm.push(downMove > 0 && downMove > upMove ? downMove : 0);
    tr.push(Math.abs(upMove));
  }

  const atr = ema(tr, p);
  const plusDi: Num[] = [];
  const minusDi: Num[] = [];
  const dx: Num[] = [];

  for (let i = 0; i < values.length; i += 1) {
    const a = atr[i];
    if (a === null || a === 0) {
      plusDi.push(null);
      minusDi.push(null);
      dx.push(null);
      continue;
    }
    const p = (plusDm[i] / a) * 100;
    const m = (minusDm[i] / a) * 100;
    plusDi.push(p);
    minusDi.push(m);
    const sum = p + m;
    dx.push(sum === 0 ? 0 : (Math.abs(p - m) / sum) * 100);
  }

  const adxRaw = ema(
    dx.map((v) => v ?? 0),
    p,
  );
  const adx: Num[] = dx.map((v, i) => (v === null ? null : adxRaw[i]));

  return { pdi: plusDi, mdi: minusDi, adx };
}

/** SAR 抛物线转向（由单序列构造 high/low） */
export function sarFromSeries(values: number[], afStep = 0.02, afMax = 0.2): Num[] {
  const n = values.length;
  const sar: Num[] = new Array(n).fill(null);
  if (n < 3) return sar;

  const { high, low } = rollingExtreme(values, 2);
  let trend = 1; // 1 上涨，−1 下跌
  let af = afStep;
  let ep = high[1] ?? values[1];
  let cur = low[1] ?? values[1];

  sar[1] = cur;
  for (let i = 2; i < n; i += 1) {
    const h = high[i] ?? values[i];
    const l = low[i] ?? values[i];
    let next = cur + af * (ep - cur);
    if (trend === 1) {
      next = Math.min(next, l, values[i - 1]);
      if (next > l) {
        trend = -1;
        next = ep;
        af = afStep;
        ep = l;
      }
    } else {
      next = Math.max(next, h, values[i - 1]);
      if (next < h) {
        trend = 1;
        next = ep;
        af = afStep;
        ep = h;
      }
    }
    if (trend === 1 && h > ep) {
      ep = h;
      af = Math.min(af + afStep, afMax);
    } else if (trend === -1 && l < ep) {
      ep = l;
      af = Math.min(af + afStep, afMax);
    }
    cur = next;
    sar[i] = cur;
  }
  return sar;
}

/**
 * 指标共振：多条件同时满足时给出方向信号。
 *
 * @param signals   每个条件的看多标记
 * @param tolerance 容错个数（允许 N 个条件出错）
 */
export function resonance(signals: boolean[], tolerance = 0): 0 | 1 | -1 {
  const total = signals.length;
  if (!total) return 0;
  const bull = signals.filter(Boolean).length;
  const bear = total - bull;
  if (bull >= total - tolerance && bull > bear) return 1;
  if (bear >= total - tolerance && bear > bull) return -1;
  return 0;
}

/** ---------- 指标注册表 ---------- */

export const INDICATOR_LIST: IndicatorDef[] = [
  {
    id: 'ma',
    name: 'MA 均线',
    overlay: true,
    params: [
      { key: 'p1', label: 'MA1', def: 5, min: 2, max: 120 },
      { key: 'p2', label: 'MA2', def: 10, min: 2, max: 120 },
      { key: 'p3', label: 'MA3', def: 20, min: 2, max: 120 },
    ],
    compute: (closes, p) => [
      { name: `MA${p.p1}`, data: sma(closes, p.p1), color: '#F2B95A' },
      { name: `MA${p.p2}`, data: sma(closes, p.p2), color: '#4FCDCD' },
      { name: `MA${p.p3}`, data: sma(closes, p.p3), color: '#B58CF2' },
    ],
    signals: (closes, p) => {
      const f = sma(closes, p.p1);
      const s = sma(closes, p.p2);
      const i = closes.length - 1;
      const j = i - 1;
      if (i < 1 || f[i] === null || s[i] === null || f[j] === null || s[j] === null) {
        return { bull: false, bear: false };
      }
      return {
        bull: f[j] <= s[j] && f[i] > s[i],
        bear: f[j] >= s[j] && f[i] < s[i],
      };
    },
  },
  {
    id: 'ema',
    name: 'EMA 指数均线',
    overlay: true,
    params: [{ key: 'p1', label: '周期', def: 12, min: 2, max: 120 }],
    compute: (closes, p) => [{ name: `EMA${p.p1}`, data: ema(closes, p.p1), color: '#F2B95A' }],
  },
  {
    id: 'expma',
    name: 'EXPMA',
    overlay: true,
    params: [
      { key: 'p1', label: '快线', def: 12, min: 2, max: 120 },
      { key: 'p2', label: '慢线', def: 50, min: 2, max: 250 },
    ],
    compute: (closes, p) => [
      { name: `EXPMA${p.p1}`, data: expma(closes, p.p1), color: '#F2B95A' },
      { name: `EXPMA${p.p2}`, data: expma(closes, p.p2), color: '#4FCDCD' },
    ],
  },
  {
    id: 'boll',
    name: 'BOLL 布林通道',
    overlay: true,
    params: [
      { key: 'p1', label: '周期', def: 20, min: 2, max: 120 },
      { key: 'p2', label: '倍数', def: 2, min: 1, max: 4 },
    ],
    compute: (closes, p) => {
      const r = boll(closes, p.p1, p.p2);
      return [
        { name: 'BOLL 上轨', data: r.upper, color: '#EF6661' },
        { name: 'BOLL 中轨', data: r.mid, color: '#F2B95A' },
        { name: 'BOLL 下轨', data: r.lower, color: '#4FCDCD' },
      ];
    },
    signals: (closes, p) => {
      const r = boll(closes, p.p1, p.p2);
      const i = closes.length - 1;
      const u = r.upper[i];
      const l = r.lower[i];
      return {
        bull: u !== null && closes[i] >= u,
        bear: l !== null && closes[i] <= l,
      };
    },
  },
  {
    id: 'macd',
    name: 'MACD',
    params: [
      { key: 'p1', label: '快线', def: 12, min: 2, max: 60 },
      { key: 'p2', label: '慢线', def: 26, min: 2, max: 120 },
      { key: 'p3', label: '信号', def: 9, min: 2, max: 60 },
    ],
    compute: (closes, p) => {
      const r = macd(closes, p.p1, p.p2, p.p3);
      return [
        { name: 'DIFF', data: r.diff, color: '#F2B95A' },
        { name: 'DEA', data: r.dea, color: '#4FCDCD' },
        { name: 'MACD', data: r.bar, type: 'bar' },
      ];
    },
    signals: (closes, p) => {
      const r = macd(closes, p.p1, p.p2, p.p3);
      const i = closes.length - 1;
      const j = i - 1;
      if (i < 1 || r.diff[i] === null || r.dea[i] === null) return { bull: false, bear: false };
      return {
        bull: r.diff[j] <= r.dea[j] && r.diff[i] > r.dea[i],
        bear: r.diff[j] >= r.dea[j] && r.diff[i] < r.dea[i],
      };
    },
  },
  {
    id: 'kdj',
    name: 'KDJ',
    params: [{ key: 'p1', label: '周期', def: 9, min: 2, max: 60 }],
    compute: (closes, p) => {
      const r = kdjFromSeries(closes, p.p1);
      return [
        { name: 'K', data: r.k, color: '#F2B95A' },
        { name: 'D', data: r.d, color: '#4FCDCD' },
        { name: 'J', data: r.j, color: '#B58CF2' },
      ];
    },
    signals: (closes, p) => {
      const r = kdjFromSeries(closes, p.p1);
      const i = closes.length - 1;
      const j = i - 1;
      if (i < 1 || r.k[i] === null || r.d[i] === null) return { bull: false, bear: false };
      return {
        bull: r.k[j] <= r.d[j] && r.k[i] > r.d[i],
        bear: r.k[j] >= r.d[j] && r.k[i] < r.d[i],
      };
    },
  },
  {
    id: 'cci',
    name: 'CCI 顺势指标',
    params: [{ key: 'p1', label: '周期', def: 14, min: 2, max: 60 }],
    compute: (closes, p) => [{ name: 'CCI', data: cciFromSeries(closes, p.p1), color: '#F2B95A' }],
    signals: (closes, p) => {
      const v = cciFromSeries(closes, p.p1);
      const i = closes.length - 1;
      const j = i - 1;
      if (i < 1 || v[i] === null || v[j] === null) return { bull: false, bear: false };
      return { bull: v[j] <= 0 && v[i] > 0, bear: v[j] >= 0 && v[i] < 0 };
    },
  },
  {
    id: 'rsi',
    name: 'RSI 相对强弱',
    params: [{ key: 'p1', label: '周期', def: 14, min: 2, max: 60 }],
    compute: (closes, p) => [{ name: 'RSI', data: rsi(closes, p.p1), color: '#F2B95A' }],
    signals: (closes, p) => {
      const v = rsi(closes, p.p1);
      const i = closes.length - 1;
      if (v[i] === null) return { bull: false, bear: false };
      return { bull: v[i] >= 70, bear: v[i] <= 30 };
    },
  },
  {
    id: 'wpr',
    name: 'W&R 威廉指标',
    params: [{ key: 'p1', label: '周期', def: 14, min: 2, max: 60 }],
    compute: (closes, p) => [{ name: 'W&R', data: wprFromSeries(closes, p.p1), color: '#4FCDCD' }],
    signals: (closes, p) => {
      const v = wprFromSeries(closes, p.p1);
      const i = closes.length - 1;
      if (v[i] === null) return { bull: false, bear: false };
      return { bull: v[i] <= 20, bear: v[i] >= 80 };
    },
  },
  {
    id: 'mtm',
    name: 'MTM 动量',
    params: [{ key: 'p1', label: '周期', def: 6, min: 1, max: 60 }],
    compute: (closes, p) => [{ name: 'MTM', data: mtm(closes, p.p1), color: '#F2B95A' }],
  },
  {
    id: 'bbi',
    name: 'BBI 多空均线',
    overlay: true,
    params: [{ key: 'p1', label: '基准', def: 3, min: 2, max: 24 }],
    compute: (closes, p) => [
      { name: 'BBI', data: bbi(closes, [p.p1, p.p1 * 2, p.p1 * 4, p.p1 * 8]), color: '#B58CF2' },
    ],
  },
  {
    id: 'atr',
    name: 'ATR 真实波幅',
    params: [{ key: 'p1', label: '周期', def: 14, min: 2, max: 60 }],
    compute: (closes, p) => [{ name: 'ATR', data: atrFromSeries(closes, p.p1), color: '#B58CF2' }],
  },
  {
    id: 'dmi',
    name: 'DMI / ADX',
    params: [{ key: 'p1', label: '周期', def: 14, min: 2, max: 60 }],
    compute: (closes, p) => {
      const r = dmiFromSeries(closes, p.p1);
      return [
        { name: '+DI', data: r.pdi, color: '#EF6661' },
        { name: '−DI', data: r.mdi, color: '#4FCDCD' },
        { name: 'ADX', data: r.adx, color: '#F2B95A' },
      ];
    },
    signals: (closes, p) => {
      const r = dmiFromSeries(closes, p.p1);
      const i = closes.length - 1;
      if (r.pdi[i] === null || r.mdi[i] === null) return { bull: false, bear: false };
      return { bull: r.pdi[i] > r.mdi[i], bear: r.pdi[i] < r.mdi[i] };
    },
  },
  {
    id: 'sar',
    name: 'SAR 抛物线转向',
    overlay: true,
    params: [{ key: 'p1', label: '步长×100', def: 2, min: 1, max: 20 }],
    compute: (closes, p) => [
      { name: 'SAR', data: sarFromSeries(closes, p.p1 / 100, 0.2), color: '#EF6661' },
    ],
  },
];

/** 默认指标参数表 */
export function defaultParams(def: IndicatorDef): Record<string, number> {
  const p: Record<string, number> = {};
  for (const item of def.params) p[item.key] = item.def;
  return p;
}

export function getIndicator(id: string): IndicatorDef | undefined {
  return INDICATOR_LIST.find((x) => x.id === id);
}

/** 取序列最后一个非空值 */
export function lastValue(data: Num[]): number | null {
  for (let i = data.length - 1; i >= 0; i -= 1) {
    if (data[i] !== null && Number.isFinite(data[i])) return data[i];
  }
  return null;
}

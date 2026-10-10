/**
 * 技术指标引擎 —— 纯函数，零依赖，不引用任何原生模块
 *
 * ---------------------------------------------------------------------------
 * 通用约定
 * ---------------------------------------------------------------------------
 * 1. 所有输入序列均为「正序」：index 0 为最旧一期，末尾为最新一期。
 * 2. 返回的数组与输入「等长、下标对齐」，数据不足的位置一律为 null，
 *    绝不用 0 或 NaN 占位，方便图表直接跳过。
 * 3. 空数组 / 长度不足 / 非法周期（<= 0）一律安全返回（空数组或全 null），不抛异常。
 * 4. 输入中的 NaN / Infinity 统一按 0 处理，避免污染整条序列。
 * 5. 所有除法都做分母判零：分母为 0 时返回 0（或该位置为 null），不产生 Infinity/NaN。
 *
 * ---------------------------------------------------------------------------
 * 各指标口径（口径尽量对齐通达信 / 同花顺主流行情软件）
 * ---------------------------------------------------------------------------
 * SMA(n)    ：简单移动平均，前 n-1 个为 null，第 n 项起取窗口算术平均。
 * EMA(n)    ：指数移动平均，alpha = 2/(n+1)；首值以前 n 项 SMA 作种子，
 *             之后 EMA = alpha*X + (1-alpha)*EMA_prev。EXPMA 与之等价（独立导出）。
 * BOLL(n,k) ：中轨 = SMA(n)；上下轨 = 中轨 ± k × 总体标准差（除以 n，非 n-1）。
 * MACD      ：DIFF = EMA(fast) - EMA(slow)；DEA = EMA(DIFF, signal)；
 *             MACD 柱 = (DIFF - DEA) × 2（国内软件惯例，柱体放大一倍）。
 * KDJ(n,m1,m2)：RSV = (C - LLV(L,n)) / (HHV(H,n) - LLV(L,n)) × 100，
 *             最高最低价相等（分母为 0）时 RSV 取 50 中性值；
 *             K = SMA(RSV, m1)，D = SMA(K, m2)，J = 3K - 2D；K/D 初值 50，
 *             窗口不足的前 n-1 项为 null。
 * RSI(n)    ：Wilder 平滑；涨跌幅分别平滑后 RS = 平均涨幅 / 平均跌幅，
 *             RSI = 100 - 100/(1+RS)。平均跌幅为 0 且涨幅为 0 记 50，
 *             仅跌幅为 0 记 100。
 * CCI(n)    ：TP = (H+L+C)/3；MA = SMA(TP, n)；MD = 平均绝对偏差 Σ|TP-MA|/n；
 *             CCI = (TP - MA) / (0.015 × MD)，MD 为 0 时记 0。
 * W&R(n)    ：威廉指标，(HHV(H,n) - C) / (HHV(H,n) - LLV(L,n)) × -100，
 *             取值 -100 ~ 0；分母为 0 时记 0。
 * ATR(n)    ：TR = max(H-L, |H-PC|, |L-PC|)，PC 为前收；首根 TR = H-L；
 *             ATR = Wilder 平滑（首值为前 n 根 TR 的算术平均）。
 * MTM(n)    ：动量，MTM[i] = V[i] - V[i-n]，前 n 项为 null。
 * BBI       ：多空均线，BBI = (MA3 + MA6 + MA12 + MA24) / 4，
 *             任一均线为 null 时该位置为 null。
 * DMI/ADX(n)：+DM/-DM 按「向上/向下运动较大者且 > 0」取值，TR 同 ATR；
 *             +DI = 100×平滑+DM/平滑TR，-DI = 100×平滑-DM/平滑TR；
 *             DX = 100×|+DI - -DI| / (+DI + -DI)，ADX = DX 的 Wilder 平滑。
 *             TR 为 0 时 DI 记 0；+DI+-DI 为 0 时 DX 记 0。
 * SAR       ：抛物线转向（Wilder）。趋势由前两根重心判定，
 *             极值点 EP 与加速因子 AF（步长 afStep，上限 afMax）递推；
 *             SAR 受前两根最高/最低价钳制，翻转时 AF 重置为步长。
 * 单序列版本：kdjFromSeries / cciFromSeries / wprFromSeries / atrFromSeries /
 *             dmiFromSeries / sarFromSeries 把同一序列同时当作 H/L/C 使用，
 *             专为彩票「开出 0/1」「遗漏值」这类只有一条曲线的场景准备。
 * resonance ：指标共振。全部为真 → 1（共振看多），全为假 → -1（共振看空），
 *             其余 → 0（无共振）；空数组记 0。
 */

/** 序列元素类型：数值或「数据不足」 */
export type Num = number | null;

/** 布林通道结果 */
export interface BollResult {
  /** 中轨 SMA(n) */
  mid: Num[];
  /** 上轨 mid + k×std */
  upper: Num[];
  /** 下轨 mid - k×std */
  lower: Num[];
}

/** MACD 结果 */
export interface MacdResult {
  /** 快线减慢线 */
  diff: Num[];
  /** 信号线（DEA） */
  dea: Num[];
  /** 柱状值 (diff - dea) × 2 */
  macd: Num[];
}

/** KDJ 结果 */
export interface KdjResult {
  k: Num[];
  d: Num[];
  j: Num[];
}

/** DMI / ADX 结果 */
export interface DmiResult {
  /** 上升方向线 +DI */
  pdi: Num[];
  /** 下降方向线 -DI */
  mdi: Num[];
  /** 平均趋向指数 ADX */
  adx: Num[];
}

/** 下拉列表用的指标定义 */
export interface IndicatorDef {
  /** 英文小写标识 */
  id: string;
  /** 中文名称 */
  name: string;
  /** 单序列 -> 序列 的纯函数（取该指标的主线，便于 UI 统一渲染） */
  fn: (values: number[]) => Num[];
}

/* -------------------------------------------------------------------------- */
/*                                  内部工具                                   */
/* -------------------------------------------------------------------------- */

/** 非有限值（NaN / Infinity）按 0 处理 */
function finite(v: number): number {
  return Number.isFinite(v) ? v : 0;
}

/** 清洗输入序列：非有限值归零 */
function clean(values: number[]): number[] {
  return values.map(finite);
}

/** 生成长度为 n 的全 null 序列 */
function nulls(n: number): Num[] {
  return new Array<Num>(n).fill(null);
}

/** 窗口内最小值（LLV）；窗口为空时返回 0 */
function llv(values: number[], end: number, n: number): number {
  let min = Infinity;
  const start = Math.max(0, end - n + 1);
  for (let i = start; i <= end; i += 1) {
    if (values[i] < min) min = values[i];
  }
  return min === Infinity ? 0 : min;
}

/** 窗口内最大值（HHV）；窗口为空时返回 0 */
function hhv(values: number[], end: number, n: number): number {
  let max = -Infinity;
  const start = Math.max(0, end - n + 1);
  for (let i = start; i <= end; i += 1) {
    if (values[i] > max) max = values[i];
  }
  return max === -Infinity ? 0 : max;
}

/**
 * Wilder 平滑（RMA）：首值取前 period 个有效值的算术平均，
 * 之后 prev = (prev × (period - 1) + v) / period。
 * 自动跳过 null；不足 period 个有效值时结果为 null。
 */
function wilder(values: Num[], period: number): Num[] {
  const n = values.length;
  const out = nulls(n);
  if (n === 0 || period <= 0) return out;
  let sum = 0;
  let count = 0;
  let prev = 0;
  for (let i = 0; i < n; i += 1) {
    const v = values[i];
    if (v === null) continue;
    if (count < period) {
      sum += v;
      count += 1;
      if (count === period) {
        prev = sum / period;
        out[i] = prev;
      }
    } else {
      prev = (prev * (period - 1) + v) / period;
      out[i] = prev;
    }
  }
  return out;
}

/** 真实波幅 TR 序列：首根为 H-L，其余取三者最大值 */
function trueRange(high: number[], low: number[], close: number[], len: number): number[] {
  const tr = new Array<number>(len).fill(0);
  for (let i = 0; i < len; i += 1) {
    if (i === 0) {
      tr[0] = high[0] - low[0];
      continue;
    }
    const pc = close[i - 1];
    tr[i] = Math.max(high[i] - low[i], Math.abs(high[i] - pc), Math.abs(low[i] - pc));
  }
  return tr;
}

/** 三序列对齐长度（取最短，避免下标越界） */
function alignLen(a: number[], b: number[], c: number[]): number {
  return Math.min(a.length, b.length, c.length);
}

/* -------------------------------------------------------------------------- */
/*                                  趋势类指标                                 */
/* -------------------------------------------------------------------------- */

/**
 * 简单移动平均 SMA(n)
 * 前 period-1 项为 null，第 period 项起为窗口算术平均。
 */
export function sma(values: number[], period: number): Num[] {
  const v = clean(values);
  const n = v.length;
  if (n === 0) return [];
  if (period <= 0) return nulls(n);
  const out = nulls(n);
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    sum += v[i];
    if (i >= period) sum -= v[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * 指数移动平均 EMA(n)
 * alpha = 2/(n+1)；首值以前 n 项 SMA 为种子，之后递归。
 */
export function ema(values: number[], period: number): Num[] {
  const v = clean(values);
  const n = v.length;
  if (n === 0) return [];
  if (period <= 0) return nulls(n);
  const out = nulls(n);
  const alpha = 2 / (period + 1);
  let seed = 0;
  let prev = 0;
  for (let i = 0; i < n; i += 1) {
    if (i < period - 1) {
      seed += v[i];
      continue;
    }
    if (i === period - 1) {
      seed += v[i];
      prev = seed / period;
    } else {
      prev = alpha * v[i] + (1 - alpha) * prev;
    }
    out[i] = prev;
  }
  return out;
}

/**
 * 布林通道 BOLL(n, k)
 * 中轨 = SMA(n)，上下轨 = 中轨 ± k × 总体标准差。
 */
export function boll(values: number[], period = 20, mult = 2): BollResult {
  const v = clean(values);
  const n = v.length;
  if (n === 0) return { mid: [], upper: [], lower: [] };
  if (period <= 0) return { mid: nulls(n), upper: nulls(n), lower: nulls(n) };
  const mid = nulls(n);
  const upper = nulls(n);
  const lower = nulls(n);
  for (let i = period - 1; i < n; i += 1) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j += 1) sum += v[j];
    const avg = sum / period;
    let sq = 0;
    for (let j = i - period + 1; j <= i; j += 1) {
      const d = v[j] - avg;
      sq += d * d;
    }
    const sd = Math.sqrt(sq / period);
    mid[i] = avg;
    upper[i] = avg + mult * sd;
    lower[i] = avg - mult * sd;
  }
  return { mid, upper, lower };
}

/**
 * 指数平滑异同移动平均 MACD(fast, slow, signal)
 * DIFF = EMA(fast) - EMA(slow)；DEA = EMA(DIFF, signal)；MACD = (DIFF - DEA) × 2。
 */
export function macd(values: number[], fast = 12, slow = 26, signal = 9): MacdResult {
  const v = clean(values);
  const n = v.length;
  if (n === 0) return { diff: [], dea: [], macd: [] };
  if (fast <= 0 || slow <= 0 || signal <= 0) {
    return { diff: nulls(n), dea: nulls(n), macd: nulls(n) };
  }
  const fastLine = ema(v, fast);
  const slowLine = ema(v, slow);
  const diff = nulls(n);
  for (let i = 0; i < n; i += 1) {
    const f = fastLine[i];
    const s = slowLine[i];
    if (f === null || s === null) continue;
    diff[i] = f - s;
  }

  // DEA 只对 DIFF 的有效段做 EMA，再按原下标回填
  const idx: number[] = [];
  const seg: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const d = diff[i];
    if (d === null) continue;
    idx.push(i);
    seg.push(d);
  }
  const deaSeg = ema(seg, signal);
  const dea = nulls(n);
  for (let k = 0; k < idx.length; k += 1) {
    const d = deaSeg[k];
    if (d === null) continue;
    dea[idx[k]] = d;
  }

  const bar = nulls(n);
  for (let i = 0; i < n; i += 1) {
    const d = diff[i];
    const e = dea[i];
    if (d === null || e === null) continue;
    bar[i] = (d - e) * 2;
  }
  return { diff, dea, macd: bar };
}

/**
 * 多空均线 BBI = (MA3 + MA6 + MA12 + MA24) / 4
 * 任一均线不足时该位置为 null。
 */
export function bbi(values: number[], periods: number[] = [3, 6, 12, 24]): Num[] {
  const v = clean(values);
  const n = v.length;
  const ps = periods.filter((p) => p > 0);
  if (n === 0 || ps.length === 0) return nulls(n);
  const lines = ps.map((p) => sma(v, p));
  const out = nulls(n);
  for (let i = 0; i < n; i += 1) {
    let sum = 0;
    let ok = true;
    for (const line of lines) {
      const x = line[i];
      if (x === null) {
        ok = false;
        break;
      }
      sum += x;
    }
    if (ok) out[i] = sum / ps.length;
  }
  return out;
}

/** 指数平均 EXPMA(n)，与 EMA 同口径，独立导出便于 UI 直接选用 */
export function expma(values: number[], period: number): Num[] {
  return ema(values, period);
}

/**
 * 动量指标 MTM(n) = V[i] - V[i-n]
 * 前 n 项为 null。
 */
export function mtm(values: number[], period = 6): Num[] {
  const v = clean(values);
  const n = v.length;
  if (n === 0) return [];
  if (period <= 0) return nulls(n);
  const out = nulls(n);
  for (let i = period; i < n; i += 1) {
    out[i] = v[i] - v[i - period];
  }
  return out;
}

/**
 * 抛物线转向 SAR
 * 返回与输入等长的 SAR 序列；长度不足 2 时仅首项有值（取最低价）或为空。
 */
export function sar(high: number[], low: number[], afStep = 0.02, afMax = 0.2): Num[] {
  const h = clean(high);
  const l = clean(low);
  const n = Math.min(h.length, l.length);
  if (n === 0) return [];
  const out = nulls(n);
  if (n === 1) {
    out[0] = l[0];
    return out;
  }
  const step = afStep > 0 ? afStep : 0.02;
  const cap = afMax >= step ? afMax : step;

  // 初始方向：前两根重心上移视为多头
  let isLong = h[1] + l[1] >= h[0] + l[0];
  let ep = isLong ? Math.max(h[0], h[1]) : Math.min(l[0], l[1]);
  let cur = isLong ? Math.min(l[0], l[1]) : Math.max(h[0], h[1]);
  let af = step;
  out[0] = null;
  out[1] = cur;

  for (let i = 2; i < n; i += 1) {
    cur = cur + af * (ep - cur);
    if (isLong) {
      // 多头 SAR 不得超过最近两根的最低价
      cur = Math.min(cur, l[i - 1], l[i - 2]);
      if (l[i] < cur) {
        // 跌破 SAR -> 翻空
        isLong = false;
        cur = ep;
        ep = l[i];
        af = step;
        cur = Math.max(cur, h[i - 1], h[i - 2]);
      } else if (h[i] > ep) {
        ep = h[i];
        af = Math.min(af + step, cap);
      }
    } else {
      // 空头 SAR 不得低于最近两根的最高价
      cur = Math.max(cur, h[i - 1], h[i - 2]);
      if (h[i] > cur) {
        // 升破 SAR -> 翻多
        isLong = true;
        cur = ep;
        ep = h[i];
        af = step;
        cur = Math.min(cur, l[i - 1], l[i - 2]);
      } else if (l[i] < ep) {
        ep = l[i];
        af = Math.min(af + step, cap);
      }
    }
    out[i] = cur;
  }
  return out;
}

/** 单序列版 SAR（同一序列兼作最高/最低价） */
export function sarFromSeries(values: number[], afStep = 0.02, afMax = 0.2): Num[] {
  return sar(values, values, afStep, afMax);
}

/* -------------------------------------------------------------------------- */
/*                                  摆动类指标                                 */
/* -------------------------------------------------------------------------- */

/**
 * 随机指标 KDJ(n, m1, m2)
 * RSV 分母为 0（最高最低相等）时取 50 中性值；K/D 初值 50。
 */
export function kdj(
  high: number[],
  low: number[],
  close: number[],
  n = 9,
  m1 = 3,
  m2 = 3,
): KdjResult {
  const h = clean(high);
  const l = clean(low);
  const c = clean(close);
  const len = alignLen(h, l, c);
  if (len === 0) return { k: [], d: [], j: [] };
  if (n <= 0 || m1 <= 0 || m2 <= 0) {
    return { k: nulls(len), d: nulls(len), j: nulls(len) };
  }
  const k = nulls(len);
  const d = nulls(len);
  const j = nulls(len);
  let pk = 50;
  let pd = 50;
  for (let i = n - 1; i < len; i += 1) {
    const hi = hhv(h, i, n);
    const lo = llv(l, i, n);
    const span = hi - lo;
    const rsv = span === 0 ? 50 : ((c[i] - lo) / span) * 100;
    pk = ((m1 - 1) * pk + rsv) / m1;
    pd = ((m2 - 1) * pd + pk) / m2;
    k[i] = pk;
    d[i] = pd;
    j[i] = 3 * pk - 2 * pd;
  }
  return { k, d, j };
}

/** 单序列版 KDJ（序列同时充当 H/L/C） */
export function kdjFromSeries(values: number[], n = 9): KdjResult {
  return kdj(values, values, values, n, 3, 3);
}

/**
 * 相对强弱 RSI(n)，Wilder 平滑
 * 平均跌幅为 0：涨幅也为 0 记 50，否则记 100。
 */
export function rsi(values: number[], period = 14): Num[] {
  const v = clean(values);
  const n = v.length;
  if (n === 0) return [];
  if (period <= 0 || n < 2) return nulls(n);
  const gain = nulls(n);
  const loss = nulls(n);
  for (let i = 1; i < n; i += 1) {
    const diff = v[i] - v[i - 1];
    gain[i] = diff > 0 ? diff : 0;
    loss[i] = diff < 0 ? -diff : 0;
  }
  const avgGain = wilder(gain, period);
  const avgLoss = wilder(loss, period);
  const out = nulls(n);
  for (let i = 0; i < n; i += 1) {
    const g = avgGain[i];
    const ls = avgLoss[i];
    if (g === null || ls === null) continue;
    if (ls === 0) {
      out[i] = g === 0 ? 50 : 100;
      continue;
    }
    out[i] = 100 - 100 / (1 + g / ls);
  }
  return out;
}

/**
 * 顺势指标 CCI(n)
 * TP = (H+L+C)/3，MD 为平均绝对偏差，MD 为 0 时记 0。
 */
export function cci(high: number[], low: number[], close: number[], period = 14): Num[] {
  const h = clean(high);
  const l = clean(low);
  const c = clean(close);
  const len = alignLen(h, l, c);
  if (len === 0) return [];
  if (period <= 0) return nulls(len);
  const tp = new Array<number>(len).fill(0);
  for (let i = 0; i < len; i += 1) tp[i] = (h[i] + l[i] + c[i]) / 3;
  const ma = sma(tp, period);
  const out = nulls(len);
  for (let i = period - 1; i < len; i += 1) {
    const m = ma[i];
    if (m === null) continue;
    let dev = 0;
    for (let k = i - period + 1; k <= i; k += 1) dev += Math.abs(tp[k] - m);
    const md = dev / period;
    out[i] = md === 0 ? 0 : (tp[i] - m) / (0.015 * md);
  }
  return out;
}

/** 单序列版 CCI（序列同时充当 H/L/C，此时 TP 即序列本身） */
export function cciFromSeries(values: number[], period = 14): Num[] {
  return cci(values, values, values, period);
}

/**
 * 威廉指标 W&R(n)，取值 -100 ~ 0
 * (HHV(H,n) - C) / (HHV(H,n) - LLV(L,n)) × -100，分母为 0 时记 0。
 */
export function wpr(high: number[], low: number[], close: number[], period = 14): Num[] {
  const h = clean(high);
  const l = clean(low);
  const c = clean(close);
  const len = alignLen(h, l, c);
  if (len === 0) return [];
  if (period <= 0) return nulls(len);
  const out = nulls(len);
  for (let i = period - 1; i < len; i += 1) {
    const hi = hhv(h, i, period);
    const lo = llv(l, i, period);
    const span = hi - lo;
    out[i] = span === 0 ? 0 : ((hi - c[i]) / span) * -100;
  }
  return out;
}

/** 单序列版 W&R */
export function wprFromSeries(values: number[], period = 14): Num[] {
  return wpr(values, values, values, period);
}

/**
 * 平均真实波幅 ATR(n)，对 TR 做 Wilder 平滑
 */
export function atr(high: number[], low: number[], close: number[], period = 14): Num[] {
  const h = clean(high);
  const l = clean(low);
  const c = clean(close);
  const len = alignLen(h, l, c);
  if (len === 0) return [];
  if (period <= 0) return nulls(len);
  return wilder(trueRange(h, l, c, len), period);
}

/** 单序列版 ATR（TR 退化为相邻差值绝对值） */
export function atrFromSeries(values: number[], period = 14): Num[] {
  return atr(values, values, values, period);
}

/**
 * 趋向指标 DMI / ADX(n)
 * +DI/-DI 为 0 时 DX 记 0；ADX 是 DX 的 Wilder 平滑，故出现更晚。
 */
export function dmi(high: number[], low: number[], close: number[], period = 14): DmiResult {
  const h = clean(high);
  const l = clean(low);
  const c = clean(close);
  const len = alignLen(h, l, c);
  if (len === 0) return { pdi: [], mdi: [], adx: [] };
  if (period <= 0) return { pdi: nulls(len), mdi: nulls(len), adx: nulls(len) };

  const tr = trueRange(h, l, c, len);
  const pdm = new Array<number>(len).fill(0);
  const mdm = new Array<number>(len).fill(0);
  for (let i = 1; i < len; i += 1) {
    const up = h[i] - h[i - 1];
    const down = l[i - 1] - l[i];
    pdm[i] = up > down && up > 0 ? up : 0;
    mdm[i] = down > up && down > 0 ? down : 0;
  }

  const str = wilder(tr, period);
  const spdm = wilder(pdm, period);
  const smdm = wilder(mdm, period);

  const pdi = nulls(len);
  const mdi = nulls(len);
  const dx = nulls(len);
  for (let i = 0; i < len; i += 1) {
    const t = str[i];
    const p = spdm[i];
    const m = smdm[i];
    if (t === null || p === null || m === null) continue;
    const pv = t === 0 ? 0 : (p / t) * 100;
    const mv = t === 0 ? 0 : (m / t) * 100;
    pdi[i] = pv;
    mdi[i] = mv;
    const sum = pv + mv;
    dx[i] = sum === 0 ? 0 : (Math.abs(pv - mv) / sum) * 100;
  }
  return { pdi, mdi, adx: wilder(dx, period) };
}

/** 单序列版 DMI / ADX */
export function dmiFromSeries(values: number[], period = 14): DmiResult {
  return dmi(values, values, values, period);
}

/* -------------------------------------------------------------------------- */
/*                                 共振与清单                                  */
/* -------------------------------------------------------------------------- */

/**
 * 指标共振判定
 * 全部为真 -> 1（共振看多）；全为假 -> -1（共振看空）；其余 -> 0（无共振）。
 * 空数组视为无共振（0）。
 */
export function resonance(signals: boolean[]): 0 | 1 | -1 {
  if (signals.length === 0) return 0;
  let trueCount = 0;
  for (const s of signals) {
    if (s) trueCount += 1;
  }
  if (trueCount === signals.length) return 1;
  if (trueCount === 0) return -1;
  return 0;
}

/**
 * 指标清单（供 UI 下拉选择）。
 * fn 统一为「单序列 -> 序列」，取各指标主线，默认周期见各函数签名。
 */
export const INDICATOR_LIST: IndicatorDef[] = [
  { id: 'sma', name: '简单移动平均 SMA', fn: (v) => sma(v, 5) },
  { id: 'ema', name: '指数移动平均 EMA', fn: (v) => ema(v, 5) },
  { id: 'expma', name: '指数平均 EXPMA', fn: (v) => expma(v, 12) },
  { id: 'bbi', name: '多空均线 BBI', fn: (v) => bbi(v) },
  { id: 'boll_mid', name: '布林中轨 BOLL', fn: (v) => boll(v, 20, 2).mid },
  { id: 'boll_upper', name: '布林上轨', fn: (v) => boll(v, 20, 2).upper },
  { id: 'boll_lower', name: '布林下轨', fn: (v) => boll(v, 20, 2).lower },
  { id: 'macd_diff', name: 'MACD 快线 DIFF', fn: (v) => macd(v).diff },
  { id: 'macd_dea', name: 'MACD 信号线 DEA', fn: (v) => macd(v).dea },
  { id: 'macd_bar', name: 'MACD 柱', fn: (v) => macd(v).macd },
  { id: 'kdj_k', name: 'KDJ - K', fn: (v) => kdjFromSeries(v, 9).k },
  { id: 'kdj_d', name: 'KDJ - D', fn: (v) => kdjFromSeries(v, 9).d },
  { id: 'kdj_j', name: 'KDJ - J', fn: (v) => kdjFromSeries(v, 9).j },
  { id: 'rsi', name: '相对强弱 RSI', fn: (v) => rsi(v, 14) },
  { id: 'cci', name: '顺势指标 CCI', fn: (v) => cciFromSeries(v, 14) },
  { id: 'wpr', name: '威廉指标 W&R', fn: (v) => wprFromSeries(v, 14) },
  { id: 'atr', name: '平均真实波幅 ATR', fn: (v) => atrFromSeries(v, 14) },
  { id: 'mtm', name: '动量指标 MTM', fn: (v) => mtm(v, 6) },
  { id: 'dmi_pdi', name: 'DMI 上升方向线 +DI', fn: (v) => dmiFromSeries(v, 14).pdi },
  { id: 'dmi_mdi', name: 'DMI 下降方向线 -DI', fn: (v) => dmiFromSeries(v, 14).mdi },
  { id: 'adx', name: '平均趋向指数 ADX', fn: (v) => dmiFromSeries(v, 14).adx },
  { id: 'sar', name: '抛物线转向 SAR', fn: (v) => sarFromSeries(v) },
];

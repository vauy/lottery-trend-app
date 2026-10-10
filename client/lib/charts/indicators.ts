/**
 * 技术指标计算 —— 彩票数据口径
 *
 * 设计前提：彩票数据里没有「收盘价」。
 * 本项目里唯一有连续数值意义的两条序列是：
 *   1) diff     = 累计实出 − 累计理论（频率K线的实体高度来源）
 *   2) omission = 当前遗漏值（遗漏K线 / 遗漏图的纵轴来源）
 * 因此所有指标都不接收「价格」，只接收一条 number[]，由调用方决定喂哪条。
 *
 * 全部为纯函数：不依赖 ECharts、不依赖 React，可直接单测。
 */

/** 指标标识 */
export type IndicatorId = 'none' | 'macd' | 'kdj' | 'rsi' | 'cci' | 'adx' | 'sar';

/** 计算所需的最小样本量：不足时返回 null，由调用方显示「数据不足」 */
export type IndicatorResult = {
  /** 各子线数据；长度与输入等长，前段用 null 占位 */
  series: { key: string; label: string; color: string; data: (number | null)[] }[];
  /** 柱状序列（MACD 的 BAR 用），没有则为 undefined */
  bars?: { label: string; data: (number | null)[]; colors: string[] };
  /** 参考线（如 RSI 的 70/30），y 值数组 */
  guides?: { value: number; color: string; dashed?: boolean }[];
  /** y 轴固定范围；不传则自适应 */
  yRange?: { min: number; max: number };
};

export interface IndicatorContext {
  /**
   * 数值序列。调用方按图表语义传入：
   *   - 频率K线 / 频率类  → diff 序列
   *   - 遗漏K线 / 遗漏图  → omission 序列
   */
  values: number[];
  /**
   * 可选的第二序列。KDJ 的 RV 需要用「未开出过程的长度」度量波动，
   * 传 omission 进来可让 KDJ 更贴合彩票语义；不传则退化用 values。
   */
  values2?: number[];
}

/* ─────────────── 通用工具 ─────────────── */

/** 简单移动平均；前 period-1 项为 null */
export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * 指数移动平均。
 * 首个有效值取前 period 项的 SMA（与国内行情软件 MACD 口径一致），
 * 而不是从第一个点直接起步——后者在序列前段会严重偏高。
 */
export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length === 0) return out;
  if (values.length < period) return out;
  let seed = 0;
  for (let i = 0; i < period; i += 1) seed += values[i];
  let prev = seed / period;
  out[period - 1] = prev;
  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i += 1) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/* ─────────────── MACD ─────────────── */

/**
 * MACD（12, 26, 9）。
 * 输入建议用 diff 序列：diff 本身就是「实出强度相对理论的偏离」，
 * 快慢均线之差正好刻画这种偏离的加速/减速，语义与股票的 DIF 完全对应。
 */
export function calcMacd(
  values: number[],
  fast = 12,
  slow = 26,
  signal = 9,
): IndicatorResult | null {
  if (values.length < slow + signal) return null;
  const ef = ema(values, fast);
  const es = ema(values, slow);
  const dif: (number | null)[] = values.map((_, i) =>
    ef[i] !== null && es[i] !== null ? (ef[i] as number) - (es[i] as number) : null,
  );
  // DEA：对 DIF 的有效段做 EMA
  const firstValid = dif.findIndex((v) => v !== null);
  const compact = firstValid < 0 ? [] : (dif.slice(firstValid) as number[]);
  const deaCompact = ema(compact, signal);
  const dea: (number | null)[] = new Array(values.length).fill(null);
  deaCompact.forEach((v, i) => {
    if (v !== null) dea[firstValid + i] = v;
  });
  const bars: (number | null)[] = values.map((_, i) =>
    dif[i] !== null && dea[i] !== null
      ? ((dif[i] as number) - (dea[i] as number)) * 2
      : null,
  );

  return {
    series: [
      { key: 'dif', label: 'DIF', color: '#f0b429', data: dif },
      { key: 'dea', label: 'DEA', color: '#4dabf7', data: dea },
    ],
    bars: {
      label: 'MACD',
      data: bars,
      // 国内习惯：柱 > 0 红、柱 < 0 绿（本项目涨红跌绿）
      colors: bars.map((v) => ((v ?? 0) >= 0 ? '#e5484d' : '#12b886')),
    },
  };
}

/* ─────────────── KDJ ─────────────── */

/**
 * KDJ（9, 3, 3）。
 * values 即「当期的度量值」（遗漏值或 diff），用滑动窗口的
 * 最高/最低构造 RSV，等价于股票里用最高价/最低价——只是这里的高低
 * 来自「遗漏的波动幅度」，含义是「本期遗漏在近 9 期里处于高位还是低位」。
 */
export function calcKdj(
  values: number[],
  n = 9,
  m1 = 3,
  m2 = 3,
): IndicatorResult | null {
  if (values.length < n) return null;
  const k: (number | null)[] = new Array(values.length).fill(null);
  const d: (number | null)[] = new Array(values.length).fill(null);
  const j: (number | null)[] = new Array(values.length).fill(null);
  let prevK = 50;
  let prevD = 50;
  for (let i = n - 1; i < values.length; i += 1) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let t = i - n + 1; t <= i; t += 1) {
      if (values[t] > hi) hi = values[t];
      if (values[t] < lo) lo = values[t];
    }
    const span = hi - lo;
    // 全平（长时间无波动）时 RSV 取中值，避免除零
    const rsv = span === 0 ? 50 : ((values[i] - lo) / span) * 100;
    prevK = (prevK * (m1 - 1) + rsv) / m1;
    prevD = (prevD * (m2 - 1) + prevK) / m2;
    k[i] = prevK;
    d[i] = prevD;
    j[i] = 3 * prevK - 2 * prevD;
  }
  return {
    series: [
      { key: 'k', label: 'K', color: '#f0b429', data: k },
      { key: 'd', label: 'D', color: '#4dabf7', data: d },
      { key: 'j', label: 'J', color: '#e5484d', data: j },
    ],
    guides: [
      { value: 80, color: '#484f58', dashed: true },
      { value: 20, color: '#484f58', dashed: true },
    ],
  };
}

/* ─────────────── RSI ─────────────── */

/**
 * RSI（14）。
 * 把逐期变化拆成「上升能量」与「下降能量」：
 * diff 增大 = 实出跑赢理论，计为上涨；减小计为下跌。
 * 结果 0~100，越高说明强于理论的程度越极端。
 */
export function calcRsi(values: number[], period = 14): IndicatorResult | null {
  if (values.length < period + 1) return null;
  const out: (number | null)[] = new Array(values.length).fill(null);
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i += 1) {
    const ch = values[i] - values[i - 1];
    if (ch >= 0) gainSum += ch;
    else lossSum -= ch;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i += 1) {
    const ch = values[i] - values[i - 1];
    const gain = ch > 0 ? ch : 0;
    const loss = ch < 0 ? -ch : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return {
    series: [{ key: 'rsi', label: `RSI${period}`, color: '#f0b429', data: out }],
    guides: [
      { value: 70, color: '#484f58', dashed: true },
      { value: 30, color: '#484f58', dashed: true },
    ],
    yRange: { min: 0, max: 100 },
  };
}

/* ─────────────── CCI ─────────────── */

/**
 * CCI（14）：衡量当前值偏离自身均值的程度（以平均绝对偏差为单位）。
 * 彩票里的读法：数值远高于 +100 说明该指标近期「显著跑偏」，
 * 往往是遗漏堆积或实出爆发的前兆。
 */
export function calcCci(values: number[], period = 14): IndicatorResult | null {
  if (values.length < period) return null;
  const ma = sma(values, period);
  const out: (number | null)[] = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i += 1) {
    const mean = ma[i] as number;
    let dev = 0;
    for (let t = i - period + 1; t <= i; t += 1) dev += Math.abs(values[t] - mean);
    const md = dev / period;
    out[i] = md === 0 ? 0 : (values[i] - mean) / (0.015 * md);
  }
  return {
    series: [{ key: 'cci', label: `CCI${period}`, color: '#f0b429', data: out }],
    guides: [
      { value: 100, color: '#484f58', dashed: true },
      { value: -100, color: '#484f58', dashed: true },
    ],
  };
}

/* ─────────────── ADX ─────────────── */

/**
 * ADX（14）：趋势强度（不判方向，只判「有多趋势」）。
 * 彩票口径：把相邻变化当作方向运动，+DI/−DI 分别为向上的动能
 * 与向下的动能占比，ADX 高说明当前处于单边加速/单边衰竭阶段。
 */
export function calcAdx(values: number[], period = 14): IndicatorResult | null {
  if (values.length < period * 2) return null;
  const n = values.length;
  const plusDI: (number | null)[] = new Array(n).fill(null);
  const minusDI: (number | null)[] = new Array(n).fill(null);
  const adx: (number | null)[] = new Array(n).fill(null);

  const plusDM: number[] = new Array(n).fill(0);
  const minusDM: number[] = new Array(n).fill(0);
  const tr: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i += 1) {
    const up = values[i] - values[i - 1];
    plusDM[i] = up > 0 ? up : 0;
    minusDM[i] = up < 0 ? -up : 0;
    tr[i] = Math.abs(up);
  }

  // Wilder 平滑
  let trS = 0;
  let pS = 0;
  let mS = 0;
  for (let i = 1; i <= period; i += 1) {
    trS += tr[i];
    pS += plusDM[i];
    mS += minusDM[i];
  }
  const dxList: { idx: number; dx: number }[] = [];
  for (let i = period; i < n; i += 1) {
    if (i > period) {
      trS = trS - trS / period + tr[i];
      pS = pS - pS / period + plusDM[i];
      mS = mS - mS / period + minusDM[i];
    }
    const pdi = trS === 0 ? 0 : (pS / trS) * 100;
    const mdi = trS === 0 ? 0 : (mS / trS) * 100;
    plusDI[i] = pdi;
    minusDI[i] = mdi;
    const sum = pdi + mdi;
    dxList.push({ idx: i, dx: sum === 0 ? 0 : (Math.abs(pdi - mdi) / sum) * 100 });
  }
  // ADX = DX 的 Wilder 平滑
  if (dxList.length >= period) {
    let adxPrev = 0;
    for (let t = 0; t < period; t += 1) adxPrev += dxList[t].dx;
    adxPrev /= period;
    adx[dxList[period - 1].idx] = adxPrev;
    for (let t = period; t < dxList.length; t += 1) {
      adxPrev = (adxPrev * (period - 1) + dxList[t].dx) / period;
      adx[dxList[t].idx] = adxPrev;
    }
  }
  return {
    series: [
      { key: 'adx', label: 'ADX', color: '#f0b429', data: adx },
      { key: 'pdi', label: '+DI', color: '#e5484d', data: plusDI },
      { key: 'mdi', label: '-DI', color: '#12b886', data: minusDI },
    ],
    yRange: { min: 0, max: 100 },
  };
}

/* ─────────────── SAR ─────────────── */

/**
 * SAR（步长 0.02 / 极值 0.2）：抛物线转向。
 * 输出的是「跟随点位」，本身不画线而是画点；这里返回一条折线 + 每个点
 * 的多空方向（由调用方决定红/绿着色），与主图叠加时能直观看到趋势翻转。
 */
export function calcSar(
  values: number[],
  step = 0.02,
  maxAf = 0.2,
): IndicatorResult | null {
  const n = values.length;
  if (n < 3) return null;
  const out: (number | null)[] = new Array(n).fill(null);
  let bull = true;
  let af = step;
  let ep = values[0];
  let sar = values[0];
  out[0] = sar;
  for (let i = 1; i < n; i += 1) {
    let next = sar + af * (ep - sar);
    if (bull) {
      if (values[i] < next) {
        // 转空
        bull = false;
        af = step;
        next = ep;
        ep = values[i];
      } else if (values[i] > ep) {
        ep = values[i];
        af = Math.min(maxAf, af + step);
      }
    } else {
      if (values[i] > next) {
        bull = true;
        af = step;
        next = ep;
        ep = values[i];
      } else if (values[i] < ep) {
        ep = values[i];
        af = Math.min(maxAf, af + step);
      }
    }
    sar = next;
    out[i] = sar;
  }
  return {
    series: [{ key: 'sar', label: 'SAR', color: '#4dabf7', data: out }],
  };
}

/* ─────────────── 统一入口 ─────────────── */

/** 各指标的中文说明（设置面板里显示，参考图也是这么写的） */
export const INDICATOR_META: Record<
  Exclude<IndicatorId, 'none'>,
  { label: string; full: string; desc: string }
> = {
  macd: {
    label: 'MACD',
    full: '指数平滑异同移动平均线',
    desc:
      '用一快一慢两条均线之差（DIF）与其均线（DEA）判断实出强弱的加速与衰竭。柱体为正说明实出持续跑赢理论，为负说明持续落后于理论，柱体由负转正通常对应趋势拐点。',
  },
  kdj: {
    label: 'KDJ',
    full: '随机指标',
    desc:
      '取最近 9 期的最高、最低值构造 RSV，衡量当期数值在近期区间里的相对位置。K、D 在 20 以下为低位、80 以上为高位，J 线最敏感，突破 100 或跌破 0 常是极端信号。',
  },
  rsi: {
    label: 'RSI',
    full: '相对强弱指标',
    desc:
      '把逐期涨跌能量拆开对比，得出 0~100 的强弱值。70 以上说明近期上行能量明显占优，30 以下说明下行动能占优，可用于判断是否已经走到极端。',
  },
  cci: {
    label: 'CCI',
    full: '顺势指标',
    desc:
      '衡量当前值偏离自身均值的程度，以平均绝对偏差为单位。突破 +100 表示显著向上偏离均值，跌破 −100 表示显著向下偏离，常用于捕捉偏离过大的回归机会。',
  },
  adx: {
    label: 'ADX',
    full: '平均趋向指标',
    desc:
      '只判断趋势「强弱」不判断方向。ADX 走高说明当前处于单边阶段（持续开出或持续遗漏），走低说明进入震荡。配合 +DI 与 −DI 的交叉判断方向。',
  },
  sar: {
    label: 'SAR',
    full: '抛物线转向指标',
    desc:
      '以抛物线的方式跟随数值移动，点在上方表示当前为下行状态，点在下方表示上行状态。每期一个点，转向时是最直观的趋势反转提示。',
  },
};

export const INDICATOR_ORDER: Exclude<IndicatorId, 'none'>[] = [
  'macd',
  'kdj',
  'rsi',
  'cci',
  'adx',
  'sar',
];

/**
 * 按 id 计算指标。
 * @returns 指标数据；数据量不足或未知 id 返回 null
 */
export function computeIndicator(
  id: IndicatorId,
  ctx: IndicatorContext,
): IndicatorResult | null {
  const { values, values2 } = ctx;
  if (values.length === 0) return null;
  switch (id) {
    case 'macd':
      return calcMacd(values);
    case 'kdj':
      // 有 second 序列时，用两条序列的差值放大波动区间，KDJ 更灵敏
      return calcKdj(
        values2 && values2.length === values.length
          ? values.map((v, i) => v - values2[i])
          : values,
      );
    case 'rsi':
      return calcRsi(values);
    case 'cci':
      return calcCci(values);
    case 'adx':
      return calcAdx(values);
    case 'sar':
      return calcSar(values);
    default:
      return null;
  }
}

/* ─────────────── MA 均线配置 ─────────────── */

/** MA 页签里可配置的均线档位（照参考图的 10/20/30/45/60/90） */
export interface MaConfig {
  period: number;
  color: string;
  enabled: boolean;
}

/** 默认 MA 配置：参考图里是 10/20/30/45/60/90/120，本项目取前 6 档 */
export const DEFAULT_MA: MaConfig[] = [
  { period: 10, color: '#f0b429', enabled: true },
  { period: 20, color: '#e5484d', enabled: true },
  { period: 30, color: '#c678dd', enabled: true },
  { period: 45, color: '#e8890c', enabled: true },
  { period: 60, color: '#9d4edd', enabled: true },
  { period: 90, color: '#4dabf7', enabled: false },
];

/** 参考图里可选的均线颜色（照抄它的色板顺序） */
export const MA_COLORS = [
  '#f0b429',
  '#e5484d',
  '#c678dd',
  '#e8890c',
  '#9d4edd',
  '#4dabf7',
  '#12b886',
  '#f783ac',
];

export const MA_PERIODS = [5, 10, 15, 20, 25, 30, 45, 60, 90, 120];

/** 生成所有已启用均线的 {period, color, data} 列表 */
export function computeMa(
  values: number[],
  configs: MaConfig[],
): { period: number; color: string; data: (number | null)[] }[] {
  return configs
    .filter((c) => c.enabled && c.period > 0)
    .map((c) => ({ period: c.period, color: c.color, data: sma(values, c.period) }));
}

/**
 * 多联图 HTML 构造 —— 纯函数，不依赖 React / react-native。
 *
 * 拆出来的原因：WebView 里的内容是这个函数的唯一产物，
 * 脱离 RN 也能直接跑（可用 Node + chromium 截图自检），
 * 不必为了验证图表而把整个 App 跑起来。
 */
import { ECHARTS_SOURCE } from '@/lib/echartsSource';
import { palette, semantic } from '@/lib/theme';
import {
  computeIndicator,
  computeMa,
  INDICATOR_META,
  type IndicatorId,
  type MaConfig,
} from '@/lib/charts/indicators';
import { buildBoll, type KBar } from './chartMath';

/** 每张图最多画多少根 K（与行情软件一致，太多会糊成一片） */
const MAX_SHOW = 160;
/** 一个 cell 里最多放几个副图（参考图是 2 个） */
export const MAX_SUB_PANES = 2;

const FN = '__ECHART_FN__';
/**
 * option 里有 renderItem 这类必须作为**函数**注入的字段，
 * 而 JSON.stringify 会把函数整个丢掉、把函数字符串加引号变成字符串。
 * 所以函数统一用 FN 标记包起来，最后再反解成裸函数文本。
 */
function serialize(option: unknown): string {
  return JSON.stringify(option).replace(
    new RegExp(`"${FN}(.*?)${FN}"`, 'g'),
    (_m, code: string) => JSON.parse(`"${code}"`) as string,
  );
}

/* 全部沿用现有主题 token，不引入新配色 */
const UP = semantic.hot;      // 涨 = 红
const DOWN = semantic.cold;   // 跌 = 绿
const AXIS = palette.line;
const TICK = palette.inkFaint;
const TITLE = palette.inkDim;
// 与原 EChartsFreqKChart 保持一致：布林带用 accent、中轨用 amber
const BOLL_COLOR = palette.accent;
const MID_COLOR = palette.amber;

/** ECharts 里 null 要变成真实 null，不能是 undefined */
const toPairs = (data: (number | null)[]) =>
  data.map((v, i) => (v === null ? null : [i, v]));

export interface MultiPaneHtmlOptions {
  /** K 线序列（已按周期聚合） */
  bars: KBar[];
  /** 主图叠加的均线配置 */
  maConfigs: MaConfig[];
  /** 是否画布林通道 */
  showBoll?: boolean;
  /** 副图指标（最多取前 MAX_SUB_PANES 个） */
  indicators: IndicatorId[];
  height: number;
  width: number;
  /** 左上角标题（如「频率K 毒胆·0 27.1%」） */
  title?: string;
  /** 主图右上角数值行（如「上轨:2196.2 中轨:2357.96 下轨:2519.71」） */
  metaLine?: string;
}

export function buildMultiPaneHtml({
  bars,
  maConfigs,
  showBoll = true,
  indicators,
  height,
  width,
  title,
  metaLine,
}: MultiPaneHtmlOptions): string {
  const subs = indicators.filter((i) => i !== 'none').slice(0, MAX_SUB_PANES);
  const show = bars.length > MAX_SHOW ? bars.slice(-MAX_SHOW) : bars;
  const n = show.length;
  if (n === 0) {
    return `<html><body style="margin:0;display:flex;align-items:center;justify-content:center;color:${TICK};font-size:12px;font-family:sans-serif">暂无数据</body></html>`;
  }

  const closes = show.map((b) => b.c);
  // 彩票 K 线没有真实的最高/最低价。单期 K 用每根实体两端构造 H/L；
  // 周期K线则由 aggregate 直接按官方口径给出真实的段内高低点。
  // ADX 的 TR 必须用它们：若退化成 |c−o| 会与 +DM+(−DM) 同值，
  // 导致 +DI/−DI 永远互补成 100（实测标准差 0.00000000 的老 BUG）。
  const highs = show.map((b) => b.h ?? Math.max(b.o, b.c));
  const lows = show.map((b) => b.l ?? Math.min(b.o, b.c));
  const maList = computeMa(closes, maConfigs);
  const boll = showBoll ? buildBoll(closes, Math.min(20, Math.max(2, n)), 2) : null;
  const subResults = subs.map((id) => ({
    id,
    res: computeIndicator(id, { values: closes, highs, lows }),
  }));

  /* ───── 主图 y 轴范围：K 线实体 + 影线 + 均线 + 布林 ───── */
  const mainY: number[] = [];
  for (let i = 0; i < n; i += 1) mainY.push(show[i].o, show[i].c, highs[i], lows[i]);
  for (const m of maList) for (const v of m.data) if (v !== null) mainY.push(v);
  if (boll) {
    for (const v of boll.upper) if (v !== null) mainY.push(v);
    for (const v of boll.lower) if (v !== null) mainY.push(v);
  }
  const mainMin = Math.min(0, ...mainY);
  const mainMax = Math.max(0, ...mainY);

  /* ───── tooltip 数据行：每期一条（期号/开高低收/MA/布林三轨），formatter 按 dataIndex 取 ───── */
  const tooltipRows: string[] = show.map((b, i) => {
    const hi = b.h ?? Math.max(b.o, b.c);
    const lo = b.l ?? Math.min(b.o, b.c);
    const parts = [
      `${b.issue}`,
      `开 ${b.o.toFixed(2)}`,
      `高 ${hi.toFixed(2)}`,
      `低 ${lo.toFixed(2)}`,
      `收 ${b.c.toFixed(2)}`,
    ];
    maList.forEach((mm) => {
      const v = mm.data[i];
      if (v !== null && v !== undefined) parts.push(`MA${mm.period} ${Number(v).toFixed(2)}`);
    });
    if (boll) {
      const up = boll.upper[i];
      const mid = boll.mid[i];
      const low = boll.lower[i];
      if (up !== null && up !== undefined) parts.push(`上轨 ${Number(up).toFixed(2)}`);
      if (mid !== null && mid !== undefined) parts.push(`中轨 ${Number(mid).toFixed(2)}`);
      if (low !== null && low !== undefined) parts.push(`下轨 ${Number(low).toFixed(2)}`);
    }
    return parts.join('   ');
  });

  /* ───── 各 grid 的高度分配 ─────
   * 踩过的坑：grid.top / height 写**数字**时，ECharts 会把它当像素用，
   * 且 containLabel 会给轴标签额外「撑高」整个 grid —— 主图吃掉大半高度、
   * 副图被挤到 canvas 之外，实测只剩十几像素（用 CDP 读 getOption 确认过）。
   * 现在统一用**百分比**（相对高度），并关掉 containLabel，
   * 用左侧固定留白给 y 轴刻度，高度分配才完全可控。 */
  const hasHeader = !!title || !!metaLine;
  const headerPct = hasHeader ? (height > 0 ? (26 / height) * 100 : 8) : 0;
  const bottomPct = height > 0 ? (20 / height) * 100 : 6;

  const subRatio = subs.length === 0 ? 0 : subs.length === 1 ? 0.24 : 0.2;
  const gapPct = subs.length === 0 ? 0 : height > 0 ? (6 / height) * 100 : 2;
  const bodyPct = 100 - headerPct - bottomPct;
  // 副图绝对高度上限 64px，换算成百分比（矮屏上防止副图把主图挤没）
  const subCapPct = height > 0 ? (64 / height) * 100 : 20;
  const subPct = subs.length === 0 ? 0 : Math.min(subCapPct, bodyPct * subRatio);
  const mainPct = Math.max(20, bodyPct - subs.length * (subPct + gapPct));

  const grids: Record<string, unknown>[] = [
    { left: 34, right: 8, top: `${headerPct}%`, height: `${mainPct}%` },
  ];
  subResults.forEach((_, i) => {
    const top = headerPct + mainPct + gapPct + i * (subPct + gapPct);
    // 副图左侧只给指标名留一点位置（它不画 y 刻度）
    grids.push({ left: 4, right: 8, top: `${top}%`, height: `${subPct}%` });
  });

  /* ───── x 轴：主副图共用同一套标签 ───── */
  const labelStep = Math.max(1, Math.ceil(n / 6));
  const xLabels = show.map((b, i) => (i % labelStep === 0 || i === n - 1 ? b.issue.slice(-3) : ''));
  const makeXAxis = (gi: number, isMain: boolean) => ({
    gridIndex: gi,
    type: 'category',
    data: xLabels,
    boundaryGap: true,
    axisTick: { show: false },
    axisLine: { lineStyle: { color: AXIS } },
    axisLabel: isMain ? { show: false } : { fontSize: 7, color: TICK, interval: 0 },
    splitLine: { show: false },
  });
  const makeYAxis = (gi: number, min?: number, max?: number) => {
    const isMain = gi === 0;
    const ax: Record<string, unknown> = {
      gridIndex: gi,
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: AXIS, type: 'dashed' }, show: isMain },
      // 副图的 y 刻度不画：它的量纲和主图完全不同（MACD 是 ±几、ADX 是 0~100），
      // 两套刻度叠在同一个左侧栏里会互相压字（实测截图里「-4.0」和「80」重在一起）。
      // 参考图里副图也只有曲线，没有刻度。
      axisLabel: {
        show: isMain,
        fontSize: 7,
        color: TICK,
        // 主图刻度是「累计实出−理论」，可能是 28.2237862… 这种长小数；
        // 不格式化会直接铺满一整行、盖住左上角标题（实测截图如此）。
        formatter: `${FN}function (v) {
          var a = Math.abs(v);
          if (a >= 1000) return (v / 1000).toFixed(1) + 'k';
          if (a >= 100) return v.toFixed(0);
          return v.toFixed(1);
        }${FN}`,
      },
    };
    if (min !== undefined && max !== undefined) {
      ax.min = min;
      ax.max = max;
    } else {
      ax.scale = true;
    }
    return ax;
  };

  /* ───── 主图 series：K 线（实体 + 上下影线）+ 均线 + 布林 ─────
   * data 每行是 [idx, o, c, h, l]；h/l 由 aggregate 给出，
   * 单期 K 时 h/l 等于实体两端，影线自然退化为零长。 */
  const candleSeries = {
    type: 'custom',
    renderItem: `${FN}function(params, api) {
      var idx = api.value(0);
      var o = api.value(1);
      var c = api.value(2);
      var h = api.value(3);
      var l = api.value(4);
      var x = api.coord([idx, 0])[0];
      var yO = api.coord([idx, o])[1];
      var yC = api.coord([idx, c])[1];
      var yH = api.coord([idx, h])[1];
      var yL = api.coord([idx, l])[1];
      var bodyTop = Math.min(yO, yC);
      var bodyBot = Math.max(yO, yC);
      var bh = Math.max(1.5, bodyBot - bodyTop);
      var bw = Math.max(1.5, Math.min(5, (params.coordSys.width / ${n}) * 0.6));
      var up = c >= o;
      var fill = up ? '${UP}' : '${DOWN}';
      var children = [
        {
          type: 'line',
          shape: { x1: x, y1: yH, x2: x, y2: yL },
          style: { stroke: fill, lineWidth: 1 }
        },
        {
          type: 'rect',
          shape: { x: x - bw / 2, y: bodyTop, width: bw, height: bh },
          style: { fill: fill }
        }
      ];
      return { type: 'group', children: children };
    }${FN}`,
    data: show.map((b, i) => [i, b.o, b.c, highs[i], lows[i]]),
    xAxisIndex: 0,
    yAxisIndex: 0,
    z: 5,
  };

  const maSeries = maList.map((m) => ({
    type: 'line',
    data: toPairs(m.data),
    xAxisIndex: 0,
    yAxisIndex: 0,
    lineStyle: { color: m.color, width: 1 },
    symbol: 'none',
    silent: true,
    z: 3,
  }));

  const bollSeries = boll
    ? [
        {
          type: 'line',
          data: toPairs(boll.upper),
          xAxisIndex: 0,
          yAxisIndex: 0,
          lineStyle: { color: BOLL_COLOR, width: 1 },
          symbol: 'none',
          silent: true,
          z: 2,
        },
        {
          type: 'line',
          data: toPairs(boll.mid),
          xAxisIndex: 0,
          yAxisIndex: 0,
          lineStyle: { color: MID_COLOR, width: 1, type: 'dashed' },
          symbol: 'none',
          silent: true,
          z: 2,
        },
        {
          type: 'line',
          data: toPairs(boll.lower),
          xAxisIndex: 0,
          yAxisIndex: 0,
          lineStyle: { color: BOLL_COLOR, width: 1 },
          symbol: 'none',
          silent: true,
          z: 2,
        },
      ]
    : [];

  /* ───── 副图 series ───── */
  const subSeries: Record<string, unknown>[] = [];
  const subGraphic: Record<string, unknown>[] = [];
  subResults.forEach(({ id, res }, i) => {
    const gi = i + 1;
    // grid.top 是百分比字符串，graphic 的 top 也要用同一套相对坐标
    const gridTop = grids[gi].top as string;
    if (!res) {
      subGraphic.push({
        type: 'text',
        left: 8,
        top: gridTop,
        style: { text: `${INDICATOR_META[id].label} 数据不足`, fontSize: 9, fill: TICK },
      });
      return;
    }
    // MACD 的柱：颜色写进 data item，不用函数式 itemStyle（序列化会把函数丢掉）
    if (res.bars) {
      subSeries.push({
        type: 'bar',
        data: res.bars.data.map((v, di) =>
          v === null ? null : { value: v, itemStyle: { color: res.bars!.colors[di] } },
        ),
        xAxisIndex: gi,
        yAxisIndex: gi,
        barWidth: '60%',
        silent: true,
        z: 2,
      });
    }
    for (const s of res.series) {
      subSeries.push({
        type: 'line',
        data: s.data,
        xAxisIndex: gi,
        yAxisIndex: gi,
        lineStyle: { color: s.color, width: 1 },
        symbol: 'none',
        silent: true,
        z: 3,
      });
    }
    // 参考线（KDJ 的 80/20、RSI 的 70/30、CCI 的 ±100 等）
    if (res.guides) {
      for (const g of res.guides) {
        subSeries.push({
          type: 'line',
          data: [],
          xAxisIndex: gi,
          yAxisIndex: gi,
          silent: true,
          markLine: {
            silent: true,
            symbol: 'none',
            label: { show: false },
            data: [
              { yAxis: g.value, lineStyle: { color: g.color, type: 'dashed', width: 0.8 } },
            ],
          },
        });
      }
    }
    // 左上角指标名 + 末值摘要（对齐官方「MACD DIF:x DEA:x」），压在副图顶边上
    const sumParts = res.series.slice(0, 2).map((s2) => {
      let lastVal: number | null = null;
      for (let k = s2.data.length - 1; k >= 0; k -= 1) {
        const v = s2.data[k];
        if (v !== null && v !== undefined) {
          lastVal = v;
          break;
        }
      }
      return `${s2.label} ${lastVal === null ? '—' : lastVal.toFixed(2)}`;
    });
    subGraphic.push({
      type: 'text',
      left: 4,
      top: gridTop,
      style: {
        text: `${INDICATOR_META[id].label}  ${sumParts.join('  ')}`,
        fontSize: 8,
        fill: TITLE,
        stroke: palette.bg,
        lineWidth: 2,
      },
    });
  });

  /* ───── 顶部标题 / 数值行 ───── */
  const graphic: Record<string, unknown>[] = [...subGraphic];
  if (title) {
    graphic.push({
      type: 'text',
      left: 6,
      top: 5,
      style: { text: title, fontSize: 10, fill: TITLE, fontWeight: 'bold' },
    });
  }
  if (metaLine) {
    graphic.push({
      type: 'text',
      right: 6,
      top: 6,
      style: { text: metaLine, fontSize: 8, fill: TICK },
    });
  }

  // y 轴列表：主图 + 每个副图一格
  const yAxes = [makeYAxis(0, mainMin, mainMax)];
  subResults.forEach(({ res }, i) => {
    const r = res?.yRange;
    yAxes.push(makeYAxis(i + 1, r?.min, r?.max));
  });

  const option = {
    animation: false,
    backgroundColor: 'transparent',
    grid: grids,
    graphic,
    xAxis: [makeXAxis(0, true), ...subResults.map((_, i) => makeXAxis(i + 1, false))],
    yAxis: yAxes,
    series: [candleSeries, ...maSeries, ...bollSeries, ...subSeries],
    /* 十字准星：主副图 x 轴联动（对齐官方点击图取该期数据） */
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross', lineStyle: { color: MID_COLOR, type: 'dashed', width: 0.8 } },
      confine: true,
      backgroundColor: 'rgba(0,0,0,0.82)',
      borderWidth: 0,
      padding: [6, 8],
      textStyle: { color: '#fff', fontSize: 10 },
      formatter: `${FN}function (params) {
        var i = params && params.length ? params[0].dataIndex : 0;
        return tooltipRows[i] || '';
      }${FN}`,
    },
    /* 手势缩放：双指捏合缩放 / 单指左右滑动平移，主副图联动（filterMode none 不改 y 轴范围） */
    dataZoom: [{ type: 'inside', xAxisIndex: grids.map((_, i) => i), filterMode: 'none' }],
  };

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <script>${ECHARTS_SOURCE}</script>
  <style>
    html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; }
    #chart { width: 100vw; height: 100vh; }
  </style>
</head>
<body>
  <div id="chart"></div>
  <script>
    var tooltipRows = ${JSON.stringify(tooltipRows)};
    var chart = echarts.init(document.getElementById('chart'));
    chart.setOption(${serialize(option)});
    window.addEventListener('resize', function () { chart.resize(); });
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(function () { chart.resize(); }).observe(document.getElementById('chart'));
    }
  </script>
</body>
</html>`;
}

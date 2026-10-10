/**
 * 多联图（主图 + 副图指标叠放）—— ECharts WebView
 *
 * 为什么放在同一个 WebView 里，而不是主图一个 WebView、副图另起一个？
 *   1) 两个 WebView 之间无法共享滚动 / 缩放，主副图 x 轴永远对不齐；
 *   2) 副图那块 WebView 启动成本高，同屏 10 个胆时等于 20 个 WebView，
 *      Expo Go 下会明显卡顿甚至黑屏。
 *   ECharts 原生支持多 grid + 多 xAxis/yAxis，一次性画完最省事也最稳。
 *
 * 布局参考「主图占大头、副图固定矮条」的行情软件排布：
 *   主图   ~58%
 *   副图1  ~20%
 *   副图2  ~20%
 *   （只有 1 个副图时，主图 ~72% / 副图 ~26%）
 */
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
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

export interface MultiPaneChartProps {
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

export function MultiPaneChart({
  bars,
  maConfigs,
  showBoll = true,
  indicators,
  height,
  width,
  title,
  metaLine,
}: MultiPaneChartProps) {
  const subs = indicators.filter((i) => i !== 'none').slice(0, MAX_SUB_PANES);

  const html = useMemo(() => {
    const show = bars.length > MAX_SHOW ? bars.slice(-MAX_SHOW) : bars;
    const n = show.length;
    if (n === 0) {
      return `<html><body style="margin:0;display:flex;align-items:center;justify-content:center;color:${TICK};font-size:12px;font-family:sans-serif">暂无数据</body></html>`;
    }

    const closes = show.map((b) => b.c);
    const maList = computeMa(closes, maConfigs);
    const boll = showBoll ? buildBoll(closes, Math.min(20, Math.max(2, n)), 2) : null;
    const subResults = subs.map((id) => ({ id, res: computeIndicator(id, { values: closes }) }));

    /* ───── 主图 y 轴范围：K 线实体 + 均线 + 布林 ───── */
    const mainY: number[] = [];
    for (const b of show) mainY.push(b.o, b.c);
    for (const m of maList) for (const v of m.data) if (v !== null) mainY.push(v);
    if (boll) {
      for (const v of boll.upper) if (v !== null) mainY.push(v);
      for (const v of boll.lower) if (v !== null) mainY.push(v);
    }
    const mainMin = Math.min(0, ...mainY);
    const mainMax = Math.max(0, ...mainY);

    /* ───── 各 grid 的高度分配 ───── */
    const TOP_PAD = title || metaLine ? 30 : 8;
    const BOTTOM_PAD = 22; // 底部留 x 轴日期
    const AVAIL = 100; // 百分比坐标系里不好算，改用 px 更可控

    const usable = Math.max(60, height - TOP_PAD - BOTTOM_PAD);
    // 副图每个占 22%（上限 74px，避免高屏上副图过高），其余给主图
    const subRatio = subs.length === 0 ? 0 : subs.length === 1 ? 0.26 : 0.22;
    const subH = Math.round(Math.min(74, usable * subRatio));
    const gap = subs.length === 0 ? 0 : 6;
    const mainH = usable - subs.length * (subH + gap);

    const grids: Record<string, unknown>[] = [
      { left: 6, right: 58, top: TOP_PAD, height: mainH, containLabel: true },
    ];
    subResults.forEach((_, i) => {
      const top = TOP_PAD + mainH + gap + i * (subH + gap);
      grids.push({ left: 6, right: 58, top, height: subH, containLabel: true });
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
      const ax: Record<string, unknown> = {
        gridIndex: gi,
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: AXIS, type: 'dashed' }, show: gi === 0 },
        axisLabel: { fontSize: 7, color: TICK },
      };
      if (min !== undefined && max !== undefined) {
        ax.min = min;
        ax.max = max;
      } else {
        ax.scale = true;
      }
      return ax;
    };

    /* ───── 主图 series：K 线实体 + 均线 + 布林 ───── */
    const candleSeries = {
      type: 'custom',
      renderItem: `function(params, api) {
        var idx = api.value(0);
        var o = api.value(1);
        var c = api.value(2);
        var x = api.coord([idx, 0])[0];
        var yO = api.coord([idx, o])[1];
        var yC = api.coord([idx, c])[1];
        var top = Math.min(yO, yC);
        var h = Math.max(1.5, Math.abs(yC - yO));
        var bw = Math.max(1.5, Math.min(5, (params.coordSys.width / ${n}) * 0.6));
        return {
          type: 'rect',
          shape: { x: x - bw / 2, y: top, width: bw, height: h },
          style: { fill: c >= o ? '${UP}' : '${DOWN}' }
        };
      }`,
      data: show.map((b, i) => [i, b.o, b.c]),
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
            xAxisIndex: 0, yAxisIndex: 0,
            lineStyle: { color: BOLL_COLOR, width: 1 },
            symbol: 'none', silent: true, z: 2,
          },
          {
            type: 'line',
            data: toPairs(boll.mid),
            xAxisIndex: 0, yAxisIndex: 0,
            lineStyle: { color: MID_COLOR, width: 1, type: 'dashed' },
            symbol: 'none', silent: true, z: 2,
          },
          {
            type: 'line',
            data: toPairs(boll.lower),
            xAxisIndex: 0, yAxisIndex: 0,
            lineStyle: { color: BOLL_COLOR, width: 1 },
            symbol: 'none', silent: true, z: 2,
          },
        ]
      : [];

    /* ───── 副图 series ───── */
    const subSeries: Record<string, unknown>[] = [];
    const subGraphic: Record<string, unknown>[] = [];
    subResults.forEach(({ id, res }, i) => {
      const gi = i + 1;
      if (!res) {
        subGraphic.push({
          type: 'text',
          left: 8,
          top: grids[gi].top as number,
          style: { text: `${INDICATOR_META[id].label} 数据不足`, fontSize: 9, fill: TICK },
        });
        return;
      }
      // MACD 的柱
      if (res.bars) {
        subSeries.push({
          type: 'bar',
          data: res.bars.data.map((v) => (v === null ? null : v)),
          xAxisIndex: gi, yAxisIndex: gi,
          itemStyle: { color: (p: { dataIndex: number }) => res.bars!.colors[p.dataIndex] },
          barWidth: '60%',
          silent: true,
          z: 2,
        });
      }
      for (const s of res.series) {
        subSeries.push({
          type: 'line',
          data: s.data,
          xAxisIndex: gi, yAxisIndex: gi,
          lineStyle: { color: s.color, width: 1 },
          symbol: 'none',
          silent: true,
          z: 3,
        });
      }
      // 参考线（KDJ 的 80/20、RSI 的 70/30 等）
      if (res.guides) {
        for (const g of res.guides) {
          subSeries.push({
            type: 'line',
            data: [],
            xAxisIndex: gi, yAxisIndex: gi,
            silent: true,
            markLine: {
              silent: true,
              symbol: 'none',
              label: { show: false },
              data: [{ yAxis: g.value, lineStyle: { color: g.color, type: 'dashed', width: 0.8 } }],
            },
          });
        }
      }
      // 左上角指标名
      subGraphic.push({
        type: 'text',
        left: 8,
        top: (grids[gi].top as number) - 12,
        style: { text: INDICATOR_META[id].label, fontSize: 9, fill: TITLE },
      });
    });

    /* ───── 顶部标题 / 数值行 ───── */
    const graphic: Record<string, unknown>[] = [...subGraphic];
    if (title) {
      graphic.push({
        type: 'text',
        left: 6,
        top: 6,
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
    var chart = echarts.init(document.getElementById('chart'));
    chart.setOption(${JSON.stringify(option).replace(/"@@FN@@/g, '').replace(/@@FN@@"/g, '')});
    window.addEventListener('resize', function () { chart.resize(); });
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(function () { chart.resize(); }).observe(document.getElementById('chart'));
    }
  </script>
</body>
</html>`;
  }, [bars, maConfigs, showBoll, subs.join(','), height, width, title, metaLine]);

  return (
    <View style={{ width, height, backgroundColor: 'transparent' }}>
      <WebView
        source={{ html }}
        style={{ width, height, backgroundColor: 'transparent' }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        bounces={false}
      />
    </View>
  );
}

export default MultiPaneChart;

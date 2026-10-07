/**
 * 频率K线图 —— ECharts WebView + custom 系列。
 * 
 * 特点：
 * - 无上下影线（只画实体）
 * - 蜡烛宽度可自定义（barWidth prop）
 * - 支持布林通道
 * - 支持多周期
 */
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { ECHARTS_SOURCE } from '@/lib/echartsSource';
import type { TargetPoint } from '@/lib/lottery/targets';

type AggPoint = { issue: string; o: number; c: number };

const RED = '#e5484d';
const CYAN = '#22d3ee';
const BOLL_COLOR = '#7c9cf5';
const MID_COLOR = '#fbbf24';

function aggregate(series: TargetPoint[], period: number): AggPoint[] {
  if (period <= 1) {
    return series.map((p, i) => ({
      issue: p.issue,
      o: i === 0 ? 0 : series[i - 1].diff,
      c: p.diff,
    }));
  }
  const out: AggPoint[] = [];
  for (let i = 0; i < series.length; i += period) {
    const slice = series.slice(i, i + period);
    if (slice.length === 0) continue;
    const o = i === 0 ? 0 : series[i - 1].diff;
    const c = slice[slice.length - 1].diff;
    out.push({ issue: slice[slice.length - 1].issue, o, c });
  }
  return out;
}

function buildBoll(values: number[], period: number, k: number) {
  const mid: (number | null)[] = [];
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i + 1 < period) {
      mid.push(null); upper.push(null); lower.push(null);
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

const MAX_SHOW = 200;

export function EChartsFreqKChart({
  series,
  height = 300,
  width = 350,
  period = 1,
  showBoll = true,
  barWidth = 4,
  hideShadow = true,
  heightScale = 1,
}: {
  series: TargetPoint[];
  height?: number;
  width?: number;
  period?: number;
  showBoll?: boolean;
  barWidth?: number;
  hideShadow?: boolean;   // 是否隐藏上下影线
  heightScale?: number;   // 高度缩放（1 = 原始，0.5 = 缩小一半）
}) {
  const html = useMemo(() => {
    const allPoints = aggregate(series, period);
    const points = allPoints.length > MAX_SHOW ? allPoints.slice(-MAX_SHOW) : allPoints;
    const n = points.length;

    if (n === 0) {
      return '<html><body style="margin:0;display:flex;align-items:center;justify-content:center;color:#888;font-size:12px;font-family:sans-serif">暂无数据</body></html>';
    }

    const cVals = points.map((p) => p.c);
    const boll = showBoll ? buildBoll(cVals, Math.min(20, Math.max(2, n)), 2) : null;

    const allY: number[] = [];
    for (const p of points) allY.push(p.o, p.c);
    if (boll) {
      for (const v of boll.upper) if (v !== null) allY.push(v);
      for (const v of boll.lower) if (v !== null) allY.push(v);
    }
    const yMin = Math.min(0, ...allY);
    const yMax = Math.max(0, ...allY);

    // custom 数据：[idx, o, c]
    const customData = points.map((p, i) => [i, p.o, p.c]);

    const toLine = (arr: (number | null)[]) =>
      arr.map((v, i) => (v === null ? null : [i, v]));

    const labelStep = Math.max(1, Math.floor(n / 12));
    const xLabels = points.map((p, i) => (i % labelStep === 0 ? p.issue.slice(-3) : ''));

    // 关键：renderItem 函数（字符串注入 HTML）
    const renderItemFn = hideShadow
      ? // 无影线版本：只画实体
        `function(params, api) {
          var idx = api.value(0);
          var o = api.value(1);
          var c = api.value(2);
          var x = api.coord([idx, 0])[0];
          var yO = api.coord([idx, o])[1];
          var yC = api.coord([idx, c])[1];
          var halfW = ${barWidth} / 2;
          var top = Math.min(yO, yC);
          var h = Math.max(1.5, Math.abs(yC - yO) * ${heightScale});
          return {
            type: 'rect',
            shape: { x: x - halfW, y: top, width: ${barWidth}, height: h },
            style: { fill: c >= o ? '${RED}' : '${CYAN}' }
          };
        }`
      : // 有影线版本（用 candlestick 的绘制逻辑）
        `function(params, api) {
          var idx = api.value(0);
          var o = api.value(1);
          var c = api.value(2);
          var x = api.coord([idx, 0])[0];
          var yO = api.coord([idx, o])[1];
          var yC = api.coord([idx, c])[1];
          var halfW = ${barWidth} / 2;
          var top = Math.min(yO, yC);
          var bottom = Math.max(yO, yC);
          return {
            type: 'group',
            children: [
              { type: 'rect', shape: { x: x - 0.5, y: top - 6, width: 1, height: bottom - top + 12 }, style: { fill: '#1f2937' } },
              { type: 'rect', shape: { x: x - halfW, y: top, width: ${barWidth}, height: Math.max(1.5, bottom - top) }, style: { fill: c >= o ? '${RED}' : '${CYAN}' } }
            ]
          };
        }`;

    const bollSeries = boll
      ? `,
        {
          type: 'line',
          data: ${JSON.stringify(toLine(boll.upper))},
          lineStyle: { color: '${BOLL_COLOR}', width: 1 },
          symbol: 'none',
          z: 2
        },
        {
          type: 'line',
          data: ${JSON.stringify(toLine(boll.mid))},
          lineStyle: { color: '${MID_COLOR}', width: 1.2 },
          symbol: 'none',
          z: 2
        },
        {
          type: 'line',
          data: ${JSON.stringify(toLine(boll.lower))},
          lineStyle: { color: '${BOLL_COLOR}', width: 1 },
          symbol: 'none',
          z: 2
        }`
      : '';

    const optionStr = `{
      animation: false,
      backgroundColor: '#ffffff',
      grid: { left: 36, right: 16, top: 10, bottom: 22 },
      xAxis: {
        type: 'category',
        data: ${JSON.stringify(xLabels)},
        axisTick: { show: false },
        axisLine: { lineStyle: { color: 'rgba(140,140,150,0.35)' } },
        axisLabel: { fontSize: 8, color: '#8a8f98', interval: 0 }
      },
      yAxis: {
        type: 'value',
        min: ${yMin.toFixed(4)},
        max: ${yMax.toFixed(4)},
        splitLine: { lineStyle: { color: 'rgba(140,140,150,0.15)' } },
        axisLabel: { fontSize: 8, color: '#8a8f98' }
      },
      series: [
        {
          type: 'custom',
          renderItem: ${renderItemFn},
          data: ${JSON.stringify(customData)},
          z: 5
        }${bollSeries}
      ]
    }`;

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
    chart.setOption(${optionStr});
    window.addEventListener('resize', function() { chart.resize(); });
  </script>
</body>
</html>`;
  }, [series, period, height, width, showBoll, barWidth, hideShadow, heightScale]);

  return (
    <View style={{ width, height }}>
      <WebView
        source={{ html }}
        style={{ width, height, backgroundColor: 'transparent' }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
      />
    </View>
  );
}

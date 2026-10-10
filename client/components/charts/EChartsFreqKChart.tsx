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
import { palette, semantic } from '@/lib/theme';

import { aggregate, buildBoll, type CycleAlign } from './chartMath';

/** 与原型 drawFreqK 对齐：涨/热 = red，跌/冷 = cyan，布林带 = accent，中轨 = amber */
const UP = semantic.hot;
const DOWN = semantic.cold;
const BOLL_COLOR = palette.accent;
const MID_COLOR = palette.amber;
/** 坐标轴线 / 网格线 */
const AXIS_COLOR = palette.line;
/** 坐标刻度文字 */
const TICK_COLOR = palette.inkFaint;
/** 标题文字 */
const TITLE_COLOR = palette.inkDim;

const MAX_SHOW = 200;

export function EChartsFreqKChart({
  series,
  height = 300,
  width = 350,
  period = 1,
  showBoll = true,
  targetLabel,
  barWidth = 4,
  hideShadow = true,
  heightScale = 1,
  align = 'left',
}: {
  series: TargetPoint[];
  height?: number;
  width?: number;
  period?: number;
  showBoll?: boolean;
  targetLabel?: string;
  barWidth?: number;
  hideShadow?: boolean;   // 是否隐藏上下影线
  heightScale?: number;   // 高度缩放（1 = 原始，0.5 = 缩小一半）
  /** 周期基准（周期K线才有意义）：左对齐=以开奖首期为基准，右对齐=以投注期为基准 */
  align?: CycleAlign;
}) {
  const html = useMemo(() => {
    const allPoints = aggregate(series, period, align);
    const points = allPoints.length > MAX_SHOW ? allPoints.slice(-MAX_SHOW) : allPoints;
    const n = points.length;

    if (n === 0) {
      return `<html><body style="margin:0;display:flex;align-items:center;justify-content:center;color:${TICK_COLOR};font-size:12px;font-family:sans-serif">暂无数据</body></html>`;
    }

    const cVals = points.map((p) => p.c);
    const boll = showBoll ? buildBoll(cVals, Math.min(20, Math.max(2, n)), 2) : null;

    const highs = points.map((p) => p.h ?? Math.max(p.o, p.c));
    const lows = points.map((p) => p.l ?? Math.min(p.o, p.c));

    const allY: number[] = [];
    for (let i = 0; i < n; i += 1) allY.push(points[i].o, points[i].c, highs[i], lows[i]);
    if (boll) {
      for (const v of boll.upper) if (v !== null) allY.push(v);
      for (const v of boll.lower) if (v !== null) allY.push(v);
    }
    const yMin = Math.min(0, ...allY);
    const yMax = Math.max(0, ...allY);

    // custom 数据：[idx, o, c, h, l]
    const customData = points.map((p, i) => [i, p.o, p.c, highs[i], lows[i]]);

    const toLine = (arr: (number | null)[]) =>
      arr.map((v, i) => (v === null ? null : [i, v]));

    const labelStep = Math.max(1, Math.floor(n / 12));
    const xLabels = points.map((p, i) => (i % labelStep === 0 ? p.issue.slice(-3) : ''));

    // renderItem（字符串注入 HTML）
    // hideShadow = true  → 单期频率K线，只画实体（彩票单期K线本来就没有影线）
    // hideShadow = false → 周期K线，画「实体 + 上下影线」，影线端点就是段内高低点
    const renderItemFn = hideShadow
      ? `function(params, api) {
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
            style: { fill: c >= o ? '${UP}' : '${DOWN}' }
          };
        }`
      : `function(params, api) {
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
          var halfW = ${barWidth} / 2;
          var fill = c >= o ? '${UP}' : '${DOWN}';
          return {
            type: 'group',
            children: [
              {
                type: 'line',
                shape: { x1: x, y1: yH, x2: x, y2: yL },
                style: { stroke: fill, lineWidth: 1 }
              },
              {
                type: 'rect',
                shape: {
                  x: x - halfW,
                  y: bodyTop,
                  width: ${barWidth},
                  height: Math.max(1.5, (bodyBot - bodyTop) * ${heightScale})
                },
                style: { fill: fill }
              }
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
      backgroundColor: 'transparent',
      grid: { left: 4, right: 10, top: 22, bottom: 22, containLabel: true },
      graphic: ${targetLabel ? `[{"type":"text","left":"center","top":4,"style":{"text":${JSON.stringify(targetLabel)},"fontSize":10,"fill":"${TITLE_COLOR}"}}]` : "null"},
      xAxis: {
        type: 'category',
        data: ${JSON.stringify(xLabels)},
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '${AXIS_COLOR}' } },
        axisLabel: { fontSize: 8, color: '${TICK_COLOR}', interval: 0 }
      },
      yAxis: {
        type: 'value',
        min: ${yMin.toFixed(4)},
        max: ${yMax.toFixed(4)},
        splitLine: { lineStyle: { color: '${AXIS_COLOR}' } },
        axisLabel: { fontSize: 8, color: '${TICK_COLOR}' }
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
  }, [series, period, align, height, width, showBoll, barWidth, hideShadow, heightScale, targetLabel]);

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

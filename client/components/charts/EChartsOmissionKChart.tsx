/**
 * 遗漏K线图 —— ECharts WebView + custom 系列。
 * 石头剪刀布爬楼梯 + 循环降档。
 */
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { ECHARTS_SOURCE } from '@/lib/echartsSource';
import type { TargetPoint } from '@/lib/lottery/targets';
import { buildOmissionBars } from './chartMath';
import { palette, semantic } from '@/lib/theme';

/** 爬楼梯：升档 = 热（red），降档 = 冷（cyan） */
const UP = semantic.hot;
const DOWN = semantic.cold;
/** 坐标轴线 / 网格线 */
const AXIS_COLOR = palette.line;
/** 坐标刻度文字 */
const TICK_COLOR = palette.inkFaint;
/** 标题文字 */
const TITLE_COLOR = palette.inkDim;

const BAR_W = 1.5;
const MAX_SHOW = 300;

/**
 * 爬楼梯实体的构造已提到 chartMath.buildOmissionBars，
 * 多联图（主图 + 副图指标）要用同一份数值，两处各算一遍必然漂移。
 */
export function EChartsOmissionKChart({
  series,
  height = 300,
  width = 350,
  theoryMiss = 0,
  targetLabel,
}: {
  series: TargetPoint[];
  height?: number;
  width?: number;
  theoryMiss?: number;
  targetLabel?: string;
}) {
  const html = useMemo(() => {
    const bars = buildOmissionBars(series, theoryMiss);
    const showBars = bars.length > MAX_SHOW ? bars.slice(-MAX_SHOW) : bars;
    const n = showBars.length;

    if (n === 0) {
      return `<html><body style="margin:0;display:flex;align-items:center;justify-content:center;color:${TICK_COLOR};font-size:12px;font-family:sans-serif">无开出记录</body></html>`;
    }

    const allY: number[] = [];
    for (const b of showBars) allY.push(b.o, b.c);
    const yMin = Math.min(0, ...allY);
    const yMax = Math.max(0, ...allY);
    const range = yMax - yMin || 1;

    const xLabels = showBars.map((b) => b.issue.slice(-3));
    // x 从 0 开始重新编号（只画可见区间）
    const dataFinal = showBars.map((b, i) => ({
      value: [i, b.o, b.c],
      itemStyle: { color: b.isRed ? UP : DOWN },
    }));

    const labelStep = Math.max(1, Math.floor(n / 15));
    const xAxisLabels = xLabels.map((l, i) => (i % labelStep === 0 ? l : ''));

    const renderItemFn = `function(params, api) {
      var idx = api.value(0);
      var o = api.value(1);
      var c = api.value(2);
      var x = api.coord([idx, 0])[0];
      var yO = api.coord([idx, o])[1];
      var yC = api.coord([idx, c])[1];
      var halfW = ${BAR_W} / 2;
      var top = Math.min(yO, yC);
      var h = Math.max(1.5, Math.abs(yC - yO));
      var color = api.visual('color');
      return {
        type: 'rect',
        shape: { x: x - halfW, y: top, width: ${BAR_W}, height: h },
        style: { fill: color }
      };
    }`;

    const optionStr = `{
      animation: false,
      backgroundColor: 'transparent',
      grid: { left: 4, right: 10, top: 26, bottom: 22, containLabel: true },
      graphic: ${targetLabel ? `[{"type":"text","left":"center","top":4,"style":{"text":${JSON.stringify(targetLabel)},"fontSize":10,"fill":"${TITLE_COLOR}"}}]` : "null"},
      xAxis: {
        type: 'category',
        data: ${JSON.stringify(xAxisLabels)},
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '${AXIS_COLOR}' } },
        axisLabel: { fontSize: 8, color: '${TICK_COLOR}', interval: 0 }
      },
      yAxis: {
        type: 'value',
        min: ${Math.floor(yMin - range * 0.08)},
        max: ${Math.ceil(yMax + range * 0.08)},
        splitLine: { lineStyle: { color: '${AXIS_COLOR}' } },
        axisLabel: { fontSize: 8, color: '${TICK_COLOR}' }
      },
      series: [
        {
          type: 'custom',
          renderItem: ${renderItemFn},
          data: ${JSON.stringify(dataFinal)},
          z: 5
        }
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
  }, [series, theoryMiss, height, width]);

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

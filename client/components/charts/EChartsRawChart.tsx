/**
 * 原始值折线图（用于振幅）。
 * 每期一个值（0-N），画成折线 + 点 + 均线。
 */
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { ECHARTS_SOURCE } from '@/lib/echartsSource';
import { palette, semantic } from '@/lib/theme';

type RawPoint = { issue: string; value: number };

/** 主折线（原型 drawAmp 的主线 = accent） */
const LINE_COLOR = palette.accent;
/** 数值点（热） */
const DOT_COLOR = semantic.hot;
/** 均线：MA3 = cyan / MA5 = amber（原型）/ MA10 = red */
const MA3_COLOR = semantic.cold;
const MA5_COLOR = palette.amber;
const MA10_COLOR = semantic.hot;
/** 坐标轴线 / 网格线 */
const AXIS_COLOR = palette.line;
/** 坐标刻度文字 */
const TICK_COLOR = palette.inkFaint;

const MAX_SHOW = 200;

export function EChartsRawChart({
  data,
  height = 300,
  width = 350,
  title,
  yMax,
}: {
  data: RawPoint[];
  height?: number;
  width?: number;
  title?: string;
  yMax?: number;
}) {
  const html = useMemo(() => {
    const points = data.length > MAX_SHOW ? data.slice(-MAX_SHOW) : data;
    const n = points.length;

    if (n === 0) {
      return `<html><body style="margin:0;display:flex;align-items:center;justify-content:center;color:${TICK_COLOR};font-size:12px;font-family:sans-serif">暂无数据</body></html>`;
    }

    const values = points.map((p) => p.value);
    const autoMax = Math.max(...values, 1);
    const yMaxFinal = yMax ?? autoMax;

    const labelStep = Math.max(1, Math.floor(n / 15));
    const xLabels = points.map((p, i) => (i % labelStep === 0 ? p.issue.slice(-3) : ''));

    // 均线（3/5/10）
    const maOf = (period: number) => {
      return values.map((_, i) => {
        if (i + 1 < period) return null;
        let s = 0;
        for (let j = i - period + 1; j <= i; j += 1) s += values[j];
        return Number((s / period).toFixed(3));
      });
    };

    const dataWithX = values.map((v, i) => [i, v]);
    const ma3 = maOf(3);
    const ma5 = maOf(5);
    const ma10 = maOf(10);

    const optionStr = `{
      animation: false,
      backgroundColor: 'transparent',
      title: ${JSON.stringify({ text: title ?? '', textStyle: { color: TICK_COLOR, fontSize: 10 } })},
      grid: { left: 36, right: 16, top: ${title ? 26 : 12}, bottom: 22 },
      xAxis: {
        type: 'category',
        data: ${JSON.stringify(xLabels)},
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '${AXIS_COLOR}' } },
        axisLabel: { fontSize: 8, color: '${TICK_COLOR}', interval: 0 }
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: ${Math.ceil(yMaxFinal * 1.1)},
        splitLine: { lineStyle: { color: '${AXIS_COLOR}' } },
        axisLabel: { fontSize: 8, color: '${TICK_COLOR}' }
      },
      series: [
        {
          name: 'MA10',
          type: 'line',
          data: ${JSON.stringify(ma10)},
          lineStyle: { color: '${MA10_COLOR}', width: 1 },
          symbol: 'none',
          smooth: true,
          z: 2
        },
        {
          name: 'MA5',
          type: 'line',
          data: ${JSON.stringify(ma5)},
          lineStyle: { color: '${MA5_COLOR}', width: 1 },
          symbol: 'none',
          smooth: true,
          z: 2
        },
        {
          name: 'MA3',
          type: 'line',
          data: ${JSON.stringify(ma3)},
          lineStyle: { color: '${MA3_COLOR}', width: 1 },
          symbol: 'none',
          smooth: true,
          z: 2
        },
        {
          name: '值',
          type: 'line',
          data: ${JSON.stringify(dataWithX)},
          lineStyle: { color: '${LINE_COLOR}', width: 1.6 },
          itemStyle: { color: '${DOT_COLOR}' },
          symbol: 'circle',
          symbolSize: 4,
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
    // WebView 的 viewport 不会随布局变化触发 window resize，
    // 容器尺寸一变图就糊/被裁，所以额外挂一个 ResizeObserver。
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(function () { chart.resize(); }).observe(document.getElementById('chart'));
    }
  </script>
</body>
</html>`;
  }, [data, title, yMax, height, width]);

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

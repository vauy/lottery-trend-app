/**
 * 遗漏和 —— ECharts WebView 折线。
 *
 * 对齐官方《遗漏和》原文：
 *   「遗漏和这个概念是从和值衍生出来的，指一个指标里面所有元素的各项遗漏值的和」
 *   - 不定位胆遗漏和（组选遗漏和）：三星三个数字的遗漏值之和
 *   - 全胆遗漏和：0-9 各码当前遗漏之和
 *   - 定位胆遗漏和（直选遗漏和）：百/十/个 三位的遗漏值之和
 * 官方经验值：「当本期开出大于或等于均值 11 的遗漏和时，
 *   下期 90% 的机会向下掉头，开出 11 以下的值，尤其是 6 以下的值居多」
 */
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { ECHARTS_SOURCE } from '@/lib/echartsSource';
import { palette, semantic } from '@/lib/theme';
import { sma } from '@/lib/charts/indicators';
import { MISS_SUM_REF } from './chartMath';

const LINE = semantic.hot;
const REF_COLOR = semantic.cold;
const MA_COLOR = palette.amber;
const AXIS_COLOR = palette.line;
const TICK_COLOR = palette.inkFaint;
const TITLE_COLOR = palette.inkDim;

const MAX_SHOW = 200;

export function EChartsMissSumChart({
  issues,
  values,
  height = 240,
  width = 350,
  targetLabel,
  maPeriod = 5,
  refValue = MISS_SUM_REF,
  tip,
}: {
  issues: string[];
  /** 逐期遗漏和 */
  values: number[];
  height?: number;
  width?: number;
  targetLabel?: string;
  maPeriod?: number;
  /** 经验参考线；组选口径用官方的 11，其余口径用各自实测均值 */
  refValue?: number;
  /** 图表内的自定义提示行；不传则用默认文案 */
  tip?: string;
}) {
  const html = useMemo(() => {
    const take = Math.min(values.length, issues.length);
    let vs = values.slice(0, take);
    let is = issues.slice(0, take);
    if (take > MAX_SHOW) {
      vs = vs.slice(-MAX_SHOW);
      is = is.slice(-MAX_SHOW);
    }
    const n = vs.length;
    if (n === 0) {
      return `<html><body style="margin:0;display:flex;align-items:center;justify-content:center;color:${TICK_COLOR};font-size:12px;font-family:sans-serif">暂无数据</body></html>`;
    }

    const ma = sma(vs, maPeriod);
    const labelStep = Math.max(1, Math.ceil(n / 8));
    const xLabels = is.map((s, i) => (i % labelStep === 0 || i === n - 1 ? s.slice(-3) : ''));
    const mean = vs.reduce((a, b) => a + b, 0) / n;
    const yMax = Math.max(refValue + 2, ...vs, ...ma.filter((v): v is number => v !== null));
    const cur = vs[n - 1];

    const header = targetLabel ? `${targetLabel}` : '遗漏和';

    const optionStr = `{
      animation: false,
      backgroundColor: 'transparent',
      grid: { left: 26, right: 10, top: 34, bottom: 20, containLabel: false },
      graphic: [
        {"type":"text","left":6,"top":4,"style":{"text":${JSON.stringify(header)},"fontSize":10,"fill":"${TITLE_COLOR}","fontWeight":"bold"}},
        {"type":"text","left":6,"top":18,"style":{"text":${JSON.stringify(tip || ('当前 ' + cur + '  均值 ' + mean.toFixed(1) + '  参考线 ' + refValue))},"fontSize":8,"fill":"${TICK_COLOR}"}}
      ],
      xAxis: {
        type: 'category',
        data: ${JSON.stringify(xLabels)},
        boundaryGap: false,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '${AXIS_COLOR}' } },
        axisLabel: { fontSize: 7, color: '${TICK_COLOR}', interval: 0 }
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: ${Math.ceil(yMax * 1.15)},
        splitLine: { lineStyle: { color: '${AXIS_COLOR}', type: 'dashed' } },
        axisLabel: { fontSize: 7, color: '${TICK_COLOR}' }
      },
      series: [
        {
          type: 'line',
          data: ${JSON.stringify(vs.map((v, i) => [i, v]))},
          lineStyle: { color: '${LINE}', width: 1 },
          itemStyle: { color: '${LINE}' },
          symbol: 'circle',
          symbolSize: 4,
          z: 5,
          markLine: {
            silent: true,
            symbol: 'none',
            label: { show: false },
            data: [{ yAxis: ${refValue}, lineStyle: { color: '${REF_COLOR}', type: 'dashed', width: 0.8 } }]
          }
        },
        {
          type: 'line',
          data: ${JSON.stringify(ma.map((v, i) => (v === null ? null : [i, v])))},
          lineStyle: { color: '${MA_COLOR}', width: 1 },
          itemStyle: { color: '${MA_COLOR}' },
          symbol: 'none',
          silent: true,
          z: 3
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
  }, [issues, values, height, width, targetLabel, maPeriod, refValue, tip]);

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

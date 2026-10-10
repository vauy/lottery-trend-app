/**
 * 出次图 / 出次移动统计 —— ECharts WebView。
 *
 * 对齐官方《出次图》原文：
 *   「图中带有圆圈的红色细线为号码出现次数曲线，
 *     圆圈内数值为当前横坐标对应的开奖期号（含）的前 N 期内的号码出现次数」
 *   「蓝色、绿色和紫色圆圈分别表示 5 期均线、10 期均线和 25 期均线的拐点值」
 *   「分段周期：用于统计出现次数的周期」
 *   「退期：把最后一点的期号往前推一定的期数」
 */
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { ECHARTS_SOURCE } from '@/lib/echartsSource';
import { palette, semantic } from '@/lib/theme';
import { sma } from '@/lib/charts/indicators';
import { findLastTurning, type ChuciPoint } from './chartMath';

/** 出现次数曲线（官方：带圆圈的红色细线） */
const LINE = semantic.hot;
/** 均线：官方「蓝色的 5 期（快速线）、绿色的 10 期（慢速线）、更慢的 25 期（紫色）」 */
const MA5 = '#4dabf7';
const MA10 = '#12b886';
const MA25 = '#c678dd';
const AXIS_COLOR = palette.line;
const TICK_COLOR = palette.inkFaint;
const TITLE_COLOR = palette.inkDim;

const MAX_SHOW = 160;

export function EChartsChuciChart({
  points,
  height = 260,
  width = 350,
  targetLabel,
  maPeriods = [5, 10, 25],
  maColors = [MA5, MA10, MA25],
  moveMode = false,
}: {
  points: ChuciPoint[];
  height?: number;
  width?: number;
  targetLabel?: string;
  /** 三条均线的周期 */
  maPeriods?: number[];
  maColors?: string[];
  /** true = 出次移动统计（每个窗口一个独立样本，隐藏过多数值标签） */
  moveMode?: boolean;
}) {
  const html = useMemo(() => {
    const all = points.length > MAX_SHOW ? points.slice(-MAX_SHOW) : points;
    const n = all.length;
    if (n === 0) {
      return `<html><body style="margin:0;display:flex;align-items:center;justify-content:center;color:${TICK_COLOR};font-size:12px;font-family:sans-serif">暂无数据</body></html>`;
    }

    const counts = all.map((p) => p.count);
    const labelStep = Math.max(1, Math.ceil(n / 8));
    const xLabels = all.map((p, i) => (i % labelStep === 0 || i === n - 1 ? p.issue.slice(-3) : ''));

    const maList = maPeriods.map((p, i) => ({
      period: p,
      color: maColors[i] ?? maColors[maColors.length - 1],
      data: sma(counts, p),
    }));

    // 拐点：官方「走向发生变化的一个点」，用同色圆圈标在最后一个转折处
    const markers: { period: number; color: string; idx: number; value: number }[] = [];
    maList.forEach((m) => {
      const v = findLastTurning(m.data);
      if (v === null) return;
      const idx = m.data.lastIndexOf(v);
      if (idx >= 0) markers.push({ period: m.period, color: m.color, idx, value: v });
    });

    const yMax = Math.max(1, ...counts, ...maList.flatMap((m) => m.data.filter((v): v is number => v !== null)));

    const tipParts = markers.map((k) => `${k.period}期均线拐点值${k.value.toFixed(2)}`);
    const tip = tipParts.length > 0 ? tipParts.join('  ') : '';

    const lineSeries = (p: number, color: string, data: (number | null)[]) =>
      `{
        type: 'line',
        data: ${JSON.stringify(data.map((v, i) => (v === null ? null : [i, v])))},
        lineStyle: { color: '${color}', width: 1 },
        itemStyle: { color: '${color}' },
        symbol: 'none',
        silent: true,
        z: 3
      }`;

    const markScatter = markers.length > 0
      ? `,
      {
        type: 'scatter',
        data: ${JSON.stringify(markers.map((k) => ({ value: [k.idx, k.value], itemStyle: { color: k.color } })))},
        symbol: 'circle',
        symbolSize: 9,
        itemStyle: { borderColor: '${palette.bg}', borderWidth: 1.5 },
        label: {
          show: true,
          position: 'top',
          fontSize: 7,
          color: '${TICK_COLOR}',
          formatter: function (p) { return p.value[1].toFixed(1); }
        },
        z: 6
      }`
      : '';

    const series = [
      `{
        type: 'line',
        data: ${JSON.stringify(counts.map((v, i) => [i, v]))},
        lineStyle: { color: '${LINE}', width: 1 },
        itemStyle: { color: '${LINE}' },
        symbol: 'circle',
        symbolSize: 6,
        label: {
          show: ${moveMode ? 'false' : 'true'},
          position: 'top',
          fontSize: 7,
          color: '${LINE}',
          formatter: '{c}'
        },
        labelLayout: { hideOverlap: true },
        z: 5
      }`,
      ...maList.map((m) => lineSeries(m.period, m.color, m.data)),
    ].join(',\n      ') + markScatter;

    const header = targetLabel ? `${targetLabel}` : '';
    const optionStr = `{
      animation: false,
      backgroundColor: 'transparent',
      grid: { left: 28, right: 10, top: ${tip ? 34 : 22}, bottom: 20, containLabel: false },
      graphic: [
        ${header ? `{"type":"text","left":6,"top":4,"style":{"text":${JSON.stringify(header)},"fontSize":10,"fill":"${TITLE_COLOR}","fontWeight":"bold"}},` : ''}
        ${tip ? `{"type":"text","left":6,"top":18,"style":{"text":${JSON.stringify(tip)},"fontSize":8,"fill":"${TICK_COLOR}"}}` : ''}
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
        max: ${Math.ceil(yMax * 1.25)},
        splitLine: { lineStyle: { color: '${AXIS_COLOR}', type: 'dashed' } },
        axisLabel: { fontSize: 7, color: '${TICK_COLOR}' }
      },
      series: [ ${series} ]
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
  }, [points, height, width, targetLabel, maPeriods, maColors, moveMode]);

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

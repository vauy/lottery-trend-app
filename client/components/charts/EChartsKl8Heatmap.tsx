/**
 * 快乐8 分布图形热力图 —— ECharts WebView heatmap。
 *
 * 对齐官方《分布图形》：80 个号码按 8 行 × 10 列排布，
 * 颜色深浅表示 热度（近 N 期出现次数）或 当前遗漏。
 * 中国彩市惯例：热 = 红（越红越热），冷 = 深底色。
 */
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { ECHARTS_SOURCE } from '@/lib/echartsSource';
import { palette } from '@/lib/theme';

const AXIS_COLOR = palette.line;
const TICK_COLOR = palette.inkFaint;
const TITLE_COLOR = palette.inkDim;

/** 冷 → 热渐变（深底 → 红） */
const HEAT_COLORS = ['#16283c', '#1d3a55', '#54432f', '#8a3a2a', '#c04434', '#e8564a'];

export type Kl8HeatMode = 'freq' | 'omission';

export function EChartsKl8Heatmap({
  counts,
  omissions,
  mode = 'freq',
  lastN,
  height = 260,
  width = 350,
  targetLabel,
}: {
  /** 出现次数，下标 0 → 号码 1 … 79 → 号码 80 */
  counts: number[];
  /** 当前遗漏（从未开出 = 样本期数） */
  omissions: number[];
  /** freq=出现次数热力 / omission=遗漏热力（遗漏 0 即刚开出，最热） */
  mode?: Kl8HeatMode;
  /** 参与统计的期数（标题里展示） */
  lastN: number;
  height?: number;
  width?: number;
  targetLabel?: string;
}) {
  const html = useMemo(() => {
    if (counts.length !== 80 || omissions.length !== 80) {
      return `<html><body style="margin:0;display:flex;align-items:center;justify-content:center;color:${TICK_COLOR};font-size:12px;font-family:sans-serif">暂无数据</body></html>`;
    }
    // 单元格：[x=列, y=行, value, 号码]；行 0 在顶部（inverse）
    const cells: [number, number, number, number][] = counts.map((_, i) => {
      const num = i + 1;
      const row = Math.floor(i / 10);
      const col = i % 10;
      const v = mode === 'freq' ? counts[i] : omissions[i];
      return [col, row, v, num] as [number, number, number, number];
    });
    const vals = cells.map((c) => c[2]);
    const vMax = Math.max(...vals, 1);
    const vMin = Math.min(...vals);
    const hottest = mode === 'freq'
      ? counts.indexOf(Math.max(...counts)) + 1
      : omissions.indexOf(Math.min(...omissions)) + 1;
    const header = targetLabel
      ? `${targetLabel} · 近${lastN}期${mode === 'freq' ? '出现次数' : '遗漏'}`
      : `分布图形 · 近${lastN}期`;
    const tip = mode === 'freq'
      ? `最热 ${hottest}（${Math.max(...counts)}次）  深色=冷 红=热`
      : `刚开出 ${hottest}  深色=遗漏大 红=刚开出`;
    const unit = mode === 'freq' ? '次' : '期';

    const optionStr = `{
      animation: false,
      backgroundColor: 'transparent',
      grid: { left: 30, right: 12, top: 34, bottom: 24, containLabel: false },
      tooltip: {
        formatter: function(p) {
          return '号码 ' + p.data[3] + '：' + p.data[2] + '${unit}';
        },
        backgroundColor: 'rgba(20,26,34,0.92)',
        borderWidth: 0,
        textStyle: { color: '#eee', fontSize: 11 }
      },
      graphic: [
        {"type":"text","left":6,"top":4,"style":{"text":${JSON.stringify(header)},"fontSize":10,"fill":"${TITLE_COLOR}","fontWeight":"bold"}},
        {"type":"text","left":6,"top":18,"style":{"text":${JSON.stringify(tip)},"fontSize":8,"fill":"${TICK_COLOR}"}}
      ],
      xAxis: {
        type: 'category',
        data: ${JSON.stringify(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'])},
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '${AXIS_COLOR}' } },
        axisLabel: { fontSize: 7, color: '${TICK_COLOR}', interval: 0 },
        splitArea: { show: false }
      },
      yAxis: {
        type: 'category',
        data: ${JSON.stringify(['0', '1', '2', '3', '4', '5', '6', '7'])},
        inverse: true,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '${AXIS_COLOR}' } },
        axisLabel: { fontSize: 7, color: '${TICK_COLOR}', formatter: function(v){ return v + 'x'; } }
      },
      visualMap: {
        show: false,
        min: ${vMin},
        max: ${vMax},
        calculable: false,
        inRange: { color: ${JSON.stringify(mode === 'freq' ? HEAT_COLORS : [...HEAT_COLORS].reverse())} }
      },
      series: [{
        type: 'heatmap',
        data: ${JSON.stringify(cells)},
        label: {
          show: true,
          fontSize: 8,
          color: 'rgba(255,255,255,0.85)',
          formatter: function(p) { return String(p.data[3]); }
        },
        itemStyle: {
          borderColor: 'rgba(0,0,0,0.35)',
          borderWidth: 1,
          borderRadius: 2
        },
        emphasis: { itemStyle: { shadowBlur: 6, shadowColor: 'rgba(0,0,0,0.5)' } }
      }]
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
  }, [counts, omissions, mode, lastN, targetLabel]);

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

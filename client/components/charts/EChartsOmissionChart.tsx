/**
 * ECharts 遗漏图（WebView 版）
 * 三种模式：
 *   both   —— 上下双联：二阶 + 一阶（默认）
 *   level1 —— 只显示一阶（铺满整图）
 *   level2 —— 只显示二阶（铺满整图）
 * 球：红=峰值、绿=开出、蓝=最新、紫=虚拟下一期
 * 线：黑实线=理论、红虚线=最大、蓝虚线=平均、蓝/绿/粉=MA5/10/20
 */
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { WebView } from 'react-native-webview';
import { ECHARTS_SOURCE } from '@/lib/echartsSource';

type SeriesPoint = { issue: string; omission: number };
type ChartMode = 'both' | 'level1' | 'level2';

const RANGES = [
  { min: 0, max: 0, label: '0' },
  { min: 1, max: 1, label: '1' },
  { min: 2, max: 2, label: '2' },
  { min: 3, max: 3, label: '3' },
  { min: 0, max: 1, label: '0-1' },
];

function niceMax(v: number): number {
  if (v <= 5) return Math.ceil(v) + 1;
  if (v <= 10) return Math.ceil(v / 2) * 2;
  return Math.ceil(v / 5) * 5;
}

export function EChartsOmissionChart({
  series,
  height = 360,
  width = 350,
  theoryMiss = 0,
  mode = 'both',
}: {
  series: SeriesPoint[];
  height?: number;
  width?: number;
  theoryMiss?: number;
  mode?: ChartMode;
}) {
  const [rangeIdx, setRangeIdx] = useState(0);

  const html = useMemo(() => {
    // 限制最多显示 100 期
    const MAX_SHOW = 100;
    const trimmed = series.length > MAX_SHOW ? series.slice(-MAX_SHOW) : series;

    const n = trimmed.length;
    if (n === 0) {
      return '<html><body style="margin:0;display:flex;align-items:center;justify-content:center;color:#888;font-size:12px">暂无数据</body></html>';
    }

    const issues = trimmed.map((p) => p.issue);
    const missValues = trimmed.map((p) => p.omission);
    const range = RANGES[rangeIdx];

    // 二阶
    const secondOrder: { x: number; y: number }[] = [];
    let lastValid: number | null = null;
    for (let i = 0; i < n; i += 1) {
      if (missValues[i] >= range.min && missValues[i] <= range.max) {
        if (lastValid !== null) secondOrder.push({ x: i, y: i - lastValid });
        lastValid = i;
      }
    }

    // 统计
    const gaps: number[] = [];
    for (let i = 1; i < n; i += 1) {
      if (missValues[i] === 0) gaps.push(missValues[i - 1]);
    }
    const maxMiss = Math.max(...missValues, 1);
    const currentMiss = missValues[n - 1];
    const avgMiss = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;

    // MA
    const maOf = (period: number, idx: number): number | null => {
      if (idx + 1 < period) return null;
      let s = 0;
      for (let i = idx - period + 1; i <= idx; i += 1) s += missValues[i];
      return s / period;
    };
    const ma5 = missValues.map((_, i) => maOf(5, i));
    const ma10 = missValues.map((_, i) => maOf(10, i));
    const ma20 = missValues.map((_, i) => maOf(20, i));

    // 一阶球
    const balls: { x: number; y: number; color: string; text: string }[] = [];
    for (let i = 0; i < n; i += 1) {
      const isLatest = i === n - 1;
      if (isLatest) {
        balls.push({ x: i, y: missValues[i], color: '#2563eb', text: String(missValues[i]) });
        continue;
      }
      if (missValues[i] === 0) {
        balls.push({ x: i, y: 0, color: '#22c55e', text: '0' });
        continue;
      }
      if (missValues[i + 1] === 0) {
        balls.push({ x: i, y: missValues[i], color: '#e5484d', text: String(missValues[i]) });
      }
    }
    balls.push({ x: n, y: currentMiss, color: '#8b5cf6', text: '?' });

    // 二阶球
    const secondBalls = secondOrder.map((p) => ({ x: p.x, y: p.y, color: '#e5484d', text: String(p.y) }));

    const secondMax = niceMax(Math.max(1, ...secondOrder.map((p) => p.y)));
    const displayMax = niceMax(Math.max(maxMiss, theoryMiss));

    // ---- mode 分派 ----
    const isBoth = mode === 'both';
    const isL1 = mode === 'level1';
    const isL2 = mode === 'level2';

    // orig: 0 = 二阶, 1 = 一阶
    // 返回该 orig 在新图中对应的 gridIndex（null 表示隐藏）
    const mapG = (orig: 0 | 1): 0 | 1 | null => {
      if (isBoth) return orig;
      if (isL1) return orig === 1 ? 0 : null;
      return orig === 0 ? 0 : null; // isL2
    };

    const grid = isBoth
      ? [
          { left: 36, right: 24, top: 26, height: '34%' },
          { left: 36, right: 24, top: '56%', height: '36%' },
        ]
      : [{ left: 36, right: 24, top: 26, height: '78%' }];

    const secondTitle = `二阶遗漏图（遗漏范围 ${range.min}-${range.max}）`;
    const firstTitle = `一阶遗漏图（历史最大:${maxMiss} 平均:${avgMiss.toFixed(3)} 理论:${theoryMiss.toFixed(3)} 当前:${currentMiss}）`;

    const graphic: any[] = [];
    if (isBoth) {
      graphic.push({ type: 'text', left: 'center', top: 6, style: { text: secondTitle, fontSize: 10, fill: '#8a8f98' } });
      graphic.push({ type: 'text', left: 'center', top: '51%', style: { text: firstTitle, fontSize: 10, fill: '#8a8f98' } });
    } else if (isL2) {
      graphic.push({ type: 'text', left: 'center', top: 6, style: { text: secondTitle, fontSize: 10, fill: '#8a8f98' } });
    } else {
      graphic.push({ type: 'text', left: 'center', top: 6, style: { text: firstTitle, fontSize: 10, fill: '#8a8f98' } });
    }

    const makeXAxis = (orig: 0 | 1) => {
      const gi = mapG(orig);
      if (gi === null) return null;
      return {
        gridIndex: gi,
        type: 'category',
        data: issues.concat(['?']),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: 'rgba(140,140,150,0.35)' } },
        axisLabel: (isBoth && orig === 0)
          ? { show: false }
          : { fontSize: 7, color: '#8a8f98', interval: Math.max(0, Math.floor(n / 15)) },
      };
    };

    const makeYAxis = (orig: 0 | 1) => {
      const gi = mapG(orig);
      if (gi === null) return null;
      return {
        gridIndex: gi,
        type: 'value',
        min: 0,
        max: orig === 0 ? secondMax : displayMax,
        splitLine: { lineStyle: { color: 'rgba(140,140,150,0.15)' } },
        axisLabel: { fontSize: 8, color: '#8a8f98' },
      };
    };

    const makeSeries = (orig: 0 | 1, opt: any) => {
      const gi = mapG(orig);
      if (gi === null) return null;
      return { ...opt, xAxisIndex: gi, yAxisIndex: gi };
    };

    const seriesArr = [
      // 二阶折线
      makeSeries(0, {
        type: 'line',
        data: secondOrder.map((p) => [p.x, p.y]),
        lineStyle: { color: '#1f2937', width: 1 },
        itemStyle: { color: 'transparent' },
        symbol: 'none',
        z: 2,
      }),
      // 二阶球
      makeSeries(0, {
        type: 'scatter',
        data: secondBalls.map((b) => ({
          value: [b.x, b.y],
          itemStyle: { color: b.color },
          label: {
            show: true,
            formatter: b.text,
            position: 'inside',
            color: '#fff',
            fontSize: 5,
            fontWeight: 'bold',
          },
        })),
        symbolSize: 6,
        z: 3,
      }),
      // 一阶折线 + 参考线
      makeSeries(1, {
        type: 'line',
        data: missValues.map((v, i) => [i, v]),
        lineStyle: { color: '#1f2937', width: 1.2 },
        itemStyle: { color: 'transparent' },
        symbol: 'none',
        z: 2,
        markLine: {
          silent: true,
          symbol: 'none',
          label: { show: false },
          data: [
            ...(theoryMiss > 0
              ? [{ yAxis: theoryMiss, lineStyle: { color: '#1f2937', width: 1.2, type: 'solid' } }]
              : []),
            { yAxis: maxMiss, lineStyle: { color: '#ef4444', width: 1, type: 'dashed' } },
            { yAxis: avgMiss, lineStyle: { color: '#3b82f6', width: 1, type: 'dashed' } },
          ],
        },
      }),
      // MA5
      makeSeries(1, {
        type: 'line',
        data: ma5.map((v, i) => (v === null ? null : [i, v])),
        lineStyle: { color: '#3b82f6', width: 1 },
        itemStyle: { color: 'transparent' },
        symbol: 'none',
        z: 1,
      }),
      // MA10
      makeSeries(1, {
        type: 'line',
        data: ma10.map((v, i) => (v === null ? null : [i, v])),
        lineStyle: { color: '#22c55e', width: 1 },
        itemStyle: { color: 'transparent' },
        symbol: 'none',
        z: 1,
      }),
      // MA20
      makeSeries(1, {
        type: 'line',
        data: ma20.map((v, i) => (v === null ? null : [i, v])),
        lineStyle: { color: '#e879f9', width: 1 },
        itemStyle: { color: 'transparent' },
        symbol: 'none',
        z: 1,
      }),
      // 一阶球
      makeSeries(1, {
        type: 'scatter',
        data: balls.map((b) => ({
          value: [b.x, b.y],
          itemStyle: { color: b.color },
          label: {
            show: true,
            formatter: b.text,
            position: 'inside',
            color: '#fff',
            fontSize: 5,
            fontWeight: 'bold',
          },
        })),
        symbolSize: 6,
        z: 5,
      }),
    ].filter(Boolean);

    const option = {
      animation: false,
      backgroundColor: '#ffffff',
      grid,
      graphic,
      xAxis: [makeXAxis(0), makeXAxis(1)].filter(Boolean),
      yAxis: [makeYAxis(0), makeYAxis(1)].filter(Boolean),
      series: seriesArr,
    };

    const optionStr = JSON.stringify(option);

    return `
<!DOCTYPE html>
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
    const chart = echarts.init(document.getElementById('chart'));
    chart.setOption(${optionStr});
    window.addEventListener('resize', () => chart.resize());
  </script>
</body>
</html>`;
  }, [series, rangeIdx, theoryMiss, height, width, mode]);

  const showRangeBar = mode !== 'level1';

  return (
    <View style={{ width }}>
      {showRangeBar && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <Text style={{ fontSize: 11, color: '#888' }}>二阶范围:</Text>
          {RANGES.map((r, i) => (
            <Pressable
              key={r.label}
              onPress={() => setRangeIdx(i)}
              style={{
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 4,
                backgroundColor: rangeIdx === i ? '#2563eb' : '#f3f4f6',
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  color: rangeIdx === i ? '#fff' : '#111827',
                  fontWeight: rangeIdx === i ? 'bold' : '400',
                }}
              >
                {r.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

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

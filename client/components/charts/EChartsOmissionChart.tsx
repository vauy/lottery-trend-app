/**
 * ECharts 遗漏图（WebView 版）
 * 按「开出事件」排列：x 轴 = 第 N 次开出，y = 该次开出的遗漏值（距上次开出的期数）
 * 模式：
 *   both   —— 上下双联：二阶 + 一阶
 *   level1 —— 只显示一阶
 *   level2 —— 只显示二阶
 */
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { WebView } from 'react-native-webview';
import { ECHARTS_SOURCE } from '@/lib/echartsSource';
import { palette, semantic } from '@/lib/theme';

type SeriesPoint = { issue: string; omission: number };
type ChartMode = 'both' | 'level1' | 'level2';

/** 图表配色：直接取 prototype 换算后的设计 token */
const CH = {
  /** 网格 / 坐标轴线 */
  line: palette.line,
  /** 坐标刻度文字 */
  tick: palette.inkFaint,
  /** 标题文字 */
  title: palette.inkDim,
  /** 主序列（一阶 / 二阶折线） */
  main: palette.accent,
  /** MA5 —— 原型 drawAmp 的 MA5 = amber */
  ma5: palette.amber,
  /** MA10 */
  ma10: semantic.hot,
  /** MA20 —— 原型 drawAmp 的 MA20 = cyan */
  ma20: semantic.cold,
  /** 遗漏值球 / 历史最大线 */
  hot: semantic.hot,
  /** 开出球（遗漏 0）/ 平均线 */
  cold: semantic.cold,
  /** 特殊标记球（第 5/10/20 个、? 球） */
  dan: semantic.dan,
  /** 理论遗漏线 */
  theory: palette.inkDim,
};

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
  historyMaxMiss,
  targetLabel,
  /** 水平参考线：equal=四等分，split=黄金分割 */
  overlay = 'none',
}: {
  series: SeriesPoint[];
  height?: number;
  width?: number;
  theoryMiss?: number;
  mode?: ChartMode;
  historyMaxMiss?: number;
  targetLabel?: string;
  overlay?: 'none' | 'split' | 'equal';
}) {
  const [rangeIdx, setRangeIdx] = useState(0);

  const html = useMemo(() => {
    const MAX_SHOW = 1000;
    const trimmed = series.length > MAX_SHOW ? series.slice(-MAX_SHOW) : series;
    const n = trimmed.length;
    if (n === 0) {
      return `<html><body style="margin:0;display:flex;align-items:center;justify-content:center;color:${CH.tick};font-size:12px">暂无数据</body></html>`;
    }

    const missValues = trimmed.map((p) => p.omission);
    const issuesAll = trimmed.map((p) => p.issue);
    const range = RANGES[rangeIdx];

    // === 提取开出点（omission === 0）===
    // opens[k] = { idx: 在原 series 中的位置, issue, miss: 距上次开出的期数 }
    const opens: { idx: number; issue: string; miss: number }[] = [];
    for (let i = 0; i < n; i += 1) {
      if (missValues[i] === 0) {
        const prevIdx = opens.length > 0 ? opens[opens.length - 1].idx : -1;
        opens.push({ idx: i, issue: issuesAll[i], miss: i - prevIdx - 1 });
      }
    }
    const nOpens = opens.length;
    const currentMiss = missValues[n - 1];

    // === 统计 ===
    const hasPending = currentMiss > 0;
    const missArr = opens.map((o) => o.miss);
    const localMaxMiss = Math.max(1, ...missArr, currentMiss);
    const maxMiss = historyMaxMiss !== undefined && historyMaxMiss >= localMaxMiss ? historyMaxMiss : localMaxMiss;
    const avgMiss = missArr.length > 0 ? missArr.reduce((a, b) => a + b, 0) / missArr.length : 0;

    // === MA（按球）：最近 N 个球平均，前 N-1 个位置用现有球平均 ===
    const maOf = (window: number, idx: number): number => {
      const start = Math.max(0, idx - window + 1);
      let sum = 0;
      for (let i = start; i <= idx; i += 1) sum += missArr[i];
      return sum / (idx - start + 1);
    };
    const ma5 = missArr.map((_, i) => maOf(5, i));
    const ma10 = missArr.map((_, i) => maOf(10, i));
    const ma20 = missArr.map((_, i) => maOf(20, i));
    // ? 点
    {
      const ext = [...missArr, currentMiss];
      const mOfExt = (window: number, idx: number): number => {
        const start = Math.max(0, idx - window + 1);
        let sum = 0;
        for (let i = start; i <= idx; i += 1) sum += ext[i];
        return sum / (idx - start + 1);
      };
      ma5.push(mOfExt(5, ext.length - 1));
      ma10.push(mOfExt(10, ext.length - 1));
      ma20.push(mOfExt(20, ext.length - 1));
    }

    // === 二阶（在开出序列上）===
    const secondOrder: { x: number; y: number }[] = [];
    let lastValid: number | null = null;
    for (let k = 0; k < nOpens; k += 1) {
      if (missArr[k] >= range.min && missArr[k] <= range.max) {
        if (lastValid !== null) secondOrder.push({ x: k, y: k - lastValid });
        lastValid = k;
      }
    }
    const secondBalls = secondOrder.map((p) => ({ x: p.x, y: p.y, color: CH.hot, text: String(p.y) }));
    const secondMax = niceMax(Math.max(1, ...secondOrder.map((p) => p.y)));

    // === 一阶球（每个开出点一个 + 末尾 ? 点）===
    // 无论有没有 ? 球，右边都留 4 格空白
    const xMax = Math.max(1, nOpens + 4);

    const balls: { x: number; y: number; color: string; text: string }[] = [];
    for (let k = 0; k < nOpens; k += 1) {
      const m = missArr[k];
      let color: string = m === 0 ? CH.main : CH.hot;
      const fromRight = nOpens - 1 - k; // 0 = 最右
      if (fromRight === 4) color = CH.cold;       // 从右数第 5 个 → cyan
      else if (fromRight === 9) color = CH.main;  // 从右数第 10 个 → accent
      else if (fromRight === 19) color = CH.dan;  // 从右数第 20 个 → amber
      if (fromRight === 0) color = CH.cold;       // 当前期（最右开出球）→ cyan
      balls.push({ x: k, y: m, color, text: String(m) });
    }
    // 当前期未开出 → 补蓝球；已开出 → 循环最右球已改蓝
    const latestOpened = missValues[n - 1] === 0;
    let tailX = nOpens - 1;
    if (!latestOpened) {
      balls.push({ x: nOpens, y: currentMiss, color: CH.cold, text: String(currentMiss) });
      tailX = nOpens;
    }
    // ? 球（下一期，未开奖）始终显示
    balls.push({ x: tailX + 1, y: currentMiss, color: CH.dan, text: '?' });

    // === 折线数据 ===
    const linePoints: [number, number][] = missArr.map((v, k) => [k, v]);
    // 补蓝球位置（已开出时是 ? 球位置）
    linePoints.push([nOpens, currentMiss]);
    // 未开出时，蓝球 + ? 球都在右侧
    if (!latestOpened) linePoints.push([nOpens + 1, currentMiss]);

    const displayMax = niceMax(Math.max(maxMiss, currentMiss, theoryMiss));

    // === 球径：每格宽度的一半 ===
    const ballSize = 12;

    // === mode 分派 ===
    const isBoth = mode === 'both';
    const isL1 = mode === 'level1';
    const isL2 = mode === 'level2';
    const mapG = (orig: 0 | 1): 0 | 1 | null => {
      if (isBoth) return orig;
      if (isL1) return orig === 1 ? 0 : null;
      return orig === 0 ? 0 : null;
    };

    /**
     * 绘图区内边距。
     * right 原来留 60 是照抄股票版的「右侧第二坐标轴」占位，
     * 但本图只有一套 y 轴，这 60dp 纯属浪费 —— 在 ~500dp 宽的卡片里
     * 等于白丢 12% 横向空间，左右各一条明显空隙。
     * 收成 10 后配合 containLabel，刻度文字仍不会被裁掉。
     */
    const grid = isBoth
      ? [
          { left: 4, right: 10, top: 26, height: '34%', containLabel: true },
          { left: 4, right: 10, top: '56%', height: '36%', containLabel: true },
        ]
      : [{ left: 4, right: 10, top: 26, height: '78%', containLabel: true }];

    const secondTitle = `${targetLabel ? targetLabel + '  ' : ''}二阶遗漏图（遗漏范围 ${range.min}-${range.max}）`;
    const firstTitle = `${targetLabel ? targetLabel + '  ' : ''}一阶遗漏图（历史最大:${maxMiss} 出次:${nOpens} 平均:${avgMiss.toFixed(3)} 理论:${theoryMiss.toFixed(3)} 当前:${currentMiss}）`;

    const graphic: any[] = [];
    if (isBoth) {
      graphic.push({ type: 'text', left: 'center', top: 6, style: { text: secondTitle, fontSize: 10, fill: CH.title } });
      graphic.push({ type: 'text', left: 'center', top: '51%', style: { text: firstTitle, fontSize: 10, fill: CH.title } });
    } else if (isL2) {
      graphic.push({ type: 'text', left: 'center', top: 6, style: { text: secondTitle, fontSize: 10, fill: CH.title } });
    } else {
      graphic.push({ type: 'text', left: 'center', top: 6, style: { text: firstTitle, fontSize: 10, fill: CH.title } });
    }

    const formatXLabel = (v: number) => {
      const i = Math.round(v);
      if (Math.abs(v - i) > 0.001) return '';
      if (i < 0) return '';
      if (i >= nOpens) return '';
      if (i % 10 !== 0 && i !== nOpens - 1) return '';
      return opens[i].issue;
    };

    const makeXAxis = (orig: 0 | 1) => {
      const gi = mapG(orig);
      if (gi === null) return null;
      return {
        gridIndex: gi,
        type: 'value',
        min: 0,
        max: xMax,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: CH.line } },
        axisLabel: (isBoth && orig === 0)
          ? { show: false }
          : { show: true, fontSize: 7, color: CH.tick, formatter: formatXLabel },
        splitLine: {
          show: true,
          interval: 4,
          lineStyle: { color: CH.line, type: 'dashed' },
        },
      };
    };

    const makeYAxis = (orig: 0 | 1) => {
      const gi = mapG(orig);
      if (gi === null) return null;
      const mx = orig === 0 ? secondMax : displayMax;
      return {
        gridIndex: gi,
        type: 'value',
        min: 0,
        max: mx,
        splitNumber: 12,
        splitLine: {
          show: true,
          lineStyle: { color: CH.line, type: 'dashed' },
        },
        axisLabel: { fontSize: 8, color: CH.tick },
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
        lineStyle: { color: CH.main, width: 1 },
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
            fontSize: Math.max(3, ballSize * 0.55),
            fontWeight: 'bold',
          },
        })),
        symbolSize: ballSize,
        z: 3,
      }),
      // 一阶折线 + 参考线
      makeSeries(1, {
        type: 'line',
        data: linePoints,
        lineStyle: { color: CH.main, width: 1.2 },
        itemStyle: { color: 'transparent' },
        symbol: 'none',
        z: 2,
        markLine: {
          silent: true,
          symbol: 'none',
          label: { show: false },
          data: [
            ...(theoryMiss > 0
              ? [{ yAxis: theoryMiss, lineStyle: { color: CH.theory, width: 1.2, type: 'solid' } }]
              : []),
            { yAxis: maxMiss, lineStyle: { color: CH.hot, width: 1, type: 'dashed' } },
            { yAxis: avgMiss, lineStyle: { color: CH.cold, width: 1, type: 'dashed' } },
          ],
        },
      }),
      // MA5
      makeSeries(1, {
        type: 'line',
        data: ma5.map((v, i) => (v === null ? null : [i, v])),
        lineStyle: { color: CH.ma5, width: 1 },
        itemStyle: { color: 'transparent' },
        symbol: 'none',
        z: 1,
      }),
      // MA10
      makeSeries(1, {
        type: 'line',
        data: ma10.map((v, i) => (v === null ? null : [i, v])),
        lineStyle: { color: CH.ma10, width: 1 },
        itemStyle: { color: 'transparent' },
        symbol: 'none',
        z: 1,
      }),
      // MA20
      makeSeries(1, {
        type: 'line',
        data: ma20.map((v, i) => (v === null ? null : [i, v])),
        lineStyle: { color: CH.ma20, width: 1 },
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
            fontSize: Math.max(3, ballSize * 0.55),
            fontWeight: 'bold',
          },
        })),
        symbolSize: ballSize,
        z: 5,
      }),
    ].filter(Boolean);

    // 分割/等分水平参考线（基于二阶主格 0..displayMax 量程）
    if (overlay !== 'none') {
      const ratios = overlay === 'equal' ? [0.25, 0.5, 0.75] : [0.382, 0.5, 0.618];
      const xLast = n - 1;
      for (const r of ratios) {
        const lvl = r * displayMax;
        const s = makeSeries(0, {
          type: 'line',
          data: [
            [0, lvl],
            [xLast, lvl],
          ],
          lineStyle: { color: '#909C94', width: 0.8, type: 'dashed' },
          symbol: 'none',
          silent: true,
          z: 1,
        });
        if (s) seriesArr.push(s);
      }
    }

    const option = {
      animation: false,
      backgroundColor: 'transparent',
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
    // WebView 的 viewport 不会随布局变化触发 window resize，
    // 容器尺寸一变图就糊/被裁，所以额外挂一个 ResizeObserver。
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(function () { chart.resize(); }).observe(document.getElementById('chart'));
    }
  </script>
</body>
</html>`;
  }, [series, rangeIdx, theoryMiss, height, width, mode, overlay]);

  const showRangeBar = mode !== 'level1';

  return (
    <View style={{ width }}>
      {showRangeBar && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <Text style={{ fontSize: 11, color: CH.title }}>二阶范围:</Text>
          {RANGES.map((r, i) => (
            <Pressable
              key={r.label}
              onPress={() => setRangeIdx(i)}
              style={{
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 4,
                backgroundColor: rangeIdx === i ? palette.accent : palette.surface2,
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  color: rangeIdx === i ? palette.accentInk : palette.inkDim,
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

/**
 * 分布图形 —— 经典位置走势图
 *
 * 对齐官方《分布图形》参考图形态：
 *   - 横轴期号、纵轴号码（0-9 或 1-80，0/小号码在上，与官方一致）
 *   - 每期开奖号码所在的单元格高亮（绿色圆点），并把相邻两期的开奖点用细线连起来
 *     —— 这就是彩票走势图里的「连线」
 *   - 每个单元格显示该号码此刻的遗漏值（当期开出为 0）
 *   - 数字过多时（快乐8 / 期数很多）自动隐藏格内遗漏值，保留圆点与连线
 *
 * 实现说明：底层用 ECharts heatmap 画单元格（含遗漏值标签），
 * 再叠一条 line 系列把每期开奖数字连起来。全部通过 EChartView 渲染，
 * 零原生依赖，Expo Go 可用，横竖屏自适应不拉伸。
 */
import React, { useMemo } from 'react';
import { EChartView, type EChartsOption } from './EChartView';
import { CHART_COLORS, gridFor, tooltipFor, xAxisFor } from './chartTheme';

export interface TrendChartProps {
  /** 期号序列（正序，旧→新） */
  issues: string[];
  /** 每期该位置开出的数字，与 issues 一一对应 */
  draws: number[];
  /** 全部候选数字（如 0..9） */
  digits: number[];
  height?: number;
  landscape?: boolean;
}

/** 官方参考：开奖点绿色、连线灰色 */
const HIT_COLOR = '#2EA063';
const LINE_COLOR = '#8A968E';

export function TrendChart({ issues, draws, digits, height, landscape = false }: TrendChartProps) {
  const option = useMemo<EChartsOption>(() => {
    const n = issues.length;
    const digitCount = digits.length;
    const digitLabels = digits.map(String);
    const digitIndex = new Map<number, number>();
    digits.forEach((d, i) => digitIndex.set(d, i));

    /** 每格遗漏值：从前往后累计「上次开出之后隔了几期」 */
    const lastSeen = new Map<number, number>();
    const omit: number[][] = digits.map(() => new Array(n).fill(0));
    for (let i = 0; i < n; i += 1) {
      for (const d of digits) {
        const seen = lastSeen.get(d);
        omit[digitIndex.get(d)!][i] = draws[i] === d ? 0 : seen === undefined ? i : i - seen;
      }
      lastSeen.set(draws[i], i);
    }

    /** 单元格（heatmap）：value=[x, y, 遗漏值]，drawn 标记当期开奖格 */
    const cells: any[] = [];
    for (let yi = 0; yi < digitCount; yi += 1) {
      for (let xi = 0; xi < n; xi += 1) {
        const drawn = draws[xi] === digits[yi];
        cells.push({
          value: [xi, yi, omit[yi][xi]],
          drawn,
          itemStyle: drawn
            ? { color: HIT_COLOR }
            : { color: 'rgba(0,0,0,0)' },
        });
      }
    }

    const totalCells = n * digitCount;
    const showCellLabel = totalCells <= 600;

    return {
      animation: false,
      backgroundColor: 'transparent',
      grid: { ...gridFor(landscape), top: 8, left: landscape ? 44 : 34 },
      tooltip: tooltipFor({
        formatter: (p: any) => {
          const v = p.value || [];
          return `${issues[v[0]] ?? ''}\n号码 ${digitLabels[v[1]] ?? ''}\n遗漏 ${v[2] ?? ''}`;
        },
      }),
      visualMap: { show: false, min: 0, max: 1, calculable: false },
      xAxis: { ...xAxisFor(issues, landscape), position: 'bottom' },
      yAxis: {
        type: 'category',
        data: digitLabels,
        inverse: true,
        axisLine: { lineStyle: { color: CHART_COLORS.grid } },
        axisTick: { show: false },
        axisLabel: { color: CHART_COLORS.axis, fontSize: 9, interval: 0 },
        splitLine: { show: true, lineStyle: { color: CHART_COLORS.grid, type: 'dashed' } },
      },
      series: [
        {
          name: '遗漏',
          type: 'heatmap',
          data: cells,
          label: {
            show: showCellLabel,
            fontSize: 8,
            color: '#E7EDE9',
            formatter: (p: any) => (p.data.drawn ? '' : String(p.value[2])),
          },
          emphasis: { disabled: true },
          z: 1,
        },
        {
          name: '走势',
          type: 'line',
          data: draws.map(String),
          symbol: 'circle',
          symbolSize: 9,
          smooth: false,
          lineStyle: { width: 1.2, color: LINE_COLOR },
          itemStyle: { color: HIT_COLOR, borderColor: 'rgba(0,0,0,0.4)', borderWidth: 1 },
          label: { show: false },
          z: 3,
        },
      ],
    };
  }, [issues, draws, digits, landscape]);

  const h = height ?? Math.max(200, digits.length * 20 + 60);
  return <EChartView option={option} height={h} />;
}

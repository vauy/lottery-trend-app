/**
 * 扫描图 —— 号码 × 期号 的「√/× 中出矩阵」
 *
 * 对齐官方《扫描图》参考图形态：
 *   - 每行一个号码（或分析项目），每列一期；
 *   - 当期中出画绿色 √，未中画粉色 ×；
 *   - 可横向滑动浏览更多期数（ECharts 内部不压缩行高，由 RN 侧决定高度）。
 *
 * 行数多时（快乐8 有 80 个号码）由父级把图表放进竖向滚动区域，
 * 图表高度按行数自动放大，保证每个号码一行不被挤压变形。
 */
import React, { useMemo } from 'react';
import { EChartView, type EChartsOption } from './EChartView';
import { CHART_COLORS, gridFor, tooltipFor, xAxisFor } from './chartTheme';

export interface ScanRow {
  /** 号码 / 项目名称 */
  label: string;
  /** 与 issues 一一对应，1=中出，0=未中 */
  hits: number[];
}

export interface ScanChartProps {
  issues: string[];
  rows: ScanRow[];
  height?: number;
  landscape?: boolean;
}

const HIT_COLOR = '#2EA063';
const MISS_COLOR = '#B0568C';

export function ScanChart({ issues, rows, height, landscape = false }: ScanChartProps) {
  const option = useMemo<EChartsOption>(() => {
    const labels = rows.map((r) => r.label);
    const data: any[] = [];
    rows.forEach((r, yi) => {
      r.hits.forEach((hit, xi) => {
        data.push({
          value: [xi, yi, hit],
          itemStyle: { color: hit === 1 ? HIT_COLOR : MISS_COLOR },
        });
      });
    });

    return {
      animation: false,
      backgroundColor: 'transparent',
      grid: { ...gridFor(landscape), top: 8, left: landscape ? 48 : 40 },
      tooltip: tooltipFor({
        formatter: (p: any) => {
          const v = p.value || [];
          return `${issues[v[0]] ?? ''}\n${labels[v[1]] ?? ''}：${v[2] === 1 ? '中出 √' : '未中 ×'}`;
        },
      }),
      visualMap: { show: false, min: 0, max: 1, calculable: false },
      xAxis: { ...xAxisFor(issues, landscape), position: 'bottom' },
      yAxis: {
        type: 'category',
        data: labels,
        inverse: true,
        axisLine: { lineStyle: { color: CHART_COLORS.grid } },
        axisTick: { show: false },
        axisLabel: { color: CHART_COLORS.axis, fontSize: 9, interval: 0 },
        splitLine: { show: false },
      },
      series: [
        {
          name: '扫描',
          type: 'heatmap',
          data,
          label: {
            show: true,
            fontSize: 9,
            color: 'rgba(255,255,255,0.9)',
            formatter: (p: any) => (p.value[2] === 1 ? '√' : '×'),
          },
          emphasis: { disabled: true },
        },
      ],
    };
  }, [issues, rows, landscape]);

  const h = height ?? Math.max(200, rows.length * 22 + 60);
  return <EChartView option={option} height={h} />;
}

/**
 * 技术指标副图 —— MACD / KDJ / RSI / CCI / DMI 等
 *
 * 指标计算全部由 lib/lottery/indicators.ts 完成，这里只做渲染。
 * 支持 line 与 bar 两种图元混合（例如 MACD 的 DIFF/DEA 是线、柱是 bar）。
 */
import React, { useMemo } from 'react';
import type { IndicatorSeries } from '../../lib/lottery/indicators';
import { EChartView, type EChartsOption } from './EChartView';
import { gridFor, legendFor, tooltipFor, xAxisFor, yAxisFor } from './chartTheme';

export interface IndicatorChartProps {
  categories: string[];
  series: IndicatorSeries[];
  height?: number;
  landscape?: boolean;
  title?: string;
  /** 是否画 0 轴参考线（MACD/CCI 之类需要） */
  zeroLine?: boolean;
}

export function IndicatorChart({
  categories,
  series,
  height,
  landscape = false,
  title,
  zeroLine = true,
}: IndicatorChartProps) {
  const option = useMemo<EChartsOption>(() => {
    const hasBar = series.some((s) => s.type === 'bar');
    const seriesList = series.map((s) => ({
      name: s.name,
      type: s.type === 'bar' ? 'bar' : 'line',
      data: s.data,
      ...(s.type === 'bar'
        ? {
            barMaxWidth: categories.length <= 60 ? 8 : 4,
            itemStyle: { color: semanticBarColor(s.color) },
          }
        : {
            smooth: true,
            symbol: 'none',
            lineStyle: { width: 1.2, color: s.color },
            itemStyle: { color: s.color },
          }),
    }));

    return {
      animation: false,
      backgroundColor: 'transparent',
      grid: gridFor(landscape),
      tooltip: tooltipFor(),
      legend: legendFor(series.map((s) => s.name)),
      xAxis: xAxisFor(categories, landscape),
      yAxis: yAxisFor(landscape),
      series: [
        ...seriesList,
        ...(zeroLine && hasBar
          ? [
              {
                name: '__zero',
                type: 'line' as const,
                data: [],
                markLine: {
                  silent: true,
                  symbol: 'none',
                  label: { show: false },
                  lineStyle: { color: '#616C65', width: 1, type: 'solid' as const },
                  data: [{ yAxis: 0 }],
                },
              },
            ]
          : []),
      ],
      title: title
        ? {
            text: title,
            left: 8,
            top: 2,
            textStyle: { color: '#909C94', fontSize: 11, fontWeight: '600' },
          }
        : undefined,
    };
  }, [categories, series, landscape, title, zeroLine]);

  return <EChartView option={option} height={height} />;
}

function semanticBarColor(color?: string): string {
  return color ?? '#60DB89';
}

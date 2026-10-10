/**
 * 出次图 —— 对齐官方参考形态
 *
 * 官方帮助《出次图》：「图中带有圆圈的红色细线为号码出现次数曲线」——
 * 即「红色细折线 + 圆圈节点」，而非柱状图。
 * 圆圈内数值为该分段（步长）内本批号码出现的次数；
 * 可叠加 5/10/25 期均线判断出现趋势。
 */
import React, { useMemo } from 'react';
import type { CountPoint } from '../../lib/lottery/types';
import { EChartView, type EChartsOption } from './EChartView';
import { CHART_COLORS, gridFor, legendFor, tooltipFor, xAxisFor, yAxisFor } from './chartTheme';

/** 官方参考图：红色细线 + 圆圈节点 */
const LINE_COLOR = '#EF6661';

export interface CountChartProps {
  points: CountPoint[];
  height?: number;
  landscape?: boolean;
  title?: string;
}

export function CountChart({ points, height, landscape = false, title }: CountChartProps) {
  const option = useMemo<EChartsOption>(() => {
    const categories = points.map((p) => p.label);
    const values = points.map((p) => p.count);
    const showLabel = points.length <= 40;

    return {
      animation: false,
      backgroundColor: 'transparent',
      grid: gridFor(landscape),
      tooltip: tooltipFor(),
      legend: legendFor(['出现次数']),
      xAxis: xAxisFor(categories, landscape),
      yAxis: { ...yAxisFor(landscape), min: 0, minInterval: 1, scale: false },
      series: [
        {
          name: '出现次数',
          type: 'line',
          data: values,
          symbol: 'circle',
          symbolSize: points.length <= 40 ? 9 : 6,
          smooth: false,
          lineStyle: { width: 1.2, color: LINE_COLOR },
          itemStyle: {
            color: LINE_COLOR,
            borderColor: 'rgba(0,0,0,0.35)',
            borderWidth: 1,
          },
          label: {
            show: showLabel,
            position: 'top',
            distance: 3,
            color: '#E7EDE9',
            fontSize: 9,
          },
        },
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
  }, [points, landscape, title]);

  return <EChartView option={option} height={height} />;
}

/**
 * K 线图 —— 频率K线 / 周期K线 / 遗漏K线 共用同一套渲染
 *
 * 三种模式的差别只在「喂进来的蜡烛数据」不同，由 analysis.ts 负责计算，
 * 这里只负责画，因此横竖屏切换时三种模式的形态表现完全一致。
 *
 * 「走势不变形」靠两点保证：
 *  - y 轴 scale:true，纵坐标贴合数据区间，不会被 0 基线拉平；
 *  - 蜡烛宽度按可见数量动态限制（barMaxWidth/barMinWidth），
 *    竖屏窄屏不会挤成一团，横屏宽屏也不会变成粗块。
 */
import React, { useMemo } from 'react';
import { semantic } from '../../lib/theme';
import type { KLineSeries } from '../../lib/lottery/types';
import { EChartView, type EChartsOption } from './EChartView';
import { CHART_COLORS, gridFor, legendFor, tooltipFor, xAxisFor, yAxisFor } from './chartTheme';

export interface OverlayLine {
  name: string;
  data: Array<number | null>;
  color: string;
}

export interface KLineChartProps {
  series: KLineSeries;
  /** 叠加在主图上的均线 / BOLL 等 */
  overlays?: OverlayLine[];
  height?: number;
  landscape?: boolean;
  /** 顶部标题（可选） */
  title?: string;
  /**
   * 理论均线值（官方《遗漏图》里那条贯穿全图的黑色直线）。
   * 传入后主图会画一条水平虚线，用于判断走势在理论均值上方（热）还是下方（冷）。
   */
  theoryLine?: number;
  /**
   * 每根蜡烛的自定义配色（遗漏K线的红格 / 蓝格）。
   * 与 candles 等长时生效：传 '#EF6661' 为红格（范围内开出），
   * '#4FCDCD' 为蓝格（范围外开出 / 预画蓝格）。
   */
  candleColors?: string[];
}

export function KLineChart({
  series,
  overlays = [],
  height,
  landscape = false,
  title,
  theoryLine,
  candleColors,
}: KLineChartProps) {
  const option = useMemo<EChartsOption>(() => {
    const { categories, candles } = series;
    const ohlc = candles.map((c) => [c.o, c.c, c.l, c.h]);

    // 可见蜡烛数量决定柱宽上限：数量少则宽，数量多则窄
    const n = Math.max(1, categories.length);
    const barMax = n <= 20 ? 22 : n <= 60 ? 14 : n <= 120 ? 8 : 5;

    const seriesList: any[] = [
      {
        name: 'K线',
        type: 'candlestick',
        data: candleColors
          ? ohlc.map((v, i) => ({
              value: v,
              itemStyle: { color: candleColors[i], color0: candleColors[i], borderColor: candleColors[i], borderColor0: candleColors[i] },
            }))
          : ohlc,
        barMaxWidth: barMax,
        barMinWidth: 1,
        itemStyle: {
          color: CHART_COLORS.up,
          color0: CHART_COLORS.down,
          borderColor: CHART_COLORS.upBorder,
          borderColor0: CHART_COLORS.downBorder,
          borderWidth: 1,
        },
      },
    ];

    for (const line of overlays) {
      seriesList.push({
        name: line.name,
        type: 'line',
        data: line.data,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 1.2, color: line.color },
        itemStyle: { color: line.color },
      });
    }

    /** 理论均线：挂在首条 series 上的水平 markLine（官方《遗漏图》的黑色理论线） */
    if (theoryLine !== undefined && Number.isFinite(theoryLine)) {
      (seriesList[0] as any).markLine = {
        silent: true,
        symbol: 'none',
        data: [{ yAxis: theoryLine }],
        lineStyle: { color: '#E7EDE9', width: 1, type: 'solid', opacity: 0.55 },
        label: {
          show: true,
          position: 'insideEndTop',
          formatter: `理论 ${theoryLine.toFixed(2)}`,
          color: '#909C94',
          fontSize: 9,
        },
      };
    }

    return {
      animation: false,
      backgroundColor: 'transparent',
      grid: gridFor(landscape),
      tooltip: tooltipFor(),
      legend: legendFor(overlays.map((o) => o.name)),
      xAxis: xAxisFor(categories, landscape),
      yAxis: yAxisFor(landscape),
      series: seriesList,
      title: title
        ? {
            text: title,
            left: 8,
            top: 2,
            textStyle: { color: semantic.textDim, fontSize: 11, fontWeight: '600' },
          }
        : undefined,
    };
  }, [series, overlays, landscape, title, theoryLine, candleColors]);

  return <EChartView option={option} height={height} />;
}

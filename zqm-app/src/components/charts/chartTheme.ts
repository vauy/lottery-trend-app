/**
 * 图表通用配置
 *
 * 集中管理坐标轴、网格、配色，保证所有图表在深色背景下观感一致，
 * 并且无论横屏还是竖屏都能自适应、不拉伸变形。
 */
import { semantic } from '../../lib/theme';
import type { EChartsOption } from './EChartView';

export const CHART_COLORS = {
  /** 阳线 / 开出 */
  up: semantic.hot,
  upBorder: semantic.hot,
  /** 阴线 / 遗漏 */
  down: semantic.cold,
  downBorder: semantic.cold,
  ma5: '#F2B95A',
  ma10: '#4FCDCD',
  ma25: '#B58CF2',
  grid: semantic.divider,
  axis: semantic.textFaint,
  bar: semantic.brand,
} as const;

/** 网格边距：横屏时上下留白更少，左右更多，避免蜡烛被压扁 */
export function gridFor(landscape: boolean) {
  return {
    left: landscape ? 52 : 40,
    right: landscape ? 16 : 10,
    top: 16,
    bottom: landscape ? 26 : 22,
    containLabel: false,
  };
}

/** 通用坐标轴样式 */
export function axisStyle(fontSize = 9) {
  return {
    axisLine: { lineStyle: { color: CHART_COLORS.grid } },
    axisTick: { show: false },
    axisLabel: { color: CHART_COLORS.axis, fontSize },
    splitLine: { show: false },
  };
}

/** 横屏时 X 轴标签可以显示得更密一些 */
export function xAxisFor(categories: string[], landscape: boolean) {
  const max = landscape ? 14 : 6;
  const step = Math.max(1, Math.ceil(categories.length / max));
  const style = axisStyle(landscape ? 10 : 9);
  return {
    type: 'category' as const,
    data: categories,
    boundaryGap: true,
    ...style,
    axisLabel: {
      ...style.axisLabel,
      interval: step - 1,
      hideOverlap: true,
    },
  };
}

/** Y 轴：scale:true 让纵坐标贴合数据范围，走势不被压平 */
export function yAxisFor(landscape: boolean) {
  const style = axisStyle(landscape ? 10 : 9);
  return {
    type: 'value' as const,
    scale: true,
    ...style,
    splitLine: { show: true, lineStyle: { color: CHART_COLORS.grid, type: 'dashed' as const } },
  };
}

/** 通用 tooltip */
export function tooltipFor(extra: Record<string, any> = {}) {
  return {
    trigger: 'axis' as const,
    confine: true,
    backgroundColor: semantic.panelBg,
    borderColor: semantic.panelBorder,
    borderWidth: 1,
    textStyle: { color: semantic.text, fontSize: 11 },
    axisPointer: { type: 'line' as const, lineStyle: { color: semantic.textFaint } },
    ...extra,
  };
}

/** 图例 */
export function legendFor(names: string[]) {
  return {
    data: names,
    show: names.length > 0,
    top: 0,
    right: 4,
    itemWidth: 10,
    itemHeight: 6,
    textStyle: { color: semantic.textDim, fontSize: 9 },
  };
}

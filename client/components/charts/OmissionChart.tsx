/**
 * 遗漏图 —— 用节点表示每次开出前的遗漏期数
 *
 * - 一阶（order = 1）：逐期遗漏值，每期一个节点
 * - 二阶（order = 2）：只在「开出」处落节点，值为开出前的遗漏期数
 * - 叠加移动均线，默认 5 / 10 / 25
 *
 * 尺寸全部由 width / height props 驱动，内部不写死宽度。
 */
import React, { useMemo } from 'react';
import {
  CHART_GRID,
  EChartView,
  categoryAxis,
  emptyOption,
  maLineSeries,
  titleGraphic,
  valueAxis,
  type EChartOption,
} from './EChartView';
import { movingAverage } from './chartUtils';
import type { TargetPoint } from '@/lib/lottery/targets';
import { alpha, palette } from '@/lib/theme';

/** 节点 / 主折线：冷色（青） */
const NODE_COLOR = palette.cyan;
/** 均线配色 */
const MA_COLORS = [palette.amber, palette.accent, palette.red];
const DEFAULT_MA = [5, 10, 25];

export interface OmissionChartProps {
  /** 目标序列（正序：index 0 最旧） */
  series: TargetPoint[];
  /** 容器宽度（由外部布局测量驱动） */
  width: number;
  /** 容器高度 */
  height: number;
  /** 1 = 一阶（逐期遗漏）；2 = 二阶（每次开出前的遗漏），默认 2 */
  order?: 1 | 2;
  /** 移动均线周期，默认 [5, 10, 25]；传 [] 关闭均线 */
  maPeriods?: number[];
  /** 最多渲染点数（保留最新），默认 200 */
  maxPoints?: number;
  /** 顶部标题 */
  title?: string;
}

export function OmissionChart({
  series,
  width,
  height,
  order = 2,
  maPeriods = DEFAULT_MA,
  maxPoints = 200,
  title,
}: OmissionChartProps) {
  const option = useMemo<EChartOption>(() => {
    const pts = series.length > maxPoints ? series.slice(-maxPoints) : series;

    const values: number[] = [];
    const issues: string[] = [];
    if (order === 2) {
      // 二阶：只在开出点落节点，值 = 开出前的遗漏期数
      for (let i = 0; i < pts.length; i += 1) {
        if (pts[i].hit !== 1) continue;
        values.push(i === 0 ? 0 : pts[i - 1].omission);
        issues.push(pts[i].issue);
      }
    } else {
      // 一阶：逐期遗漏
      for (let i = 0; i < pts.length; i += 1) {
        values.push(pts[i].omission);
        issues.push(pts[i].issue);
      }
    }

    const n = values.length;
    if (n === 0) return emptyOption('暂无数据');

    const hi = Math.max(1, ...values);
    const step = Math.max(1, Math.ceil(n / 12));
    const labels = issues.map((s, i) => (i % step === 0 ? s.slice(-3) : ''));

    const maSeries = maPeriods.map((period, i) =>
      maLineSeries(
        movingAverage(values, period),
        MA_COLORS[i % MA_COLORS.length],
        i === 0 ? 1.2 : 1,
      ),
    );

    return {
      backgroundColor: 'transparent',
      animation: false,
      grid: { ...CHART_GRID, top: height < 160 ? 18 : 24 },
      graphic: titleGraphic(title),
      xAxis: categoryAxis(labels),
      yAxis: valueAxis(0, Math.ceil(hi * 1.08)),
      series: [
        {
          type: 'line',
          data: values,
          symbol: 'circle',
          symbolSize: n > 60 ? 3 : 4,
          showSymbol: true,
          smooth: false,
          animation: false,
          itemStyle: { color: NODE_COLOR },
          lineStyle: { color: NODE_COLOR, width: 1.2 },
          areaStyle: { color: alpha(palette.cyan, 0.12) },
          z: 4,
        },
        ...maSeries,
      ],
    };
  }, [series, width, height, order, maPeriods, maxPoints, title]);

  return <EChartView option={option} width={width} height={height} />;
}

export default OmissionChart;

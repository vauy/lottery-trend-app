/**
 * 振幅图 —— 原始值走势 + 移动均线
 *
 * - 振幅 = |本期值 − 上期值|（首期为 0），如和值振幅
 * - 叠加移动均线（默认 5 / 20）与可选的平均值参考线
 *
 * 尺寸全部由 width / height props 驱动，内部不写死宽度。
 */
import React, { useMemo } from 'react';
import {
  CHART_GRID,
  CHART_TICK_COLOR,
  EChartView,
  categoryAxis,
  emptyOption,
  maLineSeries,
  titleGraphic,
  valueAxis,
  type EChartOption,
} from './EChartView';
import { movingAverage } from './chartUtils';
import { alpha, palette } from '@/lib/theme';

/** 振幅折线 */
const AMP_COLOR = palette.accent;
/** 均线配色 */
const MA_COLORS = [palette.amber, palette.cyan, palette.red];
const DEFAULT_MA = [5, 20];

export interface AmpChartProps {
  /** 原始值序列（正序：index 0 最旧），如每期和值 */
  values: number[];
  /** 容器宽度（由外部布局测量驱动） */
  width: number;
  /** 容器高度 */
  height: number;
  /** X 轴标签（期号等），缺省留空 */
  labels?: string[];
  /** 移动均线周期，默认 [5, 20]；传 [] 关闭均线 */
  maPeriods?: number[];
  /** 是否显示平均值虚线，默认 true */
  showAverage?: boolean;
  /** 最多渲染点数（保留最新），默认 200 */
  maxPoints?: number;
  /** 顶部标题 */
  title?: string;
}

export function AmpChart({
  values,
  width,
  height,
  labels,
  maPeriods = DEFAULT_MA,
  showAverage = true,
  maxPoints = 200,
  title,
}: AmpChartProps) {
  const option = useMemo<EChartOption>(() => {
    const raw = values.length > maxPoints ? values.slice(-maxPoints) : values;
    if (raw.length === 0) return emptyOption('暂无数据');

    // 振幅：首期 0，之后取相邻原始值之差的绝对值
    const amp: number[] = [0];
    for (let i = 1; i < raw.length; i += 1) {
      amp.push(Math.abs(raw[i] - raw[i - 1]));
    }
    const n = amp.length;

    const hi = Math.max(1, ...amp);
    const avg = amp.reduce((s, v) => s + v, 0) / n;

    const labelSrc = labels
      ? labels.length > maxPoints
        ? labels.slice(-maxPoints)
        : labels
      : null;
    const step = Math.max(1, Math.ceil(n / 12));
    const xLabels = amp.map((_, i) =>
      labelSrc && labelSrc[i] && i % step === 0 ? labelSrc[i].slice(-3) : '',
    );

    const maSeries = maPeriods.map((period, i) =>
      maLineSeries(
        movingAverage(amp, period),
        MA_COLORS[i % MA_COLORS.length],
        i === 0 ? 1.2 : 1,
      ),
    );

    const avgSeries = showAverage
      ? [
          {
            type: 'line',
            data: [],
            symbol: 'none',
            silent: true,
            animation: false,
            markLine: {
              silent: true,
              symbol: ['none', 'none'],
              lineStyle: { color: CHART_TICK_COLOR, width: 0.8, type: 'dashed' },
              label: { show: false },
              data: [{ yAxis: avg }],
            },
            z: 2,
          },
        ]
      : [];

    return {
      backgroundColor: 'transparent',
      animation: false,
      grid: { ...CHART_GRID, top: height < 160 ? 18 : 24 },
      graphic: titleGraphic(title),
      xAxis: categoryAxis(xLabels),
      yAxis: valueAxis(0, Math.ceil(hi * 1.08)),
      series: [
        {
          type: 'line',
          data: amp,
          symbol: 'none',
          smooth: false,
          animation: false,
          lineStyle: { color: AMP_COLOR, width: 1.6 },
          areaStyle: { color: alpha(palette.accent, 0.12) },
          z: 4,
        },
        ...maSeries,
        ...avgSeries,
      ],
    };
  }, [values, labels, width, height, maPeriods, showAverage, maxPoints, title]);

  return <EChartView option={option} width={width} height={height} />;
}

export default AmpChart;

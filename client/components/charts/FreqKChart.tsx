/**
 * 频率K线图 —— 最基础模式
 *
 * 规则：
 * - 每期一根，实体 = 上一期 diff → 本期 diff（diff = 累计实出 − 累计理论）
 * - 阳线（红）= 开出，阴线（绿）= 遗漏（国内习惯：红涨绿跌）
 * - 可叠加多周期移动均线（默认 5 / 10 / 20）
 *
 * 尺寸全部由 width / height props 驱动，内部不写死宽度。
 */
import React, { useMemo } from 'react';
import {
  CHART_AXIS_COLOR,
  CHART_GRID,
  EChartView,
  categoryAxis,
  emptyOption,
  maLineSeries,
  rawJs,
  titleGraphic,
  valueAxis,
  type EChartOption,
} from './EChartView';
import { movingAverage } from './chartUtils';
import type { TargetPoint } from '@/lib/lottery/targets';
import { palette } from '@/lib/theme';

/** 阳线：开出（红涨） */
const UP = palette.red;
/** 阴线：遗漏（绿跌） */
const DOWN = palette.accent;

/** 均线配色：与红绿实体区分 */
const MA_COLORS = [palette.amber, palette.cyan, palette.inkDim];
const DEFAULT_MA = [5, 10, 20];

export interface FreqKChartProps {
  /** 目标序列（正序：index 0 最旧） */
  series: TargetPoint[];
  /** 容器宽度（由外部布局测量驱动） */
  width: number;
  /** 容器高度 */
  height: number;
  /** 移动均线周期，默认 [5, 10, 20]；传 [] 关闭均线 */
  maPeriods?: number[];
  /** 蜡烛实体宽度（px）；不传则按 宽度/点数 自适应 */
  barWidth?: number;
  /** 最多渲染点数（保留最新），默认 200 */
  maxPoints?: number;
  /** 顶部标题 */
  title?: string;
}

export function FreqKChart({
  series,
  width,
  height,
  maPeriods = DEFAULT_MA,
  barWidth,
  maxPoints = 200,
  title,
}: FreqKChartProps) {
  const option = useMemo<EChartOption>(() => {
    const pts = series.length > maxPoints ? series.slice(-maxPoints) : series;
    const n = pts.length;
    if (n === 0) return emptyOption('暂无数据');

    // 实体：o = 上期 diff，c = 本期 diff
    const bars = pts.map((p, i) => ({
      o: i === 0 ? 0 : pts[i - 1].diff,
      c: p.diff,
      up: p.hit === 1,
    }));

    const allY: number[] = [0];
    for (const b of bars) allY.push(b.o, b.c);
    const lo = Math.min(...allY);
    const hi = Math.max(...allY);
    const pad = (hi - lo || 1) * 0.08;

    // 蜡烛宽度随可用宽度自适应，避免横屏拉伸
    const barW = barWidth ?? Math.max(1.5, Math.min(7, (width / n) * 0.6));

    const renderItem = rawJs(`function (params, api) {
      var idx = api.value(0);
      var o = api.value(1);
      var c = api.value(2);
      var x = api.coord([idx, 0])[0];
      var yO = api.coord([idx, o])[1];
      var yC = api.coord([idx, c])[1];
      var halfW = ${barW} / 2;
      var top = Math.min(yO, yC);
      var h = Math.max(1.5, Math.abs(yC - yO));
      return {
        type: 'rect',
        shape: { x: x - halfW, y: top, width: ${barW}, height: h },
        style: { fill: api.visual('color') }
      };
    }`);

    const step = Math.max(1, Math.ceil(n / 12));
    const labels = pts.map((p, i) => (i % step === 0 ? p.issue.slice(-3) : ''));

    const closes = bars.map((b) => b.c);
    const maSeries = maPeriods.map((period, i) =>
      maLineSeries(
        movingAverage(closes, period),
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
      yAxis: valueAxis(lo - pad, hi + pad),
      series: [
        {
          type: 'custom',
          renderItem,
          data: bars.map((b, i) => ({
            value: [i, b.o, b.c],
            itemStyle: { color: b.up ? UP : DOWN },
          })),
          z: 5,
        },
        ...maSeries,
        {
          // 零轴参考线
          type: 'line',
          data: [],
          symbol: 'none',
          silent: true,
          markLine: {
            silent: true,
            symbol: ['none', 'none'],
            lineStyle: { color: CHART_AXIS_COLOR, width: 1 },
            label: { show: false },
            data: [{ yAxis: 0 }],
          },
          z: 2,
        },
      ],
    };
  }, [series, width, height, maPeriods, barWidth, maxPoints, title]);

  return <EChartView option={option} width={width} height={height} />;
}

export default FreqKChart;

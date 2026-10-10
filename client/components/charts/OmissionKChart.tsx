/**
 * 遗漏K线图 —— 二阶
 *
 * 规则：只统计「开出」事件（未开出不落点）
 * - 开出前的遗漏落在设定范围内 → 阳线（红），长度 = 1/p − 1
 * - 落在范围外             → 阴线（绿），长度 = −1
 * - 分数累加成「爬楼梯」走势
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
  rawJs,
  titleGraphic,
  valueAxis,
  type EChartOption,
} from './EChartView';
import type { TargetPoint } from '@/lib/lottery/targets';
import { palette } from '@/lib/theme';

/** 阳线：范围内开出（红涨） */
const UP = palette.red;
/** 阴线：范围外开出（绿跌） */
const DOWN = palette.accent;

const DEFAULT_RANGE: [number, number] = [1, 20];

export interface OmissionKChartProps {
  /** 目标序列（正序：index 0 最旧） */
  series: TargetPoint[];
  /** 容器宽度（由外部布局测量驱动） */
  width: number;
  /** 容器高度 */
  height: number;
  /** 遗漏范围 [min, max]（含端点），默认 [1, 20] */
  range?: [number, number];
  /** 理论概率 p，用于阳线长度 1/p − 1，默认 0.1 */
  probability?: number;
  /** 蜡烛实体宽度（px）；不传则按 宽度/点数 自适应 */
  barWidth?: number;
  /** 最多渲染点数（保留最新），默认 200 */
  maxPoints?: number;
  /** 顶部标题 */
  title?: string;
}

export function OmissionKChart({
  series,
  width,
  height,
  range = DEFAULT_RANGE,
  probability = 0.1,
  barWidth,
  maxPoints = 200,
  title,
}: OmissionKChartProps) {
  const option = useMemo<EChartOption>(() => {
    const [rMin, rMax] = range;
    const p = probability > 0 && probability < 1 ? probability : 0.1;
    const upLen = 1 / p - 1;

    const all: { o: number; c: number; up: boolean; issue: string }[] = [];
    let score = 0;
    for (let i = 0; i < series.length; i += 1) {
      if (series[i].hit !== 1) continue;
      const prevMiss = i === 0 ? 0 : series[i - 1].omission;
      const inRange = prevMiss >= rMin && prevMiss <= rMax;
      const delta = inRange ? upLen : -1;
      all.push({
        o: score,
        c: score + delta,
        up: inRange,
        issue: series[i].issue,
      });
      score += delta;
    }

    const bars = all.length > maxPoints ? all.slice(-maxPoints) : all;
    const n = bars.length;
    if (n === 0) return emptyOption('无开出记录');

    const allY: number[] = [0];
    for (const b of bars) allY.push(b.o, b.c);
    const lo = Math.min(...allY);
    const hi = Math.max(...allY);
    const pad = (hi - lo || 1) * 0.08;

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
    const labels = bars.map((b, i) => (i % step === 0 ? b.issue.slice(-3) : ''));

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
  }, [series, width, height, range, probability, barWidth, maxPoints, title]);

  return <EChartView option={option} width={width} height={height} />;
}

export default OmissionKChart;

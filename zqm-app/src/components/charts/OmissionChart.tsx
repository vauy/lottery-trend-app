/**
 * 遗漏图 —— 对齐官方参考截图形态
 *
 * 官方形态（zqm168 参考图）：
 *  - 遗漏值节点画成「细折线 + 圆点标记」，圆点旁标注遗漏数值，NOT 柱状图；
 *  - 历史最大遗漏节点用绿色突出，遗漏为 0 的节点密集排在底部（蓝色小点），
 *    常规节点为红色圆点；
 *  - 叠加 MA5 / MA10 / MA25 三条移动均线，结合拐点判断介入时机。
 *
 * 竖屏/横屏均通过 EChartView 容器自适应，y 轴固定从 0 起，保证走势不变形。
 */
import React, { useMemo } from 'react';
import type { OmissionNode } from '../../lib/lottery/types';
import { EChartView, type EChartsOption } from './EChartView';
import { CHART_COLORS, gridFor, legendFor, tooltipFor, xAxisFor, yAxisFor } from './chartTheme';

/** 官方参考图配色：常规节点红、历史最大绿、零值蓝 */
const NODE_NORMAL = '#EF6661';
const NODE_MAX = '#2EA063';
const NODE_ZERO = '#4FCDCD';
/** 连接节点的细折线颜色（参考图为浅灰白细线） */
const LINE_COLOR = '#9AA8A0';

const MA_META: Array<{ key: string; name: string; color: string }> = [
  { key: '5', name: 'MA5', color: CHART_COLORS.ma5 },
  { key: '10', name: 'MA10', color: CHART_COLORS.ma10 },
  { key: '25', name: 'MA25', color: CHART_COLORS.ma25 },
];

export interface OmissionChartProps {
  nodes: OmissionNode[];
  height?: number;
  landscape?: boolean;
  title?: string;
}

export function OmissionChart({ nodes, height, landscape = false, title }: OmissionChartProps) {
  const option = useMemo<EChartsOption>(() => {
    const categories = nodes.map((n) => String(n.order));
    const values = nodes.map((n) => n.value);
    const maxV = values.length ? Math.max(...values) : 0;
    /** 节点太多时数值标签会互相重叠，仅在少量节点时显示 */
    const showLabel = nodes.length <= 40;

    const seriesList: any[] = [
      // 细折线：把各遗漏节点连起来（官方参考图的浅色细线）
      {
        name: '遗漏',
        type: 'line',
        data: values,
        symbol: 'none',
        smooth: false,
        z: 2,
        lineStyle: { width: 1, color: LINE_COLOR },
        itemStyle: { color: LINE_COLOR },
      },
      // 节点圆点：红=常规 / 绿=历史最大 / 蓝=零值，旁标数值
      {
        name: '遗漏',
        type: 'scatter',
        data: nodes.map((n) => ({
          value: n.value,
          itemStyle: {
            color: n.value >= maxV && maxV > 0 ? NODE_MAX : n.value === 0 ? NODE_ZERO : NODE_NORMAL,
            borderColor: 'rgba(0,0,0,0.35)',
            borderWidth: 1,
          },
        })),
        symbolSize: nodes.length <= 60 ? 9 : 6,
        z: 3,
        label: {
          show: showLabel,
          position: 'top',
          distance: 3,
          color: '#E7EDE9',
          fontSize: 9,
        },
      },
    ];

    for (const m of MA_META) {
      seriesList.push({
        name: m.name,
        type: 'line',
        data: nodes.map((n) => n.ma[m.key] ?? null),
        smooth: true,
        symbol: 'none',
        z: 1,
        lineStyle: { width: 1.4, color: m.color },
        itemStyle: { color: m.color },
      });
    }

    return {
      animation: false,
      backgroundColor: 'transparent',
      grid: gridFor(landscape),
      tooltip: tooltipFor(),
      legend: legendFor(['遗漏', ...MA_META.map((m) => m.name)]),
      xAxis: xAxisFor(categories, landscape),
      yAxis: { ...yAxisFor(landscape), min: 0, scale: false },
      series: seriesList,
      title: title
        ? {
            text: title,
            left: 8,
            top: 2,
            textStyle: { color: '#909C94', fontSize: 11, fontWeight: '600' },
          }
        : undefined,
    };
  }, [nodes, landscape, title]);

  return <EChartView option={option} height={height} />;
}

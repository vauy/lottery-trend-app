/**
 * 共享响应式 ECharts WebView 封装
 *
 * 背景：Expo Go 运行时里没有 Skia（react-native-skia 一引用就崩），
 * 因此所有图表统一走 react-native-webview + 内置的 ECHARTS_SOURCE 源码字符串。
 *
 * 响应式要点（横竖屏切换走势不变形）：
 * - 尺寸完全由 width / height props 驱动，HTML 内部不写死任何像素宽度
 * - HTML 中 #chart 使用 100vw / 100vh 铺满 WebView 视口
 * - 同时监听 window.resize / orientationchange / ResizeObserver → chart.resize()，
 *   容器尺寸变化时按新尺寸重绘，而不是把旧画布拉伸
 */
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { ECHARTS_SOURCE } from '@/lib/echartsSource';
import { palette, semantic } from '@/lib/theme';

/** ECharts option：允许嵌入 rawJs() 标记的 JS 片段（如 custom.renderItem） */
export type EChartOption = Record<string, any>;

/** 需要原样注入 WebView 的 JS 片段 */
export interface RawJs {
  readonly __rawJs: string;
}

/** 把一段 JS 源码标记为「原样注入」，用于 renderItem 之类的回调 */
export function rawJs(code: string): RawJs {
  return { __rawJs: code };
}

export interface EChartViewProps {
  /** ECharts option（可含 rawJs() 片段） */
  option: EChartOption;
  /** 容器宽度：由外部布局测量驱动 */
  width: number;
  /** 容器高度 */
  height: number;
}

/* ─────────────── 主题：网格线 / 刻度文字 ─────────────── */

/** 网格线 / 坐标轴线：semantic.divider */
export const CHART_AXIS_COLOR = semantic.divider;
/** 坐标刻度文字：palette.inkFaint */
export const CHART_TICK_COLOR = palette.inkFaint;
/** 标题文字：palette.inkDim */
export const CHART_TITLE_COLOR = palette.inkDim;
/** 统一内边距（containLabel 保证窄屏也放得下刻度文字） */
export const CHART_GRID = {
  left: 6,
  right: 12,
  top: 24,
  bottom: 6,
  containLabel: true,
} as const;

/* ─────────────── option 片段工厂 ─────────────── */

/** 统一类目轴（X）样式 */
export function categoryAxis(data: string[]): Record<string, unknown> {
  return {
    type: 'category',
    data,
    boundaryGap: true,
    axisTick: { show: false },
    axisLine: { lineStyle: { color: CHART_AXIS_COLOR } },
    axisLabel: { fontSize: 8, color: CHART_TICK_COLOR, hideOverlap: true },
    splitLine: { show: false },
  };
}

/** 统一数值轴（Y）样式：不传 min/max 时自动缩放（不强制 0 基线） */
export function valueAxis(min?: number, max?: number): Record<string, unknown> {
  const axis: Record<string, unknown> = {
    type: 'value',
    splitLine: { lineStyle: { color: CHART_AXIS_COLOR } },
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { fontSize: 8, color: CHART_TICK_COLOR },
  };
  if (min !== undefined) axis.min = min;
  if (max !== undefined) axis.max = max;
  if (min === undefined || max === undefined) axis.scale = true;
  return axis;
}

/** 顶部居中的标题（graphic） */
export function titleGraphic(text?: string): unknown {
  if (!text) return null;
  return [
    {
      type: 'text',
      left: 'center',
      top: 4,
      silent: true,
      style: { text, fontSize: 10, fill: CHART_TITLE_COLOR },
    },
  ];
}

/** 无数据占位 */
export function emptyOption(text = '暂无数据'): EChartOption {
  return {
    backgroundColor: 'transparent',
    animation: false,
    graphic: [
      {
        type: 'text',
        left: 'center',
        top: 'middle',
        silent: true,
        style: { text, fontSize: 11, fill: CHART_TICK_COLOR },
      },
    ],
  };
}

/** 移动均线 series（与类目轴等长的 number | null 数组） */
export function maLineSeries(
  values: (number | null)[],
  color: string,
  lineWidth = 1,
): Record<string, unknown> {
  return {
    type: 'line',
    data: values,
    symbol: 'none',
    smooth: false,
    silent: true,
    animation: false,
    lineStyle: { color, width: lineWidth },
    z: 3,
  };
}

/* ─────────────── option → HTML ─────────────── */

const RAW_MARK = '@@RAW_JS@@';

/**
 * 序列化 option：JSON.stringify 后把 RAW_MARK 包裹的片段还原成可执行 JS。
 * （JSON 已对内部引号 / 换行做过转义，去掉外层双引号后即为合法 JS 源码）
 */
function serializeOption(option: EChartOption): string {
  const json =
    JSON.stringify(option, (_key, value) => {
      if (typeof value === 'function') return `${RAW_MARK}${String(value)}${RAW_MARK}`;
      if (
        value &&
        typeof value === 'object' &&
        typeof (value as RawJs).__rawJs === 'string'
      ) {
        return `${RAW_MARK}${(value as RawJs).__rawJs}${RAW_MARK}`;
      }
      return value;
    }) ?? '{}';

  const parts = json.split(RAW_MARK);
  let out = '';
  for (let i = 0; i < parts.length; i += 1) {
    const seg = parts[i];
    if (i % 2 === 1) {
      out += seg; // 原样 JS
      continue;
    }
    let s = seg;
    if (i > 0 && s.charAt(0) === '"') s = s.slice(1);
    if (i < parts.length - 1 && s.charAt(s.length - 1) === '"') s = s.slice(0, -1);
    out += s;
  }
  return out;
}

/** 生成整段 WebView HTML（option 中的函数会被还原为可执行 JS） */
export function buildChartHtml(option: EChartOption): string {
  const merged: EChartOption = {
    ...option,
    animation: option.animation ?? false,
    backgroundColor: 'transparent',
  };

  const boot = `(function () {
  var el = document.getElementById('chart');
  var chart = echarts.init(el);
  chart.setOption(${serializeOption(merged)});
  function fit() { if (chart) chart.resize(); }
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', function () { setTimeout(fit, 150); });
  if (typeof ResizeObserver !== 'undefined') { new ResizeObserver(fit).observe(el); }
  setTimeout(fit, 0);
})();`;

  return [
    '<!DOCTYPE html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">',
    '<script>' + ECHARTS_SOURCE + '</script>',
    '<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden;}#chart{width:100vw;height:100vh;}</style>',
    '</head>',
    '<body>',
    '<div id="chart"></div>',
    '<script>' + boot + '</script>',
    '</body>',
    '</html>',
  ].join('\n');
}

/**
 * 响应式 ECharts 容器。
 * width / height 变化时重新生成 HTML 并触发 WebView 重绘。
 */
export function EChartView({ option, width, height }: EChartViewProps) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => buildChartHtml(option), [option, width, height]);

  return (
    <View style={{ width: w, height: h, backgroundColor: 'transparent' }}>
      <WebView
        source={{ html }}
        style={{ width: w, height: h, backgroundColor: 'transparent' }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        bounces={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

export default EChartView;

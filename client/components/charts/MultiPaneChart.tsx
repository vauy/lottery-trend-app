/**
 * 多联图（主图 + 副图指标叠放）—— ECharts WebView
 *
 * 为什么放在同一个 WebView 里，而不是主图一个 WebView、副图另起一个？
 *   1) 两个 WebView 之间无法共享滚动 / 缩放，主副图 x 轴永远对不齐；
 *   2) 副图那块 WebView 启动成本高，同屏 10 个胆时等于 20 个 WebView，
 *      Expo Go 下会明显卡顿甚至黑屏。
 *   ECharts 原生支持多 grid + 多 xAxis/yAxis，一次性画完最省事也最稳。
 *
 * 布局参考「主图占大头、副图固定矮条」的行情软件排布：
 *   主图   ~58%
 *   副图1  ~20%
 *   副图2  ~20%
 *   （只有 1 个副图时，主图 ~72% / 副图 ~26%）
 *
 * HTML 构造已抽到 ./multiPaneHtml（纯函数），本组件只负责套 WebView。
 */
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { IndicatorId, MaConfig } from '@/lib/charts/indicators';
import { buildMultiPaneHtml, MAX_SUB_PANES } from './multiPaneHtml';
import type { KBar } from './chartMath';

export { MAX_SUB_PANES };

export interface MultiPaneChartProps {
  /** K 线序列（已按周期聚合） */
  bars: KBar[];
  /** 主图叠加的均线配置 */
  maConfigs: MaConfig[];
  /** 是否画布林通道 */
  showBoll?: boolean;
  /** 副图指标（最多取前 MAX_SUB_PANES 个） */
  indicators: IndicatorId[];
  height: number;
  width: number;
  /** 左上角标题（如「频率K 毒胆·0 27.1%」） */
  title?: string;
  /** 主图右上角数值行（如「上轨:2196.2 中轨:2357.96 下轨:2519.71」） */
  metaLine?: string;
}

export function MultiPaneChart({
  bars,
  maConfigs,
  showBoll = true,
  indicators,
  height,
  width,
  title,
  metaLine,
}: MultiPaneChartProps) {
  const subKey = indicators.filter((i) => i !== 'none').join(',');
  const html = useMemo(
    () =>
      buildMultiPaneHtml({
        bars,
        maConfigs,
        showBoll,
        indicators,
        height,
        width,
        title,
        metaLine,
      }),
    // subKey 代替 indicators 数组，避免每次渲染都因新数组引用重建 HTML
    [bars, maConfigs, showBoll, subKey, height, width, title, metaLine],
  );

  return (
    <View style={{ width, height, backgroundColor: 'transparent' }}>
      <WebView
        source={{ html }}
        style={{ width, height, backgroundColor: 'transparent' }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        bounces={false}
      />
    </View>
  );
}

export default MultiPaneChart;

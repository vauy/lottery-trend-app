/**
 * ECharts WebView 基座 —— 全项目所有图表的统一承载层
 *
 * 为什么用 WebView + ECharts 而不是原生绘图库：
 *   Expo Go 是一个「固定运行时」，里面只包含官方预先打包好的原生模块。
 *   任何自定义原生模块（如 Skia / 自绘 chart 库）都不在其中，一旦引用就会崩溃。
 *   因此这里选择零原生依赖的方案：把 echarts.min.js 内联进一段 HTML 交给系统 WebView 渲染。
 *
 * 横竖屏自适应（关键）：
 *   1. HTML 里容器为 100vw × 100vh，随 WebView 尺寸变化自动撑满；
 *   2. 页面监听 window.resize + ResizeObserver，尺寸变化后防抖调用 chart.resize()；
 *   3. RN 侧用 onLayout 测量容器，把精确宽高注入进去兜底；
 *   4. 数据更新走 injectJavaScript 增量刷新，不重建 WebView（避免闪白与卡顿）。
 *
 * 由于 y 轴使用 scale:true（按数据范围自适应而非强制从 0 开始），
 * 走势在竖屏窄宽度和横屏大宽度下都能保持原有形态，不会被压扁或拉伸变形。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { ECHARTS_SOURCE } from '../../vendor/echartsSource';

/** ECharts option 的宽松类型（本项目内部构造，避免引入 echarts 类型包） */
export type EChartsOption = Record<string, any>;

function buildHtml(background: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<style>
  html, body { margin:0; padding:0; width:100%; height:100%; background:${background}; overflow:hidden; }
  #chart { width:100vw; height:100vh; }
</style>
</head>
<body>
<div id="chart"></div>
<script>${ECHARTS_SOURCE}</script>
<script>
(function () {
  var el = document.getElementById('chart');
  var chart = echarts.init(el, null, { renderer: 'canvas' });
  var pending = null;

  window.__setOption = function (option, notMerge) {
    if (!chart) return;
    try {
      chart.setOption(option, notMerge === undefined ? true : !!notMerge);
    } catch (e) {
      pending = option;
    }
  };

  function flush() {
    if (pending && chart) {
      try { chart.setOption(pending, true); pending = null; } catch (e) {}
    }
  }

  var timer = null;
  function scheduleResize() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      if (chart) { chart.resize(); flush(); }
    }, 60);
  }

  // 窗口尺寸变化（横竖屏切换、分屏）
  window.addEventListener('resize', scheduleResize);
  window.addEventListener('orientationchange', function(){ setTimeout(scheduleResize, 120); });

  // 容器尺寸变化（父布局重排、同屏分栏）
  if (window.ResizeObserver) {
    try { new ResizeObserver(scheduleResize).observe(el); } catch (e) {}
  }

  window.__resize = scheduleResize;
  window.__ready = true;
})();
</script>
</body>
</html>`;
}

export interface EChartViewProps {
  option: EChartsOption;
  /** 图表高度；不传则由 style 决定 */
  height?: number;
  style?: any;
  /** 背景色，需与卡片一致，否则切换时会看到白边 */
  background?: string;
  /** 数据变化后是否强制合并刷新（默认不合并，保证干净） */
  notMerge?: boolean;
}

export function EChartView({
  option,
  height,
  style,
  background = 'transparent',
  notMerge = true,
}: EChartViewProps) {
  const webviewRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const [boxWidth, setBoxWidth] = useState(0);

  const html = useMemo(() => buildHtml(background), [background]);
  const json = useMemo(() => JSON.stringify(option ?? {}), [option]);

  const push = useCallback(() => {
    if (!readyRef.current || !webviewRef.current) return;
    const script = `window.__setOption(${json}, ${notMerge ? 'true' : 'false'}); true;`;
    webviewRef.current.injectJavaScript(script);
  }, [json, notMerge]);

  useEffect(() => {
    if (readyRef.current) push();
  }, [push]);

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const w = Math.round(e.nativeEvent.layout.width);
      if (w > 0 && w !== boxWidth) {
        setBoxWidth(w);
        // 通知 WebView 重新测量
        if (readyRef.current && webviewRef.current) {
          webviewRef.current.injectJavaScript('window.__resize && window.__resize(); true;');
        }
      }
    },
    [boxWidth],
  );

  return (
    <View style={[styles.wrap, height ? { height } : null, style]} onLayout={onLayout}>
      <WebView
        ref={webviewRef}
        originWhitelist={['*']}
        source={{ html, baseUrl: 'about:blank' }}
        style={styles.webview}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        javaScriptEnabled
        domStorageEnabled
        androidLayerType="hardware"
        onLoadEnd={() => {
          readyRef.current = true;
          // 首帧就绪后立刻灌入数据
          setTimeout(push, 30);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});

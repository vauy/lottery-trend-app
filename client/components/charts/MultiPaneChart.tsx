/**
 * 多联图（主图 + 副图指标叠放）—— ECharts WebView
 *
 * 为什么放在同一个 WebView 里，而不是主图一个 WebView、副图另起一个？
 *   1) 两个 WebView 之间无法共享滚动 / 缩放，主副图 x 轴永远对不齐；
 *   2) 副图那块 WebView 启动成本高，同屏 10 个胆时等于 20 个 WebView，
 *      Expo Go 下会明显卡顿甚至黑屏。
 *   ECharts 原生支持多 grid + 多 xAxis/yAxis，一次性画完最省事也最稳。
 *
 * 副图折叠（对齐官方同屏格）：subToggle 开启时顶部显示「指标名 −/＋」行，
 * 点 − 收起该副图（主图自动占满），点 ＋ 展开；收起状态存本组件内。
 *
 * HTML 构造已抽到 ./multiPaneHtml（纯函数），本组件只负责套 WebView。
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { INDICATOR_META, type IndicatorId, type MaConfig } from '@/lib/charts/indicators';
import { palette, semantic, fontSize as fs } from '@/lib/theme';
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
  /** 副图折叠行：显示「指标名 −/＋」，点击收起/展开该副图（对齐官方同屏格） */
  subToggle?: boolean;
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
  subToggle = false,
}: MultiPaneChartProps) {
  /** 折叠的副图（按 indicators 下标） */
  const [folded, setFolded] = useState<number[]>([]);
  const fullKey = indicators.join(',');

  // 指标槽位变化时重置折叠，避免旧下标错位
  useEffect(() => {
    setFolded([]);
  }, [fullKey]);

  const effInds = useMemo(
    () => indicators.filter((_, i) => !folded.includes(i)),
    [indicators, folded],
  );
  const subKey = effInds.filter((i) => i !== 'none').join(',');
  const html = useMemo(
    () =>
      buildMultiPaneHtml({
        bars,
        maConfigs,
        showBoll,
        indicators: effInds,
        height,
        width,
        title,
        metaLine,
      }),
    // subKey 代替 indicators 数组，避免每次渲染都因新数组引用重建 HTML
    [bars, maConfigs, showBoll, subKey, height, width, title, metaLine],
  );

  const shown = indicators.filter((i) => i !== 'none');
  const showBar = subToggle && shown.length > 0;
  const barH = showBar ? height - 22 : height;

  const toggle = (i: number) =>
    setFolded((v) => (v.includes(i) ? v.filter((x) => x !== i) : [...v, i]));

  return (
    <View style={{ width, height, backgroundColor: 'transparent' }}>
      {showBar && (
        <View style={st.row}>
          {indicators.map((id, i) =>
            id === 'none' ? null : (
              <Pressable key={`${id}-${i}`} style={st.chip} onPress={() => toggle(i)}>
                <Text style={[st.txt, folded.includes(i) && st.dim]}>
                  {INDICATOR_META[id].label}
                </Text>
                <Text style={[st.txt, st.sign]}>{folded.includes(i) ? '＋' : '−'}</Text>
              </Pressable>
            ),
          )}
        </View>
      )}
      <WebView
        source={{ html }}
        style={{ width, height: barH, backgroundColor: 'transparent' }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        bounces={false}
      />
    </View>
  );
}

const st = StyleSheet.create({
  row: {
    height: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
  },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  txt: { color: palette.inkDim, fontSize: fs.xs, fontWeight: '600' },
  dim: { color: semantic.textFaint },
  sign: { color: palette.accent, fontWeight: '700' },
});

export default MultiPaneChart;

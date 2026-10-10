/**
 * 响应式 hook —— 横竖屏自适应的唯一入口
 *
 * 所有需要「同屏 / 竖屏动态适应」的布局都从这里取：
 *  - landscape：是否横屏（宽 > 高）
 *  - contentW：内容区可用宽度
 *  - columns：横屏时一排放几张图
 *  - chartW / chartH：单张图的宽高
 *
 * 图表本身内部再按 width:100% 自适应，因此这里给的是「期望值」，
 * 实际渲染以容器 onLayout 为准，走势不会被拉伸变形。
 *
 * 横屏补充（v2）：
 *  手机横屏时纵向可用高度只有 360~430dp，配置面板一旦纵向堆叠就会把图表挤出屏幕。
 *  因此横屏改为「左侧控制栏 + 右侧图表区」左右分栏，这里额外给出：
 *  - availH：横屏下内容区的可用高度（已扣除底部 Tab 栏与内边距）
 *  - railW：横屏折叠后的竖条宽度 / 展开后的控制栏宽度
 *  - panelW：横屏收起控制栏后，图表区可用的宽度
 */
import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { chartSize, space } from '../lib/theme';

/** 底部 Tab 栏高度（与 (tabs)/_layout.tsx 中保持一致） */
const TAB_BAR_H = 56 + 8;
/** 横屏左右分栏：控制栏宽度 */
const RAIL_WIDTH = 268;
/** 横屏左右分栏：收起后的竖条宽度 */
const RAIL_COLLAPSED = 34;

export interface Responsive {
  width: number;
  height: number;
  landscape: boolean;
  /** 内容区宽度（已扣除左右边距） */
  contentW: number;
  /** 横屏下内容区可用高度（扣除 Tab 栏与上下内边距） */
  availH: number;
  /** 横屏控制栏宽度（展开） */
  railW: number;
  /** 横屏控制栏收起后的竖条宽度 */
  railCollapsed: number;
  /** 横屏图表区宽度（扣除控制栏与间隙后的剩余宽度） */
  panelW: number;
  /** 横屏单张图表的最大高度（保证一屏内可见） */
  chartHLandscape: number;
  /** 横屏同时展示几张图 */
  columns: number;
  /** 单张图宽度 */
  chartW: number;
  /** 单张图高度 */
  chartH: number;
  /** 屏幕是否为窄屏（<380dp） */
  narrow: boolean;
}

export function useResponsive(): Responsive {
  const { width, height } = useWindowDimensions();
  return useMemo(() => {
    const landscape = width > height;
    const pad = space.lg;
    const contentW = Math.max(240, width - pad * 2);

    // 横屏：高度是被压缩的维度，必须精打细算
    const availH = Math.max(200, height - TAB_BAR_H - pad);
    const railW = RAIL_WIDTH;
    const railCollapsed = RAIL_COLLAPSED;
    /** 收起控制栏后，图表区可用宽度 */
    const panelW = Math.max(180, contentW - railCollapsed - space.md);

    // 横屏图表高度：优先按窗口高度给，但不低于 200；多图同屏时按行分摊
    const chartHLandscape = Math.max(200, Math.min(300, availH - 76));

    const columns = landscape ? 2 : 1;
    const gap = space.md;
    // 竖屏：contentW 即内容宽度；横屏：以图表区宽度为准
    const baseW = landscape ? contentW - railCollapsed - space.md : contentW;
    const chartW = Math.max(160, (Math.max(240, baseW) - (columns - 1) * gap) / columns);
    const chartH = landscape ? chartHLandscape : chartSize.h;
    const narrow = width < 380;

    return {
      width,
      height,
      landscape,
      contentW,
      availH,
      railW,
      railCollapsed,
      panelW,
      chartHLandscape,
      columns,
      chartW,
      chartH,
      narrow,
    };
  }, [width, height]);
}

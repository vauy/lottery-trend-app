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
 */
import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { chartSize, space } from '../lib/theme';

export interface Responsive {
  width: number;
  height: number;
  landscape: boolean;
  /** 内容区宽度（已扣除左右边距） */
  contentW: number;
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
    const columns = landscape ? 2 : 1;
    const gap = space.md;
    const chartW = Math.max(160, (contentW - (columns - 1) * gap) / columns - 24);
    const chartH = landscape ? chartSize.hLandscape : chartSize.h;
    const narrow = width < 380;
    return { width, height, landscape, contentW, columns, chartW, chartH, narrow };
  }, [width, height]);
}

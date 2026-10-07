/**
 * 图表自适应宽度 Hook
 * 通过 onLayout 测量容器宽度，供 SVG 图表按实际宽度渲染。
 */
import { useCallback, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

export interface ChartSize {
  width: number;
  height: number;
  onLayout: (e: LayoutChangeEvent) => void;
}

export function useChartSize(defaultHeight: number): ChartSize {
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(defaultHeight);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    if (w > 0) setWidth(w);
    if (h > 0) setHeight(h);
  }, []);

  return { width, height, onLayout };
}
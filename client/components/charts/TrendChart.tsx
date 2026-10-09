/**
 * 号码走势图（K 线图）—— 真正的蜡烛图。
 * 红蜡烛 = 本期开出（实体高度可见）
 * 蓝蜡烛 = 本期未开出（实体高度很矮，上影线 = 遗漏值）
 */
import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Rect, Line, Path as SvgPath, Circle, Text as SvgText } from 'react-native-svg';
import type { TrendPoint } from '@/lib/lottery/types';
import { useChartSize } from './useChartSize';
import { buildLinePath, buildTicks, niceMax, scaleLinear } from './chartUtils';
import { palette, semantic } from '@/lib/theme';

/** 开出 = 热（red），未开出 = 冷（cyan） */
const HIT_COLOR = semantic.hot;
const MISS_COLOR = semantic.cold;

/** 均线：MA5 = amber（原型）/ MA10 = red / MA20 = cyan（原型） */
const MA_COLORS: Record<string, string> = {
  '5': palette.amber,
  '10': semantic.hot,
  '20': semantic.cold,
};

const MA_LABELS: Record<string, string> = {
  '5': 'MA5',
  '10': 'MA10',
  '20': 'MA20',
};

/** 网格线 / 坐标轴线 */
const AXIS_COLOR = palette.line;
/** 坐标刻度文字 */
const TICK_COLOR = palette.inkFaint;

export function TrendChart({
  points,
  digit,
  height = 260,
  maPeriods = ['5', '10', '20'],
}: {
  points: TrendPoint[];
  digit: number;
  height?: number;
  maPeriods?: string[];
}) {
  const { width, onLayout } = useChartSize(height);

  if (width === 0) {
    return <View style={{ height }} onLayout={onLayout} />;
  }

  const pad = { left: 30, right: 6, top: 16, bottom: 22 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const n = points.length;

  // 计算每期的累积遗漏值
  const missValues: number[] = [];
  let miss = 0;
  for (const pt of points) {
    if (pt.hit === 1) {
      missValues.push(0);
      miss = 0;
    } else {
      miss += 1;
      missValues.push(miss);
    }
  }

  // Y 轴最大值
  const maxHigh = Math.max(1, ...missValues);
  const yMax = niceMax(maxHigh);
  const yScale = scaleLinear([0, yMax], [pad.top + plotH, pad.top]);
  const xFor = (i: number) =>
    n <= 1 ? pad.left + plotW / 2 : pad.left + (plotW * i) / (n - 1);

  // 蜡烛宽度
  const candleW = n > 1 ? Math.max(2, Math.min(8, (plotW / n) * 0.6)) : 8;

  const ticks = buildTicks(yMax, 4);

  // MA 均线
  const maSeries = maPeriods.map((p) => ({
    period: p,
    pts: points.map((pt, i) => ({
      x: xFor(i),
      y: pt.ma[p] === null ? null : yScale((pt.ma[p] as number) * yMax),
    })),
  }));

  // X 轴期号
  const xLabelStep = Math.max(1, Math.ceil(n / 6));
  const xLabels: { i: number; label: string }[] = [];
  for (let i = 0; i < n; i += xLabelStep) {
    xLabels.push({ i, label: points[i].issue.slice(-3) });
  }
  if (n > 0 && xLabels[xLabels.length - 1]?.i !== n - 1) {
    xLabels.push({ i: n - 1, label: points[n - 1].issue.slice(-3) });
  }

  return (
    <View onLayout={onLayout} style={{ width: '100%' }}>
      {/* 图例 */}
      <View className="flex-row items-center gap-3 mb-1 px-1">
        <View className="flex-row items-center gap-1">
          <View className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: HIT_COLOR }} />
          <Text className="text-[10px] text-muted">开出</Text>
        </View>
        <View className="flex-row items-center gap-1">
          <View className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: MISS_COLOR }} />
          <Text className="text-[10px] text-muted">未开出</Text>
        </View>
        {maPeriods.map((p) => (
          <View key={p} className="flex-row items-center gap-1">
            <View className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: MA_COLORS[p] }} />
            <Text className="text-[10px] text-muted">{MA_LABELS[p]}</Text>
          </View>
        ))}
        <Text className="text-[10px] text-foreground ml-auto font-semibold">胆码 {digit}</Text>
      </View>

      <Svg width={width} height={height}>
        {/* 网格 */}
        {ticks.map((t) => (
          <Line
            key={`g${t}`}
            x1={pad.left}
            y1={yScale(t)}
            x2={width - pad.right}
            y2={yScale(t)}
            stroke={AXIS_COLOR}
            strokeWidth={1}
          />
        ))}
        {ticks.map((t) => (
          <SvgText
            key={`l${t}`}
            x={pad.left - 4}
            y={yScale(t) + 3}
            fontSize={8}
            fill={TICK_COLOR}
            textAnchor="end"
          >
            {t}
          </SvgText>
        ))}

        {/* 蜡烛图 */}
        {points.map((pt, i) => {
          const x = xFor(i);
          const isHit = pt.hit === 1;
          const missVal = missValues[i];

          if (isHit) {
            // 红蜡烛：实体高度可见
            const bodyHeight = 6; // 实体高度像素值
            const bodyTop = yScale(1) - bodyHeight;
            return (
              <Rect
                key={pt.issue}
                x={x - candleW / 2}
                y={bodyTop}
                width={candleW}
                height={bodyHeight}
                fill={HIT_COLOR}
              />
            );
          } else {
            // 蓝蜡烛：底部小实体 + 上影线
            const bodyHeight = 3;
            const bodyTop = yScale(0) - bodyHeight;
            const yHigh = yScale(missVal);
            return (
              <React.Fragment key={pt.issue}>
                {/* 上影线：从实体顶到 high */}
                <Line
                  x1={x}
                  y1={yHigh}
                  x2={x}
                  y2={bodyTop}
                  stroke={MISS_COLOR}
                  strokeWidth={Math.max(1, candleW * 0.3)}
                />
                {/* 底部小实体 */}
                <Rect
                  x={x - candleW / 2}
                  y={bodyTop}
                  width={candleW}
                  height={bodyHeight}
                  fill={MISS_COLOR}
                />
              </React.Fragment>
            );
          }
        })}

        {/* MA 均线 */}
        {maSeries.map((s) => (
          <SvgPath
            key={s.period}
            d={buildLinePath(s.pts)}
            stroke={MA_COLORS[s.period]}
            strokeWidth={1.5}
            fill="none"
          />
        ))}
        {maSeries.map((s) => {
          const last = s.pts[s.pts.length - 1];
          if (!last || last.y === null) return null;
          return (
            <Circle
              key={`dot${s.period}`}
              cx={last.x}
              cy={last.y}
              r={2.5}
              fill={MA_COLORS[s.period]}
            />
          );
        })}

        {/* X 轴期号 */}
        {xLabels.map(({ i, label }) => (
          <SvgText
            key={`x${i}`}
            x={xFor(i)}
            y={height - 6}
            fontSize={9}
            fill={TICK_COLOR}
            textAnchor="middle"
          >
            {label}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}
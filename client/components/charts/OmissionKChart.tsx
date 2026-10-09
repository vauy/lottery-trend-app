/**
 * 遗漏K线图 —— 石头剪刀布爬楼梯。
 */
import React, { useEffect, useRef } from 'react';
import { View, ScrollView, useWindowDimensions, Text } from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';
import type { TargetPoint } from '@/lib/lottery/targets';
import { scaleLinear } from './chartUtils';
import { palette, semantic } from '@/lib/theme';

/** 升档 = 热（red）/ 降档 = 冷（cyan） */
const UP = semantic.hot;
const DOWN = semantic.cold;
/** 网格线 / 坐标轴线 */
const AXIS_COLOR = palette.line;
const ZERO_COLOR = palette.line;
/** 坐标刻度文字 */
const TICK_COLOR = palette.inkFaint;
/** 标题文字 */
const TITLE_COLOR = palette.inkDim;

const BAR_W = 4;
const COL_SPACING = 6;
const RIGHT_PAD = 120;

type KBar = { issue: string; x: number; o: number; c: number; isRed: boolean };

function calcDelta(prevMiss: number, theoryMiss: number): { delta: number; isRed: boolean } {
  if (theoryMiss <= 0) return { delta: 1, isRed: true };
  if (prevMiss <= theoryMiss) return { delta: 1, isRed: true };
  const level = Math.ceil(prevMiss / theoryMiss) - 1;
  const mult = ((level - 1) % 3) + 1;
  return { delta: -mult, isRed: false };
}

export function OmissionKChart({
  series,
  height = 300,
  width: explicitWidth,
  theoryMiss = 0,
  titleColor,
}: {
  series: TargetPoint[];
  height?: number;
  width?: number;
  theoryMiss?: number;
  titleColor?: string;
}) {
  const { width: screenW } = useWindowDimensions();
  const width = explicitWidth ?? screenW;
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: false });
    }, 50);
    return () => clearTimeout(t);
  }, [series.length]);

  if (series.length === 0) {
    return (
      <View style={{ height: 120, justifyContent: 'center', alignItems: 'center' }}>
        <Text className="text-muted text-xs">暂无数据</Text>
      </View>
    );
  }

  const bars: KBar[] = [];
  let score = 0;
  for (let i = 0; i < series.length; i += 1) {
    if (series[i].hit === 1) {
      const prevMiss = i === 0 ? 0 : series[i - 1].omission;
      const { delta, isRed } = calcDelta(prevMiss, theoryMiss);
      bars.push({ issue: series[i].issue, x: i, o: score, c: score + delta, isRed });
      score = score + delta;
    }
  }

  if (bars.length === 0) {
    return (
      <View style={{ height: 120, justifyContent: 'center', alignItems: 'center' }}>
        <Text className="text-muted text-xs">无开出记录</Text>
      </View>
    );
  }

  // 统计信息
  const curMiss = series.length > 0 ? series[series.length - 1].omission : 0;
  const maxMiss = Math.max(...series.map((p) => p.omission), 0);
  const avgMiss =
    series.length > 0
      ? series.reduce((a, b) => a + b.omission, 0) / series.length
      : 0;

  const allY: number[] = [];
  for (const b of bars) allY.push(b.o, b.c);
  const yMin = Math.min(0, ...allY);
  const yMax = Math.max(0, ...allY);
  const range = yMax - yMin || 1;
  const yLo = yMin - range * 0.08;
  const yHi = yMax + range * 0.08;

  const compact = height < 150;
  const pad = compact
    ? { left: 26, right: 8, top: 4, bottom: 14 }
    : { left: 36, right: 12, top: 10, bottom: 22 };
  const fontTick = compact ? 6 : 8;
  const fontX = compact ? 6 : 8;
  const innerH = Math.max(80, height - pad.top - pad.bottom);
  const totalHeight = height;

  const naturalW = pad.left + bars.length * COL_SPACING + RIGHT_PAD;
  const chartWidth = Math.max(width, naturalW);
  const xForBar = (k: number) => pad.left + COL_SPACING * (k + 0.5);
  const yScale = scaleLinear([yLo, yHi], [pad.top + innerH, pad.top]);

  const xLabelStep = Math.max(1, Math.round(60 / COL_SPACING));
  const yTicks = [0, 0.5, 1].map((r) => yLo + (yHi - yLo) * r);

  return (
    <View style={{ width, height: totalHeight, position: 'relative' }}>
      {/* 悬浮标题 */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 2, left: 0, right: 0, alignItems: 'center', zIndex: 10 }}>
        <Text style={{ fontSize: 10, color: titleColor ?? TITLE_COLOR }}>
          遗漏K线（历史最大:{maxMiss} 平均:{avgMiss.toFixed(2)} 理论:{theoryMiss.toFixed(2)} 当前:{curMiss}）
        </Text>
      </View>
      <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator bounces={false}>
        <Svg width={chartWidth} height={totalHeight}>
          {yTicks.map((v, idx) => {
            const y = yScale(v);
            return (
              <React.Fragment key={`g-${idx}`}>
                <Line x1={pad.left} y1={y} x2={chartWidth - pad.right} y2={y} stroke={AXIS_COLOR} strokeWidth={1} />
                <SvgText x={pad.left - 3} y={y + 3} fontSize={fontTick} fill={TICK_COLOR} textAnchor="end">
                  {v.toFixed(0)}
                </SvgText>
              </React.Fragment>
            );
          })}

          {bars.map((b, i) => {
            const cx = xForBar(i);
            const color = b.isRed ? UP : DOWN;
            const yO = yScale(b.o);
            const yC = yScale(b.c);
            const bodyTop = Math.min(yO, yC);
            const bodyH = Math.max(1.5, Math.abs(yC - yO));
            return <Rect key={`k-${i}`} x={cx - BAR_W / 2} y={bodyTop} width={BAR_W} height={bodyH} fill={color} />;
          })}

          {bars.map((b, i) =>
            i % xLabelStep === 0 || i === bars.length - 1 ? (
              <SvgText key={`x-${i}`} x={xForBar(i)} y={totalHeight - 6}
                fontSize={fontTick} fill={TICK_COLOR} textAnchor="middle">
                {b.issue.slice(-3)}
              </SvgText>
            ) : null,
          )}
        </Svg>
      </ScrollView>
    </View>
  );
}

/**
 * 频率K线图 —— 累计实际出次 - 累计理论出次。
 * Skia 版（高性能）。
 */
import React, { useEffect, useRef } from 'react';
import { View, ScrollView, useWindowDimensions, Text } from 'react-native';
import {
  Canvas,
  Rect as SkRect,
  Line as SkLine,
  Path as SkPath,
  DashPathEffect,
  vec,
  Skia,
} from '@shopify/react-native-skia';
import type { TargetPoint } from '@/lib/lottery/targets';
import { scaleLinear, buildLinePath } from './chartUtils';
import { palette, semantic } from '@/lib/theme';

/** 涨 = 热（red）/ 跌 = 冷（cyan） */
const UP = semantic.hot;
const DOWN = semantic.cold;
/** 布林带上下轨 = accent，中轨 = amber（原型 MA 线） */
const BOLL_COLOR = palette.accent;
const MID_COLOR = palette.amber;
/** 网格线 / 坐标轴线 / 零轴 */
const AXIS_COLOR = palette.line;
const ZERO_COLOR = palette.line;
/** 坐标刻度文字 */
const TICK_COLOR = palette.inkFaint;
/** 标题文字 */
const LABEL_COLOR = palette.inkDim;

const COL_W = 6;
const BODY_W = 4;
const RIGHT_PAD = 120;

type AggPoint = { issue: string; o: number; c: number };

function aggregate(series: TargetPoint[], period: number): AggPoint[] {
  if (period <= 1) {
    return series.map((p, i) => ({
      issue: p.issue,
      o: i === 0 ? 0 : series[i - 1].diff,
      c: p.diff,
    }));
  }
  const out: AggPoint[] = [];
  for (let i = 0; i < series.length; i += period) {
    const slice = series.slice(i, i + period);
    if (slice.length === 0) continue;
    const o = i === 0 ? 0 : series[i - 1].diff;
    const c = slice[slice.length - 1].diff;
    out.push({ issue: slice[slice.length - 1].issue, o, c });
  }
  return out;
}

function buildBoll(values: number[], period: number, k: number) {
  const mid: (number | null)[] = [];
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i + 1 < period) {
      mid.push(null);
      upper.push(null);
      lower.push(null);
      continue;
    }
    let s = 0;
    for (let j = i - period + 1; j <= i; j += 1) s += values[j];
    const avg = s / period;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j += 1) variance += (values[j] - avg) ** 2;
    const std = Math.sqrt(variance / Math.max(1, period - 1));
    mid.push(avg);
    upper.push(avg + k * std);
    lower.push(avg - k * std);
  }
  return { mid, upper, lower };
}

export function FreqKChart({
  series,
  height = 300,
  width: explicitWidth,
  showBoll = true,
  bollPeriod = 20,
  bollK = 2,
  period = 1,
  titleColor,
  title: customTitle,
}: {
  series: TargetPoint[];
  height?: number;
  width?: number;
  showBoll?: boolean;
  bollPeriod?: number;
  bollK?: number;
  period?: number;
  titleColor?: string;
  title?: string;
}) {
  const { width: screenW } = useWindowDimensions();
  const width = explicitWidth ?? screenW;
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: false });
    }, 50);
    return () => clearTimeout(t);
  }, [series.length, period]);

  if (series.length === 0) {
    return (
      <View style={{ height: 120, justifyContent: 'center', alignItems: 'center' }}>
        <Text className="text-muted text-xs">暂无数据</Text>
      </View>
    );
  }

  const points = aggregate(series, period);
  const n = points.length;

  const curDiff = points.length > 0 ? points[points.length - 1].c : 0;
  const maxDiff = points.length > 0 ? Math.max(...points.map((p) => p.c)) : 0;
  const avgDiff =
    points.length > 0 ? points.reduce((a, b) => a + b.c, 0) / points.length : 0;

  const cVals = points.map((p) => p.c);
  const boll = showBoll
    ? buildBoll(cVals, Math.min(bollPeriod, Math.max(2, n)), bollK)
    : null;

  const allY: number[] = [];
  for (const p of points) allY.push(p.o, p.c);
  if (boll) {
    for (const v of boll.upper) if (v !== null) allY.push(v);
    for (const v of boll.lower) if (v !== null) allY.push(v);
  }
  const yMin = Math.min(0, ...allY);
  const yMax = Math.max(0, ...allY);
  const yPad = (yMax - yMin) * 0.02 || 0.5;
  const yLo = yMin - yPad;
  const yHi = yMax + yPad;

  const compact = height < 150;
  const pad = compact
    ? { left: 26, right: 8, top: 4, bottom: 14 }
    : { left: 36, right: 12, top: 10, bottom: 22 };
  const fontTick = compact ? 6 : 8;
  const innerH = Math.max(80, height - pad.top - pad.bottom);
  const totalHeight = height;

  const chartWidth = Math.max(width, n * COL_W + RIGHT_PAD);

  const xFor = (i: number) => pad.left + COL_W * (i + 0.5);
  const yScale = scaleLinear([yLo, yHi], [pad.top + innerH, pad.top]);

  const xLabelStep = Math.max(1, Math.round(60 / COL_W));
  const yTicks = [0, 0.5, 1].map((r) => yLo + (yHi - yLo) * r);

  // ---- 预计算 Skia paths ----
  const bollUpperPath = boll
    ? Skia.Path.MakeFromSVGString(
        buildLinePath(
          boll.upper.map((v, i) => ({ x: xFor(i), y: v === null ? null : yScale(v) })),
        ),
      )
    : null;
  const bollMidPath = boll
    ? Skia.Path.MakeFromSVGString(
        buildLinePath(
          boll.mid.map((v, i) => ({ x: xFor(i), y: v === null ? null : yScale(v) })),
        ),
      )
    : null;
  const bollLowerPath = boll
    ? Skia.Path.MakeFromSVGString(
        buildLinePath(
          boll.lower.map((v, i) => ({ x: xFor(i), y: v === null ? null : yScale(v) })),
        ),
      )
    : null;

  return (
    <View style={{ width, height: totalHeight, position: 'relative' }}>
      {/* 悬浮标题 */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 2,
          left: 0,
          right: 0,
          alignItems: 'center',
          zIndex: 10,
        }}
      >
        <Text style={{ fontSize: 10, color: titleColor ?? LABEL_COLOR }}>
          {customTitle ??
            `频率K线（历史最大:${maxDiff.toFixed(2)} 平均:${avgDiff.toFixed(3)} 理论:0.000 当前:${curDiff.toFixed(2)}）`}
        </Text>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        bounces={false}
      >
        <View style={{ width: chartWidth, height: totalHeight }}>
          {/* ===== Canvas 层：图形 ===== */}
          <Canvas style={{ width: chartWidth, height: totalHeight }}>
            {/* 水平网格线 */}
            {yTicks.map((v, idx) => (
              <SkLine
                key={`g-${idx}`}
                p1={vec(pad.left, yScale(v))}
                p2={vec(chartWidth - pad.right, yScale(v))}
                color={AXIS_COLOR}
                strokeWidth={1}
              />
            ))}

            {/* 零轴（虚线） */}
            {yLo <= 0 && yHi >= 0 && (
              <SkLine
                p1={vec(pad.left, yScale(0))}
                p2={vec(chartWidth - pad.right, yScale(0))}
                color={ZERO_COLOR}
                strokeWidth={1}
              >
                <DashPathEffect intervals={[3, 3]} />
              </SkLine>
            )}

            {/* K 线实体 */}
            {points.map((p, i) => {
              const cx = xFor(i);
              const isUp = p.c >= p.o;
              const color = isUp ? UP : DOWN;
              const yO = yScale(p.o);
              const yC = yScale(p.c);
              const bodyTop = Math.min(yO, yC);
              const bodyH = Math.max(1.5, Math.abs(yC - yO));
              return (
                <SkRect
                  key={`k-${i}`}
                  x={cx - BODY_W / 2}
                  y={bodyTop}
                  width={BODY_W}
                  height={bodyH}
                  color={color}
                />
              );
            })}

            {/* 布林通道 */}
            {bollUpperPath && (
              <SkPath
                path={bollUpperPath}
                color={BOLL_COLOR}
                style="stroke"
                strokeWidth={1}
              />
            )}
            {bollMidPath && (
              <SkPath path={bollMidPath} color={MID_COLOR} style="stroke" strokeWidth={1.2} />
            )}
            {bollLowerPath && (
              <SkPath
                path={bollLowerPath}
                color={BOLL_COLOR}
                style="stroke"
                strokeWidth={1}
              />
            )}
          </Canvas>

          {/* ===== 文字层：RN Text 绝对定位 ===== */}
          {/* Y 轴刻度 */}
          {yTicks.map((v, idx) => (
            <Text
              key={`yt-${idx}`}
              style={{
                position: 'absolute',
                left: 0,
                top: yScale(v) - 6,
                width: pad.left - 2,
                textAlign: 'right',
                fontSize: fontTick,
                color: TICK_COLOR,
              }}
            >
              {v.toFixed(1)}
            </Text>
          ))}

          {/* X 轴期号 */}
          {points.map((p, i) => {
            if (i % xLabelStep !== 0 && i !== n - 1) return null;
            const cx = xFor(i);
            return (
              <Text
                key={`xt-${i}`}
                style={{
                  position: 'absolute',
                  left: cx - 20,
                  top: totalHeight - pad.bottom + 2,
                  width: 40,
                  textAlign: 'center',
                  fontSize: fontTick,
                  color: TICK_COLOR,
                }}
              >
                {p.issue.slice(-3)}
              </Text>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

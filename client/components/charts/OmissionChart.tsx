/**
 * 遗漏图 —— 上下双联图（二阶遗漏 + 一阶遗漏）。Skia 版。
 * Canvas 画图形，RN Text 叠字（避免字体加载）。
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import {
  Canvas,
  Circle,
  Line as SkLine,
  Path as SkPath,
  DashPathEffect,
  vec,
  Skia,
} from '@shopify/react-native-skia';
import { scaleLinear, buildLinePath, niceMax } from './chartUtils';
import { palette, semantic } from '@/lib/theme';

/** 遗漏值球 / 历史最大线（热） */
const RED = semantic.hot;
/** 开出球（遗漏 0） */
const GREEN = palette.accent;
/** 当前期球 */
const BLUE = semantic.cold;
/** 虚拟 ? 球 */
const PURPLE = semantic.dan;
/** 主折线（一阶 / 二阶）+ 延伸线 */
const MAIN_LINE = palette.accent;
/** 理论遗漏参考线 */
const THEORY_COLOR = palette.inkDim;
/** 历史最大线（虚线） */
const MAX_COLOR = semantic.hot;
/** 平均线（虚线） */
const AVG_COLOR = semantic.cold;
/** 均线：MA5 = amber（原型）/ MA10 = red / MA20 = cyan（原型） */
const MA5 = palette.amber;
const MA10 = semantic.hot;
const MA20 = semantic.cold;
/** 网格线 / 坐标轴线 */
const AXIS_COLOR = palette.line;
/** 坐标刻度文字 */
const TICK_COLOR = palette.inkFaint;
/** 标题文字 */
const LABEL_COLOR = palette.inkDim;

export type OmissionMetrics = {
  max: number;
  current: number;
  avg: number;
  theory: number;
};

type SeriesPoint = { issue: string; omission: number };

const RANGES: { min: number; max: number; label: string }[] = [
  { min: 0, max: 0, label: '0' },
  { min: 1, max: 1, label: '1' },
  { min: 2, max: 2, label: '2' },
  { min: 3, max: 3, label: '3' },
  { min: 0, max: 1, label: '0-1' },
];

const COL_WIDTH = 9;
const TAIL_PAD = 120;
const X_LABEL_LINE_H = 9;
const VIRTUAL_COLS = 1;
const SAFE_MAX_WIDTH = 4000;

export function OmissionChart({
  series,
  height = 360,
  theoryMiss: theoryMissProp,
}: {
  series: SeriesPoint[];
  metrics?: OmissionMetrics;
  height?: number;
  theoryMiss?: number;
}) {
  const { width: screenW } = useWindowDimensions();
  const [rangeIdx, setRangeIdx] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: false });
    }, 50);
    return () => clearTimeout(t);
  }, [series.length, rangeIdx]);

  const n = series.length;
  if (n === 0) {
    return (
      <View style={{ height: 200, justifyContent: 'center', alignItems: 'center' }}>
        <Text className="text-muted text-xs">暂无数据</Text>
      </View>
    );
  }

  const range = RANGES[rangeIdx];
  const missValues = series.map((p) => p.omission);

  const secondOrder: { index: number; value: number }[] = [];
  let lastValidIndex: number | null = null;
  for (let i = 0; i < n; i += 1) {
    if (missValues[i] >= range.min && missValues[i] <= range.max) {
      if (lastValidIndex !== null) {
        secondOrder.push({ index: i, value: i - lastValidIndex });
      }
      lastValidIndex = i;
    }
  }

  const gaps: number[] = [];
  for (let i = 1; i < n; i += 1) {
    if (missValues[i] === 0) gaps.push(missValues[i - 1]);
  }
  const maxMiss = Math.max(...missValues, 1);
  const currentMiss = missValues[n - 1];
  const avgMiss = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
  const hitCount = missValues.filter((v) => v === 0).length;

  const empiricalTheory = hitCount > 0 ? n / hitCount : 0;
  const theoryMiss = theoryMissProp ?? empiricalTheory;

  // 三线最大值也纳入 Y 轴（简单上限）
  const displayMax = niceMax(Math.max(maxMiss, theoryMiss));
  const maxSecond = Math.max(1, ...secondOrder.map((v) => v.value));
  const secondMax = niceMax(maxSecond);

  const compact = height < 220;
  const pad = compact
    ? { left: 24, right: TAIL_PAD, top: 14, bottom: 20 }
    : { left: 34, right: TAIL_PAD, top: 26, bottom: 44 };
  const gap = compact ? 12 : 26;
  const innerH = Math.max(60, height - pad.top - pad.bottom - gap);
  const h1 = Math.round(innerH * 0.45);
  const h2 = innerH - h1;
  const totalHeight = height;

  const nCols = n + VIRTUAL_COLS;
  const rawW = Math.max(screenW, nCols * COL_WIDTH + TAIL_PAD);
  const chartWidth = Math.min(SAFE_MAX_WIDTH, rawW);

  const xFor = (i: number) => {
    if (nCols <= 1) return pad.left + (chartWidth - pad.left - pad.right) / 2;
    return pad.left + ((chartWidth - pad.left - pad.right) * i) / (nCols - 1);
  };

  const virtualX = xFor(n);
  const virtualY = yScale2For(currentMiss, pad, h1, gap, h2, displayMax);

  const yScale1 = scaleLinear([0, secondMax], [pad.top + h1, pad.top]);
  const yScale2 = scaleLinear([0, displayMax], [pad.top + h1 + gap + h2, pad.top + h1 + gap]);

  // 简单移动平均（MA）
  const maOf = (window: number, idx: number): number | null => {
    if (idx + 1 < window) return null;
    let s = 0;
    for (let i = idx - window + 1; i <= idx; i += 1) s += missValues[i];
    return s / window;
  };

  const title1Y = pad.top - 10;
  const title2Y = pad.top + h1 + gap - 8;
  const xLabelStartY = totalHeight - pad.bottom + 10;

  // ---- Skia paths ----
  const secondLinePath =
    secondOrder.length > 1
      ? Skia.Path.MakeFromSVGString(
          buildLinePath(secondOrder.map((p) => ({ x: xFor(p.index), y: yScale1(p.value) }))),
        )
      : null;

  const firstLinePath = Skia.Path.MakeFromSVGString(
    buildLinePath(missValues.map((v, i) => ({ x: xFor(i), y: yScale2(v) }))),
  );

  const maPaths = [
    { window: 5, color: MA5 },
    { window: 10, color: MA10 },
    { window: 20, color: MA20 },
  ].map(({ window: w, color }) => {
    const d = buildLinePath(
      missValues.map((_, i) => {
        const v = maOf(w, i);
        return { x: xFor(i), y: v === null ? null : yScale2(v) };
      }),
    );
    const p = Skia.Path.MakeFromSVGString(d);
    return { period: w, color, path: p };
  });

  // ---- 球内数字（RN Text 叠加）----
  const ballLabels: { x: number; y: number; text: string; color: string }[] = [];

  secondOrder.forEach((p) => {
    ballLabels.push({ x: xFor(p.index), y: yScale1(p.value), text: String(p.value), color: '#fff' });
  });

  missValues.forEach((v, i) => {
    const isLatest = i === n - 1;
    if (isLatest) {
      ballLabels.push({ x: xFor(i), y: yScale2(v), text: String(v), color: '#fff' });
      return;
    }
    if (v === 0) {
      ballLabels.push({ x: xFor(i), y: yScale2(0), text: '0', color: '#fff' });
      return;
    }
    if (missValues[i + 1] === 0) {
      ballLabels.push({ x: xFor(i), y: yScale2(v), text: String(v), color: '#fff' });
    }
  });

  ballLabels.push({ x: virtualX, y: virtualY, text: '?', color: '#fff' });

  return (
    <View style={{ width: screenW }}>
      {/* 二阶范围选择 */}
      <View className="flex-row items-center mb-2">
        <Text className="text-xs text-muted mr-2">二阶范围:</Text>
        <View className="flex-row gap-1.5 flex-1">
          {RANGES.map((r, idx) => (
            <Pressable
              key={r.label}
              onPress={() => setRangeIdx(idx)}
              style={{
                minWidth: 40,
                backgroundColor: rangeIdx === idx ? palette.accent : palette.surface2,
              }}
              className="py-1 rounded border items-center"
            >
              <Text
                className={`text-[10px] ${
                  rangeIdx === idx ? 'text-accent-foreground font-bold' : 'text-foreground'
                }`}
              >
                {r.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={{ position: 'relative', height: totalHeight }}>
        <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator bounces={false}>
          <View style={{ width: chartWidth, height: totalHeight, position: 'relative' }}>
            {/* ===== Canvas 层 ===== */}
            <Canvas style={{ width: chartWidth, height: totalHeight }}>
              {/* 二阶网格 */}
              {[0, 0.25, 0.5, 0.75, 1].map((r, idx) => {
                const y = pad.top + h1 * (1 - r);
                return (
                  <SkLine
                    key={`g1-${idx}`}
                    p1={vec(0, y)}
                    p2={vec(chartWidth, y)}
                    color={AXIS_COLOR}
                    strokeWidth={1}
                  />
                );
              })}

              {/* 二阶折线 */}
              {secondLinePath && (
                <SkPath path={secondLinePath} color={MAIN_LINE} style="stroke" strokeWidth={1.2} />
              )}

              {/* 二阶球 */}
              {secondOrder.map((p, i) => (
                <Circle
                  key={`s2-${i}`}
                  cx={xFor(p.index)}
                  cy={yScale1(p.value)}
                  r={3.5}
                  color={RED}
                />
              ))}

              {/* 一阶网格 */}
              {[0, 0.25, 0.5, 0.75, 1].map((r, idx) => {
                const y = pad.top + h1 + gap + h2 * (1 - r);
                return (
                  <SkLine
                    key={`g2-${idx}`}
                    p1={vec(0, y)}
                    p2={vec(chartWidth, y)}
                    color={AXIS_COLOR}
                    strokeWidth={1}
                  />
                );
              })}

              {/* 理论线（实线黑） */}
              {theoryMiss > 0 && theoryMiss <= displayMax && (
                <SkLine
                  p1={vec(0, yScale2(theoryMiss))}
                  p2={vec(chartWidth, yScale2(theoryMiss))}
                  color={THEORY_COLOR}
                  strokeWidth={1.2}
                />
              )}

              {/* 最大线（红虚线） */}
              <SkLine
                p1={vec(0, yScale2(maxMiss))}
                p2={vec(chartWidth, yScale2(maxMiss))}
                color={MAX_COLOR}
                strokeWidth={1}
              >
                <DashPathEffect intervals={[3, 3]} />
              </SkLine>

              {/* 平均线（蓝虚线） */}
              <SkLine
                p1={vec(0, yScale2(avgMiss))}
                p2={vec(chartWidth, yScale2(avgMiss))}
                color={AVG_COLOR}
                strokeWidth={1}
              >
                <DashPathEffect intervals={[3, 3]} />
              </SkLine>

              {/* 一阶折线 */}
              {firstLinePath && (
                <SkPath path={firstLinePath} color={MAIN_LINE} style="stroke" strokeWidth={1.2} />
              )}

              {/* 折线延伸到虚拟点（虚线） */}
              <SkLine
                p1={vec(xFor(n - 1), yScale2(currentMiss))}
                p2={vec(virtualX, virtualY)}
                color={MAIN_LINE}
                strokeWidth={1.2}
              >
                <DashPathEffect intervals={[4, 3]} />
              </SkLine>

              {/* 一阶球 */}
              {missValues.map((v, i) => {
                const isLatest = i === n - 1;
                if (isLatest) {
                  return (
                    <Circle key={`d-${i}`} cx={xFor(i)} cy={yScale2(v)} r={3.5} color={BLUE} />
                  );
                }
                if (v === 0) {
                  return (
                    <Circle key={`d-${i}`} cx={xFor(i)} cy={yScale2(0)} r={3.5} color={GREEN} />
                  );
                }
                if (missValues[i + 1] === 0) {
                  return (
                    <Circle key={`d-${i}`} cx={xFor(i)} cy={yScale2(v)} r={3.5} color={RED} />
                  );
                }
                return null;
              })}

              {/* 虚拟球 */}
              <Circle cx={virtualX} cy={virtualY} r={3.5} color={PURPLE} />

              {/* MA 线 */}
              {maPaths.map(({ period, color, path }) =>
                path ? (
                  <SkPath
                    key={`ma-${period}`}
                    path={path}
                    color={color}
                    style="stroke"
                    strokeWidth={1}
                  />
                ) : null,
              )}
            </Canvas>

            {/* ===== 文字层（RN Text 叠加）===== */}
            {/* Y 轴刻度（二阶 + 一阶） */}
            {[0, 0.25, 0.5, 0.75, 1].map((r, idx) => {
              const y1 = pad.top + h1 * (1 - r);
              const y2 = pad.top + h1 + gap + h2 * (1 - r);
              return (
                <React.Fragment key={`yt-${idx}`}>
                  <Text
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: y1 - 4,
                      width: pad.left - 4,
                      textAlign: 'right',
                      fontSize: compact ? 6 : 8,
                      color: TICK_COLOR,
                    }}
                  >
                    {(secondMax * r).toFixed(0)}
                  </Text>
                  <Text
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: y2 - 4,
                      width: pad.left - 4,
                      textAlign: 'right',
                      fontSize: compact ? 6 : 8,
                      color: TICK_COLOR,
                    }}
                  >
                    {(displayMax * r).toFixed(1)}
                  </Text>
                </React.Fragment>
              );
            })}

            {/* X 轴期号（竖排） */}
            {series.map((p, i) => {
              const label = p.issue.slice(-3);
              const x = xFor(i);
              return (
                <React.Fragment key={`x-${i}`}>
                  {label.split('').map((ch, k) => (
                    <Text
                      key={`x-${i}-${k}`}
                      style={{
                        position: 'absolute',
                        left: x - 3,
                        top: xLabelStartY + k * X_LABEL_LINE_H,
                        width: 6,
                        textAlign: 'center',
                        fontSize: 5,
                        color: TICK_COLOR,
                      }}
                    >
                      {ch}
                    </Text>
                  ))}
                </React.Fragment>
              );
            })}

            {/* 虚拟点 X 轴 ? */}
            <Text
              style={{
                position: 'absolute',
                left: virtualX - 3,
                top: xLabelStartY + X_LABEL_LINE_H,
                width: 6,
                textAlign: 'center',
                fontSize: 5,
                color: PURPLE,
                fontWeight: 'bold',
              }}
            >
              ?
            </Text>

            {/* 球内数字 */}
            {ballLabels.map((b, i) => (
              <Text
                key={`bl-${i}`}
                style={{
                  position: 'absolute',
                  left: b.x - 4,
                  top: b.y - 4,
                  width: 8,
                  textAlign: 'center',
                  fontSize: 5,
                  color: b.color,
                  fontWeight: 'bold',
                }}
              >
                {b.text}
              </Text>
            ))}
          </View>
        </ScrollView>

        {/* 悬浮标题 */}
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        >
          <Text
            style={{
              position: 'absolute',
              top: title1Y,
              width: '100%',
              textAlign: 'center',
              fontSize: compact ? 8 : 10,
              color: LABEL_COLOR,
            }}
          >
            {`二阶遗漏图（遗漏范围 ${range.min}-${range.max}）`}
          </Text>
          <Text
            style={{
              position: 'absolute',
              top: title2Y,
              width: '100%',
              textAlign: 'center',
              fontSize: compact ? 8 : 10,
              color: LABEL_COLOR,
            }}
          >
            {`一阶遗漏图（历史最大:${maxMiss} 平均:${avgMiss.toFixed(3)} 理论:${theoryMiss.toFixed(3)} 当前:${currentMiss}）`}
          </Text>
        </View>
      </View>
    </View>
  );
}

function yScale2For(
  value: number,
  pad: { top: number },
  h1: number,
  gap: number,
  h2: number,
  displayMax: number,
): number {
  const top = pad.top + h1 + gap;
  const bottom = top + h2;
  if (displayMax <= 0) return bottom;
  return bottom - (value / displayMax) * (bottom - top);
}

/**
 * 遗漏走势单图（轻量版）—— 供走势页「遗漏图」模式使用。
 * 输入 TrendPoint[]，内部按 hit 计算每期遗漏值，画折线 + 红/绿球 + MA5/10/20。
 * 与 OmissionChart（双联图）区分：这个只画一阶遗漏，不带二阶。
 */
import React from 'react';
import { View, Text, ScrollView, useWindowDimensions } from 'react-native';
import Svg, { Line, Path as SvgPath, Circle, Text as SvgText } from 'react-native-svg';
import type { TrendPoint } from '@/lib/lottery/types';
import { scaleLinear, buildLinePath, niceMax } from './chartUtils';

const RED = '#e5484d';
const GREEN = '#22c55e';
const BLACK = '#1f2937';
const MAX_COLOR = '#ef4444';
const AVG_COLOR = '#3b82f6';
const MA5 = '#3b82f6';
const MA10 = '#22c55e';
const MA20 = '#e879f9';
const AXIS_COLOR = 'rgba(140,140,150,0.35)';
const LABEL_COLOR = '#8a8f98';

export function OmissionLineChart({
  points,
  height,
}: {
  points: TrendPoint[];
  height?: number;
}) {
  const { width: screenW } = useWindowDimensions();
  const n = points.length;

  if (n === 0) {
    return (
      <View style={{ height: 200, justifyContent: 'center', alignItems: 'center' }}>
        <Text className="text-muted text-xs">暂无数据</Text>
      </View>
    );
  }

  // 由 hit 序列计算每期遗漏值
  const missValues: number[] = [];
  let m = 0;
  for (const p of points) {
    if (p.hit === 1) {
      missValues.push(0);
      m = 0;
    } else {
      m += 1;
      missValues.push(m);
    }
  }

  const gaps: number[] = [];
  for (let i = 1; i < n; i += 1) {
    if (missValues[i] === 0) gaps.push(missValues[i - 1]);
  }
  const maxMiss = Math.max(...missValues, 1);
  const avgMiss = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
  const hitCount = missValues.filter((v) => v === 0).length;
  const theoryMiss = hitCount > 0 ? n / hitCount : 0;
  const displayMax = niceMax(maxMiss);

  const pad = { left: 34, right: 16, top: 20, bottom: 28 };
  const h = height ?? 280;
  const innerH = Math.max(120, h - pad.top - pad.bottom);
  const totalHeight = h;

  const colWidth = 22;
  const chartWidth = Math.min(9000, Math.max(screenW, n * colWidth));

  const xFor = (i: number) =>
    n <= 1
      ? pad.left + (chartWidth - pad.left - pad.right) / 2
      : pad.left + ((chartWidth - pad.left - pad.right) * i) / (n - 1);

  const yScale = scaleLinear([0, displayMax], [pad.top + innerH, pad.top]);

  const maOf = (period: number, idx: number): number | null => {
    if (idx < period - 1) return null;
    let s = 0;
    for (let i = idx - period + 1; i <= idx; i += 1) s += missValues[i];
    return s / period;
  };

  const xLabelStep = Math.max(1, Math.ceil(n / (chartWidth / 44)));

  return (
    <View style={{ width: screenW }}>
      <ScrollView horizontal showsHorizontalScrollIndicator bounces={false}>
        <Svg width={chartWidth} height={totalHeight}>
          {/* 网格 */}
          {[0, 0.25, 0.5, 0.75, 1].map((r) => {
            const y = pad.top + innerH * (1 - r);
            return (
              <React.Fragment key={`g-${r}`}>
                <Line x1={pad.left} y1={y} x2={chartWidth - pad.right} y2={y} stroke={AXIS_COLOR} strokeWidth={1} />
                <SvgText x={pad.left - 4} y={y + 3} fontSize={8} fill={LABEL_COLOR} textAnchor="end">
                  {(displayMax * r).toFixed(1)}
                </SvgText>
              </React.Fragment>
            );
          })}

          {/* 水平线 */}
          {theoryMiss > 0 && theoryMiss <= displayMax && (
            <Line
              x1={pad.left}
              y1={yScale(theoryMiss)}
              x2={chartWidth - pad.right}
              y2={yScale(theoryMiss)}
              stroke={BLACK}
              strokeWidth={1.2}
            />
          )}
          <Line
            x1={pad.left}
            y1={yScale(maxMiss)}
            x2={chartWidth - pad.right}
            y2={yScale(maxMiss)}
            stroke={MAX_COLOR}
            strokeWidth={1}
            strokeDasharray="3,3"
          />
          <Line
            x1={pad.left}
            y1={yScale(avgMiss)}
            x2={chartWidth - pad.right}
            y2={yScale(avgMiss)}
            stroke={AVG_COLOR}
            strokeWidth={1}
            strokeDasharray="3,3"
          />

          {/* 折线 */}
          <SvgPath
            d={buildLinePath(missValues.map((v, i) => ({ x: xFor(i), y: yScale(v) })))}
            stroke={BLACK}
            strokeWidth={1.2}
            fill="none"
          />

          {/* 开出处球：红球=上一个遗漏值，绿球=0 */}
          {missValues.map((v, i) => {
            if (v !== 0) return null;
            const prev = i > 0 ? missValues[i - 1] : 0;
            return (
              <React.Fragment key={`open-${i}`}>
                {prev > 0 && (
                  <React.Fragment>
                    <Circle cx={xFor(i)} cy={yScale(prev)} r={5} fill={RED} />
                    <SvgText
                      x={xFor(i)}
                      y={yScale(prev) + 2.5}
                      fontSize={7}
                      fill="#fff"
                      textAnchor="middle"
                      fontWeight="bold"
                    >
                      {prev}
                    </SvgText>
                  </React.Fragment>
                )}
                <Circle cx={xFor(i)} cy={yScale(0)} r={5} fill={GREEN} />
                <SvgText
                  x={xFor(i)}
                  y={yScale(0) + 2.5}
                  fontSize={7}
                  fill="#fff"
                  textAnchor="middle"
                  fontWeight="bold"
                >
                  0
                </SvgText>
              </React.Fragment>
            );
          })}

          {/* MA */}
          {[
            { period: 5, color: MA5 },
            { period: 10, color: MA10 },
            { period: 20, color: MA20 },
          ].map(({ period, color }) => (
            <SvgPath
              key={`ma-${period}`}
              d={buildLinePath(
                missValues.map((_, i) => {
                  const v = maOf(period, i);
                  return { x: xFor(i), y: v === null ? null : yScale(v) };
                }),
              )}
              stroke={color}
              strokeWidth={1}
              fill="none"
            />
          ))}

          {/* 顶部信息 */}
          <SvgText x={pad.left} y={pad.top - 6} fontSize={9} fill={LABEL_COLOR}>
            {`遗漏图（历史最大:${maxMiss} 平均:${avgMiss.toFixed(2)} 理论:${theoryMiss.toFixed(3)}）`}
          </SvgText>

          {/* X 轴期号 */}
          {points.map((p, i) =>
            i % xLabelStep === 0 || i === n - 1 ? (
              <SvgText
                key={`x-${i}`}
                x={xFor(i)}
                y={totalHeight - 8}
                fontSize={8}
                fill={LABEL_COLOR}
                textAnchor="middle"
              >
                {p.issue.slice(-3)}
              </SvgText>
            ) : null,
          )}
        </Svg>
      </ScrollView>
    </View>
  );
}

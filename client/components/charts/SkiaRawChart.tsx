/**
 * 原始值走势图（Skia 版）。
 * 悬浮标题 + MA5/10/20 + 总平均线。
 */
import React from 'react';
import { View, Text } from 'react-native';
import { Canvas, Circle, Line as SkLine, Path as SkPath, Skia, vec } from '@shopify/react-native-skia';

type RawPoint = { issue: string; value: number };

const LINE_COLOR = '#1f2937';
const DOT_COLOR = '#e5484d';
const MA5_COLOR = '#3b82f6';
const MA10_COLOR = '#22c55e';
const MA20_COLOR = '#e879f9';
const AVG_COLOR = '#000000';
const GRID_COLOR = 'rgba(140,140,150,0.2)';
const LABEL_COLOR = '#8a8f98';

const MAX_SHOW = 200;
const TAIL_PAD = 40;

export function SkiaRawChart({
  data,
  height = 300,
  width = 350,
  title,
  targetLabel,
  highlightValue,
}: {
  data: RawPoint[];
  height?: number;
  width?: number;
  title?: string;
  targetLabel?: string;
  highlightValue?: number;
}) {
  const points = data.length > MAX_SHOW ? data.slice(-MAX_SHOW) : data;
  const n = points.length;

  if (n === 0) {
    return (
      <View style={{ width, height, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: 11, color: '#888' }}>暂无数据</Text>
      </View>
    );
  }

  const values = points.map((p) => p.value);
  const yMax = Math.max(...values, 1);
  const yTop = Math.ceil(yMax * 1.1);

  const avgValue = values.reduce((a, b) => a + b, 0) / n;
  const curValue = values[n - 1];

  // 标题文字
  const titleText = title
    ? `${title}（历史平均:${avgValue.toFixed(3)} 当前:${curValue}）`
    : `值走势（历史平均:${avgValue.toFixed(3)} 当前:${curValue}）`;

  const pad = { left: 32, right: TAIL_PAD, top: 22, bottom: 22 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const xFor = (i: number) => pad.left + (innerW * i) / Math.max(1, n - 1);
  const yFor = (v: number) => pad.top + innerH - (innerH * v) / (yTop || 1);

  // 折线路径
  const linePath = Skia.Path.Make();
  points.forEach((p, i) => {
    const x = xFor(i);
    const y = yFor(p.value);
    if (i === 0) linePath.moveTo(x, y);
    else linePath.lineTo(x, y);
  });

  // 均线
  const buildMA = (period: number) => {
    const path = Skia.Path.Make();
    let started = false;
    for (let i = 0; i < n; i += 1) {
      if (i + 1 < period) continue;
      let s = 0;
      for (let j = i - period + 1; j <= i; j += 1) s += values[j];
      const v = s / period;
      const x = xFor(i);
      const y = yFor(v);
      if (!started) { path.moveTo(x, y); started = true; }
      else path.lineTo(x, y);
    }
    return path;
  };
  const ma5Path = buildMA(5);
  const ma10Path = buildMA(10);
  const ma20Path = buildMA(20);

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((r) => r * yTop);
  const labelStep = Math.max(1, Math.floor(n / 10));

  const ballR = n <= 40 ? 5 : n <= 80 ? 4 : n <= 120 ? 3.5 : 3;
  const fontSize = n <= 40 ? 7 : n <= 80 ? 6 : 5;

  return (
    <View style={{ width, height, position: 'relative' }}>
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
        <Text style={{ fontSize: 10, color: LABEL_COLOR }}>{titleText}</Text>
      </View>

      <Canvas style={{ width, height }}>
        {/* 网格 */}
        {yTicks.map((v, idx) => (
          <SkLine
            key={`g-${idx}`}
            p1={vec(pad.left, yFor(v))}
            p2={vec(width - pad.right, yFor(v))}
            color={GRID_COLOR}
            strokeWidth={1}
          />
        ))}

        {/* 均线 MA20（蓝） */}
        <SkPath path={ma20Path} color={MA20_COLOR} style="stroke" strokeWidth={1} />
        {/* 均线 MA10（紫） */}
        <SkPath path={ma10Path} color={MA10_COLOR} style="stroke" strokeWidth={1} />
        {/* 均线 MA5（绿） */}
        <SkPath path={ma5Path} color={MA5_COLOR} style="stroke" strokeWidth={1} />

        {/* 总平均线（黑实线） */}
        <SkLine
          p1={vec(pad.left, yFor(avgValue))}
          p2={vec(width - pad.right, yFor(avgValue))}
          color={AVG_COLOR}
          strokeWidth={1.5}
        />

        {/* 主折线 */}
        <SkPath path={linePath} color={LINE_COLOR} style="stroke" strokeWidth={1.2} />

        {/* 球 */}
        {points.map((p, i) => (
          <Circle key={`d-${i}`} cx={xFor(i)} cy={yFor(p.value)} r={ballR} color={DOT_COLOR} />
        ))}
      </Canvas>

      {/* Y 轴刻度 */}
      {yTicks.map((v, idx) => (
        <Text
          key={`yt-${idx}`}
          style={{
            position: 'absolute',
            left: 0,
            top: yFor(v) - 5,
            width: pad.left - 3,
            textAlign: 'right',
            fontSize: 8,
            color: LABEL_COLOR,
          }}
        >
          {v.toFixed(0)}
        </Text>
      ))}

      {/* 球内数字 */}
      {n <= 100 &&
        points.map((p, i) => {
          if (highlightValue !== undefined && p.value !== highlightValue) return null;
          return (
            <Text
              key={`bv-${i}`}
              style={{
                position: 'absolute',
                left: xFor(i) - 10,
                top: yFor(p.value) - fontSize / 2 - 1,
                width: 20,
                textAlign: 'center',
                fontSize,
                lineHeight: fontSize + 1,
                color: '#fff',
                fontWeight: 'bold',
              }}
            >
              {p.value}
            </Text>
          );
        })}

      {/* X 轴期号 */}
      {points.map((p, i) => {
        if (i % labelStep !== 0 && i !== n - 1) return null;
        const x = xFor(i);
        return (
          <Text
            key={`xt-${i}`}
            style={{
              position: 'absolute',
              left: x - 18,
              top: height - pad.bottom + 2,
              width: 36,
              textAlign: 'center',
              fontSize: 8,
              color: LABEL_COLOR,
            }}
          >
            {p.issue.slice(-3)}
          </Text>
        );
      })}
    </View>
  );
}

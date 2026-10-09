/**
 * K 线图 —— 频率K线（蜡烛图） / 遗漏K线（黑折线 + 红球 + MA）
 */
import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Rect, Line, Path as SvgPath, Circle, Text as SvgText } from 'react-native-svg';
import type { TrendPoint } from '@/lib/lottery/types';
import { useChartSize } from './useChartSize';
import { scaleLinear, buildLinePath, niceMax } from './chartUtils';
import { palette, semantic } from '@/lib/theme';

/** 涨 / 命中 = 热（red），跌 / 未命中 = 冷（cyan） */
const UP_COLOR = semantic.hot;
const DOWN_COLOR = semantic.cold;
/** 均线：MA5 = amber（原型）/ MA10 = red / MA20 = cyan（原型） */
const MA5 = palette.amber;
const MA10 = semantic.hot;
const MA20 = semantic.cold;
/** 主折线（遗漏走势） */
const MAIN_LINE = palette.accent;
/** 网格线 / 坐标轴线 / 零轴 */
const AXIS_COLOR = palette.line;
/** 坐标刻度文字 */
const TICK_COLOR = palette.inkFaint;

export function StockChart({
  points,
  title,
  mode = 'frequency',
  coverage = 0.271,
  height = 320,
}: {
  points: TrendPoint[];
  title: string;
  mode?: 'frequency' | 'omission';
  coverage?: number;
  height?: number;
}) {
  const { width, onLayout } = useChartSize(height);
  if (width === 0) return <View style={{ height }} onLayout={onLayout} />;

  const n = points.length;
  if (n === 0) {
    return (
      <View style={{ height }} className="items-center justify-center">
        <Text className="text-muted text-xs">暂无数据</Text>
      </View>
    );
  }

  const values: number[] = [];
  let cum = 0;
  let miss = 0;
  for (let i = 0; i < n; i++) {
    if (mode === 'frequency') {
      if (points[i].hit === 1) cum += 1;
      values.push(cum - (i + 1) * coverage);
    } else {
      if (points[i].hit === 1) {
        values.push(0);
        miss = 0;
      } else {
        miss += 1;
        values.push(miss);
      }
    }
  }

  const pad = { left: 36, right: 6, top: 20, bottom: 22 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  let dataMin = Math.min(...values);
  let dataMax = Math.max(...values);

  if (mode === 'frequency') {
    if (dataMax - dataMin < 4) {
      dataMin -= 2;
      dataMax += 2;
    } else {
      const padding = (dataMax - dataMin) * 0.15;
      dataMin -= padding;
      dataMax += padding;
    }
    if (dataMin > 0) dataMin = -2;
    if (dataMax < 0) dataMax = 2;
  } else {
    dataMin = 0;
    dataMax = niceMax(dataMax * 1.1 + 1);
  }

  const yMin = dataMin;
  const yMax = mode === 'frequency' ? dataMax : niceMax(dataMax);
  const yScale = scaleLinear([yMin, yMax], [pad.top + plotH, pad.top]);
  const xFor = (i: number) =>
    n <= 1 ? pad.left + plotW / 2 : pad.left + (plotW * i) / (n - 1);
  const candleW = n > 1 ? Math.max(0.5, Math.min(6, (plotW / n) * 0.6)) : 6;

  const ticks: number[] = [];
  const step = (yMax - yMin) / 4;
  for (let i = 0; i <= 4; i++) {
    ticks.push(Number((yMin + step * i).toFixed(1)));
  }
  const xLabelStep = Math.max(1, Math.ceil(n / 6));
  const zeroY = yScale(0);

  const maOf = (period: number, idx: number): number | null => {
    if (idx < period - 1) return null;
    let sum = 0;
    for (let i = idx - period + 1; i <= idx; i++) sum += values[i];
    return sum / period;
  };

  const candles = values.map((close, i) => {
    const open = i > 0 ? values[i - 1] : (mode === 'frequency' ? 0 : close);
    return {
      issue: points[i].issue,
      open,
      close,
      high: Math.max(open, close),
      low: Math.min(open, close),
      isUp: close >= open,
    };
  });

  return (
    <View onLayout={onLayout} style={{ width: '100%' }}>
      <View className="flex-row items-center mb-1 px-1">
        <Text className="text-xs text-foreground font-semibold">{title}</Text>
        <Text className="text-[10px] text-muted ml-auto">
          {mode === 'frequency'
            ? `净命中 ${values[values.length - 1].toFixed(1)}`
            : `当前遗漏 ${values[values.length - 1]}`}
        </Text>
      </View>

      <View className="flex-row items-center gap-3 mb-1 px-1 flex-wrap">
        {mode === 'frequency' ? (
          <>
            <Legend color={UP_COLOR} label="命中（+1）" />
            <Legend color={DOWN_COLOR} label="未命中（-1）" />
          </>
        ) : (
          <>
            <Legend color={MAIN_LINE} label="遗漏走势" />
            <Legend color={UP_COLOR} label="命中点" />
            <Legend color={MA5} label="MA5" />
            <Legend color={MA10} label="MA10" />
            <Legend color={MA20} label="MA20" />
          </>
        )}
      </View>

      <Svg width={width} height={height}>
        {ticks.map((t) => (
          <Line key={`g${t}`} x1={pad.left} y1={yScale(t)} x2={width - pad.right} y2={yScale(t)} stroke={AXIS_COLOR} strokeWidth={1} />
        ))}
        {ticks.map((t) => (
          <SvgText key={`l${t}`} x={pad.left - 4} y={yScale(t) + 3} fontSize={8} fill={TICK_COLOR} textAnchor="end">
            {t.toFixed(1)}
          </SvgText>
        ))}

        {mode === 'frequency' && (
          <Line x1={pad.left} y1={zeroY} x2={width - pad.right} y2={zeroY} stroke={AXIS_COLOR} strokeWidth={1} />
        )}

        {mode === 'frequency' ? (
          candles.map((c, i) => {
            const x = xFor(i);
            const yHigh = yScale(c.high);
            const yLow = yScale(c.low);
            const yOpen = yScale(c.open);
            const yClose = yScale(c.close);
            const bodyTop = Math.min(yOpen, yClose);
            const bodyBottom = Math.max(yOpen, yClose);
            const bodyH = Math.max(1, bodyBottom - bodyTop);
            const color = c.isUp ? UP_COLOR : DOWN_COLOR;
            return (
              <React.Fragment key={c.issue}>
                {yHigh < bodyTop && <Line x1={x} y1={yHigh} x2={x} y2={bodyTop} stroke={color} strokeWidth={0.8} />}
                {bodyBottom < yLow && <Line x1={x} y1={bodyBottom} x2={x} y2={yLow} stroke={color} strokeWidth={0.8} />}
                <Rect x={x - candleW / 2} y={bodyTop} width={candleW} height={bodyH} fill={color} />
              </React.Fragment>
            );
          })
        ) : (
          <>
            <SvgPath
              d={buildLinePath(values.map((v, i) => ({ x: xFor(i), y: yScale(v) })))}
              stroke={MAIN_LINE}
              strokeWidth={1}
              fill="none"
            />
            {values.map((v, i) => {
              if (v !== 0) return null;
              const prev = i > 0 ? values[i - 1] : 0;
              const cy = yScale(prev);
              const color = prev === 0 ? DOWN_COLOR : UP_COLOR;
              return (
                <React.Fragment key={`dot-${i}`}>
                  <Circle cx={xFor(i)} cy={cy} r={6} fill={color} />
                  <SvgText
                    x={xFor(i)}
                    y={cy + 3}
                    fontSize={8}
                    fill="#fff"
                    textAnchor="middle"
                    fontWeight="bold"
                  >
                    {prev}
                  </SvgText>
                </React.Fragment>
              );
            })}
            {[
              { period: 5, color: MA5 },
              { period: 10, color: MA10 },
              { period: 20, color: MA20 },
            ].map(({ period, color }) => (
              <SvgPath
                key={`ma-${period}`}
                d={buildLinePath(
                  values.map((_, i) => {
                    const v = maOf(period, i);
                    return { x: xFor(i), y: v === null ? null : yScale(v) };
                  }),
                )}
                stroke={color}
                strokeWidth={1.2}
                fill="none"
              />
            ))}
          </>
        )}

        {points.map((p, i) =>
          i % xLabelStep === 0 || i === n - 1 ? (
            <SvgText key={`x-${i}`} x={xFor(i)} y={height - 6} fontSize={9} fill={TICK_COLOR} textAnchor="middle">
              {p.issue.slice(-3)}
            </SvgText>
          ) : null,
        )}
      </Svg>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View className="flex-row items-center gap-1">
      <View className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
      <Text className="text-[10px] text-muted">{label}</Text>
    </View>
  );
}

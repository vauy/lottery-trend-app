/**
 * K 线系统 —— 主分析界面
 *
 * 对应帮助文件《K线模式》下的全部模式：
 *   频率K线 / 周期K线（左对齐·右对齐）/ 遗漏K线（二阶）/ 遗漏图（MA5·10·25）
 *   / 二阶遗漏 / 出次图 / 开出遗漏
 * 并可叠加 MA、BOLL、MACD、KDJ、RSI、CCI、DMI、SAR 等技术指标。
 *
 * 布局：竖屏自上而下单列；横屏时主图与指标副图并排两列，
 * 图表内部再按容器宽度自适应，保证走势形态不被拉伸。
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { GameSwitch } from '../../components/GameSwitch';
import { NumberPicker } from '../../components/NumberPicker';
import { KLineChart, type OverlayLine } from '../../components/charts/KLineChart';
import { OmissionChart } from '../../components/charts/OmissionChart';
import { CountChart } from '../../components/charts/CountChart';
import { IndicatorChart } from '../../components/charts/IndicatorChart';
import {
  Chip,
  Divider,
  Empty,
  Field,
  Input,
  Loading,
  Panel,
  Row,
  Segmented,
  Spacer,
  Stat,
  TongCell,
  TongGrid,
} from '../../components/ui/Kit';
import { useLottery } from '../../hooks/useLottery';
import { useResponsive } from '../../hooks/useResponsive';
import { getGame } from '../../lib/lottery/games';
import {
  buildCandles,
  buildCountChart,
  buildDrawOmission,
  buildDrawOmissionSeries,
  buildFrequencySeries,
  buildOmissionKLine,
  buildOmissionKLineDetailed,
  buildOmissionNodes,
  buildOmissionSeries,
  buildSecondOrderOmission,
  cumulative,
  currentOmission,
  findTurningPoints,
  maxOmission,
  movingAverage,
  judgeTrend,
  resolveOmissionRange,
  theoryCycleFor,
  type OmissionRangeMode,
  repeatStats,
  temperatureOf,
} from '../../lib/lottery/analysis';
import { getIndicator, sma, defaultParams } from '../../lib/lottery/indicators';
import { buildHitSeries } from '../../lib/lottery/targets';
import type { GameId, PosKey } from '../../lib/lottery/types';
import { fontSize, radius, semantic, space, touch } from '../../lib/theme';

/** 对应帮助文件《K线模式》下的全部模式 */
type Mode = 'freq' | 'cycle' | 'omitK' | 'omit' | 'second' | 'count' | 'drawOmit' | 'compare';

const MODE_OPTIONS: Array<{ value: Mode; label: string }> = [
  { value: 'freq', label: '频率K线' },
  { value: 'cycle', label: '周期K线' },
  { value: 'omitK', label: '遗漏K线' },
  { value: 'omit', label: '遗漏图' },
  { value: 'second', label: '二阶遗漏' },
  { value: 'count', label: '出次图' },
  { value: 'drawOmit', label: '开出遗漏' },
  { value: 'compare', label: '多胆同屏' },
];

/**
 * 同屏子图类型：多胆同屏时每个格子画什么。
 * 频率 / 遗漏 / 出次 三种最常用于横向对比多个胆码。
 */
type CompareChart = 'freq' | 'omit' | 'count';
const COMPARE_OPTIONS: Array<{ value: CompareChart; label: string }> = [
  { value: 'freq', label: '频率K' },
  { value: 'omit', label: '遗漏图' },
  { value: 'count', label: '出次' },
];

const MA_COLORS = ['#F2B95A', '#4FCDCD', '#B58CF2', '#EF6661'];

/** 遗漏K线红格（设置范围内开出）/ 蓝格（范围外开出，含提前预画） */
const OMIT_RED = '#EF6661';
const OMIT_BLUE = '#4FCDCD';

/** 周期与退期的可选档位 */
const PERIOD_OPTIONS = ['3', '5', '10', '20'];
const BACK_OPTIONS = ['0', '1', '2', '3', '5'];
const STEP_OPTIONS = ['5', '10', '20', '50'];

export default function ChartScreen() {
  const {
    landscape,
    chartH,
    chartW,
    contentW,
    availH,
    railW,
    railCollapsed,
    width,
    panelW: chartPanelW,
  } = useResponsive();

  /** 横屏控制栏是否展开（默认收起，进横屏第一眼就是整屏图表） */
  const [railOpen, setRailOpen] = useState(false);
  const [gameId, setGameId] = useState<GameId>('fc3d');
  const game = useMemo(() => getGame(gameId), [gameId]);

  const [pos, setPos] = useState<PosKey>('ge');
  const [digit, setDigit] = useState(5);
  const [mode, setMode] = useState<Mode>('freq');
  const [period, setPeriod] = useState(5);
  const [align, setAlign] = useState<'left' | 'right'>('left');
  const [rangeMin, setRangeMin] = useState('0');
  const [rangeMax, setRangeMax] = useState('3');
  /** 遗漏范围四选项（官方《遗漏K线》）：理论周期 / 当前遗漏 / 计划期 / 自定义 */
  const [rangeMode, setRangeMode] = useState<OmissionRangeMode>('theory');
  const [planPeriods, setPlanPeriods] = useState(3);
  const [step, setStep] = useState(10);
  const [back, setBack] = useState(0);
  const [extendMA, setExtendMA] = useState(false);
  const [indicatorId, setIndicatorId] = useState('ma');
  const [showMA, setShowMA] = useState(true);
  /** 多胆同屏：子图类型 + 点按放大的胆码（null = 不放大） */
  const [compareChart, setCompareChart] = useState<CompareChart>('freq');
  const [focusDigit, setFocusDigit] = useState<number | null>(null);

  /** 切换彩种时把位置/号码重置到该彩种的合法值 */
  useEffect(() => {
    if (game.style === 'keno') {
      setPos('any');
      setDigit(1);
    } else {
      setPos((p) => (game.positions.some((x) => x.id === p) ? p : game.positions[0].id));
      setDigit((d) => (d >= game.digitMin && d <= game.digitMax ? d : game.digitMin));
    }
  }, [game]);

  const { loading, error, records, source, refreshedAt, refresh } = useLottery(gameId, 500);

  const posOptions = useMemo(() => {
    if (game.style === 'keno') return [{ value: 'any' as PosKey, label: '号码' }];
    return [
      { value: 'any' as PosKey, label: '不定位' },
      ...game.positions.map((p) => ({ value: p.id as PosKey, label: p.name })),
    ];
  }, [game]);

  const target = useMemo(() => ({ kind: 'digit' as const, pos, digit }), [pos, digit]);

  const hits = useMemo(
    () => (records.length ? buildHitSeries(records, game, target) : []),
    [records, game, target],
  );

  const cycle = useMemo(() => theoryCycleFor(game, pos), [game, pos]);
  const range = useMemo<[number, number]>(
    () =>
      resolveOmissionRange(
        rangeMode,
        cycle,
        currentOmission(hits),
        planPeriods,
        [Number(rangeMin) || 0, Number(rangeMax) || 0],
      ),
    [rangeMode, cycle, hits, planPeriods, rangeMin, rangeMax],
  );

  /** 主图蜡烛：频率K线 / 周期K线 / 遗漏K线 共用同一套渲染 */
  const candleSeries = useMemo(() => {
    if (!hits.length) return null;
    const b = Math.max(0, Math.floor(back));
    // ⚠️ buildFrequencySeries 返回的已是累积序列（首元素 0）；
    // 而 buildOmissionKLine 返回的是逐期增量序列，需要 cumulative 累积。
    // 二者不可混用——曾因对频率序列二次累积导致曲线被抹平、失去波段起伏。
    const cum =
      mode === 'omitK'
        ? cumulative(buildOmissionKLine(hits, cycle, range))
        : buildFrequencySeries(hits, cycle);
    // 退期：把末端往前推 b 期，只看这一段
    const cut = b > 0 ? cum.slice(0, Math.max(2, cum.length - b)) : cum;
    const recs = b > 0 ? records.slice(0, Math.max(1, records.length - b)) : records;
    if (recs.length < 1) return null;
    return buildCandles(cut, recs, mode === 'freq' ? 1 : period, align);
  }, [hits, records, mode, period, align, cycle, range, back]);

  /**
   * 遗漏K线的红/蓝配色（官方《遗漏K线》）。
   * 红格 = 设置范围内开出；蓝格 = 范围外开出 或 当前遗漏越界时提前预画的蓝格。
   * 仅「逐期（周期=1）」时一一对应；做周期聚合时按段内是否含红格决定颜色。
   */
  const omitColors = useMemo<string[] | undefined>(() => {
    if (mode !== 'omitK' || !candleSeries || !hits.length) return undefined;
    const bars = buildOmissionKLineDetailed(hits, cycle, range);
    const b = Math.max(0, Math.floor(back));
    const barsCut = b > 0 ? bars.slice(0, Math.max(1, bars.length - b)) : bars;
    const n = candleSeries.candles.length;
    // 逐期：直接一对一
    if (period === 1) {
      return candleSeries.candles.map((_, i) => {
        const kind = barsCut[i]?.kind;
        return kind === 'red' ? OMIT_RED : OMIT_BLUE;
      });
    }
    // 周期聚合：段内有红格则红，否则蓝
    return candleSeries.candles.map((_, seg) => {
      const start = seg * period;
      const segBars = barsCut.slice(start, start + period);
      return segBars.some((x) => x.kind === 'red') ? OMIT_RED : OMIT_BLUE;
    });
  }, [mode, candleSeries, hits, cycle, range, back, period]);

  /** 主图均线 */
  const overlays = useMemo<OverlayLine[]>(() => {
    if (!showMA || !candleSeries) return [];
    const periods = mode === 'cycle' ? [8, 13, 21, 34] : [5, 10, 20, 60];
    return periods
      .filter((p) => p < candleSeries.closes.length)
      .slice(0, 4)
      .map((p, i) => ({
      name: `MA${p}`,
      data: sma(candleSeries.closes, p),
      color: MA_COLORS[i % MA_COLORS.length],
    }));
  }, [showMA, candleSeries, mode]);

  /** 副图指标 */
  const indicatorSeries = useMemo(() => {
    if (!candleSeries || !indicatorId || indicatorId === 'none') return null;
    const def = getIndicator(indicatorId);
    if (!def) return null;
    return { def, series: def.compute(candleSeries.closes, defaultParams(def)) };
  }, [candleSeries, indicatorId]);

  /** 遗漏图节点（含均线延长开关） */
  const nodes = useMemo(
    () => (hits.length ? buildOmissionNodes(hits, records, [5, 10, 25], extendMA) : []),
    [hits, records, extendMA],
  );

  /** 遗漏图标题：对齐官方「历史最大X 平均X.XXX 理论X.XXX 当前X」格式 */
  const omitTitle = useMemo(() => {
    if (!nodes.length) return '遗漏图';
    const vals = nodes.map((n) => n.value);
    const maxV = Math.max(...vals);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const cur = currentOmission(hits);
    return `遗漏图 (历史最大${maxV} 平均${avg.toFixed(3)} 理论${cycle.toFixed(3)} 当前${cur}${extendMA ? ' · 均线延长' : ''})`;
  }, [nodes, hits, cycle, extendMA]);

  /** 均线拐点 */
  const turning = useMemo(() => findTurningPoints(nodes, [5, 10, 25]).slice(-6), [nodes]);

  /** 趋势判断（官方：实际出次 vs 理论出次） */
  const trend = useMemo(() => (hits.length ? judgeTrend(hits, cycle) : null), [hits, cycle]);

  /** 二阶遗漏 */
  const secondSeries = useMemo(
    () => (hits.length ? buildSecondOrderOmission(hits, records, range) : []),
    [hits, records, range],
  );

  /** 二阶遗漏节点（官方二阶遗漏图同样配 MA5/10/25 均线） */
  const secondNodes = useMemo(() => {
    const gaps = secondSeries.map((s) => s.gap);
    const ma5 = movingAverage(gaps, 5);
    const ma10 = movingAverage(gaps, 10);
    const ma25 = movingAverage(gaps, 25);
    return secondSeries.map((s, i) => ({
      order: s.order,
      issue: s.issue,
      value: s.gap,
      ma: { '5': ma5[i], '10': ma10[i], '25': ma25[i] },
    }));
  }, [secondSeries]);

  /** 开出遗漏：当期各位 + 历史序列 */
  const drawOmit = useMemo(() => {
    if (!records.length) return null;
    const items = buildDrawOmission(records, game, records.length - 1);
    const series = buildDrawOmissionSeries(records, game, pos);
    return { items, series, sum: items.reduce((a, b) => a + b.lastOmission, 0) };
  }, [records, game, pos]);

  const stats = useMemo(() => {
    if (!hits.length) return null;
    const cur = currentOmission(hits);
    const max = maxOmission(hits);
    const freq = hits.reduce((a, b) => a + b, 0);
    const avg = freq > 0 ? records.length / freq : records.length;
    const rep = repeatStats(hits);
    return { cur, max, freq, avg, rep };
  }, [hits, records.length]);

  /** 退期生效的模式 */
  const showBack = mode === 'cycle' || mode === 'omitK' || mode === 'count';
  /** 需要遗漏范围参数的模式 */
  const showRange = mode === 'omitK' || mode === 'second';

  /** 图表区宽度：横屏取图表区可用宽度，竖屏取内容宽度 */
  const chartWidth = landscape ? chartPanelW : contentW;
  /** 图表高度：横屏/竖屏都用响应式给出的高度（横屏已按窗口高度收敛） */
  const chartHeight = chartH;
  /** 横屏时控件一律走紧凑模式，避免胶囊按钮在窄栏里换行把图表挤出屏幕 */
  const compact = landscape;

  /* ==================== 多胆同屏 ==================== */
  /**
   * 同屏列数与单格尺寸。
   * 竖屏 1 列 × 十行（0-9 竖排），只有宽屏（≥900dp）才 2 列；
   * 单格高度独立给足，避免「宽度大、高度小」把 K 线压扁失真。
   */
  // 宽高比控制在 2.2~3.3 之间最舒服：太扁（>4）K 线被压平，太方（<2）横向看不出走势
  const compareColumns = landscape && width >= 720 ? 2 : 1;
  const compareGap = space.sm;
  const compareCellW = Math.max(
    160,
    Math.floor((chartWidth - (compareColumns - 1) * compareGap) / compareColumns) - 20,
  );
  const compareCellH = landscape ? 140 : 150;

  /** 同屏的胆码清单：位置型彩种 0-9；快乐8 只放前 10 个号做示意 */
  const compareDigits = useMemo(() => {
    const n = game.style === 'keno' ? 10 : game.digitMax - game.digitMin + 1;
    const start = game.style === 'keno' ? 1 : game.digitMin;
    return Array.from({ length: n }, (_, i) => start + i);
  }, [game]);

  /** 单个胆码的命中序列 */
  const hitsFor = useMemo(() => {
    return (d: number) =>
      records.length ? buildHitSeries(records, game, { kind: 'digit', pos, digit: d }) : [];
  }, [records, game, pos]);

  /** 多胆同屏：每个胆码一格，点按放大单图 */
  const renderCompare = () => {
    if (mode !== 'compare') return null;
    if (focusDigit !== null) {
      const hits1 = hitsFor(focusDigit);
      if (!hits1.length) return null;
      return (
        <View style={styles.chartCenter}>
          <Panel title={`胆码 ${focusDigit} · ${COMPARE_OPTIONS.find((c) => c.value === compareChart)?.label}`}>
            <Pressable onPress={() => setFocusDigit(null)}>
              {renderCompareChart(compareChart, hits1, chartWidth, chartHeight * 2)}
            </Pressable>
            <Spacer size={space.xs} />
            <Text style={styles.tip}>再次点击图表返回同屏</Text>
          </Panel>
        </View>
      );
    }
    return (
      <TongGrid columns={compareColumns}>
        {compareDigits.map((d) => {
          const hs = hitsFor(d);
          if (!hs.length) return null;
          return (
            <TongCell
              key={d}
              digit={d}
              width={compareColumns === 1 ? undefined : compareCellW}
            >
              <Pressable onPress={() => setFocusDigit(d)}>
                {renderCompareChart(compareChart, hs, compareCellW, compareCellH)}
              </Pressable>
            </TongCell>
          );
        })}
      </TongGrid>
    );
  };

  /** 同屏单格子图：按类型渲染 */
  const renderCompareChart = (
    kind: CompareChart,
    hs: number[],
    w: number,
    h: number,
  ) => {
    if (kind === 'freq') {
      const cum = buildFrequencySeries(hs, cycle);
      const bars = buildCandles(cum, records, 1, 'left');
      return <KLineChart series={bars} height={h} landscape={false} />;
    }
    if (kind === 'count') {
      return (
        <CountChart
          points={buildCountChart(hs, records, 10, 0)}
          height={h}
          landscape={false}
        />
      );
    }
    const omits = buildOmissionSeries(hs);
    return (
      <OmissionChart
        nodes={buildOmissionNodes(hs, records, [5], false)}
        height={h}
        landscape={false}
      />
    );
  };

  /* ==================== 图表区（横屏放右侧 / 竖屏放面板下方） ==================== */
  const chartBody = loading ? (
    <Panel compact={compact}>
      <Loading text="正在获取历史开奖数据…" />
    </Panel>
  ) : error ? (
    <Panel compact={compact}>
      <Empty text={error} />
    </Panel>
  ) : !records.length ? (
    <Panel compact={compact}>
      <Empty text="暂无数据，请点击刷新" />
    </Panel>
  ) : mode === 'compare' ? (
    /* 多胆同屏：竖屏 1 列 × 十行，点按放大单图 */
    <View style={styles.chartCenter}>{renderCompare()}</View>
  ) : (
    <View style={[styles.chartArea, landscape && styles.chartAreaLandscape]}>
      {/* 趋势判断（官方：实际出次 vs 理论出次） */}
      {trend ? (
        <>
          <Panel bodyStyle={{ paddingVertical: space.xs, paddingHorizontal: space.sm }} compact={compact}>
            <Row justify="space-between">
              <Text
                style={[
                  styles.trendText,
                  compact && styles.trendTextCompact,
                  {
                    color:
                      trend.direction === 'up'
                        ? semantic.hot
                        : trend.direction === 'down'
                          ? semantic.cold
                          : semantic.textDim,
                  },
                ]}
              >
                {trend.label}
              </Text>
              <Text style={styles.trendMeta} numberOfLines={1}>
                实际 {trend.actual} / 理论 {trend.expected.toFixed(1)}
                （{(trend.deviation * 100).toFixed(0)}%）· 当前遗漏 {currentOmission(hits)}
              </Text>
            </Row>
          </Panel>
          <Spacer size={space.sm} />
        </>
      ) : null}

      {/* 遗漏图：节点 + MA5/10/25 */}
      {mode === 'omit' || mode === 'second' ? (
        <View style={[styles.chartBox, landscape ? styles.chartBoxLandscape : { width: chartWidth }]}>
          <Panel
            title={mode === 'omit' ? omitTitle : `二阶遗漏（范围 ${rangeMin}~${rangeMax}）`}
            bodyStyle={{ padding: space.xs }}
          >
            <OmissionChart
              nodes={mode === 'omit' ? nodes : secondNodes}
              height={chartHeight}
              landscape={landscape}
            />
          </Panel>
        </View>
      ) : null}

      {/* 出次图 */}
      {mode === 'count' ? (
        <View style={[styles.chartBox, landscape ? styles.chartBoxLandscape : { width: chartWidth }]}>
          <Panel title={`出次图（步长 ${step} · 退期 ${back}）`} bodyStyle={{ padding: space.xs }}>
            <CountChart
              points={buildCountChart(hits, records, step, back)}
              height={chartHeight}
              landscape={landscape}
            />
          </Panel>
        </View>
      ) : null}

      {/* 开出遗漏 */}
      {mode === 'drawOmit' ? (
        <View style={[styles.chartBox, landscape ? styles.chartBoxLandscape : { width: chartWidth }]}>
          <Panel title="开出遗漏（当期各位置）" bodyStyle={{ padding: space.xs }}>
            <CountChart
              points={drawOmissionSeriesToPoints(records, drawOmit?.series ?? [])}
              height={chartHeight}
              landscape={landscape}
            />
          </Panel>
        </View>
      ) : null}

      {/* 蜡烛图（频率 / 周期 / 遗漏K线） */}
      {candleSeries && (mode === 'freq' || mode === 'cycle' || mode === 'omitK') ? (
        <View style={[styles.chartBox, landscape ? styles.chartBoxLandscape : { width: chartWidth }]}>
          <Panel
            title={`${MODE_OPTIONS.find((m) => m.value === mode)?.label}${
              mode === 'freq' ? '' : `（周期 ${period} · ${align === 'left' ? '左对齐' : '右对齐'}）`
            }`}
            bodyStyle={{ padding: space.xs }}
          >
            <KLineChart
              series={candleSeries}
              overlays={overlays}
              candleColors={omitColors}
              height={chartHeight}
              landscape={landscape}
            />
          </Panel>
        </View>
      ) : null}

      {/* 指标副图：非叠加型指标单独一张 */}
      {indicatorSeries && !indicatorSeries.def.overlay && candleSeries ? (
        <View style={[styles.chartBox, landscape ? styles.chartBoxLandscape : { width: chartWidth }]}>
          <Panel title={indicatorSeries.def.name} bodyStyle={{ padding: space.xs }}>
            <IndicatorChart
              categories={candleSeries.categories}
              series={indicatorSeries.series}
              height={chartHeight}
              landscape={landscape}
            />
          </Panel>
        </View>
      ) : null}

      {/* 指标副图：叠加型指标再画一张带指标的 K 线 */}
      {indicatorSeries?.def.overlay && candleSeries ? (
        <View style={[styles.chartBox, landscape ? styles.chartBoxLandscape : { width: chartWidth }]}>
          <Panel title={`${indicatorSeries.def.name}（叠加主图）`} bodyStyle={{ padding: space.xs }}>
            <KLineChart
              series={candleSeries}
              overlays={[
                ...overlays,
                ...indicatorSeries.series.map((s, i) => ({
                  name: s.name,
                  data: s.data,
                  color: s.color ?? MA_COLORS[i % MA_COLORS.length],
                })),
              ]}
              height={chartHeight}
              landscape={landscape}
            />
          </Panel>
        </View>
      ) : null}
    </View>
  );

  /* ==================== 控制面板（横屏放左侧栏 / 竖屏放图表上方） ==================== */
  const controls = (
    <>
      {/* ---------- 分析对象 ---------- */}
      <Panel title="分析对象" compact={compact}>
        <Field label="位置" compact={compact}>
          <Segmented
            options={posOptions}
            value={pos}
            onChange={(v) => setPos(v as PosKey)}
            compact={compact}
          />
        </Field>
        <Field label={game.style === 'keno' ? '号码' : '数字'} compact={compact}>
          <NumberPicker
            game={game}
            value={[digit]}
            single
            landscape={landscape}
            compact={compact}
            onChange={(next) => setDigit(next[0] ?? game.digitMin)}
          />
        </Field>
      </Panel>

      <Spacer size={space.md} />

      {/* ---------- 模式与参数 ---------- */}
      <Panel title="K 线模式" compact={compact}>
        <Segmented
          options={MODE_OPTIONS}
          value={mode}
          onChange={(v) => setMode(v as Mode)}
          compact={compact}
        />
        <Spacer size={space.sm} />
        <Divider />
        <Spacer size={space.xs} />

        {mode === 'cycle' || mode === 'omitK' ? (
          <Field label="周期" compact={compact}>
            <Segmented
              options={PERIOD_OPTIONS.map((v) => ({ value: v, label: v }))}
              value={String(period)}
              onChange={(v) => setPeriod(Number(v))}
              compact={compact}
            />
          </Field>
        ) : null}

        {showRange ? (
          <>
            <Field label="遗漏范围设定" compact={compact}>
              <Segmented
                options={[
                  { value: 'theory' as OmissionRangeMode, label: '理论周期' },
                  { value: 'current' as OmissionRangeMode, label: '当前遗漏' },
                  { value: 'plan' as OmissionRangeMode, label: '计划期' },
                  { value: 'custom' as OmissionRangeMode, label: '自定义' },
                ]}
                value={rangeMode}
                onChange={(v) => setRangeMode(v as OmissionRangeMode)}
                compact={compact}
              />
            </Field>

            {rangeMode === 'plan' ? (
              <Field label={`计划期数：${planPeriods} 期`} compact={compact}>
                <Segmented
                  options={[1, 2, 3, 4, 5, 6].map((v) => ({ value: String(v), label: String(v) }))}
                  value={String(planPeriods)}
                  onChange={(v) => setPlanPeriods(Number(v))}
                  compact={compact}
                />
              </Field>
            ) : null}

            {rangeMode === 'custom' ? (
              <Field label="自定义范围" compact={compact}>
                <Row gap={space.xs}>
                  <Input value={rangeMin} onChangeText={setRangeMin} keyboardType="numeric" placeholder="最小" />
                  <Text style={styles.dash}>—</Text>
                  <Input value={rangeMax} onChangeText={setRangeMax} keyboardType="numeric" placeholder="最大" />
                </Row>
              </Field>
            ) : null}

            <Field label="实际生效范围" compact={compact}>
              <Text style={styles.rangeHint}>
                {range[0]} ~ {range[1]}
                {rangeMode === 'theory'
                  ? `（理论遗漏 ${(cycle - 1).toFixed(2)}，当前遗漏 ${currentOmission(hits)}${currentOmission(hits) > Math.ceil(cycle - 1) ? '，已超出理论周期、参考价值下降' : ''}）`
                  : rangeMode === 'current'
                    ? `（以当前遗漏 ${currentOmission(hits)} 为起点，看当期机会）`
                    : rangeMode === 'plan'
                      ? `（以当前遗漏 ${currentOmission(hits)} 为起点做 ${planPeriods} 期计划）`
                      : '（自定义）'}
              </Text>
            </Field>
          </>
        ) : null}

        {mode === 'count' ? (
          <Field label="统计步长" compact={compact}>
            <Segmented
              options={STEP_OPTIONS.map((v) => ({ value: v, label: v }))}
              value={String(step)}
              onChange={(v) => setStep(Number(v))}
              compact={compact}
            />
          </Field>
        ) : null}

        {showBack ? (
          <Field label="退期" compact={compact}>
            <Segmented
              options={BACK_OPTIONS.map((v) => ({ value: v, label: v }))}
              value={String(back)}
              onChange={(v) => setBack(Number(v))}
              compact={compact}
            />
          </Field>
        ) : null}

        {mode === 'omit' || mode === 'second' ? (
          <Field label="均线延长到当前遗漏" compact={compact}>
            <Chip
              label={extendMA ? '已开启' : '已关闭'}
              active={extendMA}
              onPress={() => setExtendMA((v) => !v)}
              compact={compact}
            />
          </Field>
        ) : null}

        {mode === 'freq' || mode === 'cycle' || mode === 'omitK' ? (
          <Field label="主图均线" compact={compact}>
            <Chip
              label={showMA ? '已开启' : '已关闭'}
              active={showMA}
              onPress={() => setShowMA((v) => !v)}
              compact={compact}
            />
          </Field>
        ) : null}

        {mode === 'compare' ? (
          <>
            <Field label="同屏子图" compact={compact}>
              <Segmented
                options={COMPARE_OPTIONS}
                value={compareChart}
                onChange={(v) => setCompareChart(v as CompareChart)}
                compact={compact}
              />
            </Field>
            <Text style={styles.tip}>
              竖屏一列十行（0-9），点按任意一格放大单图；宽屏自动两列。
            </Text>
          </>
        ) : null}
      </Panel>

      {/* 横屏在侧栏里也要能换指标，避免为了换指标把屏幕转回竖屏 */}
      {landscape ? (
        <>
          <Spacer size={space.md} />
          <Panel title="技术指标" compact>
            <Row gap={space.xs}>
              {[
                { value: 'none', label: '无' },
                ...INDICATOR_KEYS.map((id) => ({ value: id, label: getIndicator(id)?.name ?? id })),
              ].map((opt) => (
                <Chip
                  key={opt.value}
                  label={opt.label}
                  active={indicatorId === opt.value}
                  onPress={() => setIndicatorId(opt.value)}
                  compact
                />
              ))}
            </Row>
          </Panel>
        </>
      ) : null}
    </>
  );

  return (
    <Screen
      scroll={!landscape}
      padding={landscape ? space.sm : space.lg}
      contentStyle={landscape ? styles.screenLandscape : undefined}
    >
      <GameSwitch value={gameId} onChange={setGameId} compact={compact} />

      <Spacer size={space.sm} />

      {landscape ? (
        /* ================= 横屏：左控制栏 + 右图表区 =================
           横屏纵向空间极紧，这里必须给出确定高度：
           外层 Screen 关闭滚动，控制栏与图表区各自独立滚动，
           否则 ScrollView 内的 flex:1 会塌陷，图表被挤出屏幕。 */
        <View style={[styles.landscapeRoot, { height: availH }]}>
          {/* 折叠条：默认收起，点一下展开控制栏 */}
          <Pressable
            onPress={() => setRailOpen((v) => !v)}
            style={[
              styles.railBar,
              { width: railCollapsed, height: availH - space.sm },
            ]}
          >
            <Text style={styles.railBarText}>参{'\n'}数</Text>
            <Text style={styles.railBarArrow}>{railOpen ? '‹' : '›'}</Text>
          </Pressable>

          {railOpen ? (
            <ScrollView
              style={[styles.rail, { width: railW, height: availH - space.sm }]}
              contentContainerStyle={{ paddingBottom: space.lg }}
              nestedScrollEnabled
              showsVerticalScrollIndicator
            >
              {controls}
            </ScrollView>
          ) : null}

          {/* 图表区：只在这里滚动，控制栏不跟着动 */}
          <ScrollView
            style={styles.chartPane}
            contentContainerStyle={{ paddingBottom: space.sm }}
            showsVerticalScrollIndicator
          >
            {chartBody}
          </ScrollView>
        </View>
      ) : (
        /* ================= 竖屏：面板在上，图表在下 ================= */
        <>
          {controls}

          <Spacer size={space.md} />

          {chartBody}
        </>
      )}

      {landscape ? null : (
        <>
          <Spacer size={space.md} />

          {/* ---------- 技术指标 ---------- */}
          <Panel title="技术指标">
            <Row>
              {[
                { value: 'none', label: '无' },
                ...INDICATOR_KEYS.map((id) => ({ value: id, label: getIndicator(id)?.name ?? id })),
              ].map((opt) => (
                <Chip
                  key={opt.value}
                  label={opt.label}
                  active={indicatorId === opt.value}
                  onPress={() => setIndicatorId(opt.value)}
                />
              ))}
            </Row>
            {indicatorId !== 'none' ? (
              <Text style={styles.tip}>
                指标参数取默认值，可在「设置 → 指标参数」中调整（当前版本使用默认参数）。
              </Text>
            ) : null}
          </Panel>
        </>
      )}

      {landscape ? null : (
        <>
          <Spacer size={space.md} />

          {/* ---------- 统计摘要 ---------- */}
          {stats ? (
            <Panel title="统计摘要">
              <Row>
                <Stat label="当前遗漏" value={stats.cur} color={stats.cur > stats.avg * 2 ? semantic.hot : semantic.text} />
                <Stat label="最大遗漏" value={stats.max} />
                <Stat label="出现次数" value={stats.freq} />
                <Stat label="平均遗漏" value={stats.avg.toFixed(1)} />
                <Stat
                  label="欲出几率"
                  value={stats.avg > 0 ? (stats.cur / stats.avg).toFixed(2) : '0.00'}
                  color={stats.avg > 0 && stats.cur / stats.avg > 2 ? semantic.hot : semantic.text}
                />
                <Stat label="当前连出" value={stats.rep.current} />
              </Row>
              {turning.length ? (
                <>
                  <Spacer size={space.sm} />
                  <Text style={styles.tip}>
                    近期均线拐点：{turning.map((t) => `MA${t.period}→${t.value.toFixed(1)}`).join(' · ')}
                  </Text>
                </>
              ) : null}
            </Panel>
          ) : null}
        </>
      )}

      <Spacer size={landscape ? space.sm : space.xl} />

      <Row>
        <Text style={styles.meta}>
          数据源：
          {source === 'network' ? '17500.cn' : source === 'cache' ? '本地缓存' : source === 'seed' ? '内置种子' : '—'}
          {refreshedAt ? ` · 更新于 ${new Date(refreshedAt).toLocaleString('zh-CN')}` : ''}
        </Text>
        <Chip label="强制刷新" onPress={() => refresh(true)} compact={compact} />
      </Row>

      <Spacer size={landscape ? space.md : space.xxl} />
    </Screen>
  );
}

/** 把开出遗漏序列转成出次图同样的数据结构 */
function drawOmissionSeriesToPoints(
  records: Array<{ issue: string }>,
  series: number[],
): Array<{ label: string; count: number }> {
  const n = Math.min(records.length, series.length);
  return series.slice(series.length - n).map((v, i) => ({
    label: records[records.length - n + i]?.issue ?? '',
    count: v,
  }));
}

const INDICATOR_KEYS = [
  'ma',
  'ema',
  'expma',
  'boll',
  'macd',
  'kdj',
  'cci',
  'rsi',
  'wpr',
  'mtm',
  'bbi',
  'atr',
  'dmi',
  'sar',
];

const styles = StyleSheet.create({
  /** 横屏：整屏不再纵向滚动，改为左右分栏 */
  screenLandscape: {
    paddingHorizontal: space.sm,
    paddingTop: space.sm,
  },
  landscapeRoot: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: space.sm,
  },
  /** 折叠状态的竖向细条：点一下展开控制栏 */
  railBar: {
    width: 34,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    backgroundColor: semantic.panelBg,
    borderWidth: 1,
    borderColor: semantic.panelBorder,
    borderRadius: radius.md,
    paddingVertical: space.md,
  },
  railBarText: {
    color: semantic.brand,
    fontSize: fontSize.xs,
    fontWeight: '700',
    // 竖排文字：把「参数」两字竖着叠起来
    width: 12,
    lineHeight: 14,
    textAlign: 'center',
  },
  railBarArrow: {
    color: semantic.textFaint,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  /** 展开后的控制栏：内部可滚动，不挤压右侧图表 */
  rail: {
    flexShrink: 0,
    backgroundColor: semantic.contentBg,
    borderWidth: 1,
    borderColor: semantic.panelBorder,
    borderRadius: radius.md,
    paddingHorizontal: space.sm,
    paddingTop: space.sm,
  },
  /** 右侧图表区：占满剩余宽度，内部独立滚动 */
  chartPane: {
    flex: 1,
    minWidth: 0,
  },
  /** 横屏：图表容器宽度撑满，让 ECharts 按容器实测宽度绘制 */
  chartBoxLandscape: {
    width: '100%',
  },
  label: {
    color: semantic.textDim,
    fontSize: fontSize.sm,
    marginBottom: space.xs,
  },
  chartArea: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
  },
  chartAreaLandscape: {
    alignItems: 'flex-start',
    gap: space.sm,
  },
  /** 图表居中容器：占满可用宽度，内容水平居中 */
  chartCenter: {
    width: '100%',
    alignItems: 'center',
  },
  chartBox: {
    flexGrow: 0,
    flexShrink: 0,
  },
  meta: {
    color: semantic.textFaint,
    fontSize: fontSize.xs,
    flexShrink: 1,
  },
  tip: {
    color: semantic.textFaint,
    fontSize: fontSize.xs,
    lineHeight: 16,
    marginTop: space.xs,
  },
  dash: {
    color: semantic.textFaint,
  },
  rangeHint: {
    color: semantic.brand,
    fontSize: fontSize.sm,
    lineHeight: 18,
  },
  trendText: {
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  trendTextCompact: {
    fontSize: fontSize.sm,
  },
  trendMeta: {
    color: semantic.textFaint,
    fontSize: fontSize.xs,
    lineHeight: 16,
    flexShrink: 1,
  },
});

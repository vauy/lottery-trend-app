/**
 * 传统走势 —— 综合走势 / 分布图形 / 扫描图 / 最近开奖
 *
 * 对齐官方帮助《传统分析项目》三大件：
 *   - 综合走势：参数表格（和值/合值/均值/跨度/奇偶/大小/质合/012路/形态）
 *     + 选定位置的 0-9 号码分布列（当期开出高亮）
 *     + 底部「出现次数 / 当前遗漏 / 最大遗漏」统计行；
 *   - 分布图形：经典位置走势图（开奖点圆点连线 + 格内遗漏值）；
 *   - 扫描图：号码 × 期号 的 √/× 中出矩阵 + 出现/连出/正确率统计。
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { GameSwitch } from '../../components/GameSwitch';
import { TrendChart } from '../../components/charts/TrendChart';
import { ScanChart, type ScanRow } from '../../components/charts/ScanChart';
import { Chip, Divider, Empty, Loading, Panel, Row, Spacer } from '../../components/ui/Kit';
import { useLottery } from '../../hooks/useLottery';
import { useResponsive } from '../../hooks/useResponsive';
import { getDigits, getGame } from '../../lib/lottery/games';
import { buildHitSeries } from '../../lib/lottery/targets';
import { buildOmissionStats } from '../../lib/lottery/analysis';
import {
  bigCount,
  groupForm,
  oddCount,
  primeCount,
  roadCount,
  shapeForm,
  spanOf,
  sumOf,
} from '../../lib/lottery/filters';
import type { GameId, PosKey } from '../../lib/lottery/types';
import { fontSize, palette, radius, semantic, space } from '../../lib/theme';

const ROWS_OPTIONS = [20, 30, 50, 100];
type ViewMode = 'table' | 'dist' | 'scan' | 'list';

/** 连续出现统计 */
function repeatInfo(hits: number[]): { max: number; current: number } {
  let max = 0;
  let run = 0;
  for (const h of hits) {
    if (h === 1) {
      run += 1;
      if (run > max) max = run;
    } else {
      run = 0;
    }
  }
  return { max, current: run };
}

export default function TrendScreen() {
  const { landscape } = useResponsive();
  const [gameId, setGameId] = useState<GameId>('fc3d');
  const game = useMemo(() => getGame(gameId), [gameId]);
  const [rows, setRows] = useState(30);
  const [pos, setPos] = useState<PosKey>('ge');
  const [view, setView] = useState<ViewMode>('table');

  const { loading, error, records, source, refresh } = useLottery(gameId, 1000);

  const isKeno = game.style === 'keno';
  const shown = useMemo(() => records.slice(-rows), [records, rows]);
  const digits = useMemo(() => getDigits(game), [game]);

  /** 位置选项：综合走势/分布图形只允许具体位置；扫描图允许「不定位」 */
  const concretePos = game.positions;
  const posOptions = useMemo(
    () => concretePos.map((p) => ({ value: p.id as PosKey, label: p.name })),
    [concretePos],
  );
  const scanPosOptions = useMemo(
    () => [
      { value: 'any' as PosKey, label: '不定位' },
      ...concretePos.map((p) => ({ value: p.id as PosKey, label: p.name })),
    ],
    [concretePos],
  );

  /** 切彩种时把位置重置到合法值 */
  React.useEffect(() => {
    if (isKeno) setPos('any');
    else setPos((p) => (concretePos.some((x) => x.id === p) ? p : concretePos[0]?.id ?? 'ge'));
  }, [game, isKeno, concretePos]);

  /** 当前位置的开奖序列（分布图形用） */
  const drawSeries = useMemo(() => {
    if (isKeno || pos === 'any') return null;
    const idx = concretePos.find((p) => p.id === pos)?.index;
    if (idx === undefined) return null;
    return shown.map((r) => r.nums[idx]);
  }, [shown, isKeno, pos, concretePos]);

  /** 扫描图行数据 */
  const scanRows = useMemo<ScanRow[]>(() => {
    if (!shown.length) return [];
    return digits.map((d) => ({
      label: String(d).padStart(isKeno ? 2 : 1, '0'),
      hits: shown.map((r) => buildHitSeries([r], game, { kind: 'digit', pos, digit: d })[0]),
    }));
  }, [shown, digits, game, pos, isKeno]);

  /** 综合走势底部统计（按全量历史算遗漏，出现次数按当前窗口） */
  const stats = useMemo(() => {
    if (!records.length) return [];
    return buildOmissionStats(records, game, (digit) => ({ kind: 'digit', pos, digit }));
  }, [records, game, pos]);

  const windowCount = useMemo(() => {
    const m = new Map<number, number>();
    for (const d of digits) m.set(d, 0);
    for (const r of shown) {
      for (const d of digits) {
        m.set(d, (m.get(d) ?? 0) + buildHitSeries([r], game, { kind: 'digit', pos, digit: d })[0]);
      }
    }
    return m;
  }, [shown, digits, game, pos]);

  const issues = shown.map((r) => r.issue);

  return (
    <Screen>
      <GameSwitch value={gameId} onChange={setGameId} />

      {loading ? (
        <Panel>
          <Loading text="正在获取历史开奖数据…" />
        </Panel>
      ) : error ? (
        <Panel>
          <Empty text={error} />
        </Panel>
      ) : !records.length ? (
        <Panel>
          <Empty text="暂无数据" />
        </Panel>
      ) : (
        <>
          {/* 视图切换 */}
          <Panel>
            <View style={styles.chipWrap}>
              {(
                [
                  ['table', '综合走势'],
                  ['dist', '分布图形'],
                  ['scan', '扫描图'],
                  ['list', '最近开奖'],
                ] as Array<[ViewMode, string]>
              ).map(([v, label]) => (
                <Chip key={v} label={label} active={view === v} onPress={() => setView(v)} />
              ))}
            </View>
            <Spacer size={space.sm} />
            <Divider />
            <Spacer size={space.sm} />
            <Row gap={space.xs}>
              {ROWS_OPTIONS.map((r) => (
                <Chip key={r} label={`${r}期`} active={rows === r} onPress={() => setRows(r)} />
              ))}
            </Row>
            <Spacer size={space.sm} />
            {isKeno && view === 'dist' ? null : (
              <>
                <Text style={styles.label}>位置</Text>
                <View style={styles.chipWrap}>
                  {(view === 'scan' ? scanPosOptions : posOptions).map((o) => (
                    <Chip
                      key={o.value}
                      label={o.label}
                      active={pos === o.value}
                      onPress={() => setPos(o.value)}
                    />
                  ))}
                </View>
              </>
            )}
          </Panel>

          <Spacer size={space.md} />

          {/* 综合走势：参数表格 + 号码分布列 + 底部统计行 */}
          {view === 'table' ? (
            isKeno ? (
              <KenoTable shown={shown} />
            ) : (
              <Panel title={`综合走势 · ${concretePos.find((p) => p.id === pos)?.name ?? ''}`}>
                <ScrollView horizontal showsHorizontalScrollIndicator>
                  <View>
                    {/* 表头 */}
                    <View style={styles.tr}>
                      <Text style={[styles.th, styles.cIssue]}>期号</Text>
                      <Text style={[styles.th, styles.cNum]}>开奖号</Text>
                      <Text style={[styles.th, styles.cSm]}>和</Text>
                      <Text style={[styles.th, styles.cSm]}>合</Text>
                      <Text style={[styles.th, styles.cSm]}>均</Text>
                      <Text style={[styles.th, styles.cSm]}>跨</Text>
                      <Text style={[styles.th, styles.cMd]}>奇偶</Text>
                      <Text style={[styles.th, styles.cMd]}>大小</Text>
                      <Text style={[styles.th, styles.cMd]}>质合</Text>
                      <Text style={[styles.th, styles.cRoad]}>012路</Text>
                      <Text style={[styles.th, styles.cMd]}>形态</Text>
                      {digits.map((d) => (
                        <Text key={d} style={[styles.th, styles.cDigit]}>
                          {d}
                        </Text>
                      ))}
                    </View>
                    {/* 数据行（新→旧） */}
                    {shown
                      .slice()
                      .reverse()
                      .map((r) => {
                        const sum = sumOf(r.nums);
                        const odd = oddCount(r.nums);
                        const big = bigCount(r.nums);
                        const prime = primeCount(r.nums);
                        const road = roadCount(r.nums);
                        const idx = concretePos.find((p) => p.id === pos)?.index ?? 0;
                        const drawn = r.nums[idx];
                        const n = r.nums.length;
                        return (
                          <View key={r.issue} style={styles.tr}>
                            <Text style={[styles.td, styles.cIssue, styles.dim]} numberOfLines={1}>
                              {r.issue}
                            </Text>
                            <Text style={[styles.td, styles.cNum, styles.num]} numberOfLines={1}>
                              {r.nums.join('')}
                            </Text>
                            <Text style={[styles.td, styles.cSm]}>{sum}</Text>
                            <Text style={[styles.td, styles.cSm]}>{sum % 10}</Text>
                            <Text style={[styles.td, styles.cSm]}>{(sum / n).toFixed(1)}</Text>
                            <Text style={[styles.td, styles.cSm]}>{spanOf(r.nums)}</Text>
                            <Text style={[styles.td, styles.cMd]} numberOfLines={1}>
                              {odd}奇{n - odd}偶
                            </Text>
                            <Text style={[styles.td, styles.cMd]} numberOfLines={1}>
                              {big}大{n - big}小
                            </Text>
                            <Text style={[styles.td, styles.cMd]} numberOfLines={1}>
                              {prime}质{n - prime}合
                            </Text>
                            <Text style={[styles.td, styles.cRoad]} numberOfLines={1}>
                              {road.join('·')}
                            </Text>
                            <Text style={[styles.td, styles.cMd, styles.dim]} numberOfLines={1}>
                              {shapeForm(r.nums)}
                            </Text>
                            {digits.map((d) => {
                              const hit = drawn === d;
                              return (
                                <View key={d} style={[styles.digitCell, hit && styles.digitCellHit]}>
                                  <Text style={[styles.tdDigit, hit && styles.tdDigitHit]}>
                                    {d}
                                  </Text>
                                </View>
                              );
                            })}
                          </View>
                        );
                      })}
                    {/* 底部统计行 */}
                    <Divider />
                    <FooterStatRow label="出现次数" values={digits.map((d) => windowCount.get(d) ?? 0)} />
                    <FooterStatRow
                      label="当前遗漏"
                      values={digits.map((d) => stats.find((s) => s.digit === d)?.current ?? 0)}
                    />
                    <FooterStatRow
                      label="最大遗漏"
                      values={digits.map((d) => stats.find((s) => s.digit === d)?.maxOmission ?? 0)}
                    />
                  </View>
                </ScrollView>
                <Spacer size={space.xs} />
                <Text style={styles.tip}>绿色高亮 = 当期该位置开出的号码；横滑查看更多列。</Text>
              </Panel>
            )
          ) : null}

          {/* 分布图形 */}
          {view === 'dist' ? (
            isKeno ? (
              <Panel>
                <Empty text="快乐8 为无位置彩种，不支持位置连线走势，请用「扫描图」或「K线/遗漏」" />
              </Panel>
            ) : drawSeries ? (
              <Panel
                title={`分布图形 · ${concretePos.find((p) => p.id === pos)?.name ?? ''}（近 ${shown.length} 期）`}
                bodyStyle={{ padding: space.xs }}
              >
                <ScrollView horizontal showsHorizontalScrollIndicator>
                  <View style={{ width: Math.max(320, shown.length * (landscape ? 34 : 26)) }}>
                    <TrendChart
                      issues={issues}
                      draws={drawSeries}
                      digits={digits}
                      landscape={landscape}
                    />
                  </View>
                </ScrollView>
                <Spacer size={space.xs} />
                <Text style={styles.tip}>
                  绿色圆点 = 当期开出号码，细线为相邻期连线，格内数字为该号码当前遗漏值。
                </Text>
              </Panel>
            ) : null
          ) : null}

          {/* 扫描图 */}
          {view === 'scan' ? (
            <Panel
              title={`扫描图 · ${isKeno ? '全号码' : scanPosOptions.find((o) => o.value === pos)?.label ?? ''}（近 ${shown.length} 期）`}
              bodyStyle={{ padding: space.xs }}
            >
              <ScrollView horizontal showsHorizontalScrollIndicator>
                <View style={{ width: Math.max(320, shown.length * (landscape ? 34 : 26)) }}>
                  <ScrollView style={{ maxHeight: landscape ? 360 : 480 }} nestedScrollEnabled>
                    <ScanChart issues={issues} rows={scanRows} landscape={landscape} />
                  </ScrollView>
                </View>
              </ScrollView>
              {!isKeno ? (
                <>
                  <Spacer size={space.sm} />
                  <Divider />
                  <Spacer size={space.sm} />
                  <View style={styles.tr}>
                    <Text style={[styles.th, { width: 40 }]}>号码</Text>
                    <Text style={[styles.th, { width: 52 }]}>出现</Text>
                    <Text style={[styles.th, { width: 60 }]}>最大连出</Text>
                    <Text style={[styles.th, { width: 60 }]}>当前连出</Text>
                    <Text style={[styles.th, { width: 56 }]}>正确率</Text>
                  </View>
                  <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled>
                    {scanRows.map((row) => {
                      const rep = repeatInfo(row.hits);
                      const cnt = row.hits.reduce((a, b) => a + b, 0);
                      return (
                        <View key={row.label} style={styles.tr}>
                          <Text style={[styles.td, { width: 40, color: semantic.brand }]}>{row.label}</Text>
                          <Text style={[styles.td, { width: 52 }]}>{cnt}</Text>
                          <Text style={[styles.td, { width: 60 }]}>{rep.max}</Text>
                          <Text style={[styles.td, { width: 60 }]}>{rep.current}</Text>
                          <Text style={[styles.td, { width: 56 }]}>
                            {row.hits.length ? ((cnt / row.hits.length) * 100).toFixed(1) + '%' : '—'}
                          </Text>
                        </View>
                      );
                    })}
                  </ScrollView>
                </>
              ) : null}
              <Spacer size={space.xs} />
              <Text style={styles.tip}>绿色 √ = 当期中出，粉色 × = 未中出；横滑看更多期。</Text>
            </Panel>
          ) : null}

          {/* 最近开奖 */}
          {view === 'list' ? (
            <Panel title="最近开奖">
              <View style={styles.tr}>
                <Text style={[styles.th, styles.c1]}>期号</Text>
                <Text style={[styles.th, styles.c3]}>开奖号</Text>
                <Text style={[styles.th, styles.c2]}>和值</Text>
                <Text style={[styles.th, styles.c2]}>跨度</Text>
                <Text style={[styles.th, styles.c2]}>形态</Text>
              </View>
              {shown
                .slice()
                .reverse()
                .map((r) => (
                  <View key={r.issue} style={styles.tr}>
                    <Text style={[styles.td, styles.c1]} numberOfLines={1}>
                      {r.issue}
                    </Text>
                    <Text style={[styles.td, styles.c3, styles.num]} numberOfLines={1}>
                      {isKeno ? r.nums.join(' ') : r.nums.join('')}
                    </Text>
                    <Text style={[styles.td, styles.c2]}>{sumOf(r.nums)}</Text>
                    <Text style={[styles.td, styles.c2]}>{spanOf(r.nums)}</Text>
                    <Text style={[styles.td, styles.c2]} numberOfLines={1}>
                      {isKeno ? '—' : shapeForm(r.nums)}
                    </Text>
                  </View>
                ))}
            </Panel>
          ) : null}
        </>
      )}

      <Spacer size={space.xl} />
      <Row>
        <Text style={styles.meta}>数据源：data.17500.cn（{source ?? '—'}）</Text>
        <Chip label="刷新" onPress={() => refresh(true)} />
      </Row>
      <Spacer size={space.xxl} />
    </Screen>
  );
}

/** 底部统计行（标签 + 每位数字一列） */
function FooterStatRow({ label, values }: { label: string; values: number[] }) {
  return (
    <View style={styles.tr}>
      <Text style={[styles.th, styles.cIssue]}>{label}</Text>
      <Text style={[styles.td, styles.cNum]} />
      <Text style={[styles.td, styles.cSm]} />
      <Text style={[styles.td, styles.cSm]} />
      <Text style={[styles.td, styles.cSm]} />
      <Text style={[styles.td, styles.cSm]} />
      <Text style={[styles.td, styles.cMd]} />
      <Text style={[styles.td, styles.cMd]} />
      <Text style={[styles.td, styles.cMd]} />
      <Text style={[styles.td, styles.cRoad]} />
      <Text style={[styles.td, styles.cMd]} />
      {values.map((v, i) => (
        <Text key={i} style={[styles.tdDigit, styles.dim]}>
          {v}
        </Text>
      ))}
    </View>
  );
}

/** 快乐8 的综合走势（无位置，用比例列） */
function KenoTable({ shown }: { shown: Array<{ issue: string; nums: number[] }> }) {
  return (
    <Panel title="综合走势（快乐8）">
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          <View style={styles.tr}>
            <Text style={[styles.th, styles.cIssue]}>期号</Text>
            <Text style={[styles.th, { width: 190 }]}>开奖号</Text>
            <Text style={[styles.th, styles.cMd]}>和值</Text>
            <Text style={[styles.th, styles.cMd]}>奇偶比</Text>
            <Text style={[styles.th, styles.cMd]}>大小比</Text>
            <Text style={[styles.th, styles.cMd]}>质合比</Text>
          </View>
          {shown
            .slice()
            .reverse()
            .map((r) => {
              const odd = oddCount(r.nums);
              const big = bigCount(r.nums);
              const prime = primeCount(r.nums);
              const n = r.nums.length;
              return (
                <View key={r.issue} style={styles.tr}>
                  <Text style={[styles.td, styles.cIssue, styles.dim]} numberOfLines={1}>
                    {r.issue}
                  </Text>
                  <Text style={[styles.td, { width: 190 }]} numberOfLines={1}>
                    {r.nums.join(' ')}
                  </Text>
                  <Text style={[styles.td, styles.cMd]}>{sumOf(r.nums)}</Text>
                  <Text style={[styles.td, styles.cMd]}>{odd}:{n - odd}</Text>
                  <Text style={[styles.td, styles.cMd]}>{big}:{n - big}</Text>
                  <Text style={[styles.td, styles.cMd]}>{prime}:{n - prime}</Text>
                </View>
              );
            })}
        </View>
      </ScrollView>
      <Spacer size={space.xs} />
      <Text style={styles.tip}>快乐8 每期 20 个号码，按整体和值与比例统计。</Text>
    </Panel>
  );
}

const styles = StyleSheet.create({
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  label: {
    color: semantic.textDim,
    fontSize: fontSize.sm,
    marginBottom: space.xs,
  },
  tr: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semantic.panelBorder,
  },
  th: {
    color: semantic.textFaint,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textAlign: 'center',
  },
  td: {
    color: semantic.text,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  dim: {
    color: semantic.textDim,
  },
  num: {
    fontWeight: '700',
    color: semantic.brand,
    letterSpacing: 1,
  },
  // 综合走势列宽
  cIssue: { width: 72 },
  cNum: { width: 56 },
  cSm: { width: 30 },
  cMd: { width: 44 },
  cRoad: { width: 46 },
  cDigit: { width: 24 },
  digitCell: {
    width: 24,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.sm,
  },
  digitCellHit: {
    backgroundColor: palette.green,
  },
  tdDigit: {
    width: 24,
    textAlign: 'center',
    color: semantic.textDim,
    fontSize: 11,
  },
  tdDigitHit: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  // 最近开奖列宽
  c1: { flex: 2, minWidth: 64 },
  c2: { flex: 1.2, minWidth: 40, textAlign: 'right' },
  c3: { flex: 3, minWidth: 90, textAlign: 'center' },
  tip: {
    color: semantic.textFaint,
    fontSize: fontSize.xs,
    lineHeight: 16,
  },
  meta: {
    color: semantic.textFaint,
    fontSize: fontSize.xs,
    flexShrink: 1,
  },
});

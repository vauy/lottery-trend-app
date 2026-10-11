/**
 * 官方复刻版（fk 分支）—— 按反编译 KLineActivity 版式 1:1 重建
 *
 * 布局（对齐官方截图与 findViewById 顺序）：
 *   顶栏   ‹ 返回 | 毒胆▾ | 彩种▾ | N期 | 奖 | ＋
 *   图表区 同屏网格（2列×0-9，每格 = 单行头「频率K 毒胆 N 概率%」+ 主图 + MACD + KDJ）
 *          点任一格 → 满屏详情（3行头 + 主图 + MACD/KDJ 带 × 折叠）
 *   面板   下拉/把手唤出：选择单个|多个指标 → 0-9 → 中出 0/1/2/3/重 → 交集|并集|选中出图|全选出图
 *   底部栏 图 | 同屏 | 详情 | 全屏 | 分屏 | 主图 | 副图 | 周期 | •••
 *
 * 明确排除（用户要求）：会员功能、体验版横幅、广告、VIP 锁。
 * 深色主题：官方配色（#262427 面板 / #027AFF 蓝 / 红涨绿跌）。
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useLotteryHistory } from '@/hooks/useLottery';
import {
  buildTargetSeries,
  getProbability,
  getTheoryMiss,
  type Target,
} from '@/lib/lottery/targets';
import { aggregate, buildBoll, lastBollTriple, type CycleAlign } from '@/components/charts/chartMath';
import { MultiPaneChart } from '@/components/charts/MultiPaneChart';
import { DEFAULT_MA } from '@/lib/charts/indicators';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/* 官方深色 token（复刻分支专用，不影响主 App 主题） */
const C = {
  bg: '#141414',
  panel: '#262427',
  border: '#3d3b3e',
  text: '#EDEFF3',
  dim: '#8e8c8f',
  blue: '#027AFF',
  red: '#E02A52',
  green: '#1DA076',
  amber: '#F2B95A',
};

const GAMES = [
  { id: 'fc3d', label: '福彩3D', V: 10, D: 3 },
  { id: 'pl3', label: '排列3', V: 10, D: 3 },
  { id: 'pl5', label: '排列5', V: 10, D: 5 },
];

const CELL_SUBS = ['macd', 'kdj'] as const;
const SUB_OPTIONS: { id: 'macd' | 'kdj' | 'rsi' | 'cci' | 'adx' | 'wr'; label: string }[] = [
  { id: 'macd', label: 'MACD' },
  { id: 'kdj', label: 'KDJ' },
  { id: 'rsi', label: 'RSI' },
  { id: 'cci', label: 'CCI' },
  { id: 'adx', label: 'ADX' },
  { id: 'wr', label: 'WR' },
];

export default function ReplicaScreen() {
  const params = useLocalSearchParams<{ gameId?: string }>();
  const [gameId, setGameId] = useState(params.gameId && params.gameId !== 'kl8' ? params.gameId : 'pl3');
  const game = GAMES.find((g) => g.id === gameId) ?? GAMES[0];
  const { width, height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const { records, loading, refresh, gameId: dataGameId } = useLotteryHistory(game.id, 500);
  const dataReady = dataGameId === game.id;

  /** 官方 singleK：true=分屏网格（竖2列），false=满屏单图 */
  const [singleK, setSingleK] = useState(true);
  const [fullIdx, setFullIdx] = useState<number | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [cmpMulti, setCmpMulti] = useState(false);
  const [cmpSel, setCmpSel] = useState<number[]>([]);
  const [cmpCount, setCmpCount] = useState<'off' | '0' | '1' | '2' | '3' | 'zhong'>('off');
  const [fullscreen, setFullscreen] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const [subs, setSubs] = useState<{ id: typeof CELL_SUBS[number] | 'rsi' | 'cci' | 'adx' | 'wr'; on: boolean }[]>([
    { id: 'macd', on: true },
    { id: 'kdj', on: true },
  ]);
  const [periodOpen, setPeriodOpen] = useState(false);
  const [period, setPeriod] = useState(1);
  const [periodInput, setPeriodInput] = useState('1');
  const [cycleAlign, setCycleAlign] = useState<CycleAlign>('left');
  const [menuIdx, setMenuIdx] = useState<number | null>(null);
  const [codesModal, setCodesModal] = useState<{ label: string; codes: string[] } | null>(null);
  const [bareK, setBareK] = useState(false);

  const activeSubs = subs.filter((s) => s.on).map((s) => s.id);
  const contentW = Math.max(240, width - 16);
  const colW = Math.floor((contentW - 8) / 2);
  const fullW = contentW;
  const availH = Math.max(300, winH - 220);
  const fullCellH = Math.round(Math.min(availH - 90, fullW * 1.25));

  /** 同屏目标：默认 0-9（毒胆），面板操作后可变为交集/并集/中出合并图 */
  const [targets, setTargets] = useState<Target[]>(
    Array.from({ length: 10 }, (_, d) => ({ kind: 'digit', digit: d, pos: 'any' }) as Target),
  );

  const digitTarget = (d: number): Target => ({ kind: 'digit', digit: d, pos: 'any' });

  /** 面板操作（口径与官方 jbjexe/中出条件一致，复用 countOfDan） */
  const doSelected = () => {
    if (cmpSel.length === 0) return;
    setTargets([...cmpSel].sort((a, b) => a - b).map(digitTarget));
    setFullIdx(null);
  };
  const doAll = () => {
    setTargets(Array.from({ length: 10 }, (_, d) => digitTarget(d)));
    setFullIdx(null);
  };
  const doUnion = () => {
    if (cmpSel.length === 0) return;
    const s = [...cmpSel].sort((a, b) => a - b);
    setTargets([{ kind: 'countOfDan', dan: s, pei: [], start: 1, end: 9, dedupe: false }]);
    setFullIdx(null);
  };
  const doIntersect = () => {
    if (cmpSel.length === 0) return;
    const s = [...cmpSel].sort((a, b) => a - b);
    setTargets([{ kind: 'countOfDan', dan: s, pei: [], start: s.length, end: s.length, dedupe: true }]);
    setFullIdx(null);
  };
  const doCount = (v: '0' | '1' | '2' | '3' | 'zhong') => {
    if (cmpSel.length === 0) return;
    const s = [...cmpSel].sort((a, b) => a - b);
    const [start, end, dedupe] =
      v === '0' ? [0, 0, false]
      : v === '1' ? [1, 1, false]
      : v === '2' ? [2, 2, false]
      : v === '3' ? [3, 3, false]
      : [s.length, s.length, true];
    setTargets([{ kind: 'countOfDan', dan: s, pei: [], start, end, dedupe }]);
    setFullIdx(null);
  };

  const cellCodes = (d: number) => {
    const out: string[] = [];
    const rec = (i: number, cur: number[]) => {
      if (i === game.D) {
        if (cur.includes(d)) out.push(cur.join(''));
        return;
      }
      for (let x = 0; x <= 9; x += 1) rec(i + 1, [...cur, x]);
    };
    rec(0, []);
    return out;
  };

  const renderCell = (ct: Target, idx: number, w: number, full: boolean) => {
    const s = useMemoCell(records, ct, game.V, game.D, full);
    const prob = getProbability(ct, game.V, game.D);
    const tMiss = getTheoryMiss(ct, game.V, game.D);
    const lastOm = s.length > 0 ? s[s.length - 1].omission : 0;
    const bars = aggregate(s, period, cycleAlign);
    const cv = bars.map((b) => b.c);
    const bl = cv.length >= 2 ? buildBoll(cv, Math.min(20, Math.max(2, cv.length)), 2) : null;
    const tri = bl ? lastBollTriple(bl) : null;
    const fmt = (v?: number) => (v === undefined ? '—' : v.toFixed(1));
    const cellH = full
      ? Math.round(Math.min(availH - 110, w * 1.25))
      : Math.round(Math.min(300, Math.max(220, w * 0.9)));
    return (
      <View style={[st.cell, { width: w }]}>
        {full ? (
          <>
            <View style={st.rowBetween}>
              <Text style={st.cellTitle} numberOfLines={1}>{`毒胆 ${idx} · 直选${cellCodes(idx).length}注`}</Text>
              <Pressable style={st.moreBtn} onPress={() => setMenuIdx(menuIdx === idx ? null : idx)}>
                <Text style={st.moreTxt}>更多</Text>
              </Pressable>
            </View>
            <View style={st.rowBetween}>
              <Text style={st.modeTxt}>{`频率K${period > 1 ? `(${period})` : ''} ▾`}</Text>
              <Text style={st.triTxt} numberOfLines={1}>
                {tri ? `上轨 ${fmt(tri.upper)} 中轨 ${fmt(tri.mid)} 下轨 ${fmt(tri.lower)}` : ''}
              </Text>
              <Pressable onPress={() => setCodesModal({ label: `毒胆 ${idx}`, codes: cellCodes(idx).slice(0, 400) })}>
                <Text style={st.viewTxt}>查看号码</Text>
              </Pressable>
            </View>
            <Text style={st.infoTxt} numberOfLines={1}>
              {`理论周期:${tMiss.toFixed(2)} 当前遗漏:${lastOm} 概率:${(prob * 100).toFixed(1)}%`}
            </Text>
          </>
        ) : (
          <Pressable style={st.rowBetween} onPress={() => setFullIdx(idx)}>
            <Text style={st.cellTitle} numberOfLines={1}>{`频率K 毒胆 ${idx} ${(prob * 100).toFixed(1)}%`}</Text>
            <View style={st.circle} />
          </Pressable>
        )}
        <Pressable onPress={() => (full ? setFullIdx(null) : setFullIdx(idx))}>
          <MultiPaneChart
            bars={bars}
            maConfigs={bareK ? [] : DEFAULT_MA}
            showBoll={!bareK}
            indicators={[...activeSubs] as ('macd' | 'kdj' | 'rsi' | 'cci' | 'adx' | 'wr')[]}
            height={cellH}
            width={w}
            subToggle={full}
          />
        </Pressable>
        {full && menuIdx === idx && (
          <View style={st.menu}>
            {['号码', '复制', '加入缩水', '分割', '等分', '二阶'].map((k) => (
              <Pressable
                key={k}
                style={st.menuItem}
                onPress={async () => {
                  setMenuIdx(null);
                  if (k === '号码') setCodesModal({ label: `毒胆 ${idx}`, codes: cellCodes(idx).slice(0, 400) });
                  else if (k === '复制') await Clipboard.setStringAsync(cellCodes(idx).join(' '));
                  else if (k === '加入缩水') router.push({ pathname: '/(tabs)/shrink', params: {} });
                  else AlertNoImpl(k);
                }}
              >
                <Text style={st.menuTxt}>{k}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    );
  };

  const list = records.slice(-80);
  const gridCols = singleK ? 2 : 1;

  return (
    <SafeAreaView style={[st.root, { paddingTop: insets.top }]} edges={['top']}>
      {/* ── 顶栏 ── */}
      <View style={st.topbar}>
        <Pressable onPress={() => router.back()}><Text style={st.topTxt}>‹</Text></Pressable>
        <Text style={st.topTxt}>毒胆 ▾</Text>
        <Text style={st.topGame}>{game.label} ▾</Text>
        <Text style={st.topDim}>{records.length}期</Text>
        <Text style={st.topTxt}>奖</Text>
        <Text style={st.topTxt}>＋</Text>
      </View>

      {/* ── 图表区 ── */}
      <ScrollView
        style={st.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setPanelOpen(true);
              setRefreshing(false);
              void refresh();
            }}
            tintColor={C.dim}
          />
        }
      >
        {/* 下拉面板（对齐官方 XRecyclerView HeaderView） */}
        {panelOpen && (
          <View style={st.panel}>
            <View style={st.panelTabs}>
              <Pressable style={[st.panelTab, !cmpMulti && st.panelTabOn]} onPress={() => setCmpMulti(false)}>
                <Text style={[st.panelTabTxt, !cmpMulti && st.panelTabTxtOn]}>选择单个指标</Text>
              </Pressable>
              <Pressable style={[st.panelTab, cmpMulti && st.panelTabOn]} onPress={() => setCmpMulti(true)}>
                <Text style={[st.panelTabTxt, cmpMulti && st.panelTabTxtOn]}>选择多个指标</Text>
              </Pressable>
              <Pressable onPress={() => setPanelOpen(false)}>
                <Text style={st.panelTabTxt}>收起 ▴</Text>
              </Pressable>
            </View>
            <View style={st.digitGrid}>
              {Array.from({ length: 10 }, (_, d) => (
                <Pressable
                  key={d}
                  style={[st.digitCell, cmpSel.includes(d) && st.digitCellOn]}
                  onPress={() => {
                    if (cmpMulti) setCmpSel((v) => (v.includes(d) ? v.filter((x) => x !== d) : [...v, d]));
                    else {
                      setTargets([digitTarget(d)]);
                      setFullIdx(null);
                      setPanelOpen(false);
                    }
                  }}
                >
                  <Text style={[st.digitTxt, cmpSel.includes(d) && st.digitTxtOn]}>{d}</Text>
                </Pressable>
              ))}
            </View>
            {cmpMulti && (
              <>
                <View style={st.chipRow}>
                  <Text style={st.dimTxt}>中出</Text>
                  {([['0', '0'], ['1', '1'], ['2', '2'], ['3', '3'], ['zhong', '重']] as const).map(([v, l]) => (
                    <Pressable
                      key={v}
                      style={[st.chip, cmpCount === v && st.chipOn]}
                      onPress={() => {
                        const nv = cmpCount === v ? 'off' : v;
                        setCmpCount(nv as typeof cmpCount);
                        if (nv !== 'off') doCount(nv as '0' | '1' | '2' | '3' | 'zhong');
                      }}
                    >
                      <Text style={[st.chipTxt, cmpCount === v && st.chipTxtOn]}>{l}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={st.chipRow}>
                  {[
                    ['交集', doIntersect],
                    ['并集', doUnion],
                    ['选中出图', doSelected],
                    ['全选出图', doAll],
                  ].map(([l, fn]) => (
                    <Pressable key={l as string} style={st.chip} onPress={fn as () => void}>
                      <Text style={st.chipTxt}>{l as string}</Text>
                    </Pressable>
                  ))}
                  <Pressable style={st.chip} onPress={() => setCmpSel([])}>
                    <Text style={st.chipTxt}>清</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        )}

        {loading || !dataReady ? (
          <View style={st.center}><ActivityIndicator color={C.blue} /><Text style={st.dimTxt}>加载中…</Text></View>
        ) : (
          <View style={[st.grid, gridCols === 2 && st.gridMulti]}>
            {targets.map((ct, idx) => (
              <View key={`${idx}-${ct.kind}`}>
                {renderCell(ct, idx, singleK ? colW : fullW, fullIdx === idx || (!singleK && targets.length === 1))}
              </View>
            ))}
          </View>
        )}
        <View style={{ height: 90 }} />
      </ScrollView>

      {/* ── 底部栏（官方顺序） ── */}
      {!fullscreen && (
        <View style={[st.bottombar, { paddingBottom: insets.bottom + 4 }]}>
          <View style={st.barRow}>
            {([
              ['图', () => setBareK((v) => !v), bareK],
              ['同屏', () => { setSingleK(true); setFullIdx(null); doAll(); }, singleK && targets.length === 10],
              ['详情', () => { setFullIdx((v) => (v === null ? 0 : null)); }, fullIdx !== null],
              ['全屏', () => setFullscreen((v) => !v), fullscreen],
              ['分屏', () => setSingleK((v) => !v), singleK],
            ] as [string, () => void, boolean][]).map(([l, fn, on]) => (
              <Pressable key={l} style={[st.barBtn, on && st.barBtnOn]} onPress={fn}>
                <Text style={[st.barTxt, on && st.barTxtOn]}>{l}</Text>
              </Pressable>
            ))}
          </View>
          <View style={st.barRow}>
            <Pressable style={[st.barBtn, !bareK && st.barBtnOn]} onPress={() => setBareK(false)}>
              <Text style={[st.barTxt, !bareK && st.barTxtOn]}>主图</Text>
            </Pressable>
            <Pressable style={[st.barBtn, subOpen && st.barBtnOn]} onPress={() => setSubOpen((v) => !v)}>
              <Text style={[st.barTxt, subOpen && st.barTxtOn]}>副图</Text>
            </Pressable>
            <Pressable style={st.barBtn} onPress={() => { setPeriodOpen(true); setPeriodInput(String(period)); }}>
              <Text style={st.barTxt}>{period > 1 ? `周期${period}` : '周期'}</Text>
            </Pressable>
            <Pressable style={st.barBtn} onPress={() => setPanelOpen((v) => !v)}>
              <Text style={st.barTxt}>•••</Text>
            </Pressable>
          </View>
          {subOpen && (
            <View style={st.chipRow}>
              {SUB_OPTIONS.map((o) => {
                const on = subs.some((s) => s.id === o.id && s.on);
                return (
                  <Pressable
                    key={o.id}
                    style={[st.chip, on && st.chipOn]}
                    onPress={() =>
                      setSubs((v) => {
                        const has = v.some((s) => s.id === o.id);
                        if (!has) return [...v.filter((s) => s.on).slice(0, 1), { id: o.id, on: true }];
                        return v.map((s) => (s.id === o.id ? { ...s, on: !s.on } : s));
                      })
                    }
                  >
                    <Text style={[st.chipTxt, on && st.chipTxtOn]}>{o.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      )}

      {/* ── 周期弹窗 ── */}
      <Modal visible={periodOpen} transparent animationType="fade" onRequestClose={() => setPeriodOpen(false)}>
        <Pressable style={st.mask} onPress={() => setPeriodOpen(false)}>
          <View style={[st.panel, { width: 280 }]}>
            <Text style={st.panelTitle}>周期</Text>
            <View style={st.digitGrid}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((p) => (
                <Pressable key={p} style={[st.digitCell, period === p && st.digitCellOn]} onPress={() => { setPeriod(p); setPeriodInput(String(p)); }}>
                  <Text style={[st.digitTxt, period === p && st.digitTxtOn]}>{p}</Text>
                </Pressable>
              ))}
            </View>
            <View style={st.rowBetween}>
              <Text style={st.dimTxt}>自定义</Text>
              <TextInput
                value={periodInput}
                onChangeText={setPeriodInput}
                keyboardType="numeric"
                style={st.input}
                placeholder="如 15"
                placeholderTextColor={C.dim}
              />
              <Pressable
                style={[st.chip, st.chipOn]}
                onPress={() => {
                  const n = parseInt(periodInput, 10);
                  if (!Number.isNaN(n) && n >= 1 && n <= 500) setPeriod(n);
                  setPeriodOpen(false);
                }}
              >
                <Text style={st.chipTxtOn}>确定</Text>
              </Pressable>
            </View>
            {period > 1 && (
              <View style={st.chipRow}>
                {([['left', '左对齐·开奖首期基准'], ['right', '右对齐·投注期基准']] as const).map(([v, l]) => (
                  <Pressable key={v} style={[st.chip, cycleAlign === v && st.chipOn]} onPress={() => setCycleAlign(v)}>
                    <Text style={[st.chipTxt, cycleAlign === v && st.chipTxtOn]}>{l}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* ── 查看号码 ── */}
      <Modal visible={codesModal !== null} transparent animationType="fade" onRequestClose={() => setCodesModal(null)}>
        <Pressable style={st.mask} onPress={() => setCodesModal(null)}>
          <View style={[st.panel, { width: 320, maxHeight: '70%' }]}>
            <Text style={st.panelTitle}>{codesModal?.label} · {codesModal?.codes.length}注</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={st.codesTxt}>{codesModal?.codes.join(' ')}</Text>
            </ScrollView>
            <Pressable
              style={[st.chip, st.chipOn, { alignSelf: 'flex-end' }]}
              onPress={async () => {
                if (codesModal) await Clipboard.setStringAsync(codesModal.codes.join(' '));
                setCodesModal(null);
              }}
            >
              <Text style={st.chipTxtOn}>复制全部</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

/** 单元格序列 memo 替身（replica 屏内轻量缓存：records 引用不变时复用） */
const cellCache = new Map<string, ReturnType<typeof buildTargetSeries>>();
function useMemoCell(
  records: ReturnType<typeof useLotteryHistory>['records'],
  ct: Target,
  V: number,
  D: number,
  full: boolean,
) {
  const sliceN = Math.min(records.length, full ? 160 : 80);
  const key = `${ct.kind}-${JSON.stringify('dan' in ct ? ct.dan : 'digit' in ct ? ct.digit : 'other')}-${sliceN}-${records.length}-${records[0]?.issue ?? ''}`;
  const hit = cellCache.get(key);
  if (hit) return hit;
  const s = buildTargetSeries(records.slice(-sliceN), ct, V, D);
  if (cellCache.size > 40) cellCache.clear();
  cellCache.set(key, s);
  return s;
}

function AlertNoImpl(k: string) {
  // 分割 / 等分 / 二阶：占位（下一轮接 MultiPaneChart overlay 与二阶遗漏）
  console.log(`[replica] ${k} 规划中`);
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 12,
    height: 44,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  topTxt: { color: C.text, fontSize: 15 },
  topGame: { color: C.text, fontSize: 15, fontWeight: '700' },
  topDim: { color: C.dim, fontSize: 13, marginLeft: 'auto' },
  scroll: { flex: 1 },
  center: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  grid: { flexDirection: 'column', gap: 8, paddingHorizontal: 8 },
  gridMulti: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  cell: {
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    padding: 4,
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cellTitle: { color: C.text, fontSize: 12, fontWeight: '700', flex: 1 },
  modeTxt: { color: C.blue, fontSize: 11, fontWeight: '700' },
  triTxt: { color: C.dim, fontSize: 10, flex: 1, textAlign: 'center' },
  viewTxt: { color: C.dim, fontSize: 11 },
  infoTxt: { color: C.amber, fontSize: 11, marginTop: 1 },
  moreBtn: { backgroundColor: C.border, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 },
  moreTxt: { color: C.text, fontSize: 11 },
  circle: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: C.dim },
  menu: {
    position: 'absolute',
    right: 4,
    top: 30,
    zIndex: 30,
    elevation: 30,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    minWidth: 92,
  },
  menuItem: { paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  menuTxt: { color: C.text, fontSize: 13 },
  panel: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 8, margin: 8 },
  panelTabs: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  panelTab: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 4, borderWidth: 1, borderColor: C.border },
  panelTabOn: { borderColor: C.blue },
  panelTabTxt: { color: C.dim, fontSize: 12 },
  panelTabTxtOn: { color: C.blue, fontWeight: '700' },
  panelTitle: { color: C.text, fontSize: 14, fontWeight: '700', marginBottom: 8 },
  digitGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  digitCell: {
    width: 44,
    alignItems: 'center',
    paddingVertical: 8,
    backgroundColor: '#1c1a1d',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 4,
  },
  digitCellOn: { borderColor: C.blue, backgroundColor: '#12233f' },
  digitTxt: { color: C.text, fontSize: 14 },
  digitTxtOn: { color: C.blue, fontWeight: '700' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 4, borderWidth: 1, borderColor: C.border },
  chipOn: { borderColor: C.blue, backgroundColor: '#12233f' },
  chipTxt: { color: C.dim, fontSize: 12 },
  chipTxtOn: { color: C.blue, fontWeight: '700' },
  dimTxt: { color: C.dim, fontSize: 12 },
  input: {
    minWidth: 70,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 4,
    color: C.text,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 13,
  },
  codesTxt: { color: C.text, fontSize: 12, lineHeight: 20 },
  bottombar: {
    backgroundColor: C.panel,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingHorizontal: 6,
    paddingTop: 4,
  },
  barRow: { flexDirection: 'row', gap: 4, justifyContent: 'space-around' },
  barBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 4 },
  barBtnOn: { backgroundColor: '#12233f' },
  barTxt: { color: C.dim, fontSize: 13 },
  barTxtOn: { color: C.blue, fontWeight: '700' },
  mask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
});

/**
 * 组号缩水页。
 */
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { generateDanTuo } from '@/lib/lottery/danTuo';
import { applyFilters, emptyFilters, isFilterEmpty, type Filters } from '@/lib/lottery/filters';

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const SUM_RANGE = Array.from({ length: 28 }, (_, i) => i);
const BMS_KEYS = [
  '3大', '2大1中', '2大1小', '1大2中', '1大1中1小',
  '1大2小', '3中', '2中1小', '1中2小', '3小',
];
const PAIR2_KEYS: string[] = [];
for (let i = 0; i <= 9; i += 1) {
  for (let j = i; j <= 9; j += 1) {
    PAIR2_KEYS.push(`${i}${j}`);
  }
}

function classify(codes: string[]): { zusan: string[]; zuliu: string[] } {
  const zusan: string[] = [];
  const zuliu: string[] = [];
  for (const c of codes) {
    const uniq = new Set(c.split(''));
    if (uniq.size === 3) zuliu.push(c);
    else zusan.push(c);
  }
  return { zusan, zuliu };
}

export default function ShrinkScreen() {
  const [dan, setDan] = useState<number[]>([]);
  const [tuo, setTuo] = useState<number[]>([]);
  const [filters, setFilters] = useState<Filters>(emptyFilters());
  const [showFilters, setShowFilters] = useState(true);
  const [showZhixuan, setShowZhixuan] = useState(true);
  const [showZuxuan, setShowZuxuan] = useState(true);
  const [filterInput, setFilterInput] = useState('');

  const rawResult = useMemo(() => {
    if (dan.length === 0) {
      const zhixuan: string[] = [];
      for (let a = 0; a <= 9; a += 1) for (let b = 0; b <= 9; b += 1) for (let c = 0; c <= 9; c += 1)
        zhixuan.push(`${a}${b}${c}`);
      const zuxuanSet = new Set<string>();
      for (const x of zhixuan) zuxuanSet.add([...x].sort().join(''));
      return { zhixuan, zuxuan: Array.from(zuxuanSet).sort() };
    }
    return generateDanTuo(dan, tuo);
  }, [dan, tuo]);

  const result = useMemo(() => {
    const zhixuan = applyFilters(rawResult.zhixuan, filters);
    const zuxuanSet = new Set<string>();
    for (const c of zhixuan) zuxuanSet.add([...c].sort().join(''));
    return { zhixuan, zuxuan: Array.from(zuxuanSet).sort() };
  }, [rawResult, filters]);

  const zx = useMemo(() => classify(result.zhixuan), [result.zhixuan]);
  const zux = useMemo(() => classify(result.zuxuan), [result.zuxuan]);

  const toggleDan = (d: number) => setDan((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]));
  const toggleTuo = (d: number) => setTuo((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]));
  const reset = () => { setDan([]); setTuo([]); setFilters(emptyFilters()); setFilterInput(''); };

  const copy = async (text: string, tag: string) => {
    if (!text) return Alert.alert('没有可复制内容');
    try {
      await Clipboard.setStringAsync(text);
      Alert.alert('已复制', `${tag} · ${text.split(/\s+/).filter(Boolean).length} 注`);
    } catch { Alert.alert('复制失败'); }
  };

  const parseExternal = (raw: string): string[] =>
    raw.split(/[\s,]+/).map((s) => s.trim()).filter((s) => /^\d{3}$/.test(s));

  const applyIntersection = () => {
    const ext = new Set(parseExternal(filterInput));
    if (ext.size === 0) return Alert.alert('外部集合为空');
    const hit = result.zuxuan.filter((c) => ext.has(c));
    Alert.alert('交集结果', `保留 ${hit.length} 注`);
    setFilterInput(hit.join(' '));
  };
  const applyDifference = () => {
    const ext = new Set(parseExternal(filterInput));
    if (ext.size === 0) return Alert.alert('外部集合为空');
    const rest = result.zuxuan.filter((c) => !ext.has(c));
    Alert.alert('差集结果', `保留 ${rest.length} 注`);
    setFilterInput(rest.join(' '));
  };

  const onChart = () => {
    const codes = result.zhixuan.join(',');
    if (!codes) return Alert.alert('直选为空');
    router.push({ pathname: '/(tabs)/analyze', params: { codes, mode: 'zhixuan' } });
  };

  const btn = (active: boolean) =>
    `rounded items-center justify-center ${active ? 'bg-accent' : 'bg-surface-secondary border border-border'}`;
  const txt = (active: boolean) =>
    `font-bold ${active ? 'text-accent-foreground' : 'text-muted'}`;

  const toggleArr = (key: keyof Filters, v: number) => {
    setFilters((p) => {
      const arr = p[key] as number[];
      return { ...p, [key]: arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v] };
    });
  };
  const toggleStrArr = (key: keyof Filters, v: string) => {
    setFilters((p) => {
      const arr = p[key] as string[];
      return { ...p, [key]: arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v] };
    });
  };

  // 通用：「标签 + 数字按钮 0-9」行
  const numRow = (
    label: string,
    key: keyof Filters,
    labelWidth = 36,
    btnW = 24,
    btnH = 24,
    fontSize = 10,
  ) => {
    const arr = filters[key] as number[];
    return (
      <View className="flex-row items-center flex-wrap gap-1 mb-1">
        <Text className="text-xs text-muted" style={{ width: labelWidth }}>{label}</Text>
        {DIGITS.map((d) => {
          const active = arr.includes(d);
          return (
            <Pressable key={d} onPress={() => toggleArr(key, d)}
              className={btn(active)} style={{ width: btnW, height: btnH }}>
              <Text className={`text-[${fontSize}px] ${txt(active)}`}>{d}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  };

  // 通用：「标签 + 组合按钮」行
  const chipRow = <T extends number | string>(
    label: string,
    key: keyof Filters,
    options: { v: T; label: string }[],
  ) => {
    const arr = filters[key] as T[];
    return (
      <View className="flex-row items-center flex-wrap gap-1 mb-1">
        <Text className="text-xs text-muted" style={{ width: 36 }}>{label}</Text>
        {options.map((o) => {
          const active = arr.includes(o.v);
          const onPress = typeof o.v === 'number' ? () => toggleArr(key, o.v as number) : () => toggleStrArr(key, o.v as string);
          return (
            <Pressable key={String(o.v)} onPress={onPress} className={btn(active)}
              style={{ paddingHorizontal: 8, height: 26 }}>
              <Text className={`text-[11px] ${txt(active)}`}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  };

  // ============ 卡片渲染 ============
  const cardHeader = (title: string, onClear: () => void) => (
    <View className="flex-row items-center justify-between mb-2">
      <Text className="text-xs text-muted">{title}</Text>
      <Pressable onPress={onClear}><Text className="text-[10px] text-accent font-bold">清</Text></Pressable>
    </View>
  );

  const renderPosFilter = () => (
    <View className="bg-white rounded-xl border border-border p-3 mb-2">
      <Text className="text-xs text-muted mb-2">定位（默认全选，点击取消）</Text>
      {([
        { label: '百位', key: 'posBai' as const },
        { label: '十位', key: 'posShi' as const },
        { label: '个位', key: 'posGe' as const },
      ] as const).map(({ label, key }) => {
        const allSelected = filters[key].length === 10;
        return (
          <View key={key} className="flex-row items-center flex-wrap gap-1 mb-2">
            <Text className="text-xs text-muted" style={{ width: 30 }}>{label}</Text>
            {DIGITS.map((d) => {
              const active = filters[key].includes(d);
              return (
                <Pressable key={d} onPress={() => toggleArr(key, d)}
                  className={btn(active)} style={{ width: 26, height: 26 }}>
                  <Text className={`text-[11px] ${txt(active)}`}>{d}</Text>
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => setFilters((p) => ({ ...p, [key]: allSelected ? [] : [...DIGITS] }))}
              className={`rounded items-center justify-center ${allSelected ? 'bg-accent' : 'bg-surface-secondary border border-border'}`}
              style={{ width: 30, height: 26 }}>
              <Text className={`text-[11px] font-bold ${allSelected ? 'text-accent-foreground' : 'text-muted'}`}>全</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );

  const renderDanCountFilter = () => {
    const rows = [[0, 1, 2, 3, 4], [5, 6, 7, 8, 9]];
    return (
      <View className="bg-white rounded-xl border border-border p-3 mb-2">
        {cardHeader('胆码出现次数（0-3，不限=不筛）', () => {
          const nc: Record<number, number | null> = {};
          for (let i = 0; i <= 9; i += 1) nc[i] = null;
          setFilters((p) => ({ ...p, danCount: nc }));
        })}
        {rows.map((row, ri) => (
          <View key={ri} className="flex-row items-center gap-1 mb-2">
            {row.map((d) => (
              <View key={d} className="flex-1 items-center">
                <Text className="text-sm font-bold text-foreground mb-1">{d}</Text>
                <Pressable
                  onPress={() => setFilters((p) => ({ ...p, danCount: { ...p.danCount, [d]: null } }))}
                  className={btn(filters.danCount[d] === null)}
                  style={{ width: '100%', height: 22, marginBottom: 2 }}>
                  <Text className={`text-[10px] ${txt(filters.danCount[d] === null)}`}>不限</Text>
                </Pressable>
                <View className="flex-row gap-0.5" style={{ width: '100%' }}>
                  {[0, 1, 2, 3].map((cnt) => (
                    <Pressable key={cnt}
                      onPress={() => setFilters((p) => ({ ...p, danCount: { ...p.danCount, [d]: cnt } }))}
                      className={`flex-1 rounded items-center justify-center ${filters.danCount[d] === cnt ? 'bg-accent' : 'bg-surface-secondary border border-border'}`}
                      style={{ height: 20 }}>
                      <Text className={`text-[10px] font-bold ${filters.danCount[d] === cnt ? 'text-accent-foreground' : 'text-muted'}`}>{cnt}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  };

  // 形态卡（大小 / 单双 / 质合 / 大中小）
  const renderFormCard = () => (
    <View className="bg-white rounded-xl border border-border p-3 mb-2">
      {cardHeader('形态（可多选，不选=不限）', () =>
        setFilters((p) => ({ ...p, bigSmall: [], oddEven: [], primeCount: [], bmsKey: [] })))}
      <View className="flex-row items-center gap-3 mb-2">
        {chipRow('大小', 'bigSmall', [
          { v: 3, label: '3大' }, { v: 2, label: '2大1小' }, { v: 1, label: '1大2小' }, { v: 0, label: '3小' },
        ])}
        {chipRow('单双', 'oddEven', [
          { v: 3, label: '3单' }, { v: 2, label: '2单1双' }, { v: 1, label: '1单2双' }, { v: 0, label: '3双' },
        ])}
      </View>
      {chipRow('质合', 'primeCount', [
        { v: 3, label: '3质' }, { v: 2, label: '2质1合' }, { v: 1, label: '1质2合' }, { v: 0, label: '3合' },
      ])}
      {chipRow('大中小', 'bmsKey', BMS_KEYS.map((k) => ({ v: k, label: k })))}
    </View>
  );

  const renderZuiShuCard = () => (
    <View className="bg-white rounded-xl border border-border p-3 mb-2">
      {cardHeader('最数（可多选，不选=不限）', () =>
        setFilters((p) => ({ ...p, minNum: [], midNum: [], maxNum: [] })))}
      {numRow('最小', 'minNum')}
      {numRow('中间', 'midNum')}
      {numRow('最大', 'maxNum')}
    </View>
  );

  const renderSumCard = () => (
    <View className="bg-white rounded-xl border border-border p-3 mb-2">
      {cardHeader('和值（0-27，可多选）', () => setFilters((p) => ({ ...p, sum: [] })))}
      <View className="flex-row flex-wrap gap-1">
        {SUM_RANGE.map((v) => {
          const active = filters.sum.includes(v);
          return (
            <Pressable key={v} onPress={() => toggleArr('sum', v)}
              className={btn(active)} style={{ width: 26, height: 24 }}>
              <Text className={`text-[10px] ${txt(active)}`}>{v}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const renderSumTailSpanCard = () => (
    <View className="bg-white rounded-xl border border-border p-3 mb-2">
      {cardHeader('和值尾 / 跨度', () => setFilters((p) => ({ ...p, sumTail: [], span: [] })))}
      {numRow('和值尾', 'sumTail')}
      {numRow('跨度', 'span')}
    </View>
  );

  const renderSpecialCard = () => (
    <View className="bg-white rounded-xl border border-border p-3 mb-2">
      {cardHeader('特殊形态（连号 / 成对 / 012路）', () =>
        setFilters((p) => ({ ...p, lianhao: [], pair: [], road0: [], road1: [], road2: [] })))}
      {chipRow('连号', 'lianhao', [
        { v: 0, label: '无连' }, { v: 2, label: '二连' }, { v: 3, label: '三连' },
      ])}
      {chipRow('成对', 'pair', [
        { v: 0, label: '无' }, { v: 3, label: '组三' }, { v: 9, label: '豹子' },
      ])}
      {chipRow('0路个数', 'road0', [0, 1, 2, 3].map((v) => ({ v, label: String(v) })))}
      {chipRow('1路个数', 'road1', [0, 1, 2, 3].map((v) => ({ v, label: String(v) })))}
      {chipRow('2路个数', 'road2', [0, 1, 2, 3].map((v) => ({ v, label: String(v) })))}
    </View>
  );

  const renderTwoMaCard = () => (
    <View className="bg-white rounded-xl border border-border p-3 mb-2">
      {cardHeader('两码（可多选）', () =>
        setFilters((p) => ({ ...p, twoSumTail: [], twoDiff: [], pair2: [] })))}
      <Text className="text-xs text-muted mb-1">两码和尾（号码包含任一）</Text>
      <View className="flex-row flex-wrap gap-1 mb-2">
        {DIGITS.map((d) => {
          const active = filters.twoSumTail.includes(d);
          return (
            <Pressable key={`ts-${d}`} onPress={() => toggleArr('twoSumTail', d)}
              className={btn(active)} style={{ width: 24, height: 24 }}>
              <Text className={`text-[10px] ${txt(active)}`}>{d}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text className="text-xs text-muted mb-1">两码差（号码包含任一）</Text>
      <View className="flex-row flex-wrap gap-1 mb-2">
        {DIGITS.map((d) => {
          const active = filters.twoDiff.includes(d);
          return (
            <Pressable key={`td-${d}`} onPress={() => toggleArr('twoDiff', d)}
              className={btn(active)} style={{ width: 24, height: 24 }}>
              <Text className={`text-[10px] ${txt(active)}`}>{d}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text className="text-xs text-muted mb-1">不定位两码（号码同时包含这两位）</Text>
      <View className="flex-row flex-wrap gap-1">
        {PAIR2_KEYS.map((k) => {
          const active = filters.pair2.includes(k);
          return (
            <Pressable key={`p2-${k}`} onPress={() => toggleStrArr('pair2', k)}
              className={btn(active)} style={{ width: 30, height: 24 }}>
              <Text className={`text-[10px] ${txt(active)}`}>{k}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  return (
    <Screen safeAreaEdges={['top', 'left', 'right']}>
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 12, paddingBottom: 24 }}>
        {/* 胆码 */}
        <View className="bg-white rounded-xl border border-border p-3 mb-2">
          <Text className="text-xs text-muted mb-2">胆码（不选=全选 1000 注，可多选）</Text>
          <View className="flex-row flex-wrap gap-1.5">
            {DIGITS.map((d) => {
              const active = dan.includes(d);
              return (
                <Pressable key={d} onPress={() => toggleDan(d)} className={btn(active)}
                  style={{ width: 36, height: 36 }}>
                  <Text className={`text-sm ${txt(active)}`}>{d}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* 拖码 */}
        <View className="bg-white rounded-xl border border-border p-3 mb-2">
          <Text className="text-xs text-muted mb-2">拖码（可选，用来补位）</Text>
          <View className="flex-row flex-wrap gap-1.5">
            {DIGITS.map((d) => {
              const active = tuo.includes(d);
              return (
                <Pressable key={d} onPress={() => toggleTuo(d)} className={btn(active)}
                  style={{ width: 36, height: 36 }}>
                  <Text className={`text-sm ${txt(active)}`}>{d}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* 筛选开关 */}
        <View className="flex-row items-center gap-2 mb-2">
          <Pressable onPress={() => setShowFilters((v) => !v)} className={btn(showFilters)}
            style={{ paddingHorizontal: 10, height: 28 }}>
            <Text className={`text-xs ${txt(showFilters)}`}>{showFilters ? '▼' : '▶'} 筛选条件</Text>
          </Pressable>
          {!isFilterEmpty(filters) && (
            <Pressable onPress={() => setFilters(emptyFilters())} className={btn(false)}
              style={{ paddingHorizontal: 10, height: 28 }}>
              <Text className="text-xs text-foreground">清除所有筛选</Text>
            </Pressable>
          )}
        </View>

        {showFilters && (
          <>
            {renderPosFilter()}
            {renderDanCountFilter()}
            {renderFormCard()}
            {renderZuiShuCard()}
            {renderSumCard()}
            {renderSumTailSpanCard()}
            {renderSpecialCard()}
            {renderTwoMaCard()}
          </>
        )}

        {/* 摘要 */}
        <View className="bg-white rounded-xl border border-border p-3 mb-2">
          <Text className="text-sm font-semibold text-foreground mb-1">
            胆码：{dan.length > 0 ? dan.join(' ') : '（未选）'}
          </Text>
          <Text className="text-sm font-semibold text-foreground mb-2">
            拖码：{tuo.length > 0 ? tuo.join(' ') : '（未选）'}
          </Text>
          {(() => {
            const lines: string[] = [];
            const danActive = Object.entries(filters.danCount)
              .filter(([, v]) => v !== null).map(([d, v]) => `${d}出现${v}次`);
            if (danActive.length > 0) lines.push(`胆码出次：${danActive.join('、')}`);
            if (filters.bigSmall.length > 0) {
              const m: Record<number, string> = { 3: '3大', 2: '2大1小', 1: '1大2小', 0: '3小' };
              lines.push(`大小：${filters.bigSmall.map((v) => m[v]).join('、')}`);
            }
            if (filters.oddEven.length > 0) {
              const m: Record<number, string> = { 3: '3单', 2: '2单1双', 1: '1单2双', 0: '3双' };
              lines.push(`单双：${filters.oddEven.map((v) => m[v]).join('、')}`);
            }
            if (filters.primeCount.length > 0) {
              const m: Record<number, string> = { 3: '3质', 2: '2质1合', 1: '1质2合', 0: '3合' };
              lines.push(`质合：${filters.primeCount.map((v) => m[v]).join('、')}`);
            }
            if (filters.bmsKey.length > 0) lines.push(`大中小：${filters.bmsKey.join('、')}`);
            if (filters.minNum.length > 0) lines.push(`最小：${filters.minNum.join('、')}`);
            if (filters.midNum.length > 0) lines.push(`中间：${filters.midNum.join('、')}`);
            if (filters.maxNum.length > 0) lines.push(`最大：${filters.maxNum.join('、')}`);
            if (filters.sum.length > 0) lines.push(`和值：${filters.sum.join('、')}`);
            if (filters.sumTail.length > 0) lines.push(`和值尾：${filters.sumTail.join('、')}`);
            if (filters.span.length > 0) lines.push(`跨度：${filters.span.join('、')}`);
            if (filters.lianhao.length > 0) {
              const m: Record<number, string> = { 0: '无连', 2: '二连', 3: '三连' };
              lines.push(`连号：${filters.lianhao.map((v) => m[v]).join('、')}`);
            }
            if (filters.pair.length > 0) {
              const m: Record<number, string> = { 0: '无', 3: '组三', 9: '豹子' };
              lines.push(`成对：${filters.pair.map((v) => m[v]).join('、')}`);
            }
            if (filters.road0.length > 0) lines.push(`0路：${filters.road0.join('、')}个`);
            if (filters.road1.length > 0) lines.push(`1路：${filters.road1.join('、')}个`);
            if (filters.road2.length > 0) lines.push(`2路：${filters.road2.join('、')}个`);
            if (filters.twoSumTail.length > 0) lines.push(`两码和尾：${filters.twoSumTail.join('、')}`);
            if (filters.twoDiff.length > 0) lines.push(`两码差：${filters.twoDiff.join('、')}`);
            if (filters.pair2.length > 0) lines.push(`不定位两码：${filters.pair2.join('、')}`);

            if (lines.length === 0) return null;
            return (
              <View className="mb-2 pb-2 border-b border-border">
                {lines.map((l, i) => (
                  <Text key={i} className="text-xs text-foreground mb-0.5">· {l}</Text>
                ))}
              </View>
            );
          })()}
          <Text className="text-xs text-muted mb-0.5">
            {isFilterEmpty(filters)
              ? `直选 ${result.zhixuan.length} 注 · 组选 ${result.zuxuan.length} 注`
              : `原始 ${rawResult.zhixuan.length} 注 → 筛选后 直选 ${result.zhixuan.length} 注 · 组选 ${result.zuxuan.length} 注`}
          </Text>
          <Text className="text-xs text-muted">
            直选 {result.zhixuan.length * 2} 元 · 组选 {result.zuxuan.length * 2} 元
          </Text>
        </View>

        {/* 操作 */}
        <View className="flex-row gap-2 mb-2">
          <Pressable onPress={onChart} disabled={result.zuxuan.length === 0}
            className={`flex-1 py-2.5 rounded-lg items-center ${result.zuxuan.length === 0 ? 'bg-surface-secondary' : 'bg-accent'}`}>
            <Text className={`text-sm font-bold ${result.zuxuan.length === 0 ? 'text-muted' : 'text-accent-foreground'}`}>出图</Text>
          </Pressable>
          <Pressable onPress={reset} className="px-4 py-2.5 rounded-lg bg-surface-secondary items-center">
            <Text className="text-sm text-foreground">重设</Text>
          </Pressable>
        </View>

        {/* 直选结果 */}
        <View className="bg-white rounded-xl border border-border p-3 mb-2">
          <Pressable onPress={() => setShowZhixuan((v) => !v)}>
            <Text className="text-xs text-muted">{showZhixuan ? '▼' : '▶'} 单选（直选）· 共 {result.zhixuan.length} 注</Text>
          </Pressable>
          {showZhixuan && (
            <View className="mt-2">
              <View className="flex-row gap-1.5 mb-3">
                <Pressable onPress={() => copy(result.zhixuan.join(' '), '复制直选全部')} className="flex-1 py-1.5 rounded bg-surface-secondary items-center">
                  <Text className="text-[10px] text-foreground">复制直选</Text>
                </Pressable>
                <Pressable onPress={() => copy(zx.zusan.join(' '), '复制直选·组三')} className="flex-1 py-1.5 rounded bg-surface-secondary items-center">
                  <Text className="text-[10px] text-foreground">复制组三</Text>
                </Pressable>
                <Pressable onPress={() => copy(zx.zuliu.join(' '), '复制直选·组六')} className="flex-1 py-1.5 rounded bg-surface-secondary items-center">
                  <Text className="text-[10px] text-foreground">复制组六</Text>
                </Pressable>
              </View>
              <Text className="text-xs font-bold text-foreground mb-1">组三形态（{zx.zusan.length} 注）</Text>
              <View style={{ maxHeight: 160 }}>
                <ScrollView nestedScrollEnabled>
                  <Text style={{ fontSize: 12, color: '#374151', lineHeight: 20 }}>
                    {zx.zusan.length > 0 ? zx.zusan.join('  ') : '（无）'}
                  </Text>
                </ScrollView>
              </View>
              <View className="h-px bg-border my-3" />
              <Text className="text-xs font-bold text-foreground mb-1">组六形态（{zx.zuliu.length} 注）</Text>
              <View style={{ maxHeight: 160 }}>
                <ScrollView nestedScrollEnabled>
                  <Text style={{ fontSize: 12, color: '#374151', lineHeight: 20 }}>
                    {zx.zuliu.length > 0 ? zx.zuliu.join('  ') : '（无）'}
                  </Text>
                </ScrollView>
              </View>
            </View>
          )}
        </View>

        {/* 组选结果 */}
        <View className="bg-white rounded-xl border border-border p-3 mb-2">
          <Pressable onPress={() => setShowZuxuan((v) => !v)}>
            <Text className="text-xs text-muted">{showZuxuan ? '▼' : '▶'} 组选 · 共 {result.zuxuan.length} 注</Text>
          </Pressable>
          {showZuxuan && (
            <View className="mt-2">
              <View className="flex-row gap-1.5 mb-3">
                <Pressable onPress={() => copy(result.zuxuan.join(' '), '复制组选全部')} className="flex-1 py-1.5 rounded bg-surface-secondary items-center">
                  <Text className="text-[10px] text-foreground">复制组选</Text>
                </Pressable>
                <Pressable onPress={() => copy(zux.zusan.join(' '), '复制组三')} className="flex-1 py-1.5 rounded bg-surface-secondary items-center">
                  <Text className="text-[10px] text-foreground">复制组三</Text>
                </Pressable>
                <Pressable onPress={() => copy(zux.zuliu.join(' '), '复制组六')} className="flex-1 py-1.5 rounded bg-surface-secondary items-center">
                  <Text className="text-[10px] text-foreground">复制组六</Text>
                </Pressable>
              </View>
              <Text className="text-xs font-bold text-foreground mb-1">组三（{zux.zusan.length} 注）</Text>
              <View style={{ maxHeight: 160 }}>
                <ScrollView nestedScrollEnabled>
                  <Text style={{ fontSize: 12, color: '#374151', lineHeight: 20 }}>
                    {zux.zusan.length > 0 ? zux.zusan.join('  ') : '（无）'}
                  </Text>
                </ScrollView>
              </View>
              <View className="h-px bg-border my-3" />
              <Text className="text-xs font-bold text-foreground mb-1">组六（{zux.zuliu.length} 注）</Text>
              <View style={{ maxHeight: 160 }}>
                <ScrollView nestedScrollEnabled>
                  <Text style={{ fontSize: 12, color: '#374151', lineHeight: 20 }}>
                    {zux.zuliu.length > 0 ? zux.zuliu.join('  ') : '（无）'}
                  </Text>
                </ScrollView>
              </View>
            </View>
          )}
        </View>

        {/* 外部集合 */}
        <View className="bg-white rounded-xl border border-border p-3 mb-2">
          <Text className="text-xs text-muted mb-2">外部集合（空格/逗号分隔）</Text>
          <TextInput
            value={filterInput}
            onChangeText={setFilterInput}
            multiline
            placeholder="在此粘贴另一组号码"
            style={{
              borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8,
              paddingHorizontal: 10, paddingVertical: 8, fontSize: 12,
              color: '#111827', minHeight: 60,
            }}
          />
          <View className="flex-row gap-2 mt-2">
            <Pressable onPress={applyIntersection} className="flex-1 py-2 rounded-lg bg-surface-secondary items-center">
              <Text className="text-xs text-foreground">取交集（跟组选）</Text>
            </Pressable>
            <Pressable onPress={applyDifference} className="flex-1 py-2 rounded-lg bg-surface-secondary items-center">
              <Text className="text-xs text-foreground">取差集（跟组选）</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

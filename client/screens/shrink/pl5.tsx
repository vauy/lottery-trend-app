/**
 * 排列5 缩水页 —— 独立实现，不复用 3D 逻辑。
 */
import { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import {
  BottomBar,
  Chip,
  DigitGrid,
  Field,
  Legend,
  Panel,
  ResultBanner,
  Segmented,
} from '@/components/ui/Kit';
import { fontSize as fs, semantic, space, touch } from '@/lib/theme';

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const SUM_RANGE = Array.from({ length: 46 }, (_, i) => i); // 0-45
const COUNT_05 = [0, 1, 2, 3, 4, 5];
const TAIL_09 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

type Pl5Filters = {
  posWan: number[]; posQian: number[]; posBai: number[]; posShi: number[]; posGe: number[];
  danCount: Record<number, number | null>;
  bigSmall: number[]; oddEven: number[]; primeCount: number[];
  sum: number[]; sumTail: number[]; span: number[];
  road0: number[]; road1: number[]; road2: number[];
};

function emptyPl5Filters(): Pl5Filters {
  const dc: Record<number, number | null> = {};
  for (let i = 0; i <= 9; i += 1) dc[i] = null;
  return {
    posWan: [...DIGITS], posQian: [...DIGITS], posBai: [...DIGITS], posShi: [...DIGITS], posGe: [...DIGITS],
    danCount: dc,
    bigSmall: [], oddEven: [], primeCount: [],
    sum: [], sumTail: [], span: [],
    road0: [], road1: [], road2: [],
  };
}

const isPrime = (n: number) => n === 1 || n === 2 || n === 3 || n === 5 || n === 7;

function isPl5FilterEmpty(f: Pl5Filters): boolean {
  if (f.posWan.length < 10 || f.posQian.length < 10 || f.posBai.length < 10 || f.posShi.length < 10 || f.posGe.length < 10) return false;
  if (f.bigSmall.length > 0 || f.oddEven.length > 0 || f.primeCount.length > 0) return false;
  if (f.sum.length > 0 || f.sumTail.length > 0 || f.span.length > 0) return false;
  if (f.road0.length > 0 || f.road1.length > 0 || f.road2.length > 0) return false;
  for (let i = 0; i <= 9; i += 1) if (f.danCount[i] !== null) return false;
  return true;
}

function generateAllPl5(): string[] {
  const out: string[] = [];
  for (let a = 0; a <= 9; a += 1)
    for (let b = 0; b <= 9; b += 1)
      for (let c = 0; c <= 9; c += 1)
        for (let d = 0; d <= 9; d += 1)
          for (let e = 0; e <= 9; e += 1)
            out.push(`${a}${b}${c}${d}${e}`);
  return out;
}

function filterPl5(codes: string[], f: Pl5Filters): string[] {
  return codes.filter((code) => {
    const w = code.charCodeAt(0) - 48;
    const q = code.charCodeAt(1) - 48;
    const b = code.charCodeAt(2) - 48;
    const s = code.charCodeAt(3) - 48;
    const g = code.charCodeAt(4) - 48;
    const nums = [w, q, b, s, g];

    if (f.posWan.length < 10 && !f.posWan.includes(w)) return false;
    if (f.posQian.length < 10 && !f.posQian.includes(q)) return false;
    if (f.posBai.length < 10 && !f.posBai.includes(b)) return false;
    if (f.posShi.length < 10 && !f.posShi.includes(s)) return false;
    if (f.posGe.length < 10 && !f.posGe.includes(g)) return false;

    for (let d = 0; d <= 9; d += 1) {
      const want = f.danCount[d];
      if (want === null) continue;
      let cnt = 0;
      for (const n of nums) if (n === d) cnt += 1;
      if (cnt !== want) return false;
    }

    if (f.bigSmall.length > 0) {
      let bc = 0;
      for (const n of nums) if (n >= 5) bc += 1;
      if (!f.bigSmall.includes(bc)) return false;
    }
    if (f.oddEven.length > 0) {
      let oc = 0;
      for (const n of nums) if (n % 2 === 1) oc += 1;
      if (!f.oddEven.includes(oc)) return false;
    }
    if (f.primeCount.length > 0) {
      let pc = 0;
      for (const n of nums) if (isPrime(n)) pc += 1;
      if (!f.primeCount.includes(pc)) return false;
    }

    const sum = w + q + b + s + g;
    if (f.sum.length > 0 && !f.sum.includes(sum)) return false;
    if (f.sumTail.length > 0 && !f.sumTail.includes(sum % 10)) return false;

    let mn = 9, mx = 0;
    for (const n of nums) { if (n < mn) mn = n; if (n > mx) mx = n; }
    const span = mx - mn;
    if (f.span.length > 0 && !f.span.includes(span)) return false;

    let r0 = 0, r1 = 0, r2 = 0;
    for (const n of nums) {
      const r = n % 3;
      if (r === 0) r0 += 1; else if (r === 1) r1 += 1; else r2 += 1;
    }
    if (f.road0.length > 0 && !f.road0.includes(r0)) return false;
    if (f.road1.length > 0 && !f.road1.includes(r1)) return false;
    if (f.road2.length > 0 && !f.road2.includes(r2)) return false;

    return true;
  });
}

function classifyPl5(codes: string[]): { noRep: string[]; hasRep: string[] } {
  const noRep: string[] = [];
  const hasRep: string[] = [];
  for (const c of codes) {
    if (new Set(c).size === 5) noRep.push(c);
    else hasRep.push(c);
  }
  return { noRep, hasRep };
}

/** 原型 .fold > .group：可折叠筛选分组 */
function Fold({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.foldGroup}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={styles.foldSummary}
        accessibilityState={{ expanded: open }}
      >
        <Text style={[styles.foldTitle, open && styles.foldTitleOn]}>{title}</Text>
        <Text style={[styles.foldArrow, open && styles.foldTitleOn]}>{open ? '▾' : '▸'}</Text>
      </Pressable>
      {open ? <View style={styles.foldBody}>{children}</View> : null}
    </View>
  );
}

export default function Pl5ShrinkScreen() {
  const { width, height } = useWindowDimensions();
  const landscape = width >= 860 || width > height;

  const [dan, setDan] = useState<number[]>([]);
  const [tuo, setTuo] = useState<number[]>([]);
  const [filters, setFilters] = useState<Pl5Filters>(emptyPl5Filters());
  const [showFilters, setShowFilters] = useState(true);

  const rawResult = useMemo(() => {
    if (dan.length === 0 && tuo.length === 0) return generateAllPl5();
    const all = generateAllPl5();
    return all.filter((code) => {
      const nums = code.split('').map(Number);
      if (!dan.every((d) => nums.includes(d))) return false;
      if (tuo.length > 0 && !tuo.some((t) => nums.includes(t))) return false;
      return true;
    });
  }, [dan, tuo]);

  const result = useMemo(() => filterPl5(rawResult, filters), [rawResult, filters]);

  const zuxuanList = useMemo(() => {
    const s = new Set<string>();
    for (const c of result) s.add([...c].sort().join(''));
    return Array.from(s).sort();
  }, [result]);

  const zx = useMemo(() => classifyPl5(result), [result]);
  const zux = useMemo(() => classifyPl5(zuxuanList), [zuxuanList]);

  const toggleDan = (d: number) => setDan((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]));
  const toggleTuo = (d: number) => setTuo((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]));
  const reset = () => { setDan([]); setTuo([]); setFilters(emptyPl5Filters()); };

  const copy = async (text: string, tag: string) => {
    if (!text) return Alert.alert('没有可复制内容');
    try {
      await Clipboard.setStringAsync(text);
      Alert.alert('已复制', `${tag} · ${text.split(/\s+/).filter(Boolean).length} 注`);
    } catch { Alert.alert('复制失败'); }
  };

  const onChart = () => {
    const codes = result.join(',');
    if (!codes) return Alert.alert('直选为空');
    router.push({ pathname: '/(tabs)/analyze', params: { codes, mode: 'zhixuan', game: 'pl5' } });
  };

  const toggleArr = (key: keyof Pl5Filters, v: number) => {
    setFilters((p) => {
      const arr = p[key] as number[];
      return { ...p, [key]: arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v] };
    });
  };

  // 通用：数字格（44px 触控）
  const digitGrid = (key: keyof Pl5Filters, columns = 5, digits: number[] = DIGITS) => (
    <DigitGrid
      digits={digits}
      selected={filters[key] as number[]}
      onToggle={(d) => toggleArr(key, d)}
      columns={columns}
    />
  );

  // 通用：「说明 + 数字格」字段
  const digitField = (caption: string, key: keyof Pl5Filters, columns = 5, digits: number[] = DIGITS) => (
    <Field caption={caption}>{digitGrid(key, columns, digits)}</Field>
  );

  const renderPosFilter = () => (
    <Fold title="定位（默认全选，点击取消）">
      {([
        { label: '万位', key: 'posWan' as const },
        { label: '千位', key: 'posQian' as const },
        { label: '百位', key: 'posBai' as const },
        { label: '十位', key: 'posShi' as const },
        { label: '个位', key: 'posGe' as const },
      ] as const).map(({ label, key }) => {
        const allSelected = filters[key].length === 10;
        return (
          <View key={key}>
            {digitField(label, key)}
            <Chip
              label="全选"
              active={allSelected}
              onPress={() => setFilters((p) => ({ ...p, [key]: allSelected ? [] : [...DIGITS] }))}
            />
          </View>
        );
      })}
    </Fold>
  );

  const renderDanCountFilter = () => (
    <Fold title="胆码出现次数（0-5，不限=不筛）">
      <View style={styles.chipWrap}>
        <Chip
          label="全部不限"
          active={false}
          onPress={() => {
            const nc: Record<number, number | null> = {};
            for (let i = 0; i <= 9; i += 1) nc[i] = null;
            setFilters((p) => ({ ...p, danCount: nc }));
          }}
        />
      </View>
      {DIGITS.map((d) => {
        const cur = filters.danCount[d];
        return (
          <View key={d} style={styles.danRow}>
            <Text style={styles.danRowLabel}>{d}</Text>
            <View style={styles.danRowCtl}>
              <Segmented<string>
                options={[
                  { value: 'none', label: '不限' },
                  ...COUNT_05.map((c) => ({ value: String(c), label: String(c) })),
                ]}
                value={cur === null ? 'none' : String(cur)}
                onChange={(v) =>
                  setFilters((p) => ({
                    ...p,
                    danCount: { ...p.danCount, [d]: v === 'none' ? null : Number(v) },
                  }))
                }
              />
            </View>
          </View>
        );
      })}
    </Fold>
  );

  const renderFormCard = () => (
    <Fold title="形态（数量可多选，不选=不限）">
      <View style={styles.chipWrap}>
        <Chip
          label="清空形态"
          active={false}
          onPress={() => setFilters((p) => ({ ...p, bigSmall: [], oddEven: [], primeCount: [] }))}
        />
      </View>
      {digitField('大个数', 'bigSmall', 6, COUNT_05)}
      {digitField('单个数', 'oddEven', 6, COUNT_05)}
      {digitField('质个数', 'primeCount', 6, COUNT_05)}
    </Fold>
  );

  const renderSumCard = () => (
    <Fold title="和值（0-45，可多选）">
      <View style={styles.chipWrap}>
        <Chip label="清空和值" active={false} onPress={() => setFilters((p) => ({ ...p, sum: [] }))} />
      </View>
      {digitField('和值', 'sum', 7, SUM_RANGE)}
    </Fold>
  );

  const renderSumTailSpanCard = () => (
    <Fold title="和值尾 / 跨度">
      <View style={styles.chipWrap}>
        <Chip
          label="清空"
          active={false}
          onPress={() => setFilters((p) => ({ ...p, sumTail: [], span: [] }))}
        />
      </View>
      {digitField('和值尾', 'sumTail', 5, TAIL_09)}
      {digitField('跨度', 'span', 5, TAIL_09)}
    </Fold>
  );

  const renderRoadCard = () => (
    <Fold title="012 路个数（可多选）">
      <View style={styles.chipWrap}>
        <Chip
          label="清空路数"
          active={false}
          onPress={() => setFilters((p) => ({ ...p, road0: [], road1: [], road2: [] }))}
        />
      </View>
      {digitField('0路个数', 'road0', 6, COUNT_05)}
      {digitField('1路个数', 'road1', 6, COUNT_05)}
      {digitField('2路个数', 'road2', 6, COUNT_05)}
    </Fold>
  );

  const leftCol = (
    <View style={[styles.col, landscape && styles.colLeft]}>
      <Panel label="胆拖 · 排列5">
        <Field caption="胆码（不选=全选 100000 注，可多选）">
          <DigitGrid digits={DIGITS} selected={dan} onToggle={toggleDan} columns={5} />
        </Field>
        <Field caption="拖码（可选）">
          <DigitGrid digits={DIGITS} selected={tuo} onToggle={toggleTuo} columns={5} />
        </Field>
      </Panel>

      <View style={styles.chipWrap}>
        <Chip label="筛选条件" active={showFilters} onPress={() => setShowFilters((v) => !v)} />
        {!isPl5FilterEmpty(filters) ? (
          <Chip label="清除所有筛选" active={false} onPress={() => setFilters(emptyPl5Filters())} />
        ) : null}
        <Chip label="重置全部" active={false} onPress={reset} />
      </View>

      {showFilters ? (
        <View style={styles.fold}>
          {renderPosFilter()}
          {renderDanCountFilter()}
          {renderFormCard()}
          {renderSumCard()}
          {renderSumTailSpanCard()}
          {renderRoadCard()}
        </View>
      ) : null}
    </View>
  );

  const rightCol = (
    <View style={styles.col}>
      <ResultBanner
        items={[
          { value: String(result.length), label: '直选注数' },
          { value: String(zuxuanList.length), label: '组选注数' },
          { value: `${result.length * 2} 元`, label: '直选金额' },
          { value: `${zuxuanList.length * 2} 元`, label: '组选金额' },
        ]}
      />

      <Panel label="分 类">
        <Text style={styles.line}>直选 无重复 {zx.noRep.length} · 有重复 {zx.hasRep.length}</Text>
        <Text style={styles.line}>组选 无重复 {zux.noRep.length} · 有重复 {zux.hasRep.length}</Text>
        <Text style={styles.hint}>
          原始 {rawResult.length} 注 → 筛选后 直选 {result.length} 注 · 组选 {zuxuanList.length} 注
        </Text>
      </Panel>

      <Panel label="复 制">
        <View style={styles.chipWrap}>
          {[
            { label: `直选全部(${result.length})`, codes: result },
            { label: `直选无重复(${zx.noRep.length})`, codes: zx.noRep },
            { label: `直选有重复(${zx.hasRep.length})`, codes: zx.hasRep },
            { label: `组选全部(${zuxuanList.length})`, codes: zuxuanList },
            { label: `组选无重复(${zux.noRep.length})`, codes: zux.noRep },
            { label: `组选有重复(${zux.hasRep.length})`, codes: zux.hasRep },
          ].map((b) => (
            <Chip
              key={b.label}
              label={b.label}
              active={false}
              onPress={() => { void copy(b.codes.join(' '), b.label); }}
            />
          ))}
        </View>
      </Panel>

      <Legend
        items={[
          { color: semantic.dan, label: '已选 / 胆码' },
          { color: semantic.cold, label: '组选号码' },
          { color: semantic.text, label: '直选号码' },
        ]}
      />
    </View>
  );

  return (
    <Screen
      safeAreaEdges={['top', 'left', 'right']}
      backgroundColor={semantic.pageBg}
      statusBarStyle="light"
    >
      <View style={styles.page}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, landscape && styles.scrollContentWide]}
        >
          <View style={[styles.split, landscape && styles.splitLandscape]}>
            {leftCol}
            {rightCol}
          </View>
        </ScrollView>
        <BottomBar
          primaryLabel="生 成"
          onPrimary={onChart}
          ghostLabel="清空"
          onGhost={reset}
          vertical={landscape}
          hint={`原始 ${rawResult.length} 注 → 直选 ${result.length} 注 · 组选 ${zuxuanList.length} 注`}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: semantic.pageBg },
  scroll: { flex: 1 },
  scrollContent: { padding: space.md, paddingBottom: space.xxl, gap: space.md },
  scrollContentWide: { paddingHorizontal: space.lg },

  split: { flexDirection: 'column', gap: space.md },
  splitLandscape: { flexDirection: 'row', alignItems: 'flex-start' },
  col: { flexDirection: 'column', gap: space.md, flexShrink: 1 },
  colLeft: { width: 320, flexGrow: 0, flexShrink: 0 },

  fold: { flexDirection: 'column', gap: space.md },
  foldGroup: {
    borderWidth: 1,
    borderColor: semantic.panelBorder,
    borderRadius: 10,
    backgroundColor: semantic.panelBg,
    overflow: 'hidden',
  },
  foldSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: 11,
    minHeight: touch.min,
  },
  foldTitle: { fontSize: fs.sm, color: semantic.textDim },
  foldTitleOn: { color: semantic.brand },
  foldArrow: { fontSize: fs.sm, color: semantic.textFaint },
  foldBody: { paddingHorizontal: space.md, paddingBottom: space.md },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  danRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm },
  danRowLabel: {
    fontSize: fs.base,
    fontWeight: '700',
    color: semantic.text,
    width: 18,
    textAlign: 'center',
  },
  danRowCtl: { flex: 1 },

  line: { fontSize: fs.sm, color: semantic.textDim, marginBottom: space.xs },
  hint: { fontSize: fs.xs, color: semantic.textFaint, lineHeight: 18 },
});

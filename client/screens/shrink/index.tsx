/**
 * 组号缩水页。
 */
import { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { BackBar } from '@/components/ui/BackBar';
import {
  BottomBar,
  Chip,
  CodePill,
  DigitGrid,
  Field,
  Legend,
  Panel,
  ResultBanner,
  Segmented,
} from '@/components/ui/Kit';
import { generateDanTuo } from '@/lib/lottery/danTuo';
import { applyFilters, emptyFilters, isFilterEmpty, type Filters } from '@/lib/lottery/filters';
import { fontSize as fs, radius, semantic, space, touch } from '@/lib/theme';

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const SUM_RANGE = Array.from({ length: 28 }, (_, i) => i);
const DAN_COUNTS = [0, 1, 2, 3];
/** 号码列表最多渲染多少注（原型 .code-list 截断策略） */
const MAX_SHOW = 120;
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

/** 原型 .fold > .group：可折叠筛选分组 */
function Fold({
  title,
  defaultOpen = true,
  open: openProp,
  onToggle,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  /** 受控展开态，缺省时由组件内部维护 */
  open?: boolean;
  onToggle?: () => void;
  children: React.ReactNode;
}) {
  const [inner, setInner] = useState(defaultOpen);
  const open = openProp ?? inner;
  return (
    <View style={styles.foldGroup}>
      <Pressable
        onPress={() => {
          setInner(!open);
          onToggle?.();
        }}
        style={styles.foldSummary}
        accessibilityState={{ expanded: open }}
      >
        <Text style={[styles.foldTitle, open && styles.foldTitleOn]}>{title}</Text>
        <Text style={[styles.foldArrow, open && styles.foldTitleOn]}>
          {open ? '▾' : '▸'}
        </Text>
      </Pressable>
      {open ? <View style={styles.foldBody}>{children}</View> : null}
    </View>
  );
}

export default function ShrinkScreen() {
  const { width, height } = useWindowDimensions();
  const landscape = width >= 860 || width > height;

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

  // 通用：数字格 0-9（44px 触控）
  const digitGrid = (key: keyof Filters, columns = 5, digits: number[] = DIGITS) => (
    <DigitGrid
      digits={digits}
      selected={filters[key] as number[]}
      onToggle={(d) => toggleArr(key, d)}
      columns={columns}
    />
  );

  // 通用：「说明 + 数字格」字段
  const digitField = (caption: string, key: keyof Filters, columns = 5, digits: number[] = DIGITS) => (
    <Field caption={caption}>{digitGrid(key, columns, digits)}</Field>
  );

  // 通用：「说明 + 多选组合」字段
  const chipField = <T extends number | string>(
    caption: string,
    key: keyof Filters,
    options: { v: T; label: string }[],
  ) => {
    const arr = filters[key] as T[];
    return (
      <Field caption={caption}>
        <View style={styles.chipWrap}>
          {options.map((o) => {
            const active = arr.includes(o.v);
            const onPress = typeof o.v === 'number' ? () => toggleArr(key, o.v as number) : () => toggleStrArr(key, o.v as string);
            return <Chip key={String(o.v)} label={o.label} active={active} onPress={onPress} />;
          })}
        </View>
      </Field>
    );
  };

  // ============ 分组渲染 ============
  const renderPosFilter = () => (
    <Fold title="定位（默认全选，点击取消）">
      {([
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
    <Fold title="胆码出现次数（0-3，不限=不筛）">
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
                  ...DAN_COUNTS.map((c) => ({ value: String(c), label: String(c) })),
                ]}
                value={cur === null ? 'none' : String(cur)}
                onChange={(v) =>
                  setFilters((p) => ({
                    ...p,
                    danCount: { ...p.danCount, [d]: v === 'none' ? null : Number(v) },
                  }))
                }
                equalWidth
              />
            </View>
          </View>
        );
      })}
    </Fold>
  );

  // 形态卡（大小 / 单双 / 质合 / 大中小）
  const renderFormCard = () => (
    <Fold title="形态（可多选，不选=不限）">
      <View style={styles.chipWrap}>
        <Chip
          label="清空形态"
          active={false}
          onPress={() => setFilters((p) => ({ ...p, bigSmall: [], oddEven: [], primeCount: [], bmsKey: [] }))}
        />
      </View>
      {chipField('大小', 'bigSmall', [
        { v: 3, label: '3大' }, { v: 2, label: '2大1小' }, { v: 1, label: '1大2小' }, { v: 0, label: '3小' },
      ])}
      {chipField('单双', 'oddEven', [
        { v: 3, label: '3单' }, { v: 2, label: '2单1双' }, { v: 1, label: '1单2双' }, { v: 0, label: '3双' },
      ])}
      {chipField('质合', 'primeCount', [
        { v: 3, label: '3质' }, { v: 2, label: '2质1合' }, { v: 1, label: '1质2合' }, { v: 0, label: '3合' },
      ])}
      {chipField('大中小', 'bmsKey', BMS_KEYS.map((k) => ({ v: k, label: k })))}
    </Fold>
  );

  const renderZuiShuCard = () => (
    <Fold title="最数（可多选，不选=不限）">
      <View style={styles.chipWrap}>
        <Chip
          label="清空最数"
          active={false}
          onPress={() => setFilters((p) => ({ ...p, minNum: [], midNum: [], maxNum: [] }))}
        />
      </View>
      {digitField('最小', 'minNum')}
      {digitField('中间', 'midNum')}
      {digitField('最大', 'maxNum')}
    </Fold>
  );

  const renderSumCard = () => (
    <Fold title="和值（0-27，可多选）">
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
      {digitField('和值尾', 'sumTail')}
      {digitField('跨度', 'span')}
    </Fold>
  );

  const renderSpecialCard = () => (
    <Fold title="特殊形态（连号 / 成对 / 012路）">
      <View style={styles.chipWrap}>
        <Chip
          label="清空特殊形态"
          active={false}
          onPress={() => setFilters((p) => ({ ...p, lianhao: [], pair: [], road0: [], road1: [], road2: [] }))}
        />
      </View>
      {chipField('连号', 'lianhao', [
        { v: 0, label: '无连' }, { v: 2, label: '二连' }, { v: 3, label: '三连' },
      ])}
      {chipField('成对', 'pair', [
        { v: 0, label: '无' }, { v: 3, label: '组三' }, { v: 9, label: '豹子' },
      ])}
      {chipField('0路个数', 'road0', [0, 1, 2, 3].map((v) => ({ v, label: String(v) })))}
      {chipField('1路个数', 'road1', [0, 1, 2, 3].map((v) => ({ v, label: String(v) })))}
      {chipField('2路个数', 'road2', [0, 1, 2, 3].map((v) => ({ v, label: String(v) })))}
    </Fold>
  );

  const renderTwoMaCard = () => {
    const pair2Arr = filters.pair2 as string[];
    return (
      <Fold title="两码（可多选）">
        <View style={styles.chipWrap}>
          <Chip
            label="清空两码"
            active={false}
            onPress={() => setFilters((p) => ({ ...p, twoSumTail: [], twoDiff: [], pair2: [] }))}
          />
        </View>
        <Field caption="两码和尾（号码包含任一）">{digitGrid('twoSumTail')}</Field>
        <Field caption="两码差（号码包含任一）">{digitGrid('twoDiff')}</Field>
        <Field caption="不定位两码（号码同时包含这两位）">
          <View style={styles.chipWrap}>
            {PAIR2_KEYS.map((k) => (
              <Chip
                key={`p2-${k}`}
                label={k}
                active={pair2Arr.includes(k)}
                onPress={() => toggleStrArr('pair2', k)}
              />
            ))}
          </View>
        </Field>
      </Fold>
    );
  };

  const codeList = (codes: string[], kind?: 'normal' | 'zu') => (
    <View>
      <View style={styles.codeList}>
        {codes.slice(0, MAX_SHOW).map((c) => (
          <CodePill key={c} code={c} kind={kind} />
        ))}
      </View>
      {codes.length === 0 ? <Text style={styles.hint}>（无）</Text> : null}
      {codes.length > MAX_SHOW ? (
        <Text style={styles.hint}>仅显示前 {MAX_SHOW} 注，共 {codes.length} 注</Text>
      ) : null}
    </View>
  );

  const filterSummary = () => {
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
    return lines;
  };

  const summaryLines = filterSummary();

  const leftCol = (
    <View style={[styles.col, landscape && styles.colLeft]}>
      <Panel label="胆拖 · 福彩3D">
        <Field caption="胆码（不选=全选 1000 注，可多选）">
          <DigitGrid digits={DIGITS} selected={dan} onToggle={toggleDan} columns={5} />
        </Field>
        <Field caption="拖码（可选，用来补位）">
          <DigitGrid digits={DIGITS} selected={tuo} onToggle={toggleTuo} columns={5} />
        </Field>
      </Panel>

      <View style={styles.chipWrap}>
        <Chip label="筛选条件" active={showFilters} onPress={() => setShowFilters((v) => !v)} />
        {!isFilterEmpty(filters) ? (
          <Chip label="清除所有筛选" active={false} onPress={() => setFilters(emptyFilters())} />
        ) : null}
      </View>

      {showFilters ? (
        <View style={styles.fold}>
          {renderPosFilter()}
          {renderDanCountFilter()}
          {renderFormCard()}
          {renderZuiShuCard()}
          {renderSumCard()}
          {renderSumTailSpanCard()}
          {renderSpecialCard()}
          {renderTwoMaCard()}
        </View>
      ) : null}
    </View>
  );

  const rightCol = (
    <View style={styles.col}>
      <ResultBanner
        items={[
          { value: String(result.zhixuan.length), label: '直选注数' },
          { value: String(result.zuxuan.length), label: '组选注数' },
          { value: `${result.zhixuan.length * 2} 元`, label: '直选金额' },
          { value: `${result.zuxuan.length * 2} 元`, label: '组选金额' },
        ]}
      />

      <Panel label="摘 要">
        <Text style={styles.summaryStrong}>胆码：{dan.length > 0 ? dan.join(' ') : '（未选）'}</Text>
        <Text style={styles.summaryStrong}>拖码：{tuo.length > 0 ? tuo.join(' ') : '（未选）'}</Text>
        {summaryLines.length > 0 ? (
          <View style={styles.summaryBlock}>
            {summaryLines.map((l, i) => (
              <Text key={i} style={styles.summaryLine}>· {l}</Text>
            ))}
          </View>
        ) : null}
        <Text style={styles.hint}>
          {isFilterEmpty(filters)
            ? `直选 ${result.zhixuan.length} 注 · 组选 ${result.zuxuan.length} 注`
            : `原始 ${rawResult.zhixuan.length} 注 → 筛选后 直选 ${result.zhixuan.length} 注 · 组选 ${result.zuxuan.length} 注`}
        </Text>
      </Panel>

      <View style={styles.fold}>
        <Fold
          title={`单选（直选）· 共 ${result.zhixuan.length} 注`}
          defaultOpen={showZhixuan}
          open={showZhixuan}
          onToggle={() => setShowZhixuan((v) => !v)}
        >
          <View style={styles.chipWrap}>
            <Chip label="复制直选" active={false} onPress={() => { void copy(result.zhixuan.join(' '), '复制直选全部'); }} />
            <Chip label="复制组三" active={false} onPress={() => { void copy(zx.zusan.join(' '), '复制直选·组三'); }} />
            <Chip label="复制组六" active={false} onPress={() => { void copy(zx.zuliu.join(' '), '复制直选·组六'); }} />
          </View>
          <Text style={styles.subTitle}>组三形态（{zx.zusan.length} 注）</Text>
          {codeList(zx.zusan)}
          <View style={styles.divider} />
          <Text style={styles.subTitle}>组六形态（{zx.zuliu.length} 注）</Text>
          {codeList(zx.zuliu)}
        </Fold>

        <Fold
          title={`组选 · 共 ${result.zuxuan.length} 注`}
          defaultOpen={showZuxuan}
          open={showZuxuan}
          onToggle={() => setShowZuxuan((v) => !v)}
        >
          <View style={styles.chipWrap}>
            <Chip label="复制组选" active={false} onPress={() => { void copy(result.zuxuan.join(' '), '复制组选全部'); }} />
            <Chip label="复制组三" active={false} onPress={() => { void copy(zux.zusan.join(' '), '复制组三'); }} />
            <Chip label="复制组六" active={false} onPress={() => { void copy(zux.zuliu.join(' '), '复制组六'); }} />
          </View>
          <Text style={styles.subTitle}>组三（{zux.zusan.length} 注）</Text>
          {codeList(zux.zusan, 'zu')}
          <View style={styles.divider} />
          <Text style={styles.subTitle}>组六（{zux.zuliu.length} 注）</Text>
          {codeList(zux.zuliu, 'zu')}
        </Fold>
      </View>

      <Legend
        items={[
          { color: semantic.hot, label: '组三形态' },
          { color: semantic.cold, label: '组选号码' },
          { color: semantic.dan, label: '已选 / 胆码' },
        ]}
      />

      <Panel label="外部集合">
        <Field caption="空格 / 逗号分隔">
          <TextInput
            value={filterInput}
            onChangeText={setFilterInput}
            multiline
            placeholder="在此粘贴另一组号码"
            placeholderTextColor={semantic.textFaint}
            style={styles.input}
          />
        </Field>
        <View style={styles.chipWrap}>
          <Chip label="取交集（跟组选）" active={false} onPress={applyIntersection} />
          <Chip label="取差集（跟组选）" active={false} onPress={applyDifference} />
        </View>
      </Panel>
    </View>
  );

  return (
    <Screen
      safeAreaEdges={['top', 'left', 'right']}
      backgroundColor={semantic.pageBg}
      statusBarStyle="light"
    >
      <BackBar />
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
          hint={isFilterEmpty(filters)
            ? `直选 ${result.zhixuan.length} 注 · 组选 ${result.zuxuan.length} 注`
            : `原始 ${rawResult.zhixuan.length} 注 → 直选 ${result.zhixuan.length} 注 · 组选 ${result.zuxuan.length} 注`}
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

  codeList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  subTitle: { fontSize: fs.sm, fontWeight: '700', color: semantic.text, marginBottom: space.sm },
  divider: {
    height: 1,
    backgroundColor: semantic.divider,
    marginVertical: space.md,
  },
  hint: { fontSize: fs.xs, color: semantic.textFaint, lineHeight: 18 },

  summaryStrong: { fontSize: fs.base, fontWeight: '600', color: semantic.text, marginBottom: space.xs },
  summaryBlock: {
    borderBottomWidth: 1,
    borderBottomColor: semantic.divider,
    paddingBottom: space.sm,
    marginBottom: space.sm,
    marginTop: space.xs,
  },
  summaryLine: { fontSize: fs.sm, color: semantic.textDim, marginBottom: 2 },
  input: {
    borderWidth: 1,
    borderColor: semantic.panelBorder,
    borderRadius: radius.sm,
    backgroundColor: semantic.controlBg,
    color: semantic.text,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: fs.sm,
    minHeight: 60,
    textAlignVertical: 'top',
  },
});

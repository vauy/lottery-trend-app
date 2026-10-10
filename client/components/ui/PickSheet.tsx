/**
 * 选号抽屉 —— 从底部上下拉开的底部弹层
 *
 * 需求：把选号面板从「页面里的一大块」改成「可上下拉开的抽屉」，
 * 并且内容要能上下滑动。
 *
 * 用 @gorhom/bottom-sheet 而不是自己写 PanResponder，原因是：
 * - 它自带手势与内部滚动的冲突仲裁（手指在内容区向上滑是滚动，
 *   在把手上拖才是拉动抽屉），自己写这段最容易出 bug；
 * - BottomSheetScrollView 天然支持「滚到顶后继续下拉则收起抽屉」。
 * 依赖 react-native-reanimated / react-native-gesture-handler
 * 已在项目中就绪（babel 配了 worklets 插件，Provider 已包 GestureHandlerRootView）。
 */
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
// BottomSheetMethods 未从包根导出，需从 types 子路径取
import type { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import { palette, semantic, fontSize as fs, space, radius } from '@/lib/theme';

export interface PickSheetProps {
  /** 当前选中的子页签（显示在抽屉把手那一行） */
  tabLabel: string;
  /** 彩种名 */
  gameName: string;
  /** 抽屉内容（选号表单） */
  children: ReactNode;
  /** 展开状态变化回调 */
  onChange?: (expanded: boolean) => void;
  /** 受控展开：由外部（如顶栏按钮）驱动开合 */
  expanded?: boolean;
}

/**
 * 底部抽屉。
 * 两个吸附点：
 *   - '12%'  只看得到把手 + 页签行，图表占满屏幕
 *   - '88%'  展开，选号内容铺开
 */
export function PickSheet({
  tabLabel,
  gameName,
  children,
  onChange,
  expanded,
}: PickSheetProps) {
  const snapPoints = useMemo(() => ['12%', '88%'], []);
  const sheetRef = useRef<BottomSheetMethods>(null);

  // 受控：外部 expanded 变化时把抽屉滑到对应吸附点
  useEffect(() => {
    if (expanded === undefined) return;
    if (expanded) sheetRef.current?.snapToIndex(1);
    else sheetRef.current?.snapToIndex(0);
  }, [expanded]);

  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      snapPoints={snapPoints}
      onChange={(i) => onChange?.(i >= 1)}
      handleIndicatorStyle={styles.indicator}
      backgroundStyle={styles.background}
      // 允许拖动把手 / 内容区空白处来开合
      enablePanDownToClose={false}
      // 内容可滚动时，手势优先给滚动
      keyboardBehavior="interactive"
    >
      {/* 把手下方固定显示的页签行：收起状态也能看到当前在哪个选号模式 */}
      <View style={styles.headerRow}>
        <View style={styles.gripCol}>
          <Text style={styles.headerTitle}>选号</Text>
          <Text style={styles.headerSub}>{tabLabel}</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.headerGame}>{gameName}</Text>
        </View>
      </View>
      <View style={styles.divider} />
      <BottomSheetScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollInner}
        showsVerticalScrollIndicator={false}
        // 内容滚动到顶部后继续下拉 → 交给抽屉收起
        nestedScrollEnabled
      >
        {children}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  indicator: { backgroundColor: semantic.textFaint, width: 36, height: 4 },
  background: {
    backgroundColor: semantic.panelBg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderTopColor: semantic.panelBorder,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  gripCol: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  headerTitle: { fontSize: fs.sm, fontWeight: '700', color: semantic.text },
  headerSub: { fontSize: fs.xs, color: semantic.brand, fontWeight: '600' },
  headerRight: { alignItems: 'flex-end' },
  headerGame: { fontSize: fs.xs, color: semantic.textDim },
  divider: { height: 1, backgroundColor: semantic.divider },
  scroll: { flex: 1 },
  scrollInner: { padding: space.md, paddingBottom: space.xxl },
});

export default PickSheet;

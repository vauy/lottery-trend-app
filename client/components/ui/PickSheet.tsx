/**
 * 选号抽屉 —— 从底部上下拉开的底部弹层（纯 JS 实现）
 *
 * 需求：把选号面板从「页面里的一大块」改成「可上下拉开的抽屉」，
 * 并且内容要能上下滑动。
 *
 * 为什么不用 @gorhom/bottom-sheet：
 *   它依赖 react-native-reanimated + react-native-gesture-handler 的
 *   **原生侧**实现。本机开发链路是 Termux + Expo Go 热更新，而 Expo Go
 *   里的 reanimated / gesture-handler 版本是官方预打包、写死的，
 *   与 package.json 里的版本对不上就直接红屏崩溃，且无法重建原生模块。
 *   所以这里一律用 RN 自带的 Animated + PanResponder（纯 JS，零原生依赖），
 *   在任何 Expo Go 版本上都能跑。
 *
 * 手势仲裁：
 *   - 把手行（含标题 / 页签名 / 彩种 / 箭头）：任意方向都可拖动抽屉；
 *   - 内容区：交给内部 ScrollView 正常滚动，不抢手势。
 *     这样「手指在内容里上下滑」永远是滚动，「拖把手」才是开合抽屉，
 *     比在内容区抢手势稳定得多（抢手势最容易出现「滑不动 / 误收起」）。
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { semantic, fontSize as fs, space, radius } from '@/lib/theme';

/** 收起时露出多少（把手条高度）—— 页面据此给内容留底部安全距离 */
export const PEEK_H = 58;

/** 甩动速度阈值：超过就按甩动方向吸附，否则按「过半原则」 */
const VELOCITY_THRESHOLD = 0.35;

export interface PickSheetProps {
  /** 当前选中的子页签（显示在抽屉把手那一行） */
  tabLabel: string;
  /** 彩种名 */
  gameName: string;
  /** 抽屉内容（选号表单） */
  children: ReactNode;
  /** 固定在把手下方、不随内容滚动的区（如「常用/系统/定制」分组页签行） */
  fixedHeader?: ReactNode;
  /** 展开状态变化回调 */
  onChange?: (expanded: boolean) => void;
  /** 受控展开：由外部（如顶栏按钮）驱动开合 */
  expanded?: boolean;
  /** 抽屉底部要避让的高度（底部操作栏 + 安全区），避免盖住「出图 / 重置」 */
  bottomOffset?: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function PickSheet({
  tabLabel,
  gameName,
  children,
  fixedHeader,
  onChange,
  expanded,
  bottomOffset = 0,
}: PickSheetProps) {
  const { height: screenH, width: screenW } = useWindowDimensions();

  /**
   * 抽屉总高：竖屏取屏高 60%、横屏取 82%（横屏屏矮，占比要高些才放得下表单），
   * 再扣掉底部避让（图型栏 + 安全区）。官方参考图展开态约占屏一半多。
   */
  const sheetH = useMemo(() => {
    const ratio = screenW > screenH ? 0.82 : 0.6;
    return Math.max(200, Math.round(screenH * ratio) - bottomOffset);
  }, [screenW, screenH, bottomOffset]);
  /** translateY = 0 表示完全展开；= collapsedY 表示只露把手 */
  const collapsedY = Math.max(0, sheetH - PEEK_H);

  const ty = useRef(new Animated.Value(collapsedY)).current;
  /** 拖拽开始时的位置，整个手势期间固定不变 */
  const startY = useRef(collapsedY);
  /** 当前展开态（用于避免重复回调 + 渲染箭头方向） */
  const isOpen = useRef(false);
  const [openView, setOpenView] = useState(false);

  /** 读当前动画值。__getValue 未出现在公共类型里，这里只读一次 */
  const readY = useCallback(
    () => (ty as unknown as { __getValue(): number }).__getValue(),
    [ty],
  );

  const animateTo = useCallback(
    (target: number, velocity?: number) => {
      ty.flattenOffset();
      Animated.spring(ty, {
        toValue: target,
        velocity,
        tension: 68,
        friction: 12,
        useNativeDriver: true,
      }).start();
      const open = target < collapsedY / 2;
      if (open !== isOpen.current) {
        isOpen.current = open;
        setOpenView(open);
        onChange?.(open);
      }
    },
    [ty, collapsedY, onChange],
  );

  /**
   * 屏幕旋转 / 底部栏高度变化 → sheetH 变了，
   * 必须把抽屉重新贴回当前吸附点，否则会停在半空。
   */
  useEffect(() => {
    const target = isOpen.current ? 0 : collapsedY;
    ty.stopAnimation();
    ty.setValue(target);
    startY.current = target;
  }, [ty, collapsedY]);

  /** 受控：外部 expanded 变化时滑到对应吸附点 */
  useEffect(() => {
    if (expanded === undefined) return;
    if (expanded === isOpen.current) return;
    animateTo(expanded ? 0 : collapsedY);
  }, [expanded, animateTo, collapsedY]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        // 把手行：任意方向都抢，拖哪儿都跟手
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dy) > 3 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderGrant: () => {
          ty.stopAnimation();
          // 记下手势起点（绝对值），后续只按 g.dy 偏移，避免连续拖动跳变
          startY.current = readY();
          ty.setOffset(startY.current);
          ty.setValue(0);
        },
        onPanResponderMove: (_e, g) => {
          // 只允许在 [0, collapsedY] 区间内跟手
          ty.setValue(clamp(g.dy, -startY.current, collapsedY - startY.current));
        },
        onPanResponderRelease: (_e, g) => {
          const cur = startY.current + g.dy;
          // 位移很小 → 当成点按把手：直接切换展开态
          if (Math.abs(g.dy) < 6 && Math.abs(g.dx) < 6) {
            ty.setOffset(0);
            animateTo(isOpen.current ? collapsedY : 0);
            return;
          }
          let target: number;
          if (Math.abs(g.vy) > VELOCITY_THRESHOLD) {
            // 甩动：向下甩收起，向上甩展开
            target = g.vy > 0 ? collapsedY : 0;
          } else {
            target = cur > collapsedY / 2 ? collapsedY : 0;
          }
          animateTo(target, g.vy);
        },
        onPanResponderTerminate: () => {
          animateTo(readY() > collapsedY / 2 ? collapsedY : 0);
        },
      }),
    [ty, collapsedY, animateTo, readY],
  );

  return (
    <Animated.View
      style={[
        styles.sheet,
        {
          height: sheetH,
          bottom: bottomOffset,
          transform: [{ translateY: ty }],
        },
      ]}
    >
      {/* ───── 把手行：拖动开合；轻点（位移 < 6dp）等同点按切换 ─────
          注意这里刻意不用 Pressable 包一层：RN 的响应者协商是从最深层往上问，
          子 Pressable 会先抢走触摸，父级 PanResponder 就永远收不到 onMove，
          拖动会失效。所以点按也由 PanResponder 自己按位移判定。 */}
      <View style={styles.handle} {...pan.panHandlers}>
        <View style={styles.handleHit}>
          <View style={styles.grip} />
          <View style={styles.handleTextCol}>
            <View style={styles.handleTitleRow}>
              <Text style={styles.handleTitle}>选号</Text>
              <Text style={styles.handleTab}>{tabLabel}</Text>
            </View>
            <Text style={styles.handleGame}>{gameName}</Text>
          </View>
          <Text style={styles.handleArrow}>{openView ? '▼' : '▲'}</Text>
        </View>
      </View>
      <View style={styles.divider} />

      {/* ───── 固定区：不随内容滚动（分组页签行，对齐参考图） ───── */}
      {fixedHeader ? <View style={styles.fixedHeader}>{fixedHeader}</View> : null}

      {/* ───── 内容区：正常上下滚动，手势不参与开合 ───── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollInner}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        {children}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: semantic.panelBg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderTopColor: semantic.panelBorder,
    // 抽屉压在内容之上，不参与父级 column 的高度分配
    zIndex: 20,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -2 },
    overflow: 'hidden',
  },
  handle: { height: PEEK_H, justifyContent: 'center' },
  handleHit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  grip: {
    width: 34,
    height: 4,
    borderRadius: 2,
    backgroundColor: semantic.textFaint,
  },
  handleTextCol: { flex: 1 },
  handleTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  handleTitle: { fontSize: fs.sm, fontWeight: '700', color: semantic.text },
  handleTab: { fontSize: fs.xs, color: semantic.brand, fontWeight: '600' },
  handleGame: { fontSize: fs.micro, color: semantic.textDim, marginTop: 2 },
  handleArrow: { fontSize: fs.sm, color: semantic.textDim },
  divider: { height: 1, backgroundColor: semantic.divider },
  fixedHeader: {
    paddingHorizontal: space.md,
    paddingTop: space.xs,
    backgroundColor: semantic.panelBg,
  },
  scroll: { flex: 1 },
  scrollInner: { padding: space.md, paddingBottom: space.xxl },
});

export default PickSheet;

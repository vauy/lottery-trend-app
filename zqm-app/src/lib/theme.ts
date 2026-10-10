/**
 * 设计体系 —— 全局唯一的视觉基准
 *
 * 所有屏幕、组件、图表都从这里取色取值，禁止在业务文件里写死颜色，
 * 保证深色翡翠绿风格在 4 个彩种 × 6 个页签下完全一致。
 */

/** 原始色板 */
export const palette = {
  /** 页面底色 */
  bg: '#0B110D',
  /** 更深的底色（嵌套区） */
  bg2: '#050806',
  /** 卡片/面板 */
  surface: '#141D18',
  /** 卡片内次级区域 */
  surface2: '#1F2924',
  /** 分隔线 */
  line: '#2C3932',
  /** 主文字 */
  ink: '#E7EDE9',
  /** 次级文字 */
  inkDim: '#909C94',
  /** 弱文字 */
  inkFaint: '#616C65',
  /** 品牌色（翡翠绿） */
  accent: '#60DB89',
  /** 品牌色上的文字 */
  accentInk: '#001706',
  /** 强调/热 */
  amber: '#F2B95A',
  amberInk: '#2E1B00',
  /** 涨 / 开出 */
  red: '#EF6661',
  /** 跌 / 遗漏 */
  cyan: '#4FCDCD',
  /** 冷 */
  green: '#2EA063',
} as const;

/** 语义色：业务文件只用这一层 */
export const semantic = {
  pageBg: palette.bg,
  contentBg: palette.bg2,
  panelBg: palette.surface,
  panelBorder: palette.line,
  controlBg: palette.surface2,
  text: palette.ink,
  textDim: palette.inkDim,
  textFaint: palette.inkFaint,
  brand: palette.accent,
  onBrand: palette.accentInk,
  /** 开出 / 阳线 */
  hot: palette.red,
  /** 遗漏 / 阴线 */
  cold: palette.cyan,
  warn: palette.amber,
  onWarn: palette.amberInk,
  divider: palette.line,
} as const;

/** 间距：4pt 网格 */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** 圆角 */
export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
} as const;

/** 触控最小尺寸（安卓可点击元素建议 ≥44） */
export const touch = {
  min: 44,
  sm: 36,
} as const;

/** 字号 */
export const fontSize = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

/** 图表尺寸：竖屏 / 横屏分别给高度，宽度由容器动态推导 */
export const chartSize = {
  h: 200,
  hLandscape: 240,
  /** 遗漏图里同屏格子的固定宽度 */
  tongCell: 88,
} as const;

/** 给 hex 颜色加透明度，返回 #RRGGBBAA */
export function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const v = Math.round(Math.max(0, Math.min(1, a)) * 255);
  const s = v.toString(16).padStart(2, '0');
  return `#${full}${s}`;
}

/** 冷温热 → 颜色 */
export function temperatureColor(t: 'cold' | 'warm' | 'hot'): string {
  if (t === 'hot') return semantic.hot;
  if (t === 'warm') return semantic.warn;
  return semantic.cold;
}

const theme = {
  palette,
  semantic,
  space,
  radius,
  touch,
  fontSize,
  chartSize,
  alpha,
  temperatureColor,
};

export default theme;

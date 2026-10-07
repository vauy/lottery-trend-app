/**
 * 图表工具函数 —— 比例尺 / 刻度 / 路径
 */

/** 线性比例尺：将 domain 值映射到 range 像素 */
export function scaleLinear(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  const k = span === 0 ? 0 : (r1 - r0) / span;
  return (v: number) => r0 + (v - d0) * k;
}

/** 将最大值向上取整到「好看」的刻度（1/2/5 × 10^n） */
export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / mag;
  let nice = 1;
  if (norm <= 1) nice = 1;
  else if (norm <= 2) nice = 2;
  else if (norm <= 2.5) nice = 2.5;
  else if (norm <= 5) nice = 5;
  else nice = 10;
  return nice * mag;
}

/** 生成 Y 轴刻度值数组（从 0 到 max，共约 tickCount 个） */
export function buildTicks(max: number, tickCount = 5): number[] {
  const top = niceMax(max);
  const step = top / tickCount;
  const ticks: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    ticks.push(Number((i * step).toFixed(4)));
  }
  return ticks;
}

/** 将点序列转为折线 Path 的 d 属性（跳过 null 点） */
export function buildLinePath(
  points: { x: number; y: number | null }[],
): string {
  let d = '';
  let started = false;
  for (const p of points) {
    if (p.y === null) {
      started = false;
      continue;
    }
    if (!started) {
      d += `M ${p.x} ${p.y}`;
      started = true;
    } else {
      d += ` L ${p.x} ${p.y}`;
    }
  }
  return d;
}
export const ALL_DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const isPrime = (n: number) => [1, 2, 3, 5, 7].includes(n);

export type Filters = {
  posBai: number[];
  posShi: number[];
  posGe: number[];
  danCount: Record<number, number | null>;
  bigSmall: number[];
  oddEven: number[];
  primeCount: number[];
  bmsKey: string[];      // 大中小组合，如 "3大" "2大1中"
  minNum: number[];
  midNum: number[];
  maxNum: number[];
  sum: number[];
  sumTail: number[];
  span: number[];
  lianhao: number[];     // 0=无 / 2=二连 / 3=三连
  pair: number[];        // 0=无 / 3=组三 / 9=豹子
  road0: number[];
  road1: number[];
  road2: number[];
  twoSumTail: number[];
  twoDiff: number[];
  pair2: string[];       // 不定位两码，如 "01" "05"
};

export function emptyFilters(): Filters {
  const danCount: Record<number, number | null> = {};
  for (let i = 0; i <= 9; i += 1) danCount[i] = null;
  return {
    posBai: [...ALL_DIGITS],
    posShi: [...ALL_DIGITS],
    posGe: [...ALL_DIGITS],
    danCount,
    bigSmall: [], oddEven: [], primeCount: [], bmsKey: [],
    minNum: [], midNum: [], maxNum: [],
    sum: [], sumTail: [], span: [],
    lianhao: [], pair: [],
    road0: [], road1: [], road2: [],
    twoSumTail: [], twoDiff: [], pair2: [],
  };
}

/** 大中小组合键：按「X大Y中Z小」生成 */
export function bmsKeyOf(nums: number[]): string {
  let big = 0, mid = 0, small = 0;
  for (const n of nums) {
    if (n >= 7) big += 1;
    else if (n >= 3) mid += 1;
    else small += 1;
  }
  const parts: string[] = [];
  if (big > 0) parts.push(`${big}大`);
  if (mid > 0) parts.push(`${mid}中`);
  if (small > 0) parts.push(`${small}小`);
  return parts.join('');
}

/** 最长连号：无连=0，二连=2，三连=3 */
export function maxChainOf(nums: number[]): number {
  const uniq = Array.from(new Set(nums)).sort((a, b) => a - b);
  let maxC = 1, cur = 1;
  for (let i = 1; i < uniq.length; i += 1) {
    if (uniq[i] === uniq[i - 1] + 1) cur += 1;
    else cur = 1;
    if (cur > maxC) maxC = cur;
  }
  return maxC >= 2 ? maxC : 0;
}

export function isFilterEmpty(f: Filters): boolean {
  if (f.posBai.length < 10 || f.posShi.length < 10 || f.posGe.length < 10) return false;
  if (f.bigSmall.length > 0 || f.oddEven.length > 0 || f.primeCount.length > 0) return false;
  if (f.bmsKey.length > 0) return false;
  if (f.minNum.length > 0 || f.midNum.length > 0 || f.maxNum.length > 0) return false;
  if (f.sum.length > 0 || f.sumTail.length > 0 || f.span.length > 0) return false;
  if (f.lianhao.length > 0 || f.pair.length > 0) return false;
  if (f.road0.length > 0 || f.road1.length > 0 || f.road2.length > 0) return false;
  if (f.twoSumTail.length > 0 || f.twoDiff.length > 0 || f.pair2.length > 0) return false;
  for (let i = 0; i <= 9; i += 1) {
    if (f.danCount[i] !== null) return false;
  }
  return true;
}

export function applyFilters(codes: string[], f: Filters): string[] {
  return codes.filter((code) => {
    const nums = code.split('').map(Number);
    const [a, b, c] = nums;
    const sorted = [...nums].sort((x, y) => x - y);

    // 定位
    if (f.posBai.length < 10 && !f.posBai.includes(a)) return false;
    if (f.posShi.length < 10 && !f.posShi.includes(b)) return false;
    if (f.posGe.length < 10 && !f.posGe.includes(c)) return false;

    // 胆码出次
    for (let d = 0; d <= 9; d += 1) {
      const want = f.danCount[d];
      if (want === null) continue;
      const actual = nums.filter((x) => x === d).length;
      if (actual !== want) return false;
    }

    // 大小
    if (f.bigSmall.length > 0) {
      const bigCount = nums.filter((x) => x >= 5).length;
      if (!f.bigSmall.includes(bigCount)) return false;
    }
    // 单双
    if (f.oddEven.length > 0) {
      const oddCount = nums.filter((x) => x % 2 === 1).length;
      if (!f.oddEven.includes(oddCount)) return false;
    }
    // 质合
    if (f.primeCount.length > 0) {
      const primeCnt = nums.filter(isPrime).length;
      if (!f.primeCount.includes(primeCnt)) return false;
    }
    // 大中小
    if (f.bmsKey.length > 0) {
      const key = bmsKeyOf(nums);
      if (!f.bmsKey.includes(key)) return false;
    }

    // 最数
    if (f.minNum.length > 0 && !f.minNum.includes(sorted[0])) return false;
    if (f.midNum.length > 0 && !f.midNum.includes(sorted[1])) return false;
    if (f.maxNum.length > 0 && !f.maxNum.includes(sorted[2])) return false;

    // 和值 / 和值尾 / 跨度
    const sum = a + b + c;
    if (f.sum.length > 0 && !f.sum.includes(sum)) return false;
    if (f.sumTail.length > 0 && !f.sumTail.includes(sum % 10)) return false;
    if (f.span.length > 0 && !f.span.includes(sorted[2] - sorted[0])) return false;

    // 连号
    if (f.lianhao.length > 0 && !f.lianhao.includes(maxChainOf(nums))) return false;

    // 成对
    if (f.pair.length > 0) {
      const uniqSize = new Set(nums).size;
      let type = 0;
      if (uniqSize === 1) type = 9;
      else if (uniqSize === 2) type = 3;
      if (!f.pair.includes(type)) return false;
    }

    // 012 路
    const r0 = nums.filter((n) => n % 3 === 0).length;
    const r1 = nums.filter((n) => n % 3 === 1).length;
    const r2 = nums.filter((n) => n % 3 === 2).length;
    if (f.road0.length > 0 && !f.road0.includes(r0)) return false;
    if (f.road1.length > 0 && !f.road1.includes(r1)) return false;
    if (f.road2.length > 0 && !f.road2.includes(r2)) return false;

    // 两码和尾
    const twoSumTails = [(a + b) % 10, (a + c) % 10, (b + c) % 10];
    if (f.twoSumTail.length > 0 && !twoSumTails.some((s) => f.twoSumTail.includes(s))) return false;

    // 两码差
    const twoDiffs = [Math.abs(a - b), Math.abs(a - c), Math.abs(b - c)];
    if (f.twoDiff.length > 0 && !twoDiffs.some((s) => f.twoDiff.includes(s))) return false;

    // 不定位两码
    if (f.pair2.length > 0) {
      const pairs = [
        `${Math.min(a, b)}${Math.max(a, b)}`,
        `${Math.min(a, c)}${Math.max(a, c)}`,
        `${Math.min(b, c)}${Math.max(b, c)}`,
      ];
      if (!pairs.some((p) => f.pair2.includes(p))) return false;
    }

    return true;
  });
}

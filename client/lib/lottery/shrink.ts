/**
 * 缩水工具核心算法 —— 按条件过滤 000~999 的所有号码。
 */

/** 缩水条件 */
export interface ShrinkConditions {
  // 胆码：选中数字 -> 要求出现次数（1/2/3）
  digits: Record<number, number>;
  // 大小：全选 / 3大 / 2大1小 / 1大2小 / 3小
  bigSmall?: 'all' | '3big' | '2big1small' | '1big2small' | '3small';
  // 单双
  oddEven?: 'all' | '3odd' | '2odd1even' | '1odd2even' | '3even';
  // 质合
  primeComposite?: 'all' | '3prime' | '2prime1comp' | '1prime2comp' | '3comp';
  // 和值范围
  sumMin?: number;
  sumMax?: number;
  // 和值尾
  sumTail?: number[];
  // 跨度
  spanMin?: number;
  spanMax?: number;
  // 连号
  consecutive?: 'none' | '2' | '3';
  // 成对
  pairType?: 'none' | 'pair' | 'leopard';
  // 012路
  road012?: string[];
  // 不定位两码（必含）
  mustIncludePairs?: string[];
  // 不定位两码（不含）
  mustExcludePairs?: string[];
}

/** 判断一个号码的所有数字 */
function digitsOf(n: number): number[] {
  const a = Math.floor(n / 100);
  const b = Math.floor((n % 100) / 10);
  const c = n % 10;
  return [a, b, c];
}

/** 判断大小 */
function isBig(n: number): boolean { return n >= 5; }

/** 判断质数（按说明书：1算质数，0算合数） */
function isPrime(n: number): boolean {
  return n === 1 || n === 2 || n === 3 || n === 5 || n === 7;
}

/** 012路 */
function roadOf(n: number): number { return n % 3; }

/** 是否有连号 */
function hasConsecutive(nums: number[], count: number): boolean {
  const set = new Set(nums);
  for (let i = 0; i <= 9; i++) {
    if (set.has(i)) {
      let ok = true;
      for (let j = 1; j < count; j++) {
        if (!set.has(i + j)) { ok = false; break; }
      }
      if (ok) return true;
    }
  }
  return false;
}

/** 是否有对 */
function hasPair(nums: number[]): boolean {
  return new Set(nums).size === 2;
}

/** 是否是豹子 */
function isLeopard(nums: number[]): boolean {
  return new Set(nums).size === 1;
}

/** 两码组合（不定位，升序拼接） */
function pairCode(a: number, b: number): string {
  const x = Math.min(a, b);
  const y = Math.max(a, b);
  return `${x}${y}`;
}

/** 两码（不定位）是否包含某组合 */
function hasPairCombination(nums: number[], pair: string): boolean {
  const [x, y] = [parseInt(pair[0]), parseInt(pair[1])];
  const sorted = [...nums].sort((a, b) => a - b);
  // 找 nums 中是否有两个数字能组成 pair
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (pairCode(sorted[i], sorted[j]) === pair) return true;
    }
  }
  return false;
}

/** 主函数：按条件过滤所有 000~999 号码 */
export function shrinkNumbers(conditions: ShrinkConditions): string[] {
  const result: string[] = [];

  for (let i = 0; i <= 999; i++) {
    const nums = digitsOf(i);
    const [a, b, c] = nums;

    // ===== 胆码 =====
    const digitCount: Record<number, number> = {};
    for (const n of nums) digitCount[n] = (digitCount[n] || 0) + 1;
    let digitPass = true;
    for (const [dStr, cnt] of Object.entries(conditions.digits)) {
      const d = parseInt(dStr);
      if ((digitCount[d] || 0) !== cnt) { digitPass = false; break; }
    }
    if (!digitPass) continue;

    // ===== 大小 =====
    if (conditions.bigSmall && conditions.bigSmall !== 'all') {
      const bigCount = nums.filter(isBig).length;
      const smallCount = 3 - bigCount;
      const map: Record<string, [number, number]> = {
        '3big': [3, 0], '2big1small': [2, 1], '1big2small': [1, 2], '3small': [0, 3],
      };
      const target = map[conditions.bigSmall];
      if (target[0] !== bigCount) continue;
    }

    // ===== 单双 =====
    if (conditions.oddEven && conditions.oddEven !== 'all') {
      const oddCount = nums.filter((n) => n % 2 !== 0).length;
      const evenCount = 3 - oddCount;
      const map: Record<string, [number, number]> = {
        '3odd': [3, 0], '2odd1even': [2, 1], '1odd2even': [1, 2], '3even': [0, 3],
      };
      const target = map[conditions.oddEven];
      if (target[0] !== oddCount) continue;
    }

    // ===== 质合 =====
    if (conditions.primeComposite && conditions.primeComposite !== 'all') {
      const primeCount = nums.filter(isPrime).length;
      const compCount = 3 - primeCount;
      const map: Record<string, [number, number]> = {
        '3prime': [3, 0], '2prime1comp': [2, 1], '1prime2comp': [1, 2], '3comp': [0, 3],
      };
      const target = map[conditions.primeComposite];
      if (target[0] !== primeCount) continue;
    }

    // ===== 和值范围 =====
    const sum = a + b + c;
    if (conditions.sumMin !== undefined && sum < conditions.sumMin) continue;
    if (conditions.sumMax !== undefined && sum > conditions.sumMax) continue;

    // ===== 和值尾 =====
    if (conditions.sumTail && conditions.sumTail.length > 0) {
      if (!conditions.sumTail.includes(sum % 10)) continue;
    }

    // ===== 跨度 =====
    const sorted = [...nums].sort((x, y) => x - y);
    const span = sorted[2] - sorted[0];
    if (conditions.spanMin !== undefined && span < conditions.spanMin) continue;
    if (conditions.spanMax !== undefined && span > conditions.spanMax) continue;

    // ===== 连号 =====
    if (conditions.consecutive === 'none') {
      if (hasConsecutive(nums, 2)) continue;
    } else if (conditions.consecutive === '2') {
      if (!hasConsecutive(nums, 2) || hasConsecutive(nums, 3)) continue;
    } else if (conditions.consecutive === '3') {
      if (!hasConsecutive(nums, 3)) continue;
    }

    // ===== 成对 =====
    if (conditions.pairType === 'none') {
      if (hasPair(nums) || isLeopard(nums)) continue;
    } else if (conditions.pairType === 'pair') {
      if (!hasPair(nums)) continue;
    } else if (conditions.pairType === 'leopard') {
      if (!isLeopard(nums)) continue;
    }

    // ===== 012路 =====
    if (conditions.road012 && conditions.road012.length > 0) {
      const roads = nums.map(roadOf).sort().join('');
      if (!conditions.road012.includes(roads)) continue;
    }

    // ===== 不定位两码：必含 =====
    if (conditions.mustIncludePairs && conditions.mustIncludePairs.length > 0) {
      let ok = true;
      for (const pair of conditions.mustIncludePairs) {
        if (!hasPairCombination(nums, pair)) { ok = false; break; }
      }
      if (!ok) continue;
    }

    // ===== 不定位两码：不含 =====
    if (conditions.mustExcludePairs && conditions.mustExcludePairs.length > 0) {
      let bad = false;
      for (const pair of conditions.mustExcludePairs) {
        if (hasPairCombination(nums, pair)) { bad = true; break; }
      }
      if (bad) continue;
    }

    result.push(String(i).padStart(3, '0'));
  }

  return result;
}
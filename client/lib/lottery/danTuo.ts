/**
 * 胆拖组号算法。
 *
 * 规则：
 *  - 每一注必须包含「所有」胆码
 *  - 拖码非空时，每一注必须至少包含一个拖码
 *  - 其他位 0-9 任意
 *  - 直选：所有 D 位排列
 *  - 组选：直选按升序去重
 *
 * digitCount 控制位数（3 = 排列三/3D，5 = 排列五），默认 3。
 */

export type DanTuoResult = {
  zhixuan: string[];
  zuxuan: string[];
};

/** 递归枚举所有 D 位号码（每位 0-9），对命中的调用 cb */
function eachNumber(D: number, cb: (nums: number[]) => void): void {
  const cur = new Array<number>(D).fill(0);
  const rec = (i: number): void => {
    if (i === D) {
      cb(cur);
      return;
    }
    for (let d = 0; d <= 9; d += 1) {
      cur[i] = d;
      rec(i + 1);
    }
  };
  rec(0);
}

export function generateDanTuo(
  dan: number[],
  tuo: number[],
  digitCount: number = 3,
): DanTuoResult {
  const zhixuan: string[] = [];
  const zuxuanSet = new Set<string>();
  const D = Math.max(1, digitCount);

  if (dan.length === 0 && tuo.length === 0) {
    return { zhixuan: [], zuxuan: [] };
  }

  eachNumber(D, (nums) => {
    // 条件 1：必须含所有胆码
    if (!dan.every((d) => nums.includes(d))) return;
    // 条件 2：拖码非空时必须含至少一个
    if (tuo.length > 0 && !tuo.some((t) => nums.includes(t))) return;

    zhixuan.push(nums.join(''));
    zuxuanSet.add([...nums].sort((x, y) => x - y).join(''));
  });

  return {
    zhixuan: zhixuan.sort(),
    zuxuan: Array.from(zuxuanSet).sort(),
  };
}

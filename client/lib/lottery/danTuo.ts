/**
 * 胆拖组号算法。
 *
 * 规则：
 *  - 每一注必须包含「所有」胆码
 *  - 拖码非空时，每一注必须至少包含一个拖码
 *  - 其他位 0-9 任意
 *  - 直选：所有 3 位排列
 *  - 组选：直选按升序去重
 */

export type DanTuoResult = {
  zhixuan: string[];
  zuxuan: string[];
};

export function generateDanTuo(dan: number[], tuo: number[]): DanTuoResult {
  const zhixuan: string[] = [];
  const zuxuanSet = new Set<string>();

  if (dan.length === 0 && tuo.length === 0) {
    return { zhixuan: [], zuxuan: [] };
  }

  for (let a = 0; a <= 9; a += 1) {
    for (let b = 0; b <= 9; b += 1) {
      for (let c = 0; c <= 9; c += 1) {
        const nums = [a, b, c];
        // 条件 1：必须含所有胆码
        if (!dan.every((d) => nums.includes(d))) continue;
        // 条件 2：拖码非空时必须含至少一个
        if (tuo.length > 0 && !tuo.some((t) => nums.includes(t))) continue;

        zhixuan.push(`${a}${b}${c}`);
        zuxuanSet.add([...nums].sort((x, y) => x - y).join(''));
      }
    }
  }

  return {
    zhixuan: zhixuan.sort(),
    zuxuan: Array.from(zuxuanSet).sort(),
  };
}

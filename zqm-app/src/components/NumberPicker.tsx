/**
 * 号码选择器
 *
 * 位置型彩种（3D/排列三/排列五）：0-9，一行 6 个，两行排完。
 * 快乐8：1-80，一行 8 个，共 10 行，放在可滚动区域内，横屏时一行 12 个以利用宽度。
 */
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { fontSize, radius, semantic, space, touch } from '../lib/theme';
import type { GameTypeDef } from '../lib/lottery/types';
import { Chip } from './ui/Kit';

export interface NumberPickerProps {
  game: GameTypeDef;
  /** 已选号码 */
  value: number[];
  onChange: (next: number[]) => void;
  /** 单选模式：点击直接替换选中（K 线分析用） */
  single?: boolean;
  landscape?: boolean;
  /** 高度上限（快乐8 号码多时需要限制高度） */
  maxHeight?: number;
}

export function NumberPicker({
  game,
  value,
  onChange,
  single = false,
  landscape = false,
  maxHeight,
}: NumberPickerProps) {
  const digits = useMemo(() => {
    const out: number[] = [];
    for (let d = game.digitMin; d <= game.digitMax; d += 1) out.push(d);
    return out;
  }, [game]);

  const isLarge = digits.length > 20;
  const columns = isLarge ? (landscape ? 12 : 8) : 6;
  const size = isLarge ? (landscape ? 38 : 36) : landscape ? 46 : 44;

  const toggle = (d: number) => {
    if (single) {
      onChange([d]);
      return;
    }
    onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d]);
  };

  const body = (
    <View style={[styles.grid, { gap: space.xs }]}>
      {digits.map((d) => (
        <Chip
          key={d}
          label={String(d).padStart(isLarge ? 2 : 1, '0')}
          active={value.includes(d)}
          onPress={() => toggle(d)}
          style={{ width: size, height: size }}
        />
      ))}
    </View>
  );

  return (
    <View style={styles.wrap}>
      {isLarge ? (
        <View style={{ maxHeight: maxHeight ?? 200 }}>
          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
            {body}
          </ScrollView>
        </View>
      ) : (
        body
      )}
      <View style={styles.actions}>
        {single ? null : (
          <>
            <Chip label="全选" onPress={() => onChange(digits)} />
            <Chip label="清空" onPress={() => onChange([])} />
          </>
        )}
        <Text style={styles.hint}>已选 {value.length} 个</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.sm,
  },
  hint: {
    color: semantic.textFaint,
    fontSize: fontSize.xs,
    marginLeft: 'auto',
  },
});

/**
 * 彩种切换条 —— 福彩3D / 排列三 / 排列五 / 快乐8
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { GAME_ORDER } from '../lib/lottery/games';
import { getGame } from '../lib/lottery/games';
import type { GameId } from '../lib/lottery/types';
import { semantic, space } from '../lib/theme';
import { Segmented } from './ui/Kit';

export function GameSwitch({
  value,
  onChange,
  compact = false,
}: {
  value: GameId;
  onChange: (v: GameId) => void;
  /** 紧凑模式（横屏顶栏用）：控件减薄，少占纵向空间 */
  compact?: boolean;
}) {
  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <Segmented
        options={GAME_ORDER.map((id) => ({ value: id, label: getGame(id).name }))}
        value={value}
        onChange={onChange}
        compact={compact}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: space.md,
  },
  wrapCompact: {
    marginBottom: space.sm,
  },
});

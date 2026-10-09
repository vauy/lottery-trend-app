/**
 * 胆码选择器（多选版） —— 0-9 数字按钮，可多选。
 */
import { Pressable, Text, View } from 'react-native';
import type { TemperatureStatus } from '@/lib/lottery/types';
import { palette } from '@/lib/theme';

/** 冷温热配色与原型对齐：热=红 #EF6661、温=琥珀 #F2B95A、冷=青 #4FCDCD */
const TEMP_TEXT: Record<TemperatureStatus, string> = {
  hot: palette.red,
  warm: palette.amber,
  cold: palette.cyan,
};

export function DigitSelectorMulti({
  digits,
  selected,
  onToggle,
  temperatureMap,
}: {
  digits: number[];
  selected: Set<number>;
  onToggle: (d: number) => void;
  temperatureMap?: Record<number, TemperatureStatus>;
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {digits.map((d) => {
        const active = selected.has(d);
        const temp = temperatureMap?.[d];
        return (
          <Pressable
            key={d}
            onPress={() => onToggle(d)}
            className={`w-9 h-9 rounded-lg items-center justify-center border ${
              active ? 'bg-accent border-accent' : 'bg-white border-border'
            }`}
          >
            <Text
              className={`text-base font-bold ${
                active ? 'text-accent-foreground' : temp ? '' : 'text-foreground'
              }`}
              style={active ? undefined : temp ? { color: TEMP_TEXT[temp] } : undefined}
            >
              {d}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

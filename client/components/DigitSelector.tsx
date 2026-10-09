/**
 * 胆码选择器 —— 0-9 数字按钮组，按冷温热染色，支持单选。
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

export function DigitSelector({
  digits,
  selected,
  onSelect,
  temperatureMap,
}: {
  digits: number[];
  selected: number;
  onSelect: (d: number) => void;
  /** 数字 -> 冷温热（用于染色） */
  temperatureMap?: Record<number, TemperatureStatus>;
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {digits.map((d) => {
        const active = d === selected;
        const temp = temperatureMap?.[d];
        return (
          <Pressable
            key={d}
            onPress={() => onSelect(d)}
            className={`w-9 h-9 rounded-lg items-center justify-center border ${
              active ? 'bg-accent border-accent' : 'bg-white border-border'
            }`}
          >
            <Text
              className={`text-base font-bold ${
                active
                  ? 'text-accent-foreground'
                  : temp
                    ? ''
                    : 'text-foreground'
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
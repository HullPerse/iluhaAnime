import { hslToHsv, rgbToHsv } from "@/lib/graphics/color.utils";
import { clamp } from "@/lib/core/math.utils";
import type { ChannelFormat, HSV } from "@/types/graphics/color";

export const toChannels = (format: ChannelFormat, values: readonly string[]): HSV | null => {
  const numbers = values.map((value) => Math.trunc(Number(value)));
  if (values.some((value) => value === "") || numbers.some(Number.isNaN)) return null;
  const [first = 0, second = 0, third = 0] = numbers;
  if (format === "rgb") {
    return rgbToHsv({ b: clamp(third, 0, 255), g: clamp(second, 0, 255), r: clamp(first, 0, 255) });
  }
  return hslToHsv({ h: clamp(first, 0, 360), l: clamp(third, 0, 100), s: clamp(second, 0, 100) });
};

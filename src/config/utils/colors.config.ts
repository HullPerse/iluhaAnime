import type { ChannelFormat, ColorFormat } from "@/types/color";

export const HUE_GRADIENT =
  "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)";

export const COLOR_FORMATS: readonly ColorFormat[] = ["hex", "rgb", "hsl"];

export const CHANNEL_CONFIG: Record<
  ChannelFormat,
  { maxs: readonly [number, number, number]; names: readonly [string, string, string] }
> = {
  rgb: { maxs: [255, 255, 255], names: ["r", "g", "b"] },
  hsl: { maxs: [360, 100, 100], names: ["h", "s", "l"] },
};

import type { ChannelFormat, ColorFormat } from "@/types/color";

export const PALETTE = [
  "#808080",
  "#800000",
  "#808000",
  "#008000",
  "#008080",
  "#000080",
  "#800080",
  "#ffffff",
  "#c0c0c0",
  "#ff0000",
  "#ffff00",
  "#00ff00",
  "#00ffff",
  "#0000ff",
  "#ff00ff",
  "#e0e0e0",
  "#a04000",
  "#ff8000",
  "#40ff00",
  "#00ff80",
  "#0040ff",
  "#8000ff",
  "#a0a0a0",
  "#ff8080",
  "#ffff80",
  "#80ff80",
  "#80ffff",
  "#8080ff",
  "#ff80ff",
  "#404040",
  "#600000",
  "#ff4000",
  "#ffff40",
  "#40ff40",
  "#40ffff",
  "#4040ff",
  "#ff40ff",
  "#a0a0a4",
  "#000000",
  "#c08040",
  "#80ff00",
  "#00c080",
  "#0080ff",
  "#8000c0",
  "#ff0080",
];

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

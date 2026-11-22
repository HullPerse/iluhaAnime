import { readerPalette } from "@/config/manga/reader.config";
import type { readerDirections, readerDisplays, readerModes } from "@/config/manga/reader.config";

export function readerMode(
  display: (typeof readerDisplays)[number],
  direction: (typeof readerDirections)[number]
): (typeof readerModes)[number] {
  return display === "paged" ? direction : display;
}

function readableTextColor(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);

  if (!Number.isFinite(value)) return "#ffffff";
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;

  return (red * 299 + green * 587 + blue * 114) / 1000 > 140 ? "#181818" : "#ffffff";
}

export function readerColors(background: string, custom: string) {
  if (background === "custom") return { backgroundColor: custom, color: readableTextColor(custom) };

  return readerPalette[background] ?? readerPalette.black;
}

export function bookPair(page: number, count: number) {
  if (page < 1 || page >= count - 1) return undefined;
  const first = page % 2 === 0 ? page - 1 : page;

  return first + 1 < count - 1 ? first : undefined;
}

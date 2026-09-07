import {
  DEFAULT_WALLPAPER_FILTERS,
  DEFAULT_WALLPAPER_SHADOW,
} from "@/config/settings/defaults.config";
import { hexToRgba } from "@/lib/utils/color.utils";
import type { WallpaperDisplayFilters, WallpaperShadow } from "@/types/settings";

export function buildWallpaperFilter(filters?: Partial<WallpaperDisplayFilters> | null): string {
  const merged = { ...DEFAULT_WALLPAPER_FILTERS, ...filters };
  const parts: string[] = [];
  if (merged.brightness !== 100) parts.push(`brightness(${merged.brightness}%)`);
  if (merged.contrast !== 100) parts.push(`contrast(${merged.contrast}%)`);
  if (merged.saturate !== 100) parts.push(`saturate(${merged.saturate}%)`);
  if (merged.blur !== 0) parts.push(`blur(${merged.blur}px)`);
  if (merged.opacity !== 100) parts.push(`opacity(${merged.opacity}%)`);
  return parts.length > 0 ? parts.join(" ") : "none";
}

export function buildShadow(
  shadow?: Partial<WallpaperShadow> | null,
  inset = false
): string | undefined {
  const merged: WallpaperShadow = {
    ...DEFAULT_WALLPAPER_SHADOW,
    ...shadow,
    sides: { ...DEFAULT_WALLPAPER_SHADOW.sides, ...shadow?.sides },
  };
  const level = Math.max(0, Math.min(100, merged.intensity)) / 50;
  if (level <= 0) return undefined;
  const parsed = hexToRgba(merged.color);
  const base = parsed ?? { r: 0, g: 0, b: 0, a: 1 };
  const paint = (alpha: number) =>
    `rgba(${base.r},${base.g},${base.b},${Math.min(1, alpha * level)})`;
  const reach = Math.round(8 * level);
  const spread = Math.round(40 * level);
  const prefix = inset ? "inset " : "";
  const flip = inset ? -1 : 1;
  const confine = inset ? ` ${-reach}px` : "";
  const layers: string[] = [];
  if (merged.sides.top)
    layers.push(`${prefix}0 ${flip * -reach}px ${spread}px${confine} ${paint(0.5)}`);
  if (merged.sides.right)
    layers.push(`${prefix}${flip * reach}px 0 ${spread}px${confine} ${paint(0.5)}`);
  if (merged.sides.bottom)
    layers.push(`${prefix}0 ${flip * reach}px ${spread}px${confine} ${paint(0.5)}`);
  if (merged.sides.left)
    layers.push(`${prefix}${flip * -reach}px 0 ${spread}px${confine} ${paint(0.5)}`);
  return layers.length > 0 ? layers.join(", ") : undefined;
}

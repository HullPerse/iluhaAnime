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

export function buildShadow(shadow?: Partial<WallpaperShadow> | null): string | undefined {
  const merged = mergeShadow(shadow);
  if (merged.intensity <= 0) return undefined;
  const offset = Math.round(Math.max(0, Math.min(100, merged.length)));
  const blur = Math.round(Math.max(0, Math.min(100, merged.softness)));
  const paint = rgbaOf(merged, Math.min(1, merged.intensity / 100));
  const layers: string[] = [];
  if (merged.sides.top) layers.push(`0 ${-offset}px ${blur}px ${paint}`);
  if (merged.sides.right) layers.push(`${offset}px 0 ${blur}px ${paint}`);
  if (merged.sides.bottom) layers.push(`0 ${offset}px ${blur}px ${paint}`);
  if (merged.sides.left) layers.push(`${-offset}px 0 ${blur}px ${paint}`);
  return layers.length > 0 ? layers.join(", ") : undefined;
}

export function buildShadowGradients(shadow?: Partial<WallpaperShadow> | null): string | undefined {
  const merged = mergeShadow(shadow);
  if (merged.intensity <= 0) return undefined;
  const solid = Math.round(Math.max(0, Math.min(100, merged.length)));
  const fade = Math.round(Math.max(0, Math.min(100, merged.softness)));
  const end = solid + fade;
  if (end <= 0) return undefined;
  const paint = rgbaOf(merged, Math.min(1, merged.intensity / 100));
  const layers: string[] = [];
  if (merged.sides.top)
    layers.push(
      `linear-gradient(to bottom, ${paint} 0px, ${paint} ${solid}px, transparent ${end}px)`
    );
  if (merged.sides.right)
    layers.push(
      `linear-gradient(to left, ${paint} 0px, ${paint} ${solid}px, transparent ${end}px)`
    );
  if (merged.sides.bottom)
    layers.push(
      `linear-gradient(to top, ${paint} 0px, ${paint} ${solid}px, transparent ${end}px)`
    );
  if (merged.sides.left)
    layers.push(
      `linear-gradient(to right, ${paint} 0px, ${paint} ${solid}px, transparent ${end}px)`
    );
  return layers.length > 0 ? layers.join(", ") : undefined;
}

function mergeShadow(shadow?: Partial<WallpaperShadow> | null): WallpaperShadow {
  return {
    ...DEFAULT_WALLPAPER_SHADOW,
    ...shadow,
    sides: { ...DEFAULT_WALLPAPER_SHADOW.sides, ...shadow?.sides },
  };
}

function rgbaOf(shadow: WallpaperShadow, alpha: number): string {
  const parsed = hexToRgba(shadow.color);
  const base = parsed ?? { r: 0, g: 0, b: 0, a: 1 };
  return `rgba(${base.r},${base.g},${base.b},${alpha})`;
}

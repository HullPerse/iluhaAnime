import { applyWindowChrome } from "@/lib/core/system/window.utils";
import { attemptSync } from "@hullperse/hp_utils/attempt";
import { applyFontFamily, DEFAULT_FONT_FAMILY } from "@/lib/graphics/font.utils";
import { isRecord } from "@/lib/core/text/record.utils";
import type { SettingsAtoms, SettingsData } from "@/types/store/settings";

export function applyUiPreferences(
  retroStyle: SettingsData["retroStyle"],
  uiDensity: SettingsData["uiDensity"]
): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.retroStyle = retroStyle;
  document.documentElement.dataset.uiDensity = uiDensity;
}

export function applyWindowEffect(effect: SettingsData["windowEffect"]): void {
  if (typeof document === "undefined" || !document.documentElement) return;
  document.documentElement.dataset.windowEffect = effect;
}

export function applyWindowTint(opacity: number | null): void {
  if (typeof document === "undefined" || !document.documentElement) return;
  const root = document.documentElement;
  if (opacity === null) {
    root.style.removeProperty("--ui-window-opacity");
    return;
  }
  const clamped = Math.max(0, Math.min(1, opacity));
  root.style.setProperty("--ui-window-opacity", `${Math.round(clamped * 100)}%`, "important");
}

export function applyYorhaScanlines(enabled: boolean): void {
  if (typeof document === "undefined" || !document.documentElement) return;
  document.documentElement.dataset.yorhaScanlines = enabled ? "on" : "off";
}

export function applyPatchSideEffects(atoms: SettingsAtoms, partial: Partial<SettingsData>): void {
  applyUiPreferences(
    partial.retroStyle ?? atoms.retroStyle.get(),
    partial.uiDensity ?? atoms.uiDensity.get()
  );
  if ("yorhaScanlinesEnabled" in partial) {
    applyYorhaScanlines(partial.yorhaScanlinesEnabled ?? atoms.yorhaScanlinesEnabled.get());
  }
  if ("windowEffect" in partial) {
    applyWindowEffect(partial.windowEffect ?? atoms.windowEffect.get());
  }
  if ("windowTintOpacity" in partial) {
    applyWindowTint(partial.windowTintOpacity ?? null);
  }
  if (
    "customTitleBarEnabled" in partial ||
    "roundedWindowCorners" in partial ||
    "windowEffect" in partial
  ) {
    applyWindowChrome({
      customTitleBarEnabled: partial.customTitleBarEnabled ?? atoms.customTitleBarEnabled.get(),
      roundedWindowCorners: partial.roundedWindowCorners ?? atoms.roundedWindowCorners.get(),
      windowEffect: partial.windowEffect ?? atoms.windowEffect.get(),
    });
  }
  if ("appFont" in partial) {
    const next = partial.appFont ?? null;
    if (next) applyFontFamily(next);
    else {
      const [, error] = attemptSync(() => {
        const raw = localStorage.getItem("themeVars");
        const parsed: unknown = raw ? JSON.parse(raw) : null;
        const css =
          isRecord(parsed) && typeof parsed.fontFamily === "string"
            ? parsed.fontFamily
            : DEFAULT_FONT_FAMILY;
        if (typeof document !== "undefined" && document.documentElement)
          document.documentElement.style.setProperty("--font-family", css, "important");
        localStorage.removeItem("appFont");
      });
      if (error !== null) applyFontFamily(null);
    }
  }
}

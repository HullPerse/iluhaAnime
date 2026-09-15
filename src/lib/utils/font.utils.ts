import { attemptSync } from "@/lib/utils/attempt.utils";

export const DEFAULT_FONT_FAMILY = '"MS Sans Serif", "Microsoft Sans Serif", "Segoe UI", system-ui';

function quoteFont(name: string): string {
  const escaped = name.replace(/"/g, '\\"');
  return `"${escaped}"`;
}

export function toCssFontFamily(font: string | null): string {
  if (!font) return DEFAULT_FONT_FAMILY;
  return `${quoteFont(font)}, ${DEFAULT_FONT_FAMILY}`;
}

export function applyFontFamily(font: string | null): void {
  if (typeof document === "undefined" || !document.documentElement) return;
  const css = toCssFontFamily(font);
  document.documentElement.style.setProperty("--font-family", css, "important");
  attemptSync(() => {
    if (font) localStorage.setItem("appFont", font);
    else localStorage.removeItem("appFont");
  });
}

export function getStoredAppFont(): string | null {
  const [font, error] = attemptSync((): string | null => {
    const direct = localStorage.getItem("appFont");
    if (direct && direct.trim().length > 0) return direct;
    const raw = localStorage.getItem("settings");
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object") {
        const obj = parsed as Record<string, unknown>;
        const state = (obj.state as Record<string, unknown> | undefined) ?? obj;
        const stored = state.appFont;
        if (typeof stored === "string" && stored.trim().length > 0) return stored;
      }
    }
    return null;
  });
  return error === null ? font : null;
}

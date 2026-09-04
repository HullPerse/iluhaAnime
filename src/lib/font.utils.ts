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
  try {
    if (font) localStorage.setItem("appFont", font);
    else localStorage.removeItem("appFont");
  } catch {}
}

export function getStoredAppFont(): string | null {
  try {
    const direct = localStorage.getItem("appFont");
    if (direct && direct.trim().length > 0) return direct;
    const raw = localStorage.getItem("settings");
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object") {
        const obj = parsed as Record<string, unknown>;
        const state = (obj.state as Record<string, unknown> | undefined) ?? obj;
        const v = state.appFont;
        if (typeof v === "string" && v.trim().length > 0) return v;
      }
    }
  } catch {}
  return null;
}

export function getEffectiveFont(
  themeFont: string | undefined,
  appFont: string | null | undefined
): string {
  if (typeof appFont === "string" && appFont.trim().length > 0) return appFont;
  try {
    const stored = getStoredAppFont();
    if (stored) return stored;
  } catch {}
  if (themeFont && themeFont.trim().length > 0) return themeFont;
  return "";
}

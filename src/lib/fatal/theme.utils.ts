import { attemptSync } from "@/lib/utils/attempt.utils";

export function readThemeName(): string {
  const dataset = typeof document !== "undefined" ? document.documentElement?.dataset : undefined;
  if (dataset?.theme) return dataset.theme;
  if (typeof localStorage === "undefined") return "win95";
  const [raw, readError] = attemptSync(() => localStorage.getItem("themeVars"));
  if (readError !== null || !raw) return "win95";
  const [parsed, parseError] = attemptSync(() => JSON.parse(raw) as unknown);
  if (parseError !== null || typeof parsed !== "object" || parsed === null) return "win95";
  const name = (parsed as { themeName?: unknown }).themeName;
  return typeof name === "string" ? name : "win95";
}

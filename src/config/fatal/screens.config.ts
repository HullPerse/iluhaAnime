import type { FatalVariant } from "@/types/fatal";

const HISTORICAL_VARIANTS: Record<string, FatalVariant> = {
  win7: "win7",
  win95: "win95",
  xp: "xp",
};

export function resolveFatalVariant(themeName: string, safe: boolean): FatalVariant {
  if (safe) return "win95";
  return HISTORICAL_VARIANTS[themeName] ?? "generic";
}

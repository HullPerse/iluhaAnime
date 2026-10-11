import type { FatalVariant } from "@/types/fatal";

const HISTORICAL_VARIANTS: Record<string, FatalVariant> = {
  win7: "win7",
  win95: "win95",
  xp: "xp",
  terminal: "terminal",
  retroism: "retroism",
};

export function resolveFatalVariant(themeName: string, safe: boolean): FatalVariant {
  if (safe) return "win95";
  if (themeName === "yorha") return "yorha";
  return HISTORICAL_VARIANTS[themeName] ?? "generic";
}

export function resolveSplashVariant(themeName: string, safe: boolean): FatalVariant {
  if (safe) return "win95";
  if (themeName === "yorha") return "yorha";
  return resolveFatalVariant(themeName, false);
}

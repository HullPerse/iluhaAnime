
import type { StreamPrefs, StreamVariant } from "@/types/player/stream";

export function emptyPrefs(sourceId: string, mediaId: string): StreamPrefs {
  return {
    sourceId,
    mediaId,
    variantId: "",
    quality: "",
    audioLang: "",
    subLang: "",
    subEnabled: true,
  };
}

export function isNativeVariant(variant: StreamVariant): boolean {
  return variant.player === "Animelib";
}

export function preferNativeVariants(variants: StreamVariant[]): StreamVariant[] {
  const keyOf = (variant: StreamVariant) => `${variant.id}:${variant.language ?? ""}`;
  const nativeByTeam = new Map(
    variants.filter(isNativeVariant).map((variant) => [keyOf(variant), variant])
  );
  if (nativeByTeam.size === 0) return variants;
  const seen = new Set<string>();
  const preferred: StreamVariant[] = [];
  for (const variant of variants) {
    const key = keyOf(variant);
    const native = nativeByTeam.get(key);
    if (!native) {
      preferred.push(variant);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    preferred.push(native);
  }
  return preferred;
}

export function pickVariant(
  variants: StreamVariant[],
  prefs: Pick<StreamPrefs, "variantId"> | null
): StreamVariant | null {
  const preferred = preferNativeVariants(variants);
  if (preferred.length === 0) return null;
  if (prefs?.variantId) {
    const exact = preferred.find(
      (variant) => `${variant.player}:${variant.id}` === prefs.variantId
    );
    if (exact) return exact;
    const teamId = prefs.variantId.split(":").at(-1);
    const sameTeam = preferred.find((variant) => variant.id === teamId);
    if (sameTeam) return sameTeam;
    const player = prefs.variantId.split(":")[0];
    const samePlayer = preferred.find((variant) => variant.player === player);
    if (samePlayer) return samePlayer;
  }
  return preferred[0];
}

export function withVariant(prefs: StreamPrefs, variant: StreamVariant): StreamPrefs {
  return { ...prefs, variantId: `${variant.player}:${variant.id}` };
}

export function withQuality(prefs: StreamPrefs, quality: string): StreamPrefs {
  return { ...prefs, quality };
}

export function withTrack(
  prefs: StreamPrefs,
  kind: "audio" | "sub",
  language: string
): StreamPrefs {
  return kind === "audio"
    ? { ...prefs, audioLang: language }
    : { ...prefs, subLang: language, subEnabled: language !== "no" };
}

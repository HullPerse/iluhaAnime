// Per-title stream preferences.
//
// A voice-over, a quality and the chosen audio/subtitle language belong to the
// title, not to the episode: they are remembered once and reused for the next
// episode and the next launch. The position stays per episode in `player/watch`.

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

/** Whether the site serves this voice-over itself (and carries 1080p/4K). */
export function isNativeVariant(variant: StreamVariant): boolean {
  return variant.player === "Animelib";
}

/**
 * One row per voice-over. A team the site serves itself has both a native row
 * and a Kodik mirror; only the native row carries 1080p/4K, so it replaces the
 * mirror at the mirror's position. Teams without a native row keep Kodik.
 */
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

/**
 * The voice-over to play: the remembered one, the same team under another
 * player (a native row replaces Kodik for the same voice-over), any row of the
 * remembered player, then the first row. Returns null only when the episode has
 * no rows at all.
 */
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

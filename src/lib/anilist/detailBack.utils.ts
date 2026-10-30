import type { AniListOverlayScreen } from "@/types/anilist/anilist";

export function resolveDetailBack(
  screenTop: AniListOverlayScreen | null,
  trailerId: string | null,
  backScreen: () => void,
  closeTrailer: () => void,
  fallback: (() => void) | undefined
): (() => void) | undefined {
  if (screenTop) return backScreen;
  if (trailerId != null) return closeTrailer;
  return fallback;
}

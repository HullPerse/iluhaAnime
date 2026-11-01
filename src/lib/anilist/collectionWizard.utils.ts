import type { CollectionItem, WizardPrefill } from "@/types/anilist/collection";

export function prefillRatingValue(prefill: WizardPrefill | null | undefined): string {
  return prefill?.rating == null ? "" : String(prefill.rating);
}

export function prefillRatingOrigin(
  initial: CollectionItem | null | undefined,
  prefill: WizardPrefill | null | undefined
): string | null {
  if (initial) return null;
  return prefill?.scoreOrigin ?? null;
}

import type { WizardSource } from "@/types/anilist/collection";
import type { TranslationKey } from "@/types/core/i18n";

export const WIZARD_SOURCES: readonly WizardSource[] = ["custom", "anilist", "tmdb"];

export const WIZARD_BRAND_LABELS: Record<Exclude<WizardSource, "custom">, string> = {
  anilist: "AniList",
  tmdb: "TMDB",
};

export const WIZARD_SEARCH_PLACEHOLDERS: Record<Exclude<WizardSource, "custom">, TranslationKey> =
  {
    anilist: "collection.wizard.search.anilist",
    tmdb: "collection.wizard.search.tmdb",
  };

export const WIZARD_MEDIA_TYPE_LABELS: Partial<Record<string, TranslationKey>> = {
  movie: "collection.type.movie",
  tv: "collection.type.series",
};

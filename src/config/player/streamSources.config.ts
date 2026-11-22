import type { TranslationKey } from "@/types/core/i18n";
import type { StreamSourceId } from "@/types/player/stream";

/**
 * One catalog the player can browse. AnimeLib is the default: it carries the
 * Russian catalog and the account-backed filters. AllAnime is an English
 * catalog with its own taxonomy; account filters and random browsing remain
 * specific to AnimeLib.
 */
export interface StreamSourceConfig {
  id: StreamSourceId;
  name: string;
  /** Prefix the backend bakes into media ids of this source. */
  mediaPrefix: string;
  pageSize: number;
  searchPlaceholder: TranslationKey;
  supportsFilters: boolean;
  supportsSort: boolean;
  supportsRandom: boolean;
  supportsAccount: boolean;
}

export const STREAM_SOURCES: readonly StreamSourceConfig[] = [
  {
    id: "animelib",
    name: "AnimeLib",
    mediaPrefix: "",
    pageSize: 60,
    searchPlaceholder: "stream.searchPlaceholder",
    supportsFilters: true,
    supportsSort: true,
    supportsRandom: true,
    supportsAccount: true,
  },
  {
    id: "allanime",
    name: "AllAnime",
    mediaPrefix: "allanime:",
    pageSize: 40,
    searchPlaceholder: "stream.searchPlaceholder.allanime",
    supportsFilters: false,
    supportsSort: true,
    supportsRandom: false,
    supportsAccount: false,
  },
];

export const DEFAULT_STREAM_SOURCE: StreamSourceId = "animelib";

export function streamSourceConfig(id: StreamSourceId): StreamSourceConfig {
  return (
    STREAM_SOURCES.find((source) => source.id === id) ?? (STREAM_SOURCES[0] as StreamSourceConfig)
  );
}

/** The source that owns a media id, encoded by its backend prefix. */
export function sourceOfMediaId(mediaId: string | null | undefined): StreamSourceId {
  if (!mediaId) return DEFAULT_STREAM_SOURCE;

  return (
    STREAM_SOURCES.find(
      (source) => source.mediaPrefix !== "" && mediaId.startsWith(source.mediaPrefix)
    )?.id ?? DEFAULT_STREAM_SOURCE
  );
}

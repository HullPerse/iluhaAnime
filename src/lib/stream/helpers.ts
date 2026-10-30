// Stream identity and normalization.
//
// The Rust side serializes its own shapes; these functions turn them into the
// domain types the UI uses and build the one identity the player persists
// against. Every export here has a caller.

import type { StreamingAnime, StreamingEpisode, StreamVariant } from "@/types/stream";

interface RawAnimeLibAnime {
  id: string;
  title: string;
  synonyms?: string[];
  cover?: string;
  banner?: string;
  description?: string;
  year?: number;
  status?: string;
  genres?: string[];
  episodeCount?: number;
  rating?: number;
  ratingVotes?: number;
  mediaType?: string;
  ageRating?: string;
  views?: number;
  anilistId?: number;
  subOrDub?: string;
  slugUrl?: string;
}

interface RawAnimeLibEpisode {
  id: string;
  number: number;
  title?: string;
  airDate?: string;
  duration?: number;
  cover?: string;
}

interface RawAnimeLibVariant {
  id: string;
  name: string;
  language?: string;
  separateStream?: boolean;
  player?: string;
  sourceUrl?: string;
}

export function normalizeAnime(raw: RawAnimeLibAnime): StreamingAnime {
  return {
    id: raw.id,
    title: raw.title,
    synonyms: raw.synonyms ?? [],
    cover: raw.cover ?? undefined,
    banner: raw.banner ?? undefined,
    description: raw.description ?? undefined,
    year: raw.year ?? undefined,
    status: raw.status ?? undefined,
    genres: raw.genres ?? [],
    episodeCount: raw.episodeCount ?? undefined,
    rating: raw.rating ?? undefined,
    ratingVotes: raw.ratingVotes ?? undefined,
    mediaType: raw.mediaType ?? undefined,
    ageRating: raw.ageRating ?? undefined,
    views: raw.views ?? undefined,
    anilistId: raw.anilistId ?? undefined,
    subOrDub: raw.subOrDub ?? undefined,
    slugUrl: raw.slugUrl ?? "",
  };
}

export function normalizeEpisode(raw: RawAnimeLibEpisode): StreamingEpisode {
  return {
    id: raw.id,
    number: raw.number,
    title: raw.title ?? undefined,
    airDate: raw.airDate ?? undefined,
    duration: raw.duration ?? undefined,
    cover: raw.cover ?? undefined,
  };
}

export function normalizeVariant(raw: RawAnimeLibVariant): StreamVariant {
  return {
    id: raw.id,
    name: raw.name,
    language: raw.language ?? undefined,
    separateStream: raw.separateStream ?? false,
    player: raw.player ?? "",
    sourceUrl: raw.sourceUrl ?? "",
  };
}

/**
 * The identity of one voice-over row: `<player>:<teamId>`.
 *
 * The team id alone is not unique across hosters, which is why the hoster is
 * part of the key the player switches on.
 */
export function buildVariantId(variant: StreamVariant): string {
  return `${variant.player}:${variant.id}`;
}

/**
 * Whether a row is a subtitle translation rather than a voice-over.
 *
 * Kodik spells the kind in the translation label (`Субтитры`) and, for some
 * teams, only in the name (`Crunchyroll.Subtitles`). A subtitle row is still
 * a separate stream, so the player shows it as its own choice.
 */
export function isSubtitleVariant(variant: StreamVariant): boolean {
  const label = `${variant.language ?? ""} ${variant.name}`.toLowerCase();
  return label.includes("субтит") || label.includes("subtitle");
}

/**
 * The synthetic watch key for a stream session.
 *
 * Format: `stream:<sourceId>:<mediaId>:<episodeId>`. A media URL is never a
 * key, so a rotated CDN URL cannot lose the resume position.
 */
export function buildWatchKey(sourceId: string, mediaId: string, episodeId: string): string {
  return `stream:${sourceId}:${mediaId}:${episodeId}`;
}

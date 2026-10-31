
import type { StreamingAnime, StreamingEpisode, StreamVariant } from "@/types/player/stream";

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

export function buildVariantId(variant: StreamVariant): string {
  return `${variant.player}:${variant.id}`;
}

export function variantOf(
  variants: readonly StreamVariant[],
  variantId: string
): StreamVariant | null {
  const exact = variants.find((variant) => buildVariantId(variant) === variantId);
  if (exact) return exact;
  const teamId = variantId.split(":").at(-1);
  return variants.find((variant) => variant.id === teamId) ?? null;
}

export function isSubtitleVariant(variant: StreamVariant): boolean {
  const label = `${variant.language ?? ""} ${variant.name}`.toLowerCase();
  return label.includes("субтит") || label.includes("subtitle");
}

export function buildWatchKey(sourceId: string, mediaId: string, episodeId: string): string {
  return `stream:${sourceId}:${mediaId}:${episodeId}`;
}

import { IMPORT_CHUNK_SIZE } from "@/config/collection/defaults.config";
import { withFallback } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import type { AniListEntry, AniMedia } from "@/types/anilist";
import type {
  CollectionItem,
  QuickAddListEntry,
  QuickAddMedia,
  WizardPrefill,
  WizardSaveValues,
} from "@/types/collection";

import { buildWizardItem, mergeGenreTags, parseNonNegative, parseRating } from "./wizard.utils";

export interface AniListSyncState {
  status: string;
  progressValue: number;
  rating: number | null;
}

export function entrySyncState(entry: AniListEntry): AniListSyncState {
  const v = entryToWizardValues(entry);
  return {
    status: v.status,
    progressValue: parseNonNegative(v.progressValue),
    rating: parseRating(v.rating),
  };
}

export function entryDiffers(entry: AniListEntry, item: CollectionItem): boolean {
  const s = entrySyncState(entry);
  return (
    s.status !== item.status || s.progressValue !== item.progressValue || s.rating !== item.rating
  );
}

export function anilistStatusToCollection(status: string): string {
  const s = status.toUpperCase();
  if (s === "CURRENT" || s === "WATCHING") return "watching";
  if (s === "COMPLETED") return "completed";
  if (s === "PAUSED") return "paused";
  if (s === "DROPPED") return "dropped";
  if (s === "PLANNING" || s === "PLANNED") return "planned";
  if (s === "REPEATING" || s === "REWATCHING") return "rewatching";
  return "planned";
}

export function anilistFormatToCollection(format: string | null): "anime" | "movie" {
  return format === "MOVIE" ? "movie" : "anime";
}
export function buildAnilistPrefill(
  media: Pick<AniMedia, "title" | "cover_url">,
  listStatus: string | null
): WizardPrefill {
  return {
    title: media.title,
    coverUrl: media.cover_url,
    status: anilistStatusToCollection(listStatus ?? "PLANNING"),
  };
}

export function entryToWizardValues(entry: AniListEntry): WizardSaveValues {
  const m = entry.media;
  const year = m.season_year ? String(m.season_year) : "";
  const genres = mergeGenreTags(m.genres ?? [], m.tags ?? []).join(", ");
  const studio = m.studios?.[0]?.name ?? "";
  const coverUrl = m.cover_url ?? "";
  const progressValue = entry.progress != null ? String(entry.progress) : "0";
  const progressTotal = m.episodes != null ? String(m.episodes) : "";
  return {
    title: m.title,
    altTitles: m.titles.join(", "),
    type: anilistFormatToCollection(m.format),
    status: anilistStatusToCollection(entry.list_status),
    progressValue,
    progressTotal,
    progressUnit: "episodes",
    durationMinutes: m.duration ? String(m.duration) : "",
    rating:
      entry.score != null
        ? String(Math.round(entry.score))
        : m.score
          ? String(Math.round(m.score / 10))
          : "",
    priority: "normal",
    isFavorite: false,
    year,
    releaseDate: m.start_date ?? null,
    genres,
    studio,
    description: m.description ?? "",
    notes: "",
    coverUrl,
    externalIds: { anilist: m.id, ...(m.id_mal != null ? { mal: m.id_mal } : {}) },
    customFields: {},
    localPath: "",
    localKind: null,
    startedAt: "",
    finishedAt: "",
  };
}

export function mediaToWizardValues(
  media: QuickAddMedia,
  entry: QuickAddListEntry | undefined,
  isFavorite: boolean
): WizardSaveValues {
  const year = media.season_year ? String(media.season_year) : "";
  const genres = mergeGenreTags(media.genres ?? [], media.tags ?? []).join(", ");
  const studio = media.studios?.[0]?.name ?? "";
  const coverUrl = media.cover_url ?? "";
  const progressValue = entry?.progress != null ? String(entry.progress) : "0";
  const progressTotal = media.episodes != null ? String(media.episodes) : "";
  return {
    title: media.title,
    altTitles: media.titles.join(", "),
    type: anilistFormatToCollection(media.format),
    status: anilistStatusToCollection(entry?.list_status ?? "PLANNING"),
    progressValue,
    progressTotal,
    progressUnit: "episodes",
    durationMinutes: media.duration ? String(media.duration) : "",
    rating:
      entry?.score != null
        ? String(Math.round(entry.score))
        : media.score
          ? String(Math.round(media.score / 10))
          : "",
    priority: "normal",
    isFavorite,
    year,
    releaseDate: media.start_date ?? null,
    genres,
    studio,
    description: media.description ?? "",
    notes: "",
    coverUrl,
    externalIds: { anilist: media.id, ...(media.id_mal != null ? { mal: media.id_mal } : {}) },
    customFields: {},
    localPath: "",
    localKind: null,
    startedAt: "",
    finishedAt: "",
  };
}

function buildImportItem(entry: AniListEntry, now: number) {
  const values = entryToWizardValues(entry);
  const item = buildWizardItem(values, null, null);
  return {
    id: crypto.randomUUID(),
    title: item.title,
    altTitles: item.altTitles,
    type: item.type,
    status: item.status,
    progressValue: item.progressValue,
    progressTotal: item.progressTotal,
    progressUnit: item.progressUnit,
    durationMinutes: item.durationMinutes,
    rating: item.rating,
    priority: item.priority,
    isFavorite: item.isFavorite,
    year: item.year,
    genres: item.genres,
    studio: item.studio,
    description: item.description,
    notes: item.notes,
    coverUrl: item.coverUrl,
    coverBlobId: null,
    thumbBlobId: null,
    externalIds: item.externalIds,
    customFields: item.customFields,
    localPath: item.localPath,
    localKind: item.localKind,
    startedAt: item.startedAt,
    finishedAt: item.finishedAt,
    lastWatchedAt: item.lastWatchedAt,
    rewatchCount: item.rewatchCount,
    addedAt: now,
    updatedAt: now,
    sitesToView: item.sitesToView,
    tvCurrentSeason: item.tvCurrentSeason,
    tvCurrentEpisode: item.tvCurrentEpisode,
    detailsJson: item.detailsJson,
  };
}

export async function runImportBatch(
  entries: AniListEntry[],
  shouldAbort: () => boolean,
  onProgress: (processed: number, current: string) => void
): Promise<{ imported: number; failed: Array<{ id: number; title: string }> }> {
  let imported = 0;
  const failed: Array<{ id: number; title: string }> = [];
  onProgress(0, "");
  let processed = 0;
  for (let start = 0; start < entries.length && !shouldAbort(); start += IMPORT_CHUNK_SIZE) {
    const chunk = entries.slice(start, start + IMPORT_CHUNK_SIZE);
    const now = Date.now();
    const items = chunk.map((entry) => buildImportItem(entry, now));
    const outcome = await withFallback(
      invokeTyped<{
        imported: number;
        failed: Array<{ index: number; error: string }>;
      }>("import_collection_items_batch", { items }),
      {
        imported: 0,
        failed: chunk.map((_, index) => ({ index, error: "batch failed" })),
      }
    );
    imported += outcome.imported;
    const chunkFailed = new Set(outcome.failed.map((f) => f.index));
    for (let offset = 0; offset < chunk.length; offset++) {
      const entry = chunk[offset];
      if (chunkFailed.has(offset)) {
        failed.push({ id: entry.media.id, title: entry.media.title });
      }
      processed += 1;
      onProgress(processed, entry.media.title);
    }
  }
  return { imported, failed };
}

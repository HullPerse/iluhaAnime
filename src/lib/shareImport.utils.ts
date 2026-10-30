import type { CollectionItem } from "@/types/anilist/collection";
import type { ShareImportPlan } from "@/types/core/deeplink";

export function shareRowToExportRow(
  row: ShareImportPlan["rows"][number],
  status: string
): CollectionItem {
  return {
    id: "",
    title: row.snapshot.title,
    altTitles: [],
    type: row.snapshot.type,
    status,
    progressValue: 0,
    progressTotal: null,
    progressUnit: "episodes",
    durationMinutes: null,
    rating: null,
    priority: "normal",
    isFavorite: false,
    year: row.snapshot.year,
    releaseDate: null,
    genres: [],
    studio: null,
    description: null,
    notes: null,
    coverUrl: row.snapshot.coverUrl,
    coverBlobId: null,
    thumbBlobId: null,
    externalIds: row.snapshot.externalIds,
    customFields: {},
    localPath: null,
    localKind: null,
    startedAt: null,
    finishedAt: null,
    lastWatchedAt: null,
    rewatchCount: 0,
    addedAt: 0,
    updatedAt: 0,
    sitesToView: [],
    tvCurrentSeason: null,
    tvCurrentEpisode: null,
    detailsJson: null,
  };
}

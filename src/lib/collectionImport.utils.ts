import type { WizardSaveValues } from "@/lib/collectionWizard.utils";
import type { AniListEntry } from "@/types/anilist";

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

export function entryToWizardValues(entry: AniListEntry): WizardSaveValues {
  const m = entry.media;
  const year = m.season_year ? String(m.season_year) : "";
  const genres = (m.genres ?? []).join(", ");
  const studio = m.studios?.[0]?.name ?? "";
  const coverUrl = m.cover_url ?? "";
  const progressValue = entry.progress != null ? String(entry.progress) : "0";
  const progressTotal = m.episodes != null ? String(m.episodes) : "";
  return {
    title: m.title,
    altTitles: m.titles.join(", "),
    type: "anime",
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
    genres,
    studio,
    description: m.description ?? "",
    notes: "",
    coverUrl,
    externalIds: { anilist: m.id },
    customFields: {},
    localPath: "",
    localKind: null,
    startedAt: "",
    finishedAt: "",
  };
}

import type { CollectionItem, CollectionStatus, WizardSaveValues } from "@/types/collection";

function parseCommaList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseNonNegative(value: string): number {
  return Math.max(0, Number(value) || 0);
}

function parseOptionalPositive(value: string): number | null {
  if (!value) return null;
  return Math.max(1, Number(value) || 1);
}

function parseOptionalNonNegative(value: string): number | null {
  if (!value) return null;
  return Math.max(0, Number(value) || 0);
}

export function parseRating(value: string): number | null {
  if (!value) return null;
  return Math.min(10, Math.max(1, Number(value) || 0));
}

function parseOptionalYear(value: string): number | null {
  if (!value) return null;
  return Number(value) || null;
}

function parseOptionalTrimmed(value: string): string | null {
  const trimmed = value.trim();
  return trimmed || null;
}

function parseTimestamp(value: string): number | null {
  if (!value) return null;
  return new Date(value).getTime();
}

export function buildWizardItem(
  values: WizardSaveValues,
  coverBlobId: string | null,
  initial: CollectionItem | null | undefined
): Omit<CollectionItem, "id" | "addedAt" | "updatedAt"> {
  return {
    title: values.title.trim(),
    altTitles: parseCommaList(values.altTitles),
    type: values.type,
    status: values.status,
    progressValue: parseNonNegative(values.progressValue),
    progressTotal: parseOptionalPositive(values.progressTotal),
    progressUnit: values.progressUnit,
    durationMinutes: parseOptionalNonNegative(values.durationMinutes),
    rating: parseRating(values.rating),
    priority: values.priority,
    isFavorite: values.isFavorite,
    year: parseOptionalYear(values.year),
    genres: parseCommaList(values.genres),
    studio: parseOptionalTrimmed(values.studio),
    description: parseOptionalTrimmed(values.description),
    notes: parseOptionalTrimmed(values.notes),
    coverUrl: values.coverUrl,
    coverBlobId,
    thumbBlobId: coverBlobId,
    externalIds: values.externalIds,
    customFields: values.customFields,
    localPath: values.localPath || null,
    localKind: values.localKind,
    startedAt: parseTimestamp(values.startedAt),
    finishedAt: resolveFinishedAt(values.status, values.finishedAt),
    lastWatchedAt: initial?.lastWatchedAt ?? null,
    rewatchCount: initial?.rewatchCount ?? 0,
    sitesToView: initial?.sitesToView ?? [],
    tvCurrentSeason: initial?.tvCurrentSeason ?? null,
    tvCurrentEpisode: initial?.tvCurrentEpisode ?? null,
    detailsJson: initial?.detailsJson ?? null,
  };
}

export function resolveFinishedAt(status: CollectionStatus, finishedAt: string): number | null {
  if (!finishedAt) return status === "completed" ? Date.now() : null;
  return new Date(finishedAt).getTime();
}

export function wizardDefaultsIdentity(initial?: CollectionItem | null) {
  return {
    title: initial?.title ?? "",
    altTitles: initial?.altTitles.join(", ") ?? "",
    type: (initial?.type ?? "anime") as CollectionItem["type"],
    status: (initial?.status ?? "planned") as CollectionStatus,
  };
}

export function wizardDefaultsProgress(initial?: CollectionItem | null) {
  return {
    progressValue: String(initial?.progressValue ?? 0),
    progressTotal: String(initial?.progressTotal ?? ""),
    progressUnit: (initial?.progressUnit ?? "episodes") as CollectionItem["progressUnit"],
    rating: String(initial?.rating ?? ""),
    priority: (initial?.priority ?? "normal") as CollectionItem["priority"],
    isFavorite: initial?.isFavorite ?? false,
  };
}

export function wizardDefaultsMeta(initial?: CollectionItem | null) {
  return {
    year: String(initial?.year ?? ""),
    description: initial?.description ?? "",
    durationMinutes: initial?.durationMinutes != null ? String(initial.durationMinutes) : "",
    genres: initial?.genres.join(", ") ?? "",
    studio: initial?.studio ?? "",
  };
}

export function wizardDefaultsDates(initial?: CollectionItem | null) {
  return {
    startedAt: initial?.startedAt ? new Date(initial.startedAt).toISOString().slice(0, 10) : "",
    finishedAt: initial?.finishedAt ? new Date(initial.finishedAt).toISOString().slice(0, 10) : "",
    notes: initial?.notes ?? "",
  };
}

export function wizardDefaultsMedia(initial?: CollectionItem | null) {
  return {
    coverUrl: initial?.coverUrl ?? "",
    externalIds: initial?.externalIds ?? ({} as CollectionItem["externalIds"]),
    localPath: initial?.localPath ?? "",
    localKind: initial?.localKind ?? null,
    customFields: (initial?.customFields ?? {}) as Record<string, unknown>,
  };
}

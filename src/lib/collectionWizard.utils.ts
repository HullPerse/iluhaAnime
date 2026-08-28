import type { CollectionItem, CollectionStatus } from "@/types/collection";

export type WizardSaveValues = {
  title: string;
  altTitles: string;
  type: CollectionItem["type"];
  status: CollectionStatus;
  progressValue: string;
  progressTotal: string;
  progressUnit: CollectionItem["progressUnit"];
  durationMinutes: string;
  rating: string;
  priority: CollectionItem["priority"];
  isFavorite: boolean;
  year: string;
  genres: string;
  studio: string;
  description: string;
  notes: string;
  coverUrl: string;
  externalIds: CollectionItem["externalIds"];
  customFields: Record<string, unknown>;
  localPath: string;
  localKind: CollectionItem["localKind"];
  startedAt: string;
  finishedAt: string;
};

export function buildWizardItem(
  values: WizardSaveValues,
  coverBlobId: string | null,
  initial: CollectionItem | null | undefined
): Omit<CollectionItem, "id" | "addedAt" | "updatedAt"> {
  return {
    title: values.title.trim(),
    altTitles: values.altTitles
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    type: values.type,
    status: values.status,
    progressValue: Math.max(0, Number(values.progressValue) || 0),
    progressTotal: values.progressTotal ? Math.max(1, Number(values.progressTotal) || 1) : null,
    progressUnit: values.progressUnit,
    durationMinutes: values.durationMinutes ? Math.max(0, Number(values.durationMinutes) || 0) : null,
    rating: values.rating ? Math.min(10, Math.max(1, Number(values.rating) || 0)) : null,
    priority: values.priority,
    isFavorite: values.isFavorite,
    year: values.year ? Number(values.year) || null : null,
    genres: values.genres
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    studio: values.studio.trim() || null,
    description: values.description.trim() || null,
    notes: values.notes.trim() || null,
    coverUrl: values.coverUrl,
    coverBlobId,
    thumbBlobId: coverBlobId,
    externalIds: values.externalIds,
    customFields: values.customFields,
    localPath: values.localPath || null,
    localKind: values.localKind,
    startedAt: values.startedAt ? new Date(values.startedAt).getTime() : null,
    finishedAt: resolveFinishedAt(values.status, values.finishedAt),
    lastWatchedAt: initial?.lastWatchedAt ?? null,
    rewatchCount: initial?.rewatchCount ?? 0,
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

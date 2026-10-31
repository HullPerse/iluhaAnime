import { useCallback, useMemo, useState } from "react";

import {
  buildWizardItem,
  wizardDefaultsDates,
  wizardDefaultsIdentity,
  wizardDefaultsMedia,
  wizardDefaultsMeta,
  wizardDefaultsProgress,
} from "@/lib/core/wizard.utils";
import type {
  CollectionItem,
  CollectionStatus,
  WizardSaveValues,
} from "@/types/anilist/collection";

function toPreviewNumber(value: string): number {
  return Number(value) || 0;
}

function toPreviewOptionalNumber(value: string): number | null {
  return value ? Number(value) || null : null;
}

function toPreviewList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function toPreviewTrimmed(value: string): string | null {
  const t = value.trim();
  return t || null;
}

function toPreviewTimestamp(value: string): number | null {
  return value ? new Date(value).getTime() : null;
}

export function useWizardForm(initial: CollectionItem | null | undefined) {
  const identity = useMemo(() => wizardDefaultsIdentity(initial), [initial]);
  const progress = useMemo(() => wizardDefaultsProgress(initial), [initial]);
  const meta = useMemo(() => wizardDefaultsMeta(initial), [initial]);
  const dates = useMemo(() => wizardDefaultsDates(initial), [initial]);
  const media = useMemo(() => wizardDefaultsMedia(initial), [initial]);

  const [title, setTitle] = useState<string>(identity.title);
  const [altTitles, setAltTitles] = useState<string>(identity.altTitles);
  const [type, setType] = useState<CollectionItem["type"]>(identity.type);
  const [status, setStatus] = useState<CollectionStatus>(identity.status);
  const [progressValue, setProgressValue] = useState<string>(progress.progressValue);
  const [progressTotal, setProgressTotal] = useState<string>(progress.progressTotal);
  const [progressUnit, setProgressUnit] = useState<CollectionItem["progressUnit"]>(
    progress.progressUnit
  );
  const [rating, setRating] = useState<string>(progress.rating);
  const [priority, setPriority] = useState<CollectionItem["priority"]>(progress.priority);
  const [isFavorite, setIsFavorite] = useState<boolean>(progress.isFavorite);
  const [year, setYear] = useState<string>(meta.year);
  const [releaseDate, setReleaseDate] = useState<string | null>(initial?.releaseDate ?? null);
  const [description, setDescription] = useState<string>(meta.description);
  const [durationMinutes, setDurationMinutes] = useState<string>(meta.durationMinutes);
  const [genres, setGenres] = useState<string>(meta.genres);
  const [studio, setStudio] = useState<string>(meta.studio);
  const [startedAt, setStartedAt] = useState<string>(dates.startedAt);
  const [finishedAt, setFinishedAt] = useState<string>(dates.finishedAt);
  const [notes, setNotes] = useState<string>(dates.notes);
  const [coverUrl, setCoverUrl] = useState<string>(media.coverUrl);
  const [externalIds, setExternalIds] = useState<CollectionItem["externalIds"]>(media.externalIds);
  const [localPath, setLocalPath] = useState<string>(media.localPath);
  const [localKind, setLocalKind] = useState<"file" | "folder" | null>(media.localKind);
  const [customFields, setCustomFields] = useState<Record<string, unknown>>(media.customFields);

  const buildItem = useCallback(
    (coverBlobId: string | null) =>
      buildWizardItem(
        {
          title,
          altTitles,
          type,
          status,
          progressValue,
          progressTotal,
          progressUnit,
          durationMinutes,
          rating,
          priority,
          isFavorite,
          year,
          releaseDate,
          genres,
          studio,
          description,
          notes,
          coverUrl,
          externalIds,
          customFields,
          localPath,
          localKind,
          startedAt,
          finishedAt,
        } as WizardSaveValues,
        coverBlobId,
        initial
      ),
    [
      title,
      altTitles,
      type,
      status,
      progressValue,
      progressTotal,
      progressUnit,
      durationMinutes,
      rating,
      priority,
      isFavorite,
      year,
      releaseDate,
      genres,
      studio,
      description,
      notes,
      coverUrl,
      externalIds,
      customFields,
      localPath,
      localKind,
      startedAt,
      finishedAt,
      initial,
    ]
  );

  const previewItem: CollectionItem = useMemo(
    () => ({
      id: "preview",
      title: title.trim() || "Preview",
      altTitles: [],
      type,
      status,
      progressValue: toPreviewNumber(progressValue),
      progressTotal: toPreviewOptionalNumber(progressTotal),
      progressUnit,
      durationMinutes: toPreviewOptionalNumber(durationMinutes),
      rating: toPreviewOptionalNumber(rating),
      priority,
      isFavorite,
      year: toPreviewOptionalNumber(year),
      releaseDate,
      genres: toPreviewList(genres),
      studio: toPreviewTrimmed(studio),
      description: toPreviewTrimmed(description),
      notes: toPreviewTrimmed(notes),
      coverUrl: coverUrl || null,
      coverBlobId: null,
      thumbBlobId: null,
      externalIds,
      customFields,
      localPath: localPath || null,
      localKind,
      startedAt: toPreviewTimestamp(startedAt),
      finishedAt: toPreviewTimestamp(finishedAt),
      lastWatchedAt: null,
      rewatchCount: 0,
      addedAt: Date.now(),
      updatedAt: Date.now(),
      sitesToView: [],
      tvCurrentSeason: null,
      tvCurrentEpisode: null,
      detailsJson: null,
    }),
    [
      title,
      type,
      status,
      progressValue,
      progressTotal,
      progressUnit,
      durationMinutes,
      rating,
      priority,
      isFavorite,
      year,
      releaseDate,
      genres,
      studio,
      description,
      notes,
      coverUrl,
      externalIds,
      customFields,
      localPath,
      localKind,
      startedAt,
      finishedAt,
    ]
  );

  return {
    title,
    setTitle,
    altTitles,
    setAltTitles,
    type,
    setType,
    status,
    setStatus,
    progressValue,
    setProgressValue,
    progressTotal,
    setProgressTotal,
    progressUnit,
    setProgressUnit,
    rating,
    setRating,
    priority,
    setPriority,
    isFavorite,
    setIsFavorite,
    year,
    setYear,
    releaseDate,
    setReleaseDate,
    description,
    setDescription,
    durationMinutes,
    setDurationMinutes,
    genres,
    setGenres,
    studio,
    setStudio,
    startedAt,
    setStartedAt,
    finishedAt,
    setFinishedAt,
    notes,
    setNotes,
    coverUrl,
    setCoverUrl,
    externalIds,
    setExternalIds,
    localPath,
    setLocalPath,
    localKind,
    setLocalKind,
    customFields,
    setCustomFields,
    buildItem,
    previewItem,
  };
}

import { useCallback, useMemo, useState } from "react";

import {
  buildWizardItem,
  wizardDefaultsDates,
  wizardDefaultsIdentity,
  wizardDefaultsMedia,
  wizardDefaultsMeta,
  wizardDefaultsProgress,
} from "@/lib/collectionWizard.utils";
import type { WizardSaveValues } from "@/lib/collectionWizard.utils";
import type { CollectionItem, CollectionStatus } from "@/types/collection";

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

  const [title, setTitle] = useState(identity.title);
  const [altTitles, setAltTitles] = useState(identity.altTitles);
  const [type, setType] = useState<CollectionItem["type"]>(identity.type);
  const [status, setStatus] = useState<CollectionStatus>(identity.status);
  const [progressValue, setProgressValue] = useState(progress.progressValue);
  const [progressTotal, setProgressTotal] = useState(progress.progressTotal);
  const [progressUnit, setProgressUnit] = useState<CollectionItem["progressUnit"]>(
    progress.progressUnit
  );
  const [rating, setRating] = useState(progress.rating);
  const [priority, setPriority] = useState<CollectionItem["priority"]>(progress.priority);
  const [isFavorite, setIsFavorite] = useState(progress.isFavorite);
  const [year, setYear] = useState(meta.year);
  const [description, setDescription] = useState(meta.description);
  const [durationMinutes, setDurationMinutes] = useState(meta.durationMinutes);
  const [genres, setGenres] = useState(meta.genres);
  const [studio, setStudio] = useState(meta.studio);
  const [startedAt, setStartedAt] = useState(dates.startedAt);
  const [finishedAt, setFinishedAt] = useState(dates.finishedAt);
  const [notes, setNotes] = useState(dates.notes);
  const [coverUrl, setCoverUrl] = useState(media.coverUrl);
  const [externalIds, setExternalIds] = useState(media.externalIds);
  const [localPath, setLocalPath] = useState(media.localPath);
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

import { useCallback } from "react";

import { anilistApi } from "@/api/anilist.api";
import { tmdbApi } from "@/api/tmdb.api";
import { readStoredMedia, withStoredMedia } from "@/lib/collection/media.utils";
import { mergeGenreTags } from "@/lib/collection/wizard.utils";
import { useI18n, type TranslationKey } from "@/lib/locale/i18n.utils";
import { attempt, withFallback } from "@/lib/utils/attempt.utils";
import { useNotificationStore } from "@/store/notification.store";
import type { AniAnimeStaffEdge, AniCharacterEdge } from "@/types/anilist";
import type { CollectionItem } from "@/types/collection";

export function useCollectionMetadata(
  updateItem: (id: string, patch: Partial<CollectionItem>, opts?: { touch?: boolean }) => void
) {
  const { t } = useI18n();

  const notify = useCallback(
    (type: "success" | "error" | "info", key: TranslationKey) => {
      useNotificationStore.getState().add(t("app.collection"), type, t(key));
    },
    [t]
  );

  const refreshAnilist = useCallback(
    async (item: CollectionItem) => {
      const m = await anilistApi.getAnimeById<{
        title: string;
        duration: number | null;
        episodes: number | null;
        tags: string[];
        genres: string[];
        studios: { name: string }[];
        cover_url: string | null;
        season_year: number | null;
        start_date: string | null;
        trailer_youtube_id: string | null;
        description: string | null;
      }>(item.externalIds.anilist as number);
      const mergedGenres = mergeGenreTags(m.genres ?? [], m.tags ?? []);
      const nextDescription = m.description || item.description || null;
      const anilistId = item.externalIds.anilist;
      const nextCoverUrl = m.cover_url ?? item.coverUrl;
      const coverChanged =
        nextCoverUrl !== item.coverUrl && (item.coverBlobId != null || item.thumbBlobId != null);
      const [characters, staff] = anilistId
        ? await Promise.all([
            withFallback(anilistApi.getAnimeCharacters(anilistId, 1), [] as AniCharacterEdge[]),
            withFallback(anilistApi.getAnimeStaff(anilistId), [] as AniAnimeStaffEdge[]),
          ])
        : [[], []];
      updateItem(
        item.id,
        {
          ...(nextDescription ? { description: nextDescription } : {}),
          title: m.title || item.title,
          durationMinutes: m.duration ?? item.durationMinutes,
          progressTotal: m.episodes ?? item.progressTotal,
          genres: mergedGenres.length ? mergedGenres : item.genres,
          studio: m.studios[0]?.name ?? item.studio,
          coverUrl: nextCoverUrl,
          ...(coverChanged ? { coverBlobId: null, thumbBlobId: null } : {}),
          year: m.season_year ?? item.year,
          releaseDate: m.start_date ?? item.releaseDate,
          detailsJson: {
            ...withStoredMedia(
              item.detailsJson,
              readStoredMedia(item.detailsJson).stills,
              m.trailer_youtube_id ?? readStoredMedia(item.detailsJson).trailerYoutubeId
            ),
            staff: staff.slice(0, 30).map((s) => ({ id: s.id, name: s.name, role: s.role })),
            characters: characters.map((c) => ({
              id: c.character.id,
              name: c.character.name,
              voiceActors: c.voice_actors.slice(0, 3).map((v) => ({ id: v.id, name: v.name })),
            })),
          },
        },
        { touch: false }
      );
    },
    [updateItem]
  );

  const refreshTmdb = useCallback(
    async (item: CollectionItem) => {
      if (!tmdbApi.isConfigured()) {
        notify("error", "collection.wizard.tmdb.key.missing");
        return;
      }
      const tmdbId = item.externalIds.tmdb;
      if (tmdbId == null) throw new Error("missing tmdb id");
      const d = await tmdbApi.getDetails<{
        title: string;
        overview: string | null;
        year: number | null;
        releaseDate: string | null;
        runtimeMinutes: number | null;
        genres: string[];
        posters: { url: string }[];
      }>(tmdbId, item.type === "movie" ? "movie" : "tv");
      const nextCoverUrl = d.posters[0]?.url ?? item.coverUrl;
      const coverChanged =
        nextCoverUrl !== item.coverUrl && (item.coverBlobId != null || item.thumbBlobId != null);
      updateItem(
        item.id,
        {
          title: d.title || item.title,
          description: d.overview ?? item.description,
          year: d.year ?? item.year,
          releaseDate: d.releaseDate ?? item.releaseDate,
          durationMinutes: d.runtimeMinutes ?? item.durationMinutes,
          genres: d.genres.length ? d.genres : item.genres,
          coverUrl: nextCoverUrl,
          ...(coverChanged ? { coverBlobId: null, thumbBlobId: null } : {}),
        },
        { touch: false }
      );
      const mediaType = item.type === "movie" ? "movie" : "tv";
      const media = await tmdbApi.getMedia(tmdbId, mediaType);
      updateItem(
        item.id,
        {
          detailsJson: withStoredMedia(
            item.detailsJson,
            media.backdrops
              .map((b) => b.url)
              .filter(Boolean)
              .slice(0, 8),
            media.trailerYoutubeId
          ),
        },
        { touch: false }
      );
    },
    [notify, updateItem]
  );

  const refreshMetadata = useCallback(
    async (item: CollectionItem) => {
      const [, error] = await attempt(
        (async () => {
          if (item.externalIds.anilist != null) await refreshAnilist(item);
          else if (item.externalIds.tmdb != null) await refreshTmdb(item);
          else {
            notify("info", "collection.details.no.external.id");
            return;
          }
          notify("success", "collection.details.metadata.refreshed");
        })()
      );
      if (error) notify("error", "collection.details.metadata.refresh.error");
    },
    [notify, refreshAnilist, refreshTmdb]
  );

  return { refreshMetadata };
}

import { useCallback } from "react";

import { readStoredMedia, withStoredMedia } from "@/lib/collection/media.utils";
import { useI18n, type TranslationKey } from "@/lib/locale/i18n.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useNotificationStore } from "@/store/notification.store";
import { useSettingsStore } from "@/store/settings.store";
import type { CollectionItem } from "@/types/collection";

export function useCollectionMetadata(
  updateItem: (id: string, patch: Partial<CollectionItem>) => void
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
      const m = await invokeTyped<{
        title: string;
        duration: number | null;
        episodes: number | null;
        genres: string[];
        studios: { name: string }[];
        cover_url: string | null;
        season_year: number | null;
        trailer_youtube_id: string | null;
      }>("get_anime_by_id", { id: item.externalIds.anilist });
      updateItem(item.id, {
        title: m.title || item.title,
        durationMinutes: m.duration ?? item.durationMinutes,
        progressTotal: m.episodes ?? item.progressTotal,
        genres: m.genres.length ? m.genres : item.genres,
        studio: m.studios[0]?.name ?? item.studio,
        coverUrl: m.cover_url ?? item.coverUrl,
        year: m.season_year ?? item.year,
        detailsJson: withStoredMedia(
          item.detailsJson,
          readStoredMedia(item.detailsJson).stills,
          m.trailer_youtube_id ?? readStoredMedia(item.detailsJson).trailerYoutubeId
        ),
      });
    },
    [updateItem]
  );

  const refreshTmdb = useCallback(
    async (item: CollectionItem) => {
      const tmdbKey = useSettingsStore.getState().tmdbApiKey;
      const tmdbProxyUrl = useSettingsStore.getState().tmdbProxyUrl;
      if (!tmdbKey) {
        notify("error", "collection.wizard.tmdb.key.missing");
        return;
      }
      const d = await invokeTyped<{
        title: string;
        overview: string | null;
        year: number | null;
        runtimeMinutes: number | null;
        genres: string[];
        posters: { url: string }[];
      }>("get_tmdb_details", {
        apiKey: tmdbKey,
        tmdbId: item.externalIds.tmdb,
        mediaType: item.type === "movie" ? "movie" : "tv",
        proxyUrl: tmdbProxyUrl || undefined,
      } as unknown as Record<string, unknown>);
      updateItem(item.id, {
        title: d.title || item.title,
        description: d.overview ?? item.description,
        year: d.year ?? item.year,
        durationMinutes: d.runtimeMinutes ?? item.durationMinutes,
        genres: d.genres.length ? d.genres : item.genres,
        coverUrl: d.posters[0]?.url ?? item.coverUrl,
      });
      const mediaType = item.type === "movie" ? "movie" : "tv";
      const media = await invokeTyped<{
        backdrops: { url: string }[];
        trailerYoutubeId: string | null;
      }>("get_tmdb_media", {
        apiKey: tmdbKey,
        tmdbId: item.externalIds.tmdb,
        mediaType,
        proxyUrl: tmdbProxyUrl || undefined,
      } as unknown as Record<string, unknown>);
      updateItem(item.id, {
        detailsJson: withStoredMedia(
          item.detailsJson,
          media.backdrops
            .map((b) => b.url)
            .filter(Boolean)
            .slice(0, 8),
          media.trailerYoutubeId
        ),
      });
    },
    [notify, updateItem]
  );

  const refreshMetadata = useCallback(
    async (item: CollectionItem) => {
      try {
        if (item.externalIds.anilist != null) await refreshAnilist(item);
        else if (item.externalIds.tmdb != null) await refreshTmdb(item);
        else {
          notify("info", "collection.details.no.external.id");
          return;
        }
        notify("success", "collection.details.metadata.refreshed");
      } catch {
        notify("error", "collection.details.metadata.refresh.error");
      }
    },
    [notify, refreshAnilist, refreshTmdb]
  );

  return { refreshMetadata };
}

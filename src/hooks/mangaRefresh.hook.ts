import { useCell } from "@hullperse/hp_utils/react";
import { reportBackgroundError } from "@hullperse/hp_utils/attempt";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getMangaLibrary,
  getMangaSources,
  mangaLibraryKey,
  refreshMangaChapters,
} from "@/api/manga.api";
import { translate as t } from "@/lib/locale/i18n.utils";
import { groupMangaChapterUpdates } from "@/lib/manga/mangaNotifications.utils";
import { mangaRatingVisible, sourceShowsNsfw } from "@/lib/manga/nsfw.utils";
import { addNotification } from "@/store/notification.store";
import { settingsAtoms } from "@/store/settings.store";

const INTERVAL = 30 * 60 * 1000;

export function useMangaBackgroundRefresh() {
  const enabled = useCell(settingsAtoms.mangaBackgroundRefresh);
  const tabEnabled = useCell(settingsAtoms.mangaTabEnabled);
  const client = useQueryClient();
  useQuery({
    queryKey: ["manga", "backgroundRefresh"],
    enabled: enabled && tabEnabled,
    staleTime: INTERVAL,
    refetchInterval: INTERVAL,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async ({ signal }) => {
      const nsfw = settingsAtoms.mangaSourceNsfw.get();
      const [library, sources] = await Promise.all([getMangaLibrary(true), getMangaSources()]);
      const enabledSources = new Set(sources.filter((row) => row.enabled).map((row) => row.id));
      const pollId = Date.now();
      const updates: { title: string; count: number }[] = [];
      for (const item of library.items) {
        if (signal.aborted) break;
        if (!enabledSources.has(item.source)) continue;
        if (!mangaRatingVisible(item.rating, nsfw, item.source)) continue;
        const result = await refreshMangaChapters(
          item.source,
          item.mangaId,
          sourceShowsNsfw(nsfw, item.source),
          true
        ).catch((error: unknown) => {
          reportBackgroundError("manga.refresh", error);
          return undefined;
        });
        const notification = result?.notification;
        if (!notification) continue;
        if (notification.statusChange) {
          const [previous, current] = notification.statusChange;
          addNotification(
            t("manga.notification.status"),
            "info",
            t("manga.notification.status.body", { title: item.title, previous, current }),
            `manga:status:${item.id}:${pollId}`
          );
        }
        if (notification.newChapters > 0) {
          updates.push({ title: item.title, count: notification.newChapters });
        }
      }
      for (const [index, update] of groupMangaChapterUpdates(updates).entries()) {
        addNotification(
          t("manga.notification.chapters"),
          "info",
          update.title === null
            ? t("manga.notification.chapters.summary", { count: update.count })
            : t("manga.notification.chapters.title", { title: update.title, count: update.count }),
          `manga:chapters:${pollId}:${index}`
        );
      }
      await client.invalidateQueries({ queryKey: mangaLibraryKey });
      return Date.now();
    },
  });
}

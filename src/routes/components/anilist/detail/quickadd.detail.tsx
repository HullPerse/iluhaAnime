import { useState } from "react";

import { Button } from "@/components/ui/button.component";
import { withStoredMedia } from "@/lib/collection/media.utils";
import { useCollectionData, useCollectionMutations } from "@/hooks/collection/queries.hook";
import {
  mediaToWizardValues,
  type QuickAddListEntry,
  type QuickAddMedia,
} from "@/lib/collection/import.utils";
import { buildWizardItem } from "@/lib/collection/wizard.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useSettingsStore } from "@/store/settings.store";
import { useNotificationStore } from "@/store/notification.store";

async function downloadCover(url: string): Promise<string | null> {
  if (!url.startsWith("http://") && !url.startsWith("https://")) return null;
  try {
    const cached = await invokeTyped<{ id: string }>("download_remote_image", {
      url,
      nameHint: "collection-cover",
    });
    return cached.id;
  } catch {
    return null;
  }
}

interface AddedMedia {
  backdrops: { url: string }[];
  trailerYoutubeId: string | null;
}

/**
 * Fetches stills (TMDB with the key, Jikan as fallback) and the trailer for the
 * quick-added anime so the collection media viewer has content. Failures are
 * non-fatal: the viewer falls back to live fetching by anilist id.
 */
async function fetchAddedMedia(media: QuickAddMedia): Promise<AddedMedia | null> {
  const { tmdbApiKey, tmdbProxyUrl } = useSettingsStore.getState();
  let media_type: "movie" | "tv" | null = null;
  let tmdbId: number | null = null;
  if (tmdbApiKey) {
    try {
      const results = await invokeTyped<{ id: number; media_type: string }[]>("search_tmdb", {
        apiKey: tmdbApiKey,
        query: media.title,
        language: "ru-RU",
        includeAdult: false,
        proxyUrl: tmdbProxyUrl || undefined,
      } as unknown as Record<string, unknown>);
      const first = results.find((r) => r.media_type === "movie" || r.media_type === "tv");
      if (first) {
        tmdbId = first.id;
        media_type = first.media_type as "movie" | "tv";
      }
    } catch {
      // fall through to Jikan
    }
  }
  if (tmdbId != null && media_type != null) {
    try {
      const tmdb = await invokeTyped<AddedMedia>("get_tmdb_media", {
        apiKey: tmdbApiKey,
        tmdbId,
        mediaType: media_type,
        proxyUrl: tmdbProxyUrl || undefined,
      } as unknown as Record<string, unknown>);
      return {
        backdrops: tmdb.backdrops,
        trailerYoutubeId: tmdb.trailerYoutubeId ?? media.trailer_youtube_id ?? null,
      };
    } catch {
      // fall through to Jikan
    }
  }
  if (media.id_mal != null) {
    try {
      const pics = await invokeTyped<{ url: string }[]>("get_anime_stills", {
        malId: media.id_mal,
      });
      return { backdrops: pics, trailerYoutubeId: media.trailer_youtube_id ?? null };
    } catch {
      return null;
    }
  }
  return null;
}

export default function QuickAddButton({
  anime,
  listEntry,
  isFavorite,
}: {
  anime: QuickAddMedia;
  listEntry?: QuickAddListEntry;
  isFavorite: boolean;
}) {
  const { t } = useI18n();
  const { items } = useCollectionData();
  const { addItem } = useCollectionMutations();
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  const exists = added || items.some((item) => item.externalIds.anilist === anime.id);

  const handleAdd = async () => {
    if (exists || adding) return;
    setAdding(true);
    try {
      const values = mediaToWizardValues(anime, listEntry, isFavorite);
      const coverBlobId = await downloadCover(values.coverUrl);
      const built = buildWizardItem(values, coverBlobId, null);
      const added = await fetchAddedMedia(anime);
      await addItem(
        added
          ? {
              ...built,
              detailsJson: withStoredMedia(
                built.detailsJson,
                added.backdrops.map((b) => b.url).filter(Boolean).slice(0, 8),
                added.trailerYoutubeId
              ),
            }
          : built
      );
      setAdded(true);
      useNotificationStore
        .getState()
        .add(t("app.collection"), "success", t("collection.quick.add.success"));
    } catch {
      useNotificationStore
        .getState()
        .add(t("app.collection"), "error", t("collection.quick.add.error"));
    } finally {
      setAdding(false);
    }
  };

  return (
    <Button
      className="h-5 shrink-0 px-1 text-xs"
      disabled={exists || adding}
      onClick={handleAdd}
      title={t(exists ? "collection.quick.added" : "collection.quick.add")}
    >
      {t(exists ? "collection.quick.added" : "collection.quick.add")}
    </Button>
  );
}

import { attempt } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { AddedMedia, QuickAddMedia } from "@/types/collection";

export async function downloadCover(url: string): Promise<string | null> {
  if (!url.startsWith("http://") && !url.startsWith("https://")) return null;

  const [data, error] = await attempt(
    invokeTyped<{ id: string }>("download_remote_image", {
      url,
      nameHint: "collection-cover",
    })
  );

  if (error) return null;
  else return data.id;
}

export async function fetchAddedMedia(media: QuickAddMedia): Promise<AddedMedia | null> {
  const { tmdbKeySet, tmdbProxyUrl } = useSettingsStore.getState();
  let media_type: "movie" | "tv" | null = null;
  let tmdbId: number | null = null;
  if (tmdbKeySet) {
    try {
      const results = await invokeTyped<{ id: number; media_type: string }[]>("search_tmdb", {
        apiKey: "",
        query: media.title,
        language: "ru-RU",
        includeAdult: false,
        proxyUrl: tmdbProxyUrl || undefined,
      });
      const first = results.find((r) => r.media_type === "movie" || r.media_type === "tv");
      if (first) {
        tmdbId = first.id;
        media_type = first.media_type as "movie" | "tv";
      }
    } catch {}
  }
  if (tmdbId != null && media_type != null) {
    try {
      const tmdb = await invokeTyped<AddedMedia>("get_tmdb_media", {
        apiKey: "",
        tmdbId,
        mediaType: media_type,
        proxyUrl: tmdbProxyUrl || undefined,
      });
      return {
        backdrops: tmdb.backdrops,
        trailerYoutubeId: tmdb.trailerYoutubeId ?? media.trailer_youtube_id ?? null,
      };
    } catch {}
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

import { tmdbApi } from "@/api/tmdb.api";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { attemptResult, err, map, ok, unwrapOr, type Result } from "@/lib/utils/result.utils";
import type { AddedMedia, QuickAddMedia } from "@/types/collection";

export async function downloadCover(url: string): Promise<string | null> {
  if (!url.startsWith("http://") && !url.startsWith("https://")) return null;

  const image = await attemptResult(
    invokeTyped<{ id: string }>("download_remote_image", {
      url,
      nameHint: "collection-cover",
    })
  );

  return unwrapOr(
    map(image, (data) => data.id),
    null
  );
}

async function fetchFromTmdb(media: QuickAddMedia): Promise<Result<AddedMedia>> {
  if (!tmdbApi.isConfigured()) return err("tmdb api key is not set");
  const search = await attemptResult(
    tmdbApi.search<{ id: number; mediaType: string }>({
      query: media.title,
      language: "ru-RU",
      includeAdult: false,
    })
  );
  if (!search.ok) return search;
  const match = search.value.find((r) => r.mediaType === "movie" || r.mediaType === "tv");
  if (!match) return err("tmdb returned no movie or tv match");
  const details = await attemptResult(
    tmdbApi.getMedia(match.id, match.mediaType as "movie" | "tv")
  );
  if (!details.ok) return details;
  return ok({
    backdrops: details.value.backdrops,
    trailerYoutubeId: details.value.trailerYoutubeId ?? media.trailer_youtube_id ?? null,
  });
}

async function fetchFromMal(media: QuickAddMedia): Promise<Result<AddedMedia>> {
  const malId = media.id_mal;
  if (malId == null) return err("no mal id to look stills up by");
  const stills = await attemptResult(
    invokeTyped<{ url: string }[]>("get_anime_stills", {
      malId,
    })
  );
  if (!stills.ok) return stills;
  return ok({ backdrops: stills.value, trailerYoutubeId: media.trailer_youtube_id ?? null });
}

export async function fetchAddedMedia(media: QuickAddMedia): Promise<AddedMedia | null> {
  const tmdb = await fetchFromTmdb(media);
  if (tmdb.ok) return tmdb.value;
  return unwrapOr(await fetchFromMal(media), null);
}

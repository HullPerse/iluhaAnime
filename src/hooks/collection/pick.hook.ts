import { useRef } from "react";

import { WIZARD_COVER_MAX } from "@/config/collection/defaults.config";
import type { useWizardSearch } from "@/hooks/collection/search.hook";
import type { useWizardForm } from "@/hooks/collection/wizard.hook";
import { mergeGenreTags } from "@/lib/collection/wizard.utils";
import { reportBackgroundError } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import type { WizardPickedMedia, WizardSearchResult } from "@/types/collection";

type WizardForm = ReturnType<typeof useWizardForm>;
type WizardSearchState = ReturnType<typeof useWizardSearch>;

export function useWizardPick({
  form,
  source,
  tmdbKeySet,
  tmdbProxyUrl,
  coverBlobIdRef,
  setCoverBroken,
  setCoverOptions,
}: {
  form: WizardForm;
  source: "anilist" | "tmdb" | "custom";
  tmdbKeySet: boolean;
  tmdbProxyUrl?: string | null;
  coverBlobIdRef: { current: string | null };
  setCoverBroken: (broken: boolean) => void;
  setCoverOptions: WizardSearchState["setCoverOptions"];
}) {
  const {
    setTitle,
    setAltTitles,
    setYear,
    setReleaseDate,
    setCoverUrl,
    setDurationMinutes,
    setProgressTotal,
    setGenres,
    setStudio,
    setDescription,
    setType,
    setExternalIds,
  } = form;

  function applyCoverFromResult(cover: string | null): void {
    if (!cover) return;
    coverBlobIdRef.current = null;
    setCoverBroken(false);
    setCoverUrl(cover);
    setCoverOptions((prev) => (prev.includes(cover) ? prev : [cover, ...prev]));
  }

  function applyExternalId(resultId: number): void {
    const key = source === "anilist" ? "anilist" : source === "tmdb" ? "tmdb" : null;
    if (!key) return;
    setExternalIds((prev) => ({ ...prev, [key]: resultId }));
  }

  const tmdbPickRef = useRef(0);
  const mediaRef = useRef<WizardPickedMedia | null>(null);
  const handlePickResult = (r: WizardSearchResult) => {
    setTitle(r.title);
    if (r.altTitles?.length) {
      setAltTitles(r.altTitles.join(", "));
    }
    if (r.year) setYear(String(r.year));
    applyCoverFromResult(r.cover_url);
    if (r.duration) setDurationMinutes(String(r.duration));
    if (r.episodes) setProgressTotal(String(r.episodes));
    const mergedGenres = mergeGenreTags(r.genres ?? [], r.tags ?? []);
    if (mergedGenres.length) setGenres(mergedGenres.join(", "));
    if (r.studio) setStudio(r.studio);
    if (r.description) setDescription(r.description);
    applyExternalId(r.id);
    if (source === "tmdb" && tmdbKeySet && (r.mediaType === "movie" || r.mediaType === "tv")) {
      tmdbPickRef.current += 1;
      const pickId = tmdbPickRef.current;
      const mediaType = r.mediaType;
      invokeTyped<{
        title: string;
        overview: string | null;
        year: number | null;
        release_date: string | null;
        runtimeMinutes: number | null;
        genres: string[];
        posters: { url: string }[];
      }>("get_tmdb_details", {
        apiKey: "",
        tmdbId: r.id,
        mediaType,
        proxyUrl: tmdbProxyUrl || undefined,
      })
        .then((d) => {
          if (tmdbPickRef.current !== pickId) return;
          if (d.overview) setDescription(d.overview);
          if (d.genres.length) setGenres(d.genres.join(", "));
          if (d.year) setYear(String(d.year));
          if (d.release_date) setReleaseDate(d.release_date);
          if (d.runtimeMinutes) setDurationMinutes(String(d.runtimeMinutes));
          setType(mediaType === "movie" ? "movie" : "series");
          const posters = d.posters.map((p) => p.url).filter(Boolean);
          if (posters.length)
            setCoverOptions((prev) =>
              [...new Set([...posters, ...prev])].slice(0, WIZARD_COVER_MAX)
            );
          invokeTyped<{
            backdrops: { url: string }[];
            trailerYoutubeId: string | null;
          }>("get_tmdb_media", {
            apiKey: "",
            tmdbId: r.id,
            mediaType,
            proxyUrl: tmdbProxyUrl || undefined,
          })
            .then((m) => {
              if (tmdbPickRef.current !== pickId) return;
              mediaRef.current = {
                stills: m.backdrops
                  .map((b) => b.url)
                  .filter(Boolean)
                  .slice(0, 8),
                trailerYoutubeId: m.trailerYoutubeId,
              };
            })
            .catch((error) => reportBackgroundError("tmdb.pick.media", error));
        })
        .catch((error) => reportBackgroundError("tmdb.pick.details", error));
    }
  };

  return { handlePickResult, mediaRef };
}

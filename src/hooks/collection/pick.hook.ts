import { useRef } from "react";

import { tmdbApi } from "@/api/tmdb.api";
import { WIZARD_COVER_MAX } from "@/config/anilist/collectionDefaults.config";
import type { useWizardSearch } from "@/hooks/collection/search.hook";
import type { useWizardForm } from "@/hooks/collection/wizard.hook";
import { mergeGenreTags } from "@/lib/core/collection/wizard.utils";
import { ignore } from "@/lib/core/shared/promise.utils";
import { tr } from "@/lib/locale/i18n.utils";
import { attempt, reportBackgroundError } from "@hullperse/hp_utils/attempt";
import { showError } from "@/lib/core/ui/notification.utils";
import { settingsAtoms } from "@/store/settings.store";
import type { WizardPickedMedia, WizardSearchResult } from "@/types/anilist/collection";

type WizardForm = ReturnType<typeof useWizardForm>;
type WizardSearchState = ReturnType<typeof useWizardSearch>;

function reportPickError(scope: string, error: unknown): void {
  reportBackgroundError(scope, error);
  if (!settingsAtoms.notifyScanErrors.get()) return;
  showError(
    tr("notification.sync.failed"),
    error instanceof Error ? error.message : String(error)
  );
}

export function useWizardPick({
  form,
  source,
  coverBlobIdRef,
  setCoverBroken,
  setCoverOptions,
}: {
  form: WizardForm;
  source: "anilist" | "tmdb" | "custom";
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
    const key = source === "custom" ? null : source;
    if (!key) return;
    setExternalIds((prev) => ({ ...prev, [key]: resultId }));
  }

  const tmdbPickRef = useRef<number>(0);
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
    if (
      source === "tmdb" &&
      tmdbApi.isConfigured() &&
      (r.mediaType === "movie" || r.mediaType === "tv")
    ) {
      tmdbPickRef.current += 1;
      const pickId = tmdbPickRef.current;
      const mediaType = r.mediaType;
      const loadTmdbPick = async (): Promise<void> => {
        const [details, detailsError] = await attempt(
          tmdbApi.getDetails<{
            title: string;
            overview: string | null;
            year: number | null;
            releaseDate: string | null;
            runtimeMinutes: number | null;
            genres: string[];
            posters: { url: string }[];
          }>(r.id, mediaType)
        );
        if (detailsError !== null) {
          reportPickError("tmdb.pick.details", detailsError);
          return;
        }
        if (tmdbPickRef.current !== pickId) return;
        if (details.overview) setDescription(details.overview);
        if (details.genres.length) setGenres(details.genres.join(", "));
        if (details.year) setYear(String(details.year));
        if (details.releaseDate) setReleaseDate(details.releaseDate);
        if (details.runtimeMinutes) setDurationMinutes(String(details.runtimeMinutes));
        setType(mediaType === "movie" ? "movie" : "series");
        const posters = (details.posters ?? []).map((p) => p.url).filter(Boolean);
        if (posters.length)
          setCoverOptions((prev) =>
            [...new Set([...posters, ...prev])].slice(0, WIZARD_COVER_MAX)
          );
        const [media, mediaError] = await attempt(
          tmdbApi.getMedia<{
            backdrops: { url: string }[];
            trailerYoutubeId: string | null;
          }>(r.id, mediaType)
        );
        if (mediaError !== null) {
          reportPickError("tmdb.pick.media", mediaError);
          return;
        }
        if (tmdbPickRef.current !== pickId) return;
        mediaRef.current = {
          stills: (media.backdrops ?? []).map((b) => b.url).filter(Boolean).slice(0, 8),
          trailerYoutubeId: media.trailerYoutubeId,
        };
      };
      ignore(loadTmdbPick());
    }
  };

  return { handlePickResult, mediaRef };
}

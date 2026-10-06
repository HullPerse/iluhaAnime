import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { useAnimeBrief } from "@/hooks/anilist/anime-brief.hook";
import { useAnimeTitlePreference } from "@/hooks/anilist/title-preference.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { animeTitleFields, resolveAnimeTitle } from "@/lib/anilist/title.utils";
import { attempt, reportBackgroundError } from "@/lib/utils/attempt.utils";
import { useDeepLinkStore } from "@/store/deeplink.store";
import type { AniMedia } from "@/types/anilist";

const COVER_WIDTH = 62;
const COVER_HEIGHT = 86;

export interface AnimeCardProps {
  animeId: number;
  /** Skips the network request when present. */
  initialBrief?: AniMedia | null;
  onOpenInternal?: (id: number) => void;
  onOpenExternal?: (url: string) => void;
}

function defaultOpenInternal(id: number): void {
  useDeepLinkStore.getState().openAnime({ source: "anilist", id });
}

function defaultOpenExternal(url: string): void {
  attempt(openUrl(url)).then(([, error]) => {
    if (error) reportBackgroundError("lobby.chat.anime.openExternal", error);
  });
}

function AnimeCover({ brief, title }: { brief: AniMedia; title: string }) {
  if (brief.cover_url !== null && brief.cover_url !== "") {
    return (
      <img
        alt=""
        className="windows95-3d-border shrink-0 object-cover"
        height={COVER_HEIGHT}
        loading="lazy"
        referrerPolicy="no-referrer"
        src={brief.cover_url}
        style={{ height: COVER_HEIGHT, width: COVER_WIDTH }}
        width={COVER_WIDTH}
        onError={(event) => {
          event.currentTarget.style.display = "none";
        }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="bg-secondary windows95-3d-border text-title-text flex shrink-0 items-center justify-center text-sm font-bold"
      style={{ height: COVER_HEIGHT, width: COVER_WIDTH }}
    >
      {title.slice(0, 1).toUpperCase()}
    </span>
  );
}

export default function AnimeCard({
  animeId,
  initialBrief = null,
  onOpenInternal = defaultOpenInternal,
  onOpenExternal = defaultOpenExternal,
}: AnimeCardProps) {
  const { t } = useI18n();
  const preference = useAnimeTitlePreference();
  const { brief, loading, error } = useAnimeBrief(animeId, initialBrief);
  const siteUrl = `https://anilist.co/anime/${animeId}`;

  if (brief === null && loading) {
    return (
      <div
        aria-busy="true"
        aria-label={t("lobby.chat.anime.loading")}
        className="bg-field windows95-3d-border mt-1 flex max-w-[320px] items-center gap-2 px-2 py-1"
        role="status"
      >
        <span className="windows95-text text-hint text-xs">
          {t("lobby.chat.anime.loading")}
        </span>
      </div>
    );
  }

  if (brief === null || error) {
    return (
      <a
        className="text-highlight mt-1 block w-fit text-xs underline-offset-2 hover:underline"
        href={siteUrl}
        rel="noreferrer"
        target="_blank"
      >
        {t("lobby.chat.anime.unavailable")}
      </a>
    );
  }

  const title =
    resolveAnimeTitle(animeTitleFields(brief), preference) || brief.title;
  const meta = [
    brief.format,
    brief.season_year !== null ? String(brief.season_year) : null,
    brief.episodes !== null
      ? t("lobby.chat.anime.episodes", { count: String(brief.episodes) })
      : null,
    brief.score !== null ? t("lobby.chat.anime.score", { score: String(brief.score) }) : null,
  ]
    .filter((part): part is string => part !== null && part !== "")
    .join(" · ");

  return (
    <div className="bg-field windows95-3d-border mt-1 flex max-w-[320px] items-start gap-2 px-2 py-1">
      <button
        aria-label={t("lobby.chat.anime.open")}
        className="flex min-w-0 flex-1 items-start gap-2 text-left"
        onClick={() => onOpenInternal(animeId)}
        title={t("lobby.chat.anime.open")}
        type="button"
      >
        <AnimeCover brief={brief} title={title} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="windows95-text text-text line-clamp-2 text-xs font-bold">
            {title}
          </span>
          {meta !== "" && (
            <span className="windows95-text text-hint text-xs">{meta}</span>
          )}
        </span>
      </button>
      <Button
        aria-label={t("lobby.chat.anime.openExternal")}
        className="shrink-0"
        onClick={() => onOpenExternal(siteUrl)}
        size="icon"
        title={t("lobby.chat.anime.openExternal")}
        type="button"
      >
        <ExternalLink />
      </Button>
    </div>
  );
}

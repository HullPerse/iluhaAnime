import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { anilistApi } from "@/api/anilist.api";
import { TrailerEmbed } from "@/components/shared/lightbox/trailerEmbed.media";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { queryKeys } from "@/lib/query/keys.utils";
import { attemptAll } from "@/lib/utils/attempt.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { AniDetailProps as DetailProps } from "@/types/anilist";

import { CopyLinkButton } from "./copyLinkButton.detail";
import { FavHeartButton } from "./favHeartButton.detail";
import { AniListDetailView } from "./view.detail";

export interface DetailShellSlot {
  title: string;
  actions: ReactNode;
  onBack: (() => void) | undefined;
  body: ReactNode;
}

export function AnimeDetailShell({
  render,
  ...props
}: DetailProps & { render: (slot: DetailShellSlot) => ReactNode }) {
  const { t } = useI18n();
  const [trailer, setTrailer] = useState<{ animeId: number; youtubeId: string } | null>(null);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const trailerId =
    trailer !== null && trailer.animeId === props.animeId ? trailer.youtubeId : null;
  const isFavorite = props.favouriteIds?.has(props.animeId) ?? false;
  const toggleFavorite = async () => {
    if (favoriteLoading) return;
    setFavoriteLoading(true);
    await attemptAll([() => props.onFavouriteToggle?.(props.animeId)], {
      onFinally: () => setFavoriteLoading(false),
    });
  };
  const anilistProxyUrl = useSettingsStore((s) => s.anilistProxyUrl);
  const query = useAppQuery("static", {
    queryKey: queryKeys.animeFull(props.animeId, anilistProxyUrl ?? "", props.isLoggedIn),
    queryFn: () => anilistApi.getAnimeFull(props.animeId),
    retry: 1,
  });
  const title =
    query.data?.media.title ??
    (query.isError ? t("anilist.details.load.error") : t("anilist.details.loading"));
  const actions = (
    <>
      <CopyLinkButton animeId={props.animeId} />
      {props.isLoggedIn && query.data ? (
        <FavHeartButton
          isFavorite={isFavorite}
          loading={favoriteLoading}
          onToggle={toggleFavorite}
        />
      ) : null}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          openUrl(`https://anilist.co/anime/${query.data?.media.id ?? props.animeId}`);
        }}
        title={t("anilist.controls.open.site")}
        aria-label={t("anilist.controls.open.site")}
        className="windows95-active-border bg-primary text-text windows95-text flex size-5 cursor-pointer items-center justify-center hover:brightness-110 active:translate-x-px active:translate-y-px"
      >
        <ExternalLink className="size-2.5" />
      </button>
    </>
  );
  const body =
    trailerId != null ? (
      <TrailerEmbed youtubeId={trailerId} title={t("anilist.details.trailer")} />
    ) : (
      <AniListDetailView
        {...props}
        anime={query.data?.media}
        initialCharacters={query.data?.characters}
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        refetch={query.refetch}
        onTrailer={(youtubeId) => setTrailer({ animeId: props.animeId, youtubeId })}
      />
    );
  return (
    <>
      {render({
        title,
        actions,
        onBack: trailerId != null ? () => setTrailer(null) : props.onBack,
        body,
      })}
    </>
  );
}

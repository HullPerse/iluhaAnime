import { useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { anilistApi } from "@/api/anilist.api";
import { TrailerEmbed } from "@/components/shared/lightbox/trailerEmbed.media";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { queryKeys } from "@/lib/query/keys.utils";
import { useCell } from "@/lib/state/signal.hook";
import { attemptAll } from "@/lib/utils/attempt.utils";
import { settingsAtoms } from "@/store/settings.store";
import type {
  AniDetailProps as DetailProps,
  AniListOverlayContext,
  AniListOverlayScreen,
} from "@/types/anilist";

import { CopyLinkButton } from "./copyLinkButton.detail";
import { FavHeartButton } from "./favHeartButton.detail";
import { OverlayScreens } from "./screens.detail";
import { AniListDetailView } from "./view.detail";

export interface DetailShellSlot {
  title: string;
  actions: ReactNode;
  onBack: (() => void) | undefined;
  body: ReactNode;
}

function ShellHeaderActions({
  animeId,
  favoriteLoading,
  hasAnime,
  isFavorite,
  isLoggedIn,
  onToggle,
  siteId,
}: {
  animeId: number;
  favoriteLoading: boolean;
  hasAnime: boolean;
  isFavorite: boolean;
  isLoggedIn: boolean;
  onToggle: () => void;
  siteId: number;
}) {
  const { t } = useI18n();
  return (
    <>
      <CopyLinkButton animeId={animeId} />
      {isLoggedIn && hasAnime ? (
        <FavHeartButton isFavorite={isFavorite} loading={favoriteLoading} onToggle={onToggle} />
      ) : null}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          openUrl(`https://anilist.co/anime/${siteId}`);
        }}
        title={t("anilist.controls.open.site")}
        aria-label={t("anilist.controls.open.site")}
        className="windows95-active-border bg-primary text-text windows95-text flex size-5 cursor-pointer items-center justify-center hover:brightness-110 active:translate-x-px active:translate-y-px"
      >
        <ExternalLink className="size-2.5" />
      </button>
    </>
  );
}

function resolveBack(
  screenTop: AniListOverlayScreen | null,
  trailerId: string | null,
  backScreen: () => void,
  closeTrailer: () => void,
  fallback: (() => void) | undefined
): (() => void) | undefined {
  if (screenTop) return backScreen;
  if (trailerId != null) return closeTrailer;
  return fallback;
}

function useDetailScreens(animeId: number, onRelated: ((id: number) => void) | undefined) {
  const [screens, setScreens] = useState<AniListOverlayScreen[]>([]);
  useEffect(() => {
    setScreens([]);
  }, [animeId]);
  const screenTop = screens.at(-1) ?? null;
  const pushScreen = (screen: AniListOverlayScreen) => {
    setScreens((prev) => [...prev, screen]);
  };
  const backScreen = () => {
    setScreens((prev) => prev.slice(0, -1));
  };
  const openAnime = (id: number) => {
    setScreens([]);
    onRelated?.(id);
  };
  return { backScreen, openAnime, pushScreen, screenTop };
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
  const anilistProxyUrl = useCell(settingsAtoms.anilistProxyUrl);
  const queryClient = useQueryClient();
  const query = useAppQuery("static", {
    queryKey: queryKeys.animeFull(props.animeId, anilistProxyUrl ?? "", props.isLoggedIn),
    queryFn: () => anilistApi.getAnimeFull(props.animeId),
    retry: 1,
  });
  // The franchise section and SimilarSection share this key; starting the
  // request here drops the full-bundle round trip from the graph's wait time.
  useEffect(() => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.animeFranchiseRefresh(props.animeId, 0),
      queryFn: () => anilistApi.getAnimeFranchise(props.animeId, "all"),
      staleTime: Infinity,
    });
  }, [props.animeId, queryClient]);
  const { backScreen, openAnime, pushScreen, screenTop } = useDetailScreens(
    props.animeId,
    props.onRelated
  );
  const screenContext: AniListOverlayContext = {
    isLoggedIn: props.isLoggedIn,
    favouriteCharacterIds: props.favouriteCharacterIds,
    favouriteStaffIds: props.favouriteStaffIds,
    onCharacterFavouriteToggle: props.onCharacterFavouriteToggle,
    onStaffFavouriteToggle: props.onStaffFavouriteToggle,
    onOpenAnime: openAnime,
    onPush: pushScreen,
  };
  const animeTitle =
    query.data?.media.title ??
    (query.isError ? t("anilist.details.load.error") : t("anilist.details.loading"));
  const title = screenTop?.name ?? animeTitle;
  const actions = screenTop ? undefined : (
    <ShellHeaderActions
      animeId={props.animeId}
      favoriteLoading={favoriteLoading}
      hasAnime={query.data != null}
      isFavorite={isFavorite}
      isLoggedIn={props.isLoggedIn}
      onToggle={toggleFavorite}
      siteId={query.data?.media.id ?? props.animeId}
    />
  );
  const onBack = resolveBack(
    screenTop,
    trailerId,
    backScreen,
    () => setTrailer(null),
    props.onBack
  );
  const body = screenTop ? (
    <OverlayScreens current={screenTop} context={screenContext} />
  ) : trailerId != null ? (
    <TrailerEmbed youtubeId={trailerId} title={t("anilist.details.trailer")} />
  ) : (
    <AniListDetailView
      {...props}
      anime={query.data?.media}
      initialCharacters={query.data?.characters}
      initialRecommendations={query.data?.recommendations}
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      refetch={query.refetch}
      onTrailer={(youtubeId) => setTrailer({ animeId: props.animeId, youtubeId })}
      onPushScreen={pushScreen}
    />
  );
  return (
    <>
      {render({
        title,
        actions,
        onBack,
        body,
      })}
    </>
  );
}

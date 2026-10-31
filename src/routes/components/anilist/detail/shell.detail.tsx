import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { anilistApi } from "@/api/anilist.api";
import { TrailerEmbed } from "@/components/shared/lightbox/trailerEmbed.media";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { queryKeys } from "@/lib/core/keys.utils";
import { useCell } from "@/lib/core/signal.hook";
import { attemptAll } from "@/lib/core/attempt.utils";
import { settingsAtoms } from "@/store/settings.store";
import { resolveDetailBack } from "@/lib/anilist/detailBack.utils";
import { useDetailScreens } from "@/hooks/anilist/detailScreens.hook";
import { useDetailPresence } from "@/hooks/anilist/detailPresence.hook";
import { ShellHeaderActions } from "@/routes/components/anilist/detail/shellHeaderActions.detail";
import type { AniDetailProps as DetailProps, AniListOverlayContext } from "@/types/anilist/anilist";

import { OverlayScreens } from "./screens.detail";
import { AniListDetailView } from "./view.detail";
import type { DetailShellSlot } from "@/types/core/shell.detail";

export function AnimeDetailShell({
  render,
  ...props
}: DetailProps & { render: (slot: DetailShellSlot) => ReactNode }) {
  const { t } = useI18n();
  const [trailer, setTrailer] = useState<{ animeId: number; youtubeId: string } | null>(null);
  const [favoriteLoading, setFavoriteLoading] = useState<boolean>(false);
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
  useDetailPresence(query.data?.media, props.animeId);
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
  const onBack = resolveDetailBack(
    screenTop,
    trailerId,
    backScreen,
    () => setTrailer(null),
    props.onBack
  );
  let body: ReactNode;
  if (screenTop) body = <OverlayScreens current={screenTop} context={screenContext} />;
  else if (trailerId != null)
    body = <TrailerEmbed youtubeId={trailerId} title={t("anilist.details.trailer")} />;
  else
    body = (
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

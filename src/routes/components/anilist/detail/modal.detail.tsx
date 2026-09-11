import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { TrailerEmbed } from "@/components/shared/lightbox/lightbox.media";
import Modal from "@/components/shared/modal.component";
import { anilistProxyArgs } from "@/lib/anilist/proxy.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { AniMedia } from "@/types/anilist";
import type { AniDetailProps as DetailProps } from "@/types/anilist";

import { CopyLinkButton, FavHeartButton } from "./actions.detail";
import { AniListDetailView } from "./view.detail";

function AniListDetailModal(props: DetailProps) {
  const { t } = useI18n();
  const [trailer, setTrailer] = useState<{ animeId: number; youtubeId: string } | null>(null);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const trailerId =
    trailer !== null && trailer.animeId === props.animeId ? trailer.youtubeId : null;
  const isFavorite = props.favouriteIds?.has(props.animeId) ?? false;
  const toggleFavorite = () => {
    if (favoriteLoading) return;
    setFavoriteLoading(true);
    props.onFavouriteToggle?.(props.animeId);
    setFavoriteLoading(false);
  };
  const anilistProxyUrl = useSettingsStore((s) => s.anilistProxyUrl);
  const query = useQuery({
    queryKey: ["anime_detail", props.animeId, anilistProxyUrl ?? "", props.isLoggedIn ? 1 : 0],
    queryFn: () =>
      invokeTyped<AniMedia>("get_anime_by_id", {
        id: props.animeId,
        ...anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl),
      }),
    staleTime: 1000 * 60 * 60,
    retry: 1,
  });
  return (
    <Modal
      header={query.data?.title ?? t("anilist.details.loading")}
      onClose={props.onClose}
      onBack={trailerId ? () => setTrailer(null) : props.onBack}
      headerActions={
        <>
          <CopyLinkButton animeId={props.animeId} />
          {props.isLoggedIn && query.data ? (
            <FavHeartButton
              isFavorite={isFavorite}
              loading={favoriteLoading}
              onToggle={toggleFavorite}
            />
          ) : null}
        </>
      }
      className="min-w-2xl"
    >
      {trailerId ? (
        <TrailerEmbed youtubeId={trailerId} title={t("anilist.details.trailer")} />
      ) : (
        <AniListDetailView
          {...props}
          anime={query.data}
          isLoading={query.isLoading}
          isError={query.isError}
          error={query.error}
          refetch={query.refetch}
          onTrailer={(youtubeId) => setTrailer({ animeId: props.animeId, youtubeId })}
        />
      )}
    </Modal>
  );
}

export default AniListDetailModal;

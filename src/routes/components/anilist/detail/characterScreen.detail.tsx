import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { characterRoleLabels } from "@/config/anilist/labels.config";
import { MEDIA_PAGE_SIZE } from "@/config/anilist/pagination.config";
import { anilistProxyArgs } from "@/lib/anilist/proxy.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import { uniqueById } from "@/lib/utils/array.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useSettingsStore } from "@/store/settings.store";
import type {
  AniCharacterDetail,
  AniListOverlayContext,
  AniListOverlayScreen,
} from "@/types/anilist";

import { CreditSection } from "./creditSection.detail";
import { PersonFavButton } from "./favbutton.detail";
import { DetailProfileHeader } from "./profileHeader.detail";
import { DetailError, DetailLoading } from "./screenState.detail";

export function CharacterScreen({
  screen,
  context,
}: {
  screen: Extract<AniListOverlayScreen, { kind: "character" }>;
  context: AniListOverlayContext;
}) {
  const { t } = useI18n();
  const query = useInfiniteQuery({
    queryKey: ["character_detail", screen.id],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      invokeTyped<AniCharacterDetail>("get_character_detail", {
        id: screen.id,
        page: pageParam,
        ...anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl),
      }),
    // A command that resolved to nothing (mock, empty response) must not blow up the observer.
    getNextPageParam: (lastPage, pages) =>
      (Array.isArray(lastPage?.media) ? lastPage.media.length : 0) < MEDIA_PAGE_SIZE
        ? undefined
        : pages.length + 1,
  });

  const media = useMemo(
    () =>
      uniqueById(
        (query.data?.pages ?? []).flatMap((page) => (page ? page.media : [])),
        (item) => item.id
      ),
    [query.data]
  );
  const profile = query.data?.pages.at(0);
  const roleLabel = screen.role ? characterRoleLabels[screen.role] : undefined;

  if (query.isLoading) {
    return <DetailLoading />;
  }
  if (query.isError) {
    return (
      <DetailError
        message={query.error instanceof Error ? query.error.message : undefined}
        onRetry={() => query.refetch()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2 p-1">
      <DetailProfileHeader
        image={profile?.image ?? null}
        name={profile?.name ?? screen.name}
        nativeName={profile?.native_name ?? null}
        roleLabel={roleLabel ? t(roleLabel) : undefined}
        favourites={profile?.favourites ?? null}
        siteUrl={profile?.site_url ?? null}
        favButton={
          context.isLoggedIn ? (
            <PersonFavButton
              id={screen.id}
              favouriteIds={context.favouriteCharacterIds}
              labelled
              onToggle={(id) => context.onCharacterFavouriteToggle?.(id)}
            />
          ) : undefined
        }
      />

      {screen.voiceActors.length > 0 && (
        <CreditSection
          header={t("anilist.characters.voice.actors")}
          items={screen.voiceActors.map((voiceActor) => ({
            id: voiceActor.id,
            image: voiceActor.image,
            label: voiceActor.name,
            sublabel: voiceActor.native_name ?? undefined,
          }))}
          onSelect={(item) => context.onPush({ kind: "staff", id: item.id, name: item.label })}
        />
      )}

      <CreditSection
        header={t("anilist.characters.appears.in", { count: media.length })}
        emptyLabel={t("anilist.characters.none")}
        items={media.map((item) => ({ id: item.id, image: item.cover_url, label: item.title }))}
        hasNextPage={query.hasNextPage}
        isFetchingNextPage={query.isFetchingNextPage}
        onShowMore={() => query.fetchNextPage()}
        onSelect={(item) => context.onPush({ kind: "anime", id: item.id, name: item.label })}
      />
    </div>
  );
}

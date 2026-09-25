import { useMemo, useState } from "react";

import { anilistApi } from "@/api/anilist.api";
import Section from "@/components/shared/section.component";
import { STAFF_CREDITS_PAGE_SIZE } from "@/config/anilist/pagination.config";
import { useAppInfiniteQuery } from "@/hooks/appQuery.hook";
import { flattenMarkup } from "@/lib/anilist/text.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import { queryKeys } from "@/lib/query/keys.utils";
import { uniqueById } from "@/lib/utils/array.utils";
import type { AniListOverlayContext, AniListOverlayScreen } from "@/types/anilist";

import { CreditSection } from "./creditSection.detail";
import { PersonFavButton } from "./favbutton.detail";
import { DetailProfileHeader } from "./profileHeader.detail";
import { DetailError, DetailLoading } from "./screenState.detail";

function useStaffPage(
  key: string,
  id: number,
  list: "characters" | "media",
  pageParamName: "page" | "charPage",
  pageSize: number
) {
  return useAppInfiniteQuery("slow", {
    queryKey: queryKeys.staffDetail(id, key),
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      anilistApi.getStaffCharacters(
        id,
        pageParamName === "page" ? pageParam : 1,
        pageParamName === "charPage" ? pageParam : 1
      ),
    getNextPageParam: (lastPage, pages) =>
      (Array.isArray(lastPage?.[list]) ? lastPage[list].length : 0) < pageSize
        ? undefined
        : pages.length + 1,
  });
}

type StaffPage = ReturnType<typeof useStaffPage>;

function StaffCharactersSection({
  query,
  context,
}: {
  query: StaffPage;
  context: AniListOverlayContext;
}) {
  const { t } = useI18n();
  const characters = useMemo(
    () =>
      uniqueById(
        (query.data?.pages ?? []).flatMap((page) => (page ? page.characters : [])),
        (character) => character.id
      ),
    [query.data]
  );
  return (
    <CreditSection
      header={t("anilist.characters.characters.of", {
        count: query.data?.pages[0]?.character_count || characters.length,
      })}
      items={characters.map((character) => ({
        id: character.id,
        image: character.image,
        label: character.name,
        favourite: context.favouriteCharacterIds?.has(character.id) ?? false,
      }))}
      hasNextPage={query.hasNextPage}
      isFetchingNextPage={query.isFetchingNextPage}
      onShowMore={() => query.fetchNextPage()}
      onSelect={(item) =>
        context.onPush({ kind: "character", id: item.id, name: item.label, voiceActors: [] })
      }
    />
  );
}

function StaffAboutSection({ about }: { about: string }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  if (about === "") {
    return null;
  }
  return (
    <Section
      header={t("anilist.staff.about")}
      className="windows95-text bg-field leading-relaxed whitespace-pre-line"
      expanded={expanded}
      onExpand={() => setExpanded((prev) => !prev)}
    >
      <span className="text-xs">{expanded ? about : about.split("\n")[0]}</span>
    </Section>
  );
}

function StaffMediaSection({
  query,
  context,
}: {
  query: StaffPage;
  context: AniListOverlayContext;
}) {
  const { t } = useI18n();
  const media = useMemo(
    () =>
      uniqueById(
        (query.data?.pages ?? []).flatMap((page) => (page ? page.media : [])),
        (item) => item.id
      ),
    [query.data]
  );
  return (
    <CreditSection
      header={t("anilist.characters.anime.of", {
        count: query.data?.pages[0]?.media_count || media.length,
      })}
      items={media.map((item) => ({ id: item.id, image: item.cover_url, label: item.title }))}
      hasNextPage={query.hasNextPage}
      isFetchingNextPage={query.isFetchingNextPage}
      onShowMore={() => query.fetchNextPage()}
      onSelect={(item) => context.onPush({ kind: "anime", id: item.id, name: item.label })}
    />
  );
}

export function StaffScreen({
  screen,
  context,
}: {
  screen: Extract<AniListOverlayScreen, { kind: "staff" }>;
  context: AniListOverlayContext;
}) {
  const characters = useStaffPage(
    "characters",
    screen.id,
    "characters",
    "charPage",
    STAFF_CREDITS_PAGE_SIZE
  );
  const media = useStaffPage("media", screen.id, "media", "page", STAFF_CREDITS_PAGE_SIZE);

  const profile = characters.data?.pages[0] ?? media.data?.pages[0];
  const about = flattenMarkup(profile?.about);

  if (characters.isLoading && media.isLoading) {
    return <DetailLoading />;
  }
  if (characters.isError && media.isError) {
    return (
      <DetailError
        onRetry={() => {
          characters.refetch();
          media.refetch();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2 p-1">
      <DetailProfileHeader
        image={profile?.image ?? null}
        name={profile?.name ?? screen.name}
        nativeName={profile?.native_name ?? null}
        favourites={profile?.favourites ?? null}
        siteUrl={profile?.site_url ?? null}
        favButton={
          context.isLoggedIn ? (
            <PersonFavButton
              id={screen.id}
              favouriteIds={context.favouriteStaffIds}
              labelled
              onToggle={(id) => context.onStaffFavouriteToggle?.(id)}
            />
          ) : undefined
        }
      />

      <StaffAboutSection about={about} />

      <StaffCharactersSection query={characters} context={context} />
      <StaffMediaSection query={media} context={context} />
    </div>
  );
}

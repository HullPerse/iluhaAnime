import { useCell } from "@hullperse/hp_utils/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { TabButtons } from "@/routes/components/anilist/stats/modal/tabs.modal";
import { anilistApi } from "@/api/anilist.api";
import Modal from "@/components/shared/modal.component";
import Pagination from "@/components/shared/pagination.component";
import { useI18n } from "@/hooks/i18n.hook";
import TrackedMangaDetail, {
  trackingMangaKey,
} from "@/routes/components/anilist/mangaDetail.anilist";
import { trackedManga } from "@/store/anilistManga.store";
import type { AniFriend, AniUser } from "@/types/anilist/anilist";
import { MangaFilters } from "@/routes/components/anilist/manga/filters.manga";
import { TrackingToolbar } from "@/routes/components/anilist/manga/trackingToolbar.manga";
import { ProfileControls } from "@/routes/components/anilist/manga/profileControls.manga";
import { ProfileContent } from "@/routes/components/anilist/manga/profileContent.manga";
import {
  query,
  search,
  filters,
  page,
  filterOpen,
  account,
  section,
  listStatus,
} from "@/store/anilistMangaProfile.store";

const PAGE_SIZE = 25;

function useMangaProfileData(user: AniUser | null | undefined) {
  const term = useCell(query);
  const isSearching = useCell(search);
  const pagination = useCell(page);
  const searchFilters = useCell(filters);
  const selected = useCell(trackedManga);
  const showFilters = useCell(filterOpen);
  const active = useCell(section);
  const status = useCell(listStatus);
  const viewed = useCell(account);
  const viewedId = viewed ? Number(viewed) : user?.id;
  const own = viewedId === user?.id;
  const list = useQuery({
    queryKey: [...trackingMangaKey, "lists", viewedId],
    enabled: viewedId !== undefined,
    queryFn: () => anilistApi.getLists(viewedId ?? 0, false, "MANGA"),
  });
  const overview = useQuery({
    queryKey: [...trackingMangaKey, "overview", viewedId],
    enabled:
      viewedId !== undefined &&
      (active === "favourites" || active === "stats" || selected !== null),
    queryFn: () => anilistApi.getMangaOverview(viewedId ?? 0),
  });
  const result = useQuery({
    queryKey: [...trackingMangaKey, "search", term, searchFilters, pagination],
    enabled: isSearching,
    queryFn: () =>
      anilistApi.filterPage({
        ...searchFilters,
        mediaType: "MANGA",
        adult: false,
        query: term || null,
        page: pagination,
        perPage: PAGE_SIZE,
      }),
  });
  const ids = viewedId === undefined ? [] : [viewedId];
  const activity = useQuery({
    queryKey: [...trackingMangaKey, "activity", ids],
    enabled: active === "activity" && ids.length > 0,
    queryFn: () => anilistApi.getActivity(ids, "MANGA"),
  });
  const stats = overview.data?.statistics;
  const entries = new Map(
    list.data?.flatMap((group) => group.entries.map((entry) => [entry.media.id, entry] as const))
  );
  const current = isSearching
    ? result.data?.media
    : active === "favourites"
      ? overview.data?.favourites
      : active === "lists"
        ? [...entries.values()]
            .filter((entry) => !status || entry.list_status === status)
            .map((entry) => entry.media)
        : undefined;
  const loading = isSearching
    ? result.isPending
    : active === "activity"
      ? activity.isFetching
      : active === "lists"
        ? list.isFetching
        : overview.isFetching;

  return {
    term,
    isSearching,
    pagination,
    selected,
    showFilters,
    active,
    own,
    list,
    overview,
    result,
    activity,
    stats,
    entries,
    current,
    loading,
  };
}

export default function AniListMangaProfile({
  user,
  friends,
}: {
  user?: AniUser | null;
  friends: readonly AniFriend[];
}) {
  const { t } = useI18n();
  const [statsOpen, setStatsOpen] = useState<boolean>(false);
  const {
    term,
    isSearching,
    pagination,
    selected,
    showFilters,
    active,
    own,
    list,
    overview,
    result,
    activity,
    stats,
    entries,
    current,
    loading,
  } = useMangaProfileData(user);

  return (
    <div className="flex h-full min-h-0 flex-col gap-1 text-xs">
      <TrackingToolbar term={term} onStats={user ? () => setStatsOpen(true) : undefined} />
      {user && <ProfileControls user={user} friends={friends} />}
      <ProfileContent
        {...{ loading, current, entries, user, isSearching, active, stats }}
        error={result.isError || list.isError || overview.isError || activity.isError}
        activity={activity.data}
      />
      {isSearching && result.data && result.data.total > PAGE_SIZE && (
        <Pagination
          page={pagination}
          lastPage={Math.ceil(result.data.total / PAGE_SIZE)}
          total={result.data.total}
          from={(pagination - 1) * PAGE_SIZE + 1}
          to={Math.min(pagination * PAGE_SIZE, result.data.total)}
          onPageChange={(next) => page.set(next)}
        />
      )}
      {showFilters && <MangaFilters />}
      {statsOpen && user && (
        <Modal
          header={t("anilist.stats.title")}
          onClose={() => setStatsOpen(false)}
          className="w-3xl"
        >
          <TabButtons tab="overview" onTab={() => {}} manga />
          <ProfileContent
            loading={overview.isPending}
            error={overview.isError}
            current={undefined}
            entries={entries}
            user={user}
            isSearching={false}
            active="stats"
            stats={stats}
            activity={undefined}
          />
        </Modal>
      )}
      {selected && (
        <TrackedMangaDetail
          key={selected.id}
          {...selected}
          user={own ? user : null}
          entry={entries.get(selected.id)}
          favourite={overview.data?.favourites.some((item) => item.id === selected.id) ?? false}
        />
      )}
    </div>
  );
}

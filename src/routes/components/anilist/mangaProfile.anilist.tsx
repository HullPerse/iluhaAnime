import { useCell } from "@hullperse/hp_utils/react";
import { createSignalStore } from "@hullperse/hp_utils/signal";
import { useQuery } from "@tanstack/react-query";
import { Calendar } from "lucide-react";
import { useState } from "react";
import { TabButtons } from "@/routes/components/anilist/stats/modal/tabs.modal";

import { anilistApi } from "@/api/anilist.api";
import type { AnilistSearchParams } from "@/api/anilist.api";
import Modal from "@/components/shared/modal.component";
import Pagination from "@/components/shared/pagination.component";
import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import Select from "@/components/ui/select.component";
import { useI18n } from "@/hooks/i18n.hook";
import TrackedMangaDetail, {
  mangaListStatuses,
  trackingMangaKey,
} from "@/routes/components/anilist/mangaDetail.anilist";
import { anilistMangaMode, openTrackedManga, trackedManga } from "@/store/anilistManga.store";
import { AniListMediaMode } from "@/routes/components/anilist/mediaMode.anilist";
import type {
  AniActivity,
  AniFriend,
  AniListEntry,
  AniMangaOverview,
  AniMedia,
  AniUser,
} from "@/types/anilist/anilist";

const PAGE_SIZE = 25;
const store = createSignalStore();
const query = store.atom("anilist.manga.search", "");
const search = store.atom("anilist.manga.searchActive", false);
const filters = store.atom<AnilistSearchParams>("anilist.manga.filters", {});
const page = store.atom("anilist.manga.page", 1);
const filterOpen = store.atom("anilist.manga.filterOpen", false);
const account = store.atom("anilist.manga.account", "");
const section = store.atom<"lists" | "favourites" | "stats" | "activity">(
  "anilist.manga.section",
  "lists"
);
const listStatus = store.atom("anilist.manga.status", "");

function MangaFilters() {
  const { t } = useI18n();
  const current = useCell(filters);
  return (
    <Modal
      header={t("anilist.route.filters")}
      onClose={() => filterOpen.set(false)}
      className="w-md"
    >
      <form
        className="grid gap-2 text-xs"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const value = (field: string) => String(data.get(field) ?? "").trim();
          if (value("type") === "ANIME") {
            filterOpen.set(false);
            anilistMangaMode.set(false);
            return;
          }
          const year = Number(value("year")) || null;
          const terms = (field: string) =>
            value(field)
              .split(",")
              .map((term) => term.trim())
              .filter(Boolean);
          filters.set({
            format: value("format") || null,
            country: value("country") || null,
            yearFrom: year,
            yearTo: year ? year + 1 : null,
            status: value("status") || null,
            genres: terms("genres"),
            tags: terms("tags"),
            sort: value("sort") ? [value("sort")] : null,
          });
          page.set(1);
          search.set(true);
          filterOpen.set(false);
        }}
      >
        <label>
          {t("manga.tracking.type")}
          <select
            name="type"
            defaultValue="MANGA"
            className="windows95-border bg-field block w-full p-1"
          >
            <option value="MANGA">{t("app.manga")}</option>
            <option value="ANIME">{t("manga.tracking.anime")}</option>
          </select>
        </label>
        {(
          [
            {
              name: "format",
              label: "anilist.filters.format",
              value: current.format,
              options: [
                ["MANGA", "Манга"],
                ["ONE_SHOT", "Ваншот"],
              ],
            },
            {
              name: "country",
              label: "manga.tracking.country",
              value: current.country,
              options: [
                ["JP", "Япония"],
                ["KR", "Корея"],
                ["CN", "Китай"],
                ["TW", "Тайвань"],
              ],
            },
            {
              name: "status",
              label: "anilist.filters.status",
              value: current.status,
              options: [
                ["RELEASING", "Выходит"],
                ["FINISHED", "Завершена"],
                ["HIATUS", "На паузе"],
                ["CANCELLED", "Отменена"],
                ["NOT_YET_RELEASED", "Анонс"],
              ],
            },
            {
              name: "sort",
              label: "manga.tracking.sort",
              value: current.sort?.[0],
              options: [
                ["SEARCH_MATCH", "Релевантность"],
                ["POPULARITY_DESC", "Популярность"],
                ["SCORE_DESC", "Оценка"],
                ["START_DATE_DESC", "Дата выхода"],
              ],
            },
          ] as const
        ).map((row) => (
          <label key={row.name}>
            {t(row.label)}
            <select
              name={row.name}
              defaultValue={row.value ?? ""}
              className="windows95-border bg-field block w-full p-1"
            >
              <option value="">{t("manga.library.all")}</option>
              {row.options.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label>
          {t("manga.tracking.year")}
          <Input
            type="number"
            min={1900}
            max={2100}
            name="year"
            defaultValue={current.yearFrom ?? ""}
          />
        </label>
        <label>
          {t("manga.tracking.genres")}
          <Input name="genres" defaultValue={current.genres?.join(", ")} />
        </label>
        <label>
          {t("manga.tracking.tags")}
          <Input name="tags" defaultValue={current.tags?.join(", ")} />
        </label>
        <Button type="submit">{t("manga.tracking.apply")}</Button>
      </form>
    </Modal>
  );
}

function MediaRows({ media, entries }: { media: AniMedia[]; entries: Map<number, AniListEntry> }) {
  const { t } = useI18n();
  return (
    <ul className="divide-muted divide-y">
      {media.map((row) => {
        const entry = entries.get(row.id);
        const statusKey = mangaListStatuses.find(([id]) => id === entry?.list_status)?.[1];
        return (
          <li
            key={row.id}
            className="grid min-w-0 grid-cols-[minmax(8rem,1fr)_auto] items-center gap-2 p-1 text-xs"
          >
            <Button
              className="justify-start text-start whitespace-normal"
              onClick={() => openTrackedManga(row.id, row.title)}
            >
              {row.title}
            </Button>
            <span className="text-hint tabular-nums">
              {t("manga.tracking.counts", {
                chapters: entry?.progress ?? row.chapters ?? "-",
                volumes: entry?.progress_volumes ?? row.volumes ?? "-",
              })}
              {statusKey && ` - ${t(statusKey)}`}
              {(entry?.score ?? row.score) != null && ` - ${entry?.score ?? row.score}`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function TrackingToolbar({ term, onStats }: { term: string; onStats?: () => void }) {
  const { t } = useI18n();
  return (
    <form
      className="ui-toolbar ui-panel flex flex-wrap gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        const value = new FormData(event.currentTarget).get("query");
        if (typeof value === "string") query.set(value.trim());
        page.set(1);
        search.set(true);
      }}
    >
      <Input
        name="query"
        defaultValue={term}
        aria-label={t("manga.search.query")}
        placeholder={t("manga.search.query")}
        className="w-auto min-w-24 flex-1"
      />
      {onStats && (
        <Button
          size="icon"
          className="h-7 w-7 text-xs"
          onClick={onStats}
          title={t("anilist.stats.title")}
          aria-label={t("anilist.stats.title")}
        >
          <Calendar className="size-3" />
        </Button>
      )}
      <AniListMediaMode manga />
      <Button onClick={() => filterOpen.set(true)}>{t("anilist.route.filters")}</Button>
      <Button type="submit">{t("manga.search.submit")}</Button>
    </form>
  );
}

function ProfileControls({ user, friends }: { user: AniUser; friends: readonly AniFriend[] }) {
  const { t } = useI18n();
  const viewed = useCell(account);
  const isSearching = useCell(search);
  const active = useCell(section);
  const status = useCell(listStatus);
  return (
    <div className="ui-panel flex flex-wrap items-center gap-1 p-1">
      <Select
        value={viewed}
        onChange={(id) => account.set(id)}
        options={[
          { value: "", label: user.name },
          ...friends.map((friend) => ({ value: String(friend.id), label: friend.name })),
        ]}
        aria-label={t("manga.tracking.profile")}
      />
      {(["lists", "favourites", "stats", "activity"] as const).map((id) => (
        <Button
          key={id}
          aria-pressed={!isSearching && active === id}
          onClick={() => {
            section.set(id);
            search.set(false);
          }}
        >
          {t(`manga.tracking.${id}`)}
        </Button>
      ))}
      {!isSearching && active === "lists" && (
        <Select
          aria-label={t("manga.library.status")}
          value={status}
          onChange={(id) => listStatus.set(id)}
          options={[
            { value: "", label: t("manga.library.all") },
            ...mangaListStatuses.map(([id, label]) => ({ value: id, label: t(label) })),
          ]}
        />
      )}
    </div>
  );
}

function ProfileContent({
  loading,
  error,
  current,
  entries,
  user,
  isSearching,
  active,
  stats,
  activity,
}: {
  loading: boolean;
  error: boolean;
  current: AniMedia[] | undefined;
  entries: Map<number, AniListEntry>;
  user: AniUser | null | undefined;
  isSearching: boolean;
  active: "lists" | "favourites" | "activity" | "stats";
  stats: AniMangaOverview["statistics"] | undefined;
  activity: AniActivity[] | undefined;
}) {
  const { t } = useI18n();
  return (
    <section className="ui-panel min-h-0 flex-1 overflow-y-auto p-2">
      {loading && <p role="status">{t("manga.library.loading")}</p>}
      {error && <p role="alert">{t("manga.tracking.failed")}</p>}
      {!user && !isSearching && <p>{t("manga.search.empty")}</p>}
      {current?.length === 0 && !loading && <p>{t("manga.search.noResults")}</p>}
      {current && <MediaRows media={current} entries={entries} />}
      {!isSearching && active === "stats" && stats && (
        <div className="grid gap-2">
          <p>
            {t("manga.tracking.statsSummary", {
              count: stats.count,
              chapters: stats.chapters,
              volumes: stats.volumes,
              meanScore: stats.meanScore,
            })}
          </p>
          {(["statuses", "formats", "genres", "years"] as const).map((key) => (
            <section key={key} aria-label={t(`manga.tracking.stats.${key}`)}>
              <h2 className="font-bold">{t(`manga.tracking.stats.${key}`)}</h2>
              <ul>
                {stats[key].map(({ label, count }) => (
                  <li key={label}>
                    {label} - {count}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {!isSearching && active === "activity" && activity && (
        <ul className="divide-muted divide-y">
          {activity.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center gap-2 py-1">
              <span>{entry.user_name}</span>
              {entry.media_id && entry.media_title && (
                <Button
                  onClick={() => {
                    if (entry.media_id && entry.media_title)
                      openTrackedManga(entry.media_id, entry.media_title);
                  }}
                >
                  {entry.media_title}
                </Button>
              )}
              {entry.progress && <span>{entry.progress}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

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
  const [statsOpen, setStatsOpen] = useState(false);
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

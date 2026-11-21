import { useState } from "react";
import { useCell } from "@hullperse/hp_utils/react";
import { createSignalStore } from "@hullperse/hp_utils/signal";
import { useQuery } from "@tanstack/react-query";

import {
  getMangaLibrary,
  mangaLibraryKey,
  mangaSources,
  MANGA_UNASSIGNED_STATUS,
} from "@/api/manga.api";
import { Button } from "@/components/ui/button.component";
import { ChevronLeft, ChevronRight, LayoutGrid, List, Plus, SortAsc, SortDesc } from "lucide-react";
import { usePagedRow } from "@/hooks/pagedRow.hook";
import AniListListsRow from "@/routes/components/anilist/lists.anilist";
import { useI18n } from "@/hooks/i18n.hook";
import {
  getInlineCompletion,
  getSearchSuggestions,
  normalizeSearchText,
} from "@/lib/core/anilist/suggestions.utils";
import { mangaRatingMosaic } from "@/lib/manga/nsfw.utils";
import { MangaCard, mangaStatusColor } from "@/routes/components/manga/card.manga";
import { MangaSearchField } from "@/routes/components/manga/searchField.manga";
import { MangaState } from "@/routes/components/manga/state.manga";
import type { LibraryCopy, MangaStatus } from "@/api/manga.api";
import MangaStatuses from "@/routes/components/manga/statuses.manga";
import { mangaDetail } from "@/store/manga.store";
import { patchSettings, settingsAtoms } from "@/store/settings.store";

const store = createSignalStore();
const filter = store.atom("manga.library.filter", "");
const status = store.atom("manga.library.status", "");

const sortLabels = {
  lastRead: "manga.library.sort.lastRead",
  updated: "manga.library.sort.updated",
  title: "anilist.sort.title",
  chapters: "manga.library.sort.chapters",
} as const;
const sortKeys = ["lastRead", "updated", "title", "chapters"] as const;
type LibrarySortKey = (typeof sortKeys)[number];
const librarySort = store.atom<{ key: LibrarySortKey; dir: "asc" | "desc" }>("manga.library.sort", {
  key: "lastRead",
  dir: "desc",
});
const compareItems = {
  lastRead: (a: LibraryCopy, b: LibraryCopy) => (a.lastReadAt ?? 0) - (b.lastReadAt ?? 0),
  updated: (a: LibraryCopy, b: LibraryCopy) => a.updatedAt - b.updatedAt,
  title: (a: LibraryCopy, b: LibraryCopy) => a.title.localeCompare(b.title, "ru"),
  chapters: (a: LibraryCopy, b: LibraryCopy) => a.read + a.unread - b.read - b.unread,
};

function LibrarySort() {
  const { t } = useI18n();
  const sort = useCell(librarySort);
  const { rowRef, start, end, stepPage } = usePagedRow(sortKeys.length, sortKeys.indexOf(sort.key));
  const DirectionIcon = sort.dir === "desc" ? SortDesc : SortAsc;
  return (
    <section
      className="windows95-border bg-field flex items-center gap-1 px-1 py-0.5"
      aria-label={t("anilist.sort.sorting")}
    >
      <Button
        size="icon"
        className="h-6 w-6 shrink-0"
        title={t("common.previous")}
        aria-label={t("common.previous")}
        onClick={() => stepPage(-1)}
      >
        <ChevronLeft className="size-3.5" />
      </Button>
      <div ref={rowRef} className="flex min-w-0 flex-1 gap-1 overflow-hidden">
        {sortKeys.slice(start, end).map((key) => (
          <Button
            key={key}
            variant={sort.key === key ? "outline" : "default"}
            className="h-6 w-33 shrink-0 px-1"
            aria-current={sort.key === key ? true : undefined}
            onClick={() => {
              const dir =
                sort.key === key
                  ? sort.dir === "asc"
                    ? "desc"
                    : "asc"
                  : key === "title"
                    ? "asc"
                    : "desc";
              librarySort.set({ key, dir });
            }}
          >
            <span className="min-w-0 flex-1 truncate">{t(sortLabels[key])}</span>
            {sort.key === key && <DirectionIcon className="size-3 shrink-0" />}
          </Button>
        ))}
      </div>
      <Button
        size="icon"
        className="h-6 w-6 shrink-0"
        title={t("common.next")}
        aria-label={t("common.next")}
        onClick={() => stepPage(1)}
      >
        <ChevronRight className="size-3.5" />
      </Button>
    </section>
  );
}

function LibraryEntry({
  item,
  view,
  nsfw,
  status,
}: {
  item: LibraryCopy;
  view: "cards" | "list";
  nsfw: Record<string, boolean>;
  status?: MangaStatus;
}) {
  const { t } = useI18n();
  const metadata = mangaSources.find((source) => source.id === item.source)?.name;
  function handleOpen() {
    mangaDetail.set({ source: item.source, id: item.mangaId, title: item.title });
  }
  return (
    <li className="min-w-0">
      {view === "cards" ? (
        <MangaCard
          title={item.title}
          cover={item.cover}
          entry={item}
          status={status}
          showUnread
          showFavourite
          mosaic={mangaRatingMosaic(item.rating, nsfw, item.source)}
          onOpen={handleOpen}
        />
      ) : (
        <Button
          aria-label={item.title}
          className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 p-2 text-start whitespace-normal"
          onClick={handleOpen}
        >
          <span className="truncate font-bold">{item.title}</span>
          {item.unread > 0 && (
            <span className="text-hint text-xs tabular-nums">
              {t("manga.library.unread", { count: item.unread })}
            </span>
          )}
          <span className="text-hint col-span-full truncate text-xs">{metadata}</span>
        </Button>
      )}
    </li>
  );
}

function LibraryStatusRow({
  active,
  data,
  items,
  onCreate,
}: {
  active: string;
  onCreate: () => void;
  data?: Awaited<ReturnType<typeof getMangaLibrary>>;
  items: readonly LibraryCopy[];
}) {
  const { t } = useI18n();
  const { statuses = [] } = data ?? {};
  const hidden = useCell(settingsAtoms.mangaHiddenStatuses);
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
  }
  return (
    <AniListListsRow
      label={t("manga.library.status")}
      leadingAction={
        <Button
          size="icon"
          className="size-6 shrink-0"
          aria-haspopup="dialog"
          aria-label={t("manga.library.newStatus")}
          title={t("manga.library.newStatus")}
          onClick={onCreate}
        >
          <Plus className="size-4" />
        </Button>
      }
      activeTab={active}
      onChange={(next) => status.set(next)}
      tabs={[
        { id: "", label: `${t("manga.library.all")} (${items.length})` },
        ...statuses
          .filter(({ id }) => id !== MANGA_UNASSIGNED_STATUS && !hidden.includes(id))
          .map(({ id, label, color }) => ({
            id,
            label: `${label} (${counts.get(id) ?? 0})`,
            color: mangaStatusColor(color),
          })),
      ]}
    />
  );
}

export default function MangaLibrary() {
  const { t } = useI18n();
  const nsfw = useCell(settingsAtoms.mangaSourceNsfw);
  const view = useCell(settingsAtoms.mangaLibraryView);
  const active = useCell(status);
  const search = useCell(filter);
  const [creating, setCreating] = useState(false);
  const nextView = view === "cards" ? "list" : "cards";
  const ViewIcon = nextView === "list" ? List : LayoutGrid;
  const viewLabel = t(nextView === "list" ? "manga.library.list" : "manga.library.cards");
  const sort = useCell(librarySort);
  const library = useQuery({
    queryKey: [...mangaLibraryKey, "all"],
    queryFn: () => getMangaLibrary(true),
  });
  const available = library.data?.items.filter((item) => !active || item.status === active);
  const normalized = normalizeSearchText(search.trim());
  const matching = library.data?.items.filter((item) =>
    normalizeSearchText(item.title).includes(normalized)
  );
  const compare = compareItems[sort.key];
  const direction = sort.dir === "asc" ? 1 : -1;
  const items = matching
    ?.filter((item) => !active || item.status === active)
    .sort(
      (a, b) =>
        Number(Boolean(b.favourite)) - Number(Boolean(a.favourite)) || direction * compare(a, b)
    );
  const suggestions = normalized
    ? getSearchSuggestions(search, {
        extraValues: available?.map(({ title }) => ({ value: title, kind: "manga" })),
        limit: 8,
      })
    : [];
  return (
    <div className="grid grid-cols-1 gap-1 text-xs">
      <MangaSearchField
        value={search}
        aria-label={t("manga.library.filter")}
        placeholder={t("manga.library.filter")}
        suggestions={suggestions}
        completion={getInlineCompletion(search, suggestions)}
        onChange={(event) => filter.set(event.currentTarget.value)}
        onSelectSuggestion={(value) => filter.set(value)}
        onAcceptCompletion={(value) => filter.set(value)}
        onSearch={() => filter.set(search.trim())}
        trailingAction={
          <Button
            type="button"
            size="icon"
            aria-label={viewLabel}
            title={viewLabel}
            onClick={() => patchSettings({ mangaLibraryView: nextView })}
          >
            <ViewIcon className="size-4" aria-hidden />
          </Button>
        }
      />
      <LibraryStatusRow
        active={active}
        data={library.data}
        items={matching ?? []}
        onCreate={() => setCreating(true)}
      />
      <LibrarySort />
      {creating && (
        <MangaStatuses
          statuses={library.data?.statuses ?? []}
          onClose={() => setCreating(false)}
          onHide={(id) => {
            if (status.get() === id) status.set("");
          }}
          onDeleted={(id) => {
            if (status.get() === id) status.set("");
            if (settingsAtoms.mangaLastStatus.get() === id) {
              patchSettings({ mangaLastStatus: "planned" });
            }
          }}
        />
      )}
      {library.isPending && <MangaState kind="loading">{t("manga.library.loading")}</MangaState>}
      {library.error && (
        <MangaState kind="error">
          {t("manga.library.failed")}
          <Button
            onClick={async () => {
              await library.refetch();
            }}
          >
            {t("manga.search.retry")}
          </Button>
        </MangaState>
      )}
      {items && items.length > 0 && (
        <ul
          className={
            view === "cards"
              ? "grid grid-cols-[repeat(auto-fill,minmax(min(100%,9rem),1fr))] gap-2"
              : "divide-muted grid divide-y"
          }
        >
          {items.map((item) => (
            <LibraryEntry
              key={item.id}
              item={item}
              view={view}
              nsfw={nsfw}
              status={library.data?.statuses.find((entry) => entry.id === item.status)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

import { useState } from "react";
import { useCell } from "@hullperse/hp_utils/react";
import { useQuery } from "@tanstack/react-query";
import { getMangaLibrary, mangaLibraryKey } from "@/api/manga.api";
import { Button } from "@/components/ui/button.component";
import { LayoutGrid, List } from "lucide-react";
import { useI18n } from "@/hooks/i18n.hook";
import {
  getInlineCompletion,
  getSearchSuggestions,
  normalizeSearchText,
} from "@/lib/core/anilist/suggestions.utils";
import { MangaSearchField } from "@/routes/components/manga/searchField.manga";
import { MangaState } from "@/routes/components/manga/state.manga";
import MangaStatuses from "@/routes/components/manga/status/view.status";
import { compareItems } from "@/lib/manga/library.utils";
import { librarySort, mangaLibraryFilter, mangaLibraryStatus } from "@/store/manga.store";
import { patchSettings, settingsAtoms } from "@/store/settings.store";
import { LibrarySort } from "@/routes/components/manga/library/sort.library";
import { LibraryEntry } from "@/routes/components/manga/library/entry.library";
import { LibraryStatusRow } from "@/routes/components/manga/library/statusRow.library";

export default function MangaLibrary() {
  const { t } = useI18n();
  const nsfw = useCell(settingsAtoms.mangaSourceNsfw);
  const view = useCell(settingsAtoms.mangaLibraryView);
  const active = useCell(mangaLibraryStatus);
  const search = useCell(mangaLibraryFilter);
  const [creating, setCreating] = useState<boolean>(false);
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
        onChange={(event) => mangaLibraryFilter.set(event.currentTarget.value)}
        onSelectSuggestion={(value) => mangaLibraryFilter.set(value)}
        onAcceptCompletion={(value) => mangaLibraryFilter.set(value)}
        onSearch={() => mangaLibraryFilter.set(search.trim())}
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
            if (mangaLibraryStatus.get() === id) mangaLibraryStatus.set("");
          }}
          onDeleted={(id) => {
            if (mangaLibraryStatus.get() === id) mangaLibraryStatus.set("");

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
              : "windows95-active-border bg-field divide-muted grid divide-y"
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

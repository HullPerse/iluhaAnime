import { ChevronLeft, ChevronRight, BookOpen, LayoutGrid, RotateCcw, SortAsc, SortDesc } from "lucide-react";
import { useMemo } from "react";

import { InlineAutocompleteInput } from "@/components/shared/autocomplete/input.autocomplete";
import { Button } from "@/components/ui/button.component";
import Select from "@/components/ui/select.component";
import {
  CARD_KINDS,
  CARD_RARITIES,
  CARD_SORTS,
  COLLECTION_SORTS,
  cardKindLabelKeys,
  cardRarityLabelKeys,
  cardsSortLabelKeys,
  collectionSortLabelKeys,
} from "@/config/cards/labels.config";
import { useI18n } from "@/hooks/i18n.hook";
import { usePagedRow } from "@/hooks/pagedRow.hook";
import type { CardKind, CardRarity } from "@/types/api/cards";
import type { SearchSuggestion } from "@/types/search/search";
import type { CardsAlbumMode, CardsSortDir } from "@/types/store/cards";

import AlbumMenu from "@/routes/components/collection/albumMenu.cards";

export type AlbumMode = CardsAlbumMode;

export default function AlbumToolbar({
  mode,
  view,
  kind,
  rarity,
  sort,
  sortDir,
  infinite,
  search,
  suggestions,
  onKind,
  onRarity,
  onSort,
  onSortDir,
  onReset,
  onView,
  onInfinite,
  onSearch,
}: {
  mode: AlbumMode;
  view: "grid" | "binder";
  infinite: boolean;
  kind: CardKind | null;
  rarity: CardRarity | null;
  sort: string;
  sortDir: CardsSortDir;
  search: string;
  suggestions: readonly string[];
  onKind: (kind: CardKind | null) => void;
  onRarity: (rarity: CardRarity | null) => void;
  onSort: (sort: string) => void;
  onSortDir: (dir: CardsSortDir) => void;
  onReset: () => void;
  onView: (view: "grid" | "binder") => void;
  onInfinite: (infinite: boolean) => void;
  onSearch: (value: string) => void;
}) {
  const { t } = useI18n();
  const showCardFilters = mode === "all";
  const nextSortDir: CardsSortDir = sortDir === "asc" ? "desc" : "asc";
  const nextView = view === "grid" ? "binder" : "grid";
  const nextViewLabel = t(nextView === "grid" ? "collection.grid.view" : "collection.binder");

  const kindOptions: { value: "all" | CardKind; label: string }[] = [
    { value: "all", label: t("collection.filters.all") },
    ...CARD_KINDS.map((value) => ({ value, label: t(cardKindLabelKeys[value]) })),
  ];
  const rarityOptions: { value: "all" | CardRarity; label: string }[] = [
    { value: "all", label: t("collection.filters.all") },
    ...CARD_RARITIES.map((value) => ({ value, label: t(cardRarityLabelKeys[value]) })),
  ];
  const sortOptions =
    mode === "collections"
      ? COLLECTION_SORTS.map((value) => ({ value, label: t(collectionSortLabelKeys[value]) }))
      : CARD_SORTS.map((value) => ({ value, label: t(cardsSortLabelKeys[value]) }));

  const activeSortIndex = sortOptions.findIndex((option) => option.value === sort);
  const { rowRef: sortRowRef, start, end, stepPage } = usePagedRow(
    sortOptions.length,
    Math.max(0, activeSortIndex)
  );

  const titleSuggestions = useMemo<SearchSuggestion[]>(
    () =>
      suggestions.map((value, index) => ({
        kind: "local" as const,
        score: suggestions.length - index,
        value,
      })),
    [suggestions]
  );

  return (
    <div className="flex shrink-0 flex-col gap-1">
      {showCardFilters && (
        <div className="ui-toolbar ui-panel flex w-full flex-row">
          <InlineAutocompleteInput
            data-main-search
            value={search}
            placeholder={t("collection.search.placeholder")}
            className="h-9 font-bold"
            suggestions={titleSuggestions}
            onChange={(event) => onSearch(event.target.value)}
            onSelectSuggestion={onSearch}
          />
          <span className="ui-toolbar-separator" aria-hidden />
          <Button
            className="h-7 gap-1 px-2 text-xs"
            title={nextViewLabel}
            aria-label={nextViewLabel}
            onClick={() => onView(nextView)}
          >
            {nextView === "grid" ? (
              <LayoutGrid className="size-4" aria-hidden />
            ) : (
              <BookOpen className="size-4" aria-hidden />
            )}
            {nextViewLabel}
          </Button>
        </div>
      )}
      <section className="windows95-border bg-field flex shrink-0 flex-row items-center gap-2 px-1 py-0.5">
        <div
          className="flex min-w-0 flex-1 items-center gap-1"
          aria-label={t("collection.filters.sort")}
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
          <div ref={sortRowRef} className="flex min-w-0 flex-1 gap-1 overflow-hidden">
            {sortOptions.slice(start, end).map((option) => {
              const active = option.value === sort;
              return (
                <Button
                  key={option.value}
                  variant={active ? "outline" : "default"}
                  className="h-6 w-33 shrink-0 px-1"
                  aria-current={active ? true : undefined}
                  onClick={() => {
                    if (active) onSortDir(nextSortDir);
                    else onSort(option.value);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {active &&
                    (sortDir === "desc" ? (
                      <SortDesc className="size-3 shrink-0" />
                    ) : (
                      <SortAsc className="size-3 shrink-0" />
                    ))}
                </Button>
              );
            })}
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
        </div>
        <span className="bg-muted ml-auto h-5 w-px" />
        <div className="flex flex-row items-center gap-1">
          {showCardFilters && (
            <>
              <Select
                className="w-24"
                label={t("collection.filters.kind")}
                value={kind ?? "all"}
                options={kindOptions}
                onChange={(value) => onKind(value === "all" ? null : (value as CardKind))}
              />
              <Select
                className="w-28"
                label={t("collection.filters.rarity")}
                value={rarity ?? "all"}
                options={rarityOptions}
                onChange={(value) => onRarity(value === "all" ? null : (value as CardRarity))}
              />
              <Button
                size="icon"
                className="h-6 w-6"
                aria-label={t("collection.filters.reset")}
                title={t("collection.filters.reset")}
                onClick={onReset}
              >
                <RotateCcw className="size-3.5" />
              </Button>
            </>
          )}
          <AlbumMenu view={view} infinite={infinite} onInfinite={onInfinite} />
        </div>
      </section>
    </div>
  );
}

import { Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { WizardSearchResult } from "@/types/collection";

import { SearchResultCover } from "./searchResultCover.wizard";

export function WizardSourceSearch({
  source,
  search,
  setSearch,
  onSearch,
  loading,
  hasTmdbKey,
  searchError,
  searched,
  searchResults,
  onPickResult,
}: {
  source: "anilist" | "tmdb" | "custom";
  search: string;
  setSearch: (value: string) => void;
  onSearch: () => void;
  loading: boolean;
  hasTmdbKey: boolean;
  searchError: string | null;
  searched: boolean;
  searchResults: WizardSearchResult[];
  onPickResult: (result: WizardSearchResult) => void;
}) {
  const { t } = useI18n();
  const listboxId = useId();
  const [activeIndex, setActiveIndex] = useState(-1);
  const resultIds = searchResults.map((r) => `${r.mediaType ?? source}-${r.id}`).join(",");
  const prevIdsRef = useRef(resultIds);
  useEffect(() => {
    if (prevIdsRef.current !== resultIds) {
      prevIdsRef.current = resultIds;
      setActiveIndex(-1);
    }
  }, [resultIds]);
  const showList = searchResults.length > 0;
  const showEmpty = searched && !loading && !searchError && searchResults.length === 0;
  const showLoadingRow = loading && searchResults.length === 0;

  function pick(index: number) {
    const result = searchResults[index];
    if (!result) return;
    setActiveIndex(-1);
    onPickResult(result);
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && showList) {
              e.preventDefault();
              setActiveIndex((prev) => (prev < searchResults.length - 1 ? prev + 1 : prev));
            } else if (e.key === "ArrowUp" && showList) {
              e.preventDefault();
              setActiveIndex((prev) => (prev > 0 ? prev - 1 : -1));
            } else if (e.key === "Home" && showList && activeIndex >= 0) {
              e.preventDefault();
              setActiveIndex(0);
            } else if (e.key === "End" && showList && activeIndex >= 0) {
              e.preventDefault();
              setActiveIndex(searchResults.length - 1);
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (activeIndex >= 0) pick(activeIndex);
              else if (searchResults.length > 0) pick(0);
              else onSearch();
            } else if (e.key === "Escape") {
              setActiveIndex(-1);
            }
          }}
          role="combobox"
          aria-controls={showList ? listboxId : undefined}
          aria-expanded={showList || undefined}
          aria-activedescendant={
            showList && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined
          }
          placeholder={
            source === "anilist"
              ? t("collection.wizard.search.anilist")
              : source === "tmdb"
                ? t("collection.wizard.search.tmdb")
                : ""
          }
          className="h-full flex-1"
        />
        <Button
          size="default"
          className="h-6 shrink-0 px-2 text-xs"
          onClick={onSearch}
          disabled={loading || (source === "tmdb" && !hasTmdbKey)}
        >
          <Search className="size-3" /> {loading ? t("common.loading") : t("app.search")}
        </Button>
      </div>
      {source === "tmdb" && !hasTmdbKey && (
        <p className="text-hint text-xs">{t("collection.wizard.tmdbKeyMissing")}</p>
      )}
      {showLoadingRow && <p className="text-hint text-xs">{t("common.loading")}</p>}
      {showList && (
        <div className="flex flex-col gap-1">
          <p className="text-hint text-xs">
            {t("collection.wizard.search.results", { count: searchResults.length })}
          </p>
          <div
            role="listbox"
            id={listboxId}
            aria-label={t("collection.wizard.search.results", { count: searchResults.length })}
            className="windows95-border bg-field flex max-h-64 flex-col gap-1 overflow-y-auto p-1"
          >
            {searchResults.map((r, index) => {
              const active = index === activeIndex;
              const alt = r.altTitles?.find((a) => a && a !== r.title);
              const typeLabel =
                r.mediaType === "movie"
                  ? t("collection.type.movie")
                  : r.mediaType === "tv"
                    ? t("collection.type.series")
                    : null;
              return (
                <button
                  key={`${r.mediaType ?? source}-${r.id}`}
                  id={`${listboxId}-${index}`}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`windows95-border bg-field flex cursor-pointer items-center gap-1 p-1 text-left text-xs hover:bg-[var(--color-highlight)] hover:text-white ${
                    active ? "bg-[var(--color-highlight)] text-white" : ""
                  }`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(-1)}
                  onFocus={() => setActiveIndex(index)}
                  onClick={() => pick(index)}
                >
                  {r.cover_url ? (
                    <SearchResultCover url={r.cover_url} title={r.title} />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="windows95-border bg-primary text-hint flex h-12 w-9 shrink-0 items-center justify-center text-sm font-bold"
                    >
                      {(r.title.trim().charAt(0) || "-").toUpperCase()}
                    </span>
                  )}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-bold">{r.title}</span>
                    {alt && (
                      <span className={`truncate ${active ? "text-white/80" : "text-hint"}`}>
                        {alt}
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 flex-col items-end">
                    {typeLabel && <span className="font-bold">{typeLabel}</span>}
                    {r.year && (
                      <span className={active ? "text-white/80" : "text-hint"}>{r.year}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {showEmpty && <p className="text-hint text-xs">{t("collection.wizard.search.empty")}</p>}
    </div>
  );
}

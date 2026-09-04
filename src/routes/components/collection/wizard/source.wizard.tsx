import { Search } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { InlineAutocompleteInput } from "@/components/shared/autocomplete.component";
import { Button } from "@/components/ui/button.component";
import { TMDB_LIMIT } from "@/config/collection.config";
import { useTmdbRateLimit } from "@/hooks/tmdbRateLimit.hook";
import type { WizardSearchResult } from "@/hooks/wizardSearch.hook";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/index.utils";
import type { SearchSuggestion } from "@/lib/search.suggestions";
import { useSearchStore } from "@/store/search.store";

export function WizardSourcePanelCollection({
  source,
  setSource,
  search,
  setSearch,
  onSearch,
  loading,
  hasTmdbKey,
  searchError,
  searchResults,
  onPickResult,
}: {
  source: "anilist" | "tmdb" | "custom";
  setSource: (source: "anilist" | "tmdb" | "custom") => void;
  search: string;
  setSearch: (value: string) => void;
  onSearch: () => void;
  loading: boolean;
  hasTmdbKey: boolean;
  searchError: string | null;
  searchResults: WizardSearchResult[];
  onPickResult: (result: WizardSearchResult) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="mb-2 flex flex-col gap-1">
      <div className="flex items-center gap-1">
        {(["custom", "anilist", "tmdb"] as const).map((src) => (
          <Button
            key={src}
            variant={source === src ? "outline" : "default"}
            className="h-6 px-2 text-xs"
            onClick={() => setSource(src)}
          >
            {src === "custom"
              ? t("collection.type.custom")
              : src === "anilist"
                ? "AniList"
                : "TMDB"}
          </Button>
        ))}
        {source === "tmdb" && <TmdbBadge />}
      </div>
      {source === "custom" ? (
        <p className="text-hint text-xs">{t("collection.wizard.manualHint")}</p>
      ) : (
        <WizardSourceSearch
          source={source}
          search={search}
          setSearch={setSearch}
          onSearch={onSearch}
          loading={loading}
          hasTmdbKey={hasTmdbKey}
          searchResults={searchResults}
          onPickResult={onPickResult}
        />
      )}
      {searchError && <p className="text-destructive text-xs">{searchError}</p>}
    </div>
  );
}

function TmdbBadge() {
  const rate = useTmdbRateLimit();
  if (rate.remaining == null) return null;
  const limited = rate.retryAfterSecs != null;
  return (
    <span
      className={cn(
        "ml-auto text-xs font-bold",
        limited ? "text-destructive" : rate.remaining < 5 ? "text-orange-500" : "text-hint"
      )}
      title={rate.resetAt ? new Date(rate.resetAt).toLocaleTimeString() : undefined}
    >
      TMDB {rate.remaining}/{TMDB_LIMIT}
      {limited ? ` ${rate.retryAfterSecs}s` : ""}
    </span>
  );
}

function WizardSourceSearch({
  source,
  search,
  setSearch,
  onSearch,
  loading,
  hasTmdbKey,
  searchResults,
  onPickResult,
}: {
  source: "anilist" | "tmdb" | "custom";
  search: string;
  setSearch: (value: string) => void;
  onSearch: () => void;
  loading: boolean;
  hasTmdbKey: boolean;
  searchResults: WizardSearchResult[];
  onPickResult: (result: WizardSearchResult) => void;
}) {
  const { t } = useI18n();
  const [focused, setFocused] = useState(false);
  const [picked, setPicked] = useState(false);

  const history = useSearchStore((s) => s.history);

  const suggestions: SearchSuggestion[] = useMemo(
    () =>
      history
        .filter((h) => h.trim().length > 0)
        .slice(0, 6)
        .map((h) => ({ kind: "history" as const, score: 0, value: h })),
    [history]
  );

  const showDropdown = focused && !picked && searchResults.length > 0;

  const handlePick = useCallback(
    (r: WizardSearchResult) => {
      setPicked(true);
      onPickResult(r);
    },
    [onPickResult]
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearch(value);
      if (picked) setPicked(false);
    },
    [setSearch, picked]
  );

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1">
        <InlineAutocompleteInput
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSearch();
          }}
          onFocus={() => {
            setFocused(true);
            setPicked(false);
          }}
          onBlur={() => setFocused(false)}
          onSelectSuggestion={(value) => {
            setSearch(value);
            setPicked(false);
          }}
          placeholder={
            source === "anilist"
              ? t("collection.wizard.searchAnilist")
              : source === "tmdb"
                ? t("collection.wizard.searchTmdb")
                : ""
          }
          suggestions={suggestions}
          history={history}
          className="h-full flex-1"
        />
        <Button
          size="default"
          className="h-6 px-2 text-xs"
          onClick={onSearch}
          disabled={loading || (source === "tmdb" && !hasTmdbKey)}
        >
          <Search className="size-3" /> {loading ? t("common.loading") : t("app.search")}
        </Button>
      </div>
      {source === "tmdb" && !hasTmdbKey && (
        <p className="text-hint text-xs">{t("collection.wizard.tmdbKeyMissing")}</p>
      )}
      {showDropdown && (
        <div className="windows95-border flex flex-col gap-1 bg-white p-1">
          {searchResults.map((r) => (
            <button
              key={r.id}
              type="button"
              className="windows95-border flex cursor-pointer items-center gap-1 bg-white p-1 text-left text-xs hover:bg-[var(--color-highlight)] hover:text-white"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handlePick(r)}
            >
              {r.cover_url && <img src={r.cover_url} alt="" className="size-8 object-cover" />}
              <span className="flex-1 truncate">{r.title}</span>
              {r.year && <span className="text-hint">{r.year}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

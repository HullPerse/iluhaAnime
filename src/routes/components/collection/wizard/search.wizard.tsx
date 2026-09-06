import { Search } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { InlineAutocompleteInput } from "@/components/shared/autocomplete.component";
import { Button } from "@/components/ui/button.component";
import { WIZARD_HISTORY_COUNT } from "@/config/collection/defaults.config";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { SearchSuggestion } from "@/lib/search/suggestions.utils";
import { useSearchStore } from "@/store/search.store";
import type { WizardSearchResult } from "@/types/collection";

export function WizardSourceSearch({
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
        .slice(0, WIZARD_HISTORY_COUNT)
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
              ? t("collection.wizard.search.anilist")
              : source === "tmdb"
                ? t("collection.wizard.search.tmdb")
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

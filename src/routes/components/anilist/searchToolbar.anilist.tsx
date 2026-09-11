import { Filter, Search, User } from "lucide-react";

import { InlineAutocompleteInput } from "@/components/shared/autocomplete/input.autocomplete";
import { Button } from "@/components/ui/button.component";
import { countActiveAnilistFilters } from "@/lib/anilist/filters.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { SearchSuggestion } from "@/lib/search/suggestions.utils";
import { enterSubmit } from "@/lib/utils/keyboard.utils";
import type { AniListFilters } from "@/types/anilist";

export default function AniListSearchToolbar({
  searchTerms,
  onSearchTermsChange,
  global,
  inlineCompletion,
  suggestions,
  searchHistory,
  onRecordSuggestion,
  onRecordSuggestionIgnored,
  onGlobal,
  onReset,
  filters,
  onFiltersOpen,
  loadingSearch,
}: {
  searchTerms: string;
  onSearchTermsChange: (value: string) => void;
  global: boolean;
  inlineCompletion: string | null;
  suggestions: SearchSuggestion[];
  searchHistory: string[];
  onRecordSuggestion: (value: string) => void;
  onRecordSuggestionIgnored: (value: string) => void;
  onGlobal: () => void;
  onReset: () => void;
  filters: AniListFilters;
  onFiltersOpen: () => void;
  loadingSearch: boolean;
}) {
  const { t } = useI18n();
  const activeFilterCount = countActiveAnilistFilters(filters);

  const submitSearch = () => {
    if (
      inlineCompletion &&
      searchTerms.trim().toLocaleLowerCase() !== inlineCompletion.toLocaleLowerCase()
    ) {
      onRecordSuggestionIgnored(inlineCompletion);
    }
    onGlobal();
  };

  return (
    <div className="ui-toolbar ui-panel w-full flex-row">
      <InlineAutocompleteInput
        placeholder={t("anilist.route.search.placeholder")}
        value={searchTerms}
        completion={inlineCompletion}
        suggestions={suggestions}
        history={searchHistory}
        className="h-9 font-bold"
        onChange={(e) => {
          onSearchTermsChange(e.target.value);
          if (global && !e.target.value.trim()) onReset();
        }}
        onAcceptCompletion={(value) => {
          onRecordSuggestion(value);
          onSearchTermsChange(value);
        }}
        onDismissCompletion={() => {
          if (inlineCompletion) onRecordSuggestionIgnored(inlineCompletion);
        }}
        onKeyDown={enterSubmit(submitSearch)}
      />
      <span className="ui-toolbar-separator" aria-hidden />
      <Button
        size="icon"
        title={t("anilist.route.filters")}
        onClick={onFiltersOpen}
        className="relative"
      >
        <Filter className="size-4" />
        {activeFilterCount > 0 && (
          <span className="bg-secondary absolute -top-1 -right-1 flex size-3 items-center justify-center text-xs text-white">
            {activeFilterCount}
          </span>
        )}
      </Button>
      <Button
        size="icon"
        title={global ? t("anilist.route.back.to.profile") : t("app.search")}
        onClick={() => (global ? onReset() : onGlobal())}
        disabled={loadingSearch}
      >
        {global ? <User className="size-4" /> : <Search className="size-4" />}
      </Button>
    </div>
  );
}

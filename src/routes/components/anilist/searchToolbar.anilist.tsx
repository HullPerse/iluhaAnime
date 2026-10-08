import { Filter, Search, User } from "lucide-react";
import { memo, useCallback, useMemo } from "react";
import type { ChangeEvent } from "react";

import { InlineAutocompleteInput } from "@/components/shared/autocomplete/input.autocomplete";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { countActiveAnilistFilters } from "@/lib/anilist/filters.utils";
import { enterSubmit } from "@/lib/utils/keyboard.utils";
import type { AniListFilters } from "@/types/anilist";
import type { SearchField } from "@/types/collection";

export default memo(AniListSearchToolbar);

function AniListSearchToolbar({
  field,
  global,
  onGlobal,
  onReset,
  onClearSearch,
  filters,
  onFiltersOpen,
  loadingSearch,
}: {
  field: SearchField;
  global: boolean;
  onGlobal: () => void;
  onReset: () => void;
  onClearSearch: () => void;
  filters: AniListFilters;
  onFiltersOpen: () => void;
  loadingSearch: boolean;
}) {
  const { t } = useI18n();
  const activeFilterCount = countActiveAnilistFilters(filters);

  const submitSearch = useCallback(() => {
    if (
      field.inlineCompletion &&
      field.inputProps.value.trim().toLocaleLowerCase() !==
        field.inlineCompletion.toLocaleLowerCase()
    ) {
      field.recordSuggestionIgnored(field.inlineCompletion);
    }
    onGlobal();
  }, [field, onGlobal]);
  const handleKeyDown = useMemo(() => enterSubmit(submitSearch), [submitSearch]);
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      field.inputProps.onChange(event);
      if (global && !event.target.value.trim()) onClearSearch();
    },
    [field.inputProps, global, onClearSearch]
  );

  return (
    <div className="ui-toolbar ui-panel w-full flex-row">
      <InlineAutocompleteInput
        placeholder={t("anilist.route.search.placeholder")}
        {...field.inputProps}
        className="h-9 font-bold"
        onChange={handleChange}
        onKeyDown={handleKeyDown}
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
          <span className="bg-secondary text-title-text absolute -top-1 -right-1 flex size-3 items-center justify-center text-xs">
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

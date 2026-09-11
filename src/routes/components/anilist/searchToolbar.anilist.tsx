import { Filter, Search, User } from "lucide-react";

import { InlineAutocompleteInput } from "@/components/shared/autocomplete/input.autocomplete";
import { Button } from "@/components/ui/button.component";
import { countActiveAnilistFilters } from "@/lib/anilist/filters.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import { enterSubmit } from "@/lib/utils/keyboard.utils";
import type { AniListFilters } from "@/types/anilist";
import type { SearchField } from "@/types/collection";

export default function AniListSearchToolbar({
  field,
  global,
  onGlobal,
  onReset,
  filters,
  onFiltersOpen,
  loadingSearch,
}: {
  field: SearchField;
  global: boolean;
  onGlobal: () => void;
  onReset: () => void;
  filters: AniListFilters;
  onFiltersOpen: () => void;
  loadingSearch: boolean;
}) {
  const { t } = useI18n();
  const activeFilterCount = countActiveAnilistFilters(filters);

  // Custom submit on purpose: handleGlobal owns history recording, field.handleSubmit would record twice.
  const submitSearch = () => {
    if (
      field.inlineCompletion &&
      field.inputProps.value.trim().toLocaleLowerCase() !==
        field.inlineCompletion.toLocaleLowerCase()
    ) {
      field.recordSuggestionIgnored(field.inlineCompletion);
    }
    onGlobal();
  };

  return (
    <div className="ui-toolbar ui-panel w-full flex-row">
      <InlineAutocompleteInput
        placeholder={t("anilist.route.search.placeholder")}
        {...field.inputProps}
        className="h-9 font-bold"
        onChange={(event) => {
          field.inputProps.onChange(event);
          if (global && !event.target.value.trim()) onReset();
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

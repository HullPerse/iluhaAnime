import { Filter, RotateCw, Search, X } from "lucide-react";
import { useEffect, useState } from "react";

import { InlineAutocompleteInput } from "@/components/shared/autocomplete/input.autocomplete";
import { Button } from "@/components/ui/button.component";
import { countActiveStreamFilters } from "@/config/player/streamFilters.config";
import { useI18n } from "@/hooks/i18n.hook";
import { useSearchField } from "@/hooks/search/field.hook";
import { useCell } from "@/lib/core/signal.hook";
import { submitStreamSearch, streamPage, streamQuery } from "@/store/stream.store";
import type { StreamCatalogFilters } from "@/types/player/stream";

/**
 * One toolbar row, the same shape the AniList tab uses: the shared smart input
 * (history, suggestions, inline completion), a separator, the filter button and
 * the refresh action. The field keeps its own draft, because the submitted
 * query is what the catalog request keys on: typing must not issue a request
 * per keystroke.
 */
export default function StreamToolbar({
  isFetching,
  filters,
  onRefetch,
  onFiltersOpen,
}: {
  isFetching: boolean;
  filters: StreamCatalogFilters;
  onRefetch: () => void;
  onFiltersOpen: () => void;
}) {
  const { t } = useI18n();
  const query = useCell(streamQuery);
  const page = useCell(streamPage);
  const [text, setText] = useState<string>(query);

  // A clear from another surface (the empty results panel) has to reach the
  // field, and a submitted search has to leave the field holding what was
  // submitted, so the draft follows the store whenever the store moves.
  useEffect(() => {
    setText(query);
  }, [query]);

  const field = useSearchField({
    scope: "stream",
    query: text,
    setQuery: setText,
    onSubmit: submitStreamSearch,
    submitOnSelect: true,
  });

  const clear = () => {
    setText("");
    submitStreamSearch("");
  };
  const activeFilters = countActiveStreamFilters(filters);

  return (
    <div className="ui-toolbar ui-panel w-full flex-row">
      <InlineAutocompleteInput
        data-main-search
        placeholder={t("stream.searchPlaceholder")}
        aria-label={t("stream.searchPlaceholder")}
        className="h-9 font-bold"
        {...field.inputProps}
      />

      <Button
        size="icon"
        title={t("stream.search")}
        aria-label={t("stream.search")}
        onClick={field.handleSubmit}
        disabled={text.trim().length === 0}
      >
        <Search className="size-4" />
      </Button>
      <Button
        size="icon"
        title={t("stream.clear")}
        aria-label={t("stream.clear")}
        onClick={clear}
        disabled={text.length === 0 && query.length === 0 && page === 1}
      >
        <X className="size-4" />
      </Button>

      <span className="ui-toolbar-separator" aria-hidden />
      <Button
        size="icon"
        className="relative"
        title={t("stream.filters.button")}
        aria-label={t("stream.filters.button")}
        onClick={onFiltersOpen}
      >
        <Filter className="size-4" />
        {activeFilters > 0 && (
          <span className="bg-secondary text-title-text absolute -top-1 -right-1 flex size-3 items-center justify-center text-xs">
            {activeFilters}
          </span>
        )}
      </Button>

      <span className="ui-toolbar-separator" aria-hidden />
      <Button
        size="icon"
        title={t("stream.refresh")}
        aria-label={t("stream.refresh")}
        onClick={onRefetch}
        loading={isFetching}
      >
        <RotateCw className="size-4" />
      </Button>
    </div>
  );
}

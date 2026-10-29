import { Filter, RotateCw, Search, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import Select from "@/components/ui/select.component";
import { countActiveStreamFilters } from "@/config/stream/filters.config";
import { useI18n } from "@/hooks/i18n.hook";
import { useCell } from "@/lib/state/signal.hook";
import { enterSubmit } from "@/lib/utils/keyboard.utils";
import { submitStreamSearch, streamPage, streamQuery } from "@/store/stream.store";
import type { StreamCatalogFilters } from "@/types/stream";

const SOURCE_ID = "animelib";
const SOURCE_NAME = "AnimeLib";

/**
 * One toolbar row, the same shape the AniList and collection tabs use: source,
 * query, search, clear, refresh. The submitted query lives in the store, so
 * the field follows a clear that comes from the results surface.
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
  const [text, setText] = useState(query);

  useEffect(() => {
    setText(query);
  }, [query]);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    submitStreamSearch(trimmed);
  };

  const clear = () => {
    setText("");
    submitStreamSearch("");
  };
  const activeFilters = countActiveStreamFilters(filters);

  return (
    <div className="ui-toolbar ui-panel w-full flex-row">
      <Select
        className="w-28"
        label={t("stream.source")}
        value={SOURCE_ID}
        onChange={() => undefined}
        options={[{ value: SOURCE_ID, label: SOURCE_NAME }]}
      />
      <span className="ui-toolbar-separator" aria-hidden />

      <Input
        data-main-search
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={enterSubmit(submit)}
        placeholder={t("stream.searchPlaceholder")}
        aria-label={t("stream.searchPlaceholder")}
        className="h-9 flex-1 font-bold"
        spellCheck={false}
      />
      <Button
        size="icon"
        title={t("stream.search")}
        aria-label={t("stream.search")}
        onClick={submit}
        disabled={text.trim().length === 0}
      >
        <Search className="size-4" />
      </Button>
      <Button
        size="icon"
        title={t("stream.clear")}
        aria-label={t("stream.clear")}
        onClick={clear}
        disabled={query.length === 0 && page === 1}
      >
        <X className="size-4" />
      </Button>
      <Button
        size="icon"
        className="relative"
        title={t("stream.filters.button")}
        aria-label={t("stream.filters.button")}
        onClick={onFiltersOpen}
      >
        <Filter className="size-4" />
        {activeFilters > 0 ? (
          <span className="bg-secondary text-title-text absolute -top-1 -right-1 flex size-3 items-center justify-center text-xs">
            {activeFilters}
          </span>
        ) : null}
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

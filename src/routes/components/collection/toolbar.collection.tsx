import { Filter, Palette, Plus, SortAsc, SortDesc } from "lucide-react";
import { useMemo } from "react";

import { InlineAutocompleteInput } from "@/components/shared/autocomplete/input.autocomplete";
import { Button } from "@/components/ui/button.component";
import Select from "@/components/ui/select.component";
import { useCollectionDataActions } from "@/hooks/collection/data.hook";
import { useI18n } from "@/lib/locale/i18n.utils";
import { tokenizeIntent } from "@/lib/search/intent.utils";
import type { CollectionStore, SearchField } from "@/types/collection";

import DataCollection from "./data.collection";

export default function ToolbarCollection({
  field,
  sortBy,
  sortDir,
  handleAdd,
  handleStatusManager,
  handleAnilistImport,
  handleShowFilters,
  onSortChange,
  onRandom,
  randomDisabled,
}: {
  field: SearchField;
  sortBy: CollectionStore["sortBy"];
  sortDir: CollectionStore["sortDir"];
  handleAdd: () => void;
  handleStatusManager: () => void;
  handleAnilistImport: () => void;
  handleShowFilters: () => void;
  onSortChange: (by: CollectionStore["sortBy"], dir: CollectionStore["sortDir"]) => void;
  onRandom: () => void;
  randomDisabled: boolean;
}) {
  const { t } = useI18n();
  const dataActions = useCollectionDataActions();
  const highlightRanges = useMemo(
    () => tokenizeIntent(field.inputProps.value ?? ""),
    [field.inputProps.value]
  );

  return (
    <div className="ui-toolbar ui-panel w-full flex-row">
      <Button onClick={handleAdd} size="icon" className="size-7" title={t("collection.add.media")} aria-label={t("collection.add.media")}>
        <Plus className="size-5" />
      </Button>
      <Button
        onClick={handleStatusManager}
        size="icon"
        className="size-7"
        title={t("collection.status.manager.toolbar")}
        aria-label={t("collection.status.manager.toolbar")}
      >
        <Palette className="size-5" />
      </Button>

      <span className="ui-toolbar-separator" aria-hidden />
      <InlineAutocompleteInput
        placeholder={t("collection.search.title")}
        className="h-9 font-bold"
        {...field.inputProps}
        highlightRanges={highlightRanges}
      />
      <span className="ui-toolbar-separator" aria-hidden />

      <Select
        className="w-28"
        value={sortBy}
        onChange={(v) => onSortChange(v as CollectionStore["sortBy"], sortDir)}
        options={[
          { value: "date", label: t("collection.sort.date") },
          { value: "name", label: t("collection.sort.name") },
          { value: "rating", label: t("collection.sort.rating") },
          { value: "year", label: t("collection.sort.year") },
        ]}
      />

      <Button
        size="icon"
        className="size-7"
        title={t("collection.sortdir")}
        aria-label={t("collection.sortdir")}
        onClick={() => onSortChange(sortBy, sortDir === "asc" ? "desc" : "asc")}
      >
        {sortDir === "desc" ? <SortDesc className="size-5" /> : <SortAsc className="size-5" />}
      </Button>

      <Button
        size="icon"
        className="size-7"
        title={t("collection.filters.title")}
        aria-label={t("collection.filters.title")}
        onClick={handleShowFilters}
      >
        <Filter className="size-5" />
      </Button>

      <DataCollection
        onHandleJson={dataActions.handleExportJson}
        onHandleZip={dataActions.handleExportZip}
        onHandleImport={dataActions.handleImportFile}
        onHandleAnilist={handleAnilistImport}
        onRandom={onRandom}
        randomDisabled={randomDisabled}
      />
    </div>
  );
}

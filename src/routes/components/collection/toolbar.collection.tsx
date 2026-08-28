import { Filter, ListTree, Palette, Plus, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/i18n";
import type { CollectionStore } from "@/types/collection";
import { DataMenu } from "./dataMenu.collection";

type SortBy = CollectionStore["sortBy"];
type SortDir = CollectionStore["sortDir"];

export function CollectionToolbar({
  searchQuery,
  onSearchChange,
  sortBy,
  sortDir,
  onSortChange,
  groupByStatus,
  onToggleGroupBy,
  onToggleFilters,
  onAdd,
  onOpenStatusManager,
  onExportJson,
  onExportZip,
  onImportFile,
}: {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sortBy: SortBy;
  sortDir: SortDir;
  onSortChange: (by: SortBy, dir: SortDir) => void;
  groupByStatus: boolean;
  onToggleGroupBy: () => void;
  onToggleFilters: () => void;
  onAdd: () => void;
  onOpenStatusManager: () => void;
  onExportJson: () => void;
  onExportZip: () => void;
  onImportFile: (file: File) => void;
}) {
  const { t } = useI18n();
  return (
    <section className="ui-toolbar ui-panel flex flex-wrap items-center gap-1">
      <Button onClick={onAdd}>
        <Plus className="size-3" /> {t("collection.addMedia")}
      </Button>
      <Button onClick={onOpenStatusManager}>
        <Palette className="size-3" /> {t("collection.statusManager.toolbar")}
      </Button>
      <DataMenu
        onExportJson={onExportJson}
        onExportZip={onExportZip}
        onImportFile={onImportFile}
      />
      <div className="ml-auto flex items-center gap-1">
        <div className="windows95-border flex items-center gap-1 bg-white px-1">
          <Search className="text-hint size-3" />
          <input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("collection.searchTitle")}
            className="w-32 bg-transparent py-0.5 text-xs outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="p-0.5"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as SortBy, sortDir)}
          className="windows95-border bg-white px-1 py-0.5 text-xs"
        >
          <option value="date">{t("collection.sortDate")}</option>
          <option value="name">{t("collection.sortName")}</option>
          <option value="rating">{t("collection.sortRating")}</option>
        </select>
        <Button
          size="icon"
          className="size-6"
          onClick={() => onSortChange(sortBy, sortDir === "asc" ? "desc" : "asc")}
        >
          {sortDir === "asc" ? "↑" : "↓"}
        </Button>
        <Button
          size="icon"
          variant={groupByStatus ? "outline" : "default"}
          className="size-6"
          onClick={onToggleGroupBy}
          aria-label={t("collection.groupByStatus")}
          aria-pressed={groupByStatus}
          title={t("collection.groupByStatus")}
        >
          <ListTree className="size-3" />
        </Button>
        <Button
          size="icon"
          variant="outline"
          className="size-6"
          onClick={onToggleFilters}
          aria-label={t("collection.filters.title")}
        >
          <Filter className="size-3" />
        </Button>
      </div>
    </section>
  );
}
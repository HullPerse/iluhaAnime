import { cn } from "cn";

import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { FILTER_LABELS, RELATION_FILTERS } from "@/config/anilist/graph.config";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { FranchiseToolbarProps } from "@/types/anilist";

function FranchiseToolbar({
  activeFilters,
  searchQuery,
  cacheSource,
  countDiff,
  listView,
  onToggleFilter,
  onSearchChange,
  onToggleView,
  onResetLayout,
  onRefresh,
}: FranchiseToolbarProps) {
  const { t } = useI18n();

  return (
    <section className="flex flex-wrap items-center gap-1">
      <div className="flex flex-wrap gap-1">
        {RELATION_FILTERS.map((group) => (
          <Button
            key={group}
            onClick={() => onToggleFilter(group)}
            variant="default"
            className={cn(
              "h-auto px-1.5 py-0.5 text-xs",
              activeFilters.has(group) && "bg-secondary text-white"
            )}
          >
            {t(FILTER_LABELS[group] as never)}
          </Button>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-1">
        <Input
          type="text"
          placeholder={t("common.search")}
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          className="h-6 w-24 text-xs"
        />
        {cacheSource && (
          <span
            className={cn(
              "windows95-font px-1 py-0.5 text-xs leading-none",
              cacheSource === "fresh" ? "bg-secondary text-white" : "bg-surface text-hint"
            )}
            title={
              cacheSource === "fresh"
                ? t("anilist.franchise.fresh.title")
                : t("anilist.franchise.cache.title")
            }
          >
            {cacheSource === "fresh" ? t("anilist.franchise.fresh") : t("anilist.franchise.cache")}
          </span>
        )}
        {countDiff && (
          <span
            className="windows95-font bg-secondary/20 text-secondary px-1 py-0.5 text-xs leading-none"
            title={t("anilist.franchise.diff.title")}
          >
            {countDiff}
          </span>
        )}
        <Button
          onClick={onToggleView}
          className="h-auto px-1.5 py-0.5 text-xs"
          variant="default"
          title={t("anilist.franchise.toggle.view")}
        >
          {listView ? t("anilist.franchise.graph") : t("anilist.franchise.list")}
        </Button>
        <Button
          onClick={onResetLayout}
          className="h-auto px-1.5 py-0.5 text-xs"
          variant="default"
          title={t("anilist.franchise.reset.layout")}
        >
          {t("anilist.franchise.reset.layout")}
        </Button>
        <Button
          onClick={onRefresh}
          className="h-auto px-1.5 py-0.5 text-xs"
          variant="default"
          title={t("anilist.franchise.refresh.title")}
        >
          {t("anilist.franchise.refresh")}
        </Button>
      </div>
    </section>
  );
}

export { FranchiseToolbar };

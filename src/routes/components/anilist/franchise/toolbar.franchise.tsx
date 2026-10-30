import { cn } from "cn";

import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { FILTER_LABELS, RELATION_FILTERS } from "@/config/graph.config";
import { useI18n } from "@/hooks/i18n.hook";
import type { FranchiseToolbarProps } from "@/types/anilist";

function FranchiseToolbar({
  activeFilters,
  groupCounts,
  searchQuery,
  matchCount,
  listView,
  refreshing,
  onToggleFilter,
  onSearchChange,
  onToggleView,
  onFocusCurrent,
  onResetLayout,
  onRefresh,
}: FranchiseToolbarProps) {
  const { t } = useI18n();

  return (
    <section className="flex flex-wrap items-center gap-1">
      <div
        className="flex flex-wrap gap-1"
        role="group"
        aria-label={t("anilist.franchise.filters")}
      >
        {RELATION_FILTERS.map((group) => {
          const active = activeFilters.has(group);
          return (
            <Button
              key={group}
              onClick={() => onToggleFilter(group)}
              variant={active ? "outline" : "default"}
              aria-pressed={active}
              aria-label={t("anilist.franchise.filter.count", {
                count: groupCounts[group],
                label: t(FILTER_LABELS[group]),
              })}
              className="h-auto gap-1 px-1.5 py-0.5 text-xs"
            >
              <span>{t(FILTER_LABELS[group])}</span>
              <span className={cn("text-hint tabular-nums", active && "opacity-80")}>
                {groupCounts[group]}
              </span>
            </Button>
          );
        })}
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-1">
        <Input
          type="text"
          placeholder={t("common.search")}
          aria-label={t("anilist.franchise.search")}
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          className="h-6 w-32 text-xs"
        />
        {matchCount != null && (
          <span className="text-hint text-xs">
            {matchCount === 0
              ? t("anilist.franchise.no.matches")
              : t("anilist.franchise.found", { count: matchCount })}
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
        {!listView && (
          <Button
            onClick={onFocusCurrent}
            className="h-auto px-1.5 py-0.5 text-xs"
            variant="default"
            title={t("anilist.franchise.focus.current.title")}
          >
            {t("anilist.franchise.focus.current")}
          </Button>
        )}
        {!listView && (
          <Button
            onClick={onResetLayout}
            className="h-auto px-1.5 py-0.5 text-xs"
            variant="default"
            title={t("anilist.franchise.reset.layout")}
          >
            {t("anilist.franchise.reset.layout")}
          </Button>
        )}
        <Button
          onClick={onRefresh}
          className="h-auto px-1.5 py-0.5 text-xs"
          variant="default"
          aria-label={t("anilist.franchise.refresh")}
          title={t("anilist.franchise.refresh.title")}
          loading={refreshing}
        >
          {t("anilist.franchise.refresh")}
        </Button>
      </div>
    </section>
  );
}

export { FranchiseToolbar };

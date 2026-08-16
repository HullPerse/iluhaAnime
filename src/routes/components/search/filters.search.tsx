import { Filter, SortAsc, SortDesc } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import Select from "@/components/ui/select.component";
import { useI18n } from "@/lib/i18n";
import type { SortKey } from "@/types";
import type { SortDirection } from "@/types/search";

interface Props {
  sort: SortKey;
  direction: SortDirection;
  activeFilterCount: number;
  onSortChange: (sort: SortKey) => void;
  onDirectionChange: () => void;
  onOpenFilters: () => void;
}

export default function SearchFiltersBar({
  sort,
  direction,
  activeFilterCount,
  onSortChange,
  onDirectionChange,
  onOpenFilters,
}: Props) {
  const { t } = useI18n();
  return (
    <section className="flex w-full flex-row items-center gap-2">
      <div className="flex items-center gap-1">
        <span className="text-text windows95-text">{t("search.sortBy")}</span>
        <Select
          className="w-22"
          value={sort}
          onChange={(v) => onSortChange(v as SortKey)}
          options={[
            { value: "seeders", label: t("search.sort.seeders") },
            { value: "leechers", label: t("search.sort.leechers") },
            { value: "size", label: t("search.sort.size") },
          ]}
        />
        <Button
          size="icon"
          className="size-5.5"
          title={
            direction === "desc" ? t("search.sortDesc") : t("search.sortAsc")
          }
          onClick={onDirectionChange}
        >
          {direction === "desc" ? (
            <SortDesc className="size-3" />
          ) : (
            <SortAsc className="size-3" />
          )}
        </Button>
      </div>

      <Button size="icon" className="relative size-5.5" onClick={onOpenFilters}>
        <Filter className="size-3" />
        {activeFilterCount > 0 && (
          <span className="bg-secondary absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center text-[8px] text-white">
            {activeFilterCount}
          </span>
        )}
      </Button>
    </section>
  );
}

import { Filter, SortAsc, SortDesc } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import Select from "@/components/ui/select.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { SortKey } from "@/types";
import type { SearchFiltersProps as Props } from "@/types/search";

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
        <span className="text-text windows95-text">{t("search.sort.by")}</span>
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
          title={direction === "desc" ? t("search.sort.desc") : t("search.sort.asc")}
          onClick={onDirectionChange}
        >
          {direction === "desc" ? <SortDesc className="size-3" /> : <SortAsc className="size-3" />}
        </Button>
      </div>

      <Button size="icon" className="relative size-5.5" onClick={onOpenFilters}>
        <Filter className="size-3" />
        {activeFilterCount > 0 && (
          <span className="bg-secondary absolute -top-1 -right-1 flex min-h-4 min-w-4 items-center justify-center px-0.5 text-xs leading-none text-white">
            {activeFilterCount}
          </span>
        )}
      </Button>
    </section>
  );
}

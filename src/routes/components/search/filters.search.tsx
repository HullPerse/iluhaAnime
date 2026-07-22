import type { SortKey } from "@/types";
import Select from "@/components/ui/select.component";
import { Button } from "@/components/ui/button.component";
import { Filter, SortAsc, SortDesc } from "lucide-react";
import { SortDirection } from "@/types/search";

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
  return (
    <section className="flex flex-row gap-2 w-full items-center">
      <div className="flex items-center gap-1">
        <span className="text-text windows95-text">Сортировка:</span>
        <Select
          className="w-22"
          value={sort}
          onChange={(v) => onSortChange(v as SortKey)}
          options={[
            { value: "seeders", label: "Сидеры" },
            { value: "leechers", label: "Личи" },
            { value: "size", label: "Размер" },

          ]}
        />
        <Button
          size="icon"
          className="size-5.5"
          title={direction === "desc" ? "По убыванию" : "По возрастанию"}
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
          <span className="absolute -top-1 -right-1 h-3 w-3 text-[8px] bg-secondary text-white flex items-center justify-center">
            {activeFilterCount}
          </span>
        )}
      </Button>
    </section>
  );
}

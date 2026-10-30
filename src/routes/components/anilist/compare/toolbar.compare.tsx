import { Checkbox } from "@/components/ui/checkbox.component";
import { Input } from "@/components/ui/input.component";
import Select from "@/components/ui/select.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { CompareSort } from "@/types/core/compare";

export function CompareToolbar({
  query,
  sort,
  sortOptions,
  diffMode,
  onQuery,
  onSort,
  onDiffMode,
}: {
  query: string;
  sort: CompareSort;
  sortOptions: { value: CompareSort; label: string }[];
  diffMode: boolean;
  onQuery: (query: string) => void;
  onSort: (sort: CompareSort) => void;
  onDiffMode: (enabled: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="border-t border-black/20 p-2">
      <Input
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        placeholder={t("anilist.compare.search")}
        aria-label={t("anilist.compare.search")}
      />
      <div className="mt-1 flex items-center gap-1">
        <Select
          value={sort}
          onChange={(value) => onSort(value as CompareSort)}
          options={sortOptions}
          label={t("anilist.compare.sort")}
          className="min-w-0 flex-1"
        />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Checkbox
            checked={diffMode}
            onChange={onDiffMode}
            aria-label={t("anilist.compare.diff.mode")}
          />
          <span className="windows95-text text-xs">{t("anilist.compare.diff.mode")}</span>
        </div>
      </div>
    </div>
  );
}

import { Search } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { useI18n } from "@/lib/locale/i18n.utils";

export function FilterBar({
  filterInput,
  setFilterInput,
  filterInputRef,
  applyFilter,
  rowsTotal,
  deleting,
}: {
  filterInput: string;
  setFilterInput: (value: string) => void;
  filterInputRef: React.RefObject<HTMLInputElement | null>;
  applyFilter: () => void;
  rowsTotal?: number;
  deleting: boolean;
}) {
  const { t } = useI18n();
  return (
    <>
      <div className="flex min-w-56 flex-1 gap-1">
        <Input
          ref={filterInputRef}
          value={filterInput}
          onChange={(e) => setFilterInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") applyFilter();
          }}
          placeholder={t("settings.sqlite.filter.placeholder")}
          disabled={deleting}
        />
        <Button
          size="icon"
          className="size-6"
          onClick={applyFilter}
          title={t("settings.sqlite.filter")}
          disabled={deleting}
        >
          <Search className="size-3" />
        </Button>
      </div>
      <span className="text-hint windows95-text text-xs">
        {rowsTotal != null ? t("settings.sqlite.rows.summary", { count: rowsTotal }) : ""}
      </span>
    </>
  );
}

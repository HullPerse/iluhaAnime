import { ArrowDown, ArrowUp, Check } from "lucide-react";

import { useI18n } from "@/lib/locale/i18n.utils";
import type { SortState } from "@/types/sqlite";

export function RowsTableHead({
  columns,
  interactive,
  hideId,
  primaryKeys,
  rowsArray,
  selectedRows,
  primaryKeyValues,
  sort,
  toggleAllRows,
  toggleSort,
}: {
  columns: string[];
  interactive: boolean;
  hideId: boolean;
  primaryKeys: string[];
  rowsArray: Array<unknown>[];
  selectedRows: Record<string, string[]>;
  primaryKeyValues: (row: unknown[]) => string[] | null;
  sort: SortState;
  toggleAllRows: (rows: Array<unknown>[]) => void;
  toggleSort: (column: string) => void;
}) {
  const { t } = useI18n();
  const idHidden = hideId && columns.includes("id");
  return (
    <thead className="bg-secondary sticky top-0 z-10 text-white">
      <tr>
        {interactive && primaryKeys.length > 0 && (
          <th className="w-8 border-r border-white/30 px-1 py-1 font-normal">
            <button
              type="button"
              className="flex items-center hover:cursor-pointer"
              title={t("settings.sqlite.select.all")}
              onClick={() => toggleAllRows(rowsArray)}
            >
              {rowsArray.every(
                (row) => !!selectedRows[primaryKeyValues(row)?.join(" | ") ?? ""]
              ) ? (
                <Check className="size-3" />
              ) : (
                <span className="block size-3 border border-white/60" />
              )}
            </button>
          </th>
        )}
        {idHidden && <th className="w-10 border-r border-white/30 px-1 py-1 font-normal">#</th>}
        {(idHidden ? columns.filter((column) => column !== "id") : columns).map((column) => (
          <th key={column} className="border-r border-white/30 px-1 py-1 font-normal">
            {interactive ? (
              <button
                type="button"
                className="flex w-full items-center gap-0.5 text-left hover:cursor-pointer"
                title={
                  sort?.column === column
                    ? sort.direction === "asc"
                      ? t("settings.sqlite.sort.desc")
                      : t("settings.sqlite.sort.asc")
                    : t("settings.sqlite.sort.asc")
                }
                onClick={() => toggleSort(column)}
              >
                {column}
                {sort?.column === column &&
                  (sort.direction === "asc" ? (
                    <ArrowUp className="size-2.5" />
                  ) : (
                    <ArrowDown className="size-2.5" />
                  ))}
              </button>
            ) : (
              column
            )}
          </th>
        ))}
        {interactive && <th className="px-1 py-1 font-normal">{t("settings.sqlite.actions")}</th>}
      </tr>
    </thead>
  );
}

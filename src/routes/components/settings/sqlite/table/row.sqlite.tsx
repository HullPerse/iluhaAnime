import { cn } from "cn";
import { Check, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";

import { RowCell } from "./rowCell.sqlite";

export function DataRow({
  row,
  rowIndex,
  columns,
  interactive,
  selectedRows,
  primaryKeyValues,
  toggleRowSelection,
  showImages,
  blobColumns,
  selectedDatabase,
  selectedTable,
  openCell,
  setPendingDelete,
  deleting,
  idHidden,
  rowNumber,
  measureRef,
  dataIndex,
}: {
  row: unknown[];
  rowIndex: number;
  columns: string[];
  interactive: boolean;
  selectedRows: Record<string, string[]>;
  primaryKeyValues: (row: unknown[]) => string[] | null;
  toggleRowSelection: (keys: string[] | null) => void;
  showImages: boolean;
  blobColumns: Set<string>;
  selectedDatabase: string;
  selectedTable: string;
  openCell: (row: unknown[], column: string) => void;
  setPendingDelete: (keys: string[]) => void;
  deleting: boolean;
  idHidden: boolean;
  rowNumber: number | null;
  measureRef?: (el: HTMLTableRowElement | null) => void;
  dataIndex?: number;
}) {
  const { t } = useI18n();
  const rowKeys = interactive ? primaryKeyValues(row) : null;
  const rowId = rowKeys ? rowKeys.join(" | ") : `${rowIndex}`;
  const selected = interactive ? !!rowKeys && !!selectedRows[rowId] : false;
  return (
    <tr
      ref={measureRef}
      data-index={dataIndex}
      className={cn(
        selected && "bg-secondary/10",
        "hover:bg-surface border-b border-black/10 align-top"
      )}
    >
      {interactive && rowKeys && (
        <td className="px-1 py-1">
          <button
            type="button"
            className="flex items-center hover:cursor-pointer"
            onClick={() => toggleRowSelection(rowKeys)}
            title={t("settings.sqlite.select.all")}
          >
            {selected ? (
              <Check className="size-3" />
            ) : (
              <span className="block size-3 border border-black/40" />
            )}
          </button>
        </td>
      )}
      {rowNumber !== null && <td className="text-hint px-1 py-1">{rowNumber}</td>}
      {row.map((value, cellIndex) => {
        const name = columns[cellIndex];
        if (name === undefined || (idHidden && name === "id")) return null;
        return (
          <td
            key={`${cellIndex}-${rowIndex}`}
            className="max-h-20 max-w-72 overflow-hidden px-1 py-1 wrap-break-word whitespace-pre-wrap"
          >
            <RowCell
              value={value}
              column={name}
              interactive={interactive}
              row={row}
              rowKeys={rowKeys}
              showImages={showImages}
              blobColumns={blobColumns}
              selectedDatabase={selectedDatabase}
              selectedTable={selectedTable}
              openCell={openCell}
            />
          </td>
        );
      })}
      {interactive && (
        <td className="px-1 py-1">
          <Button
            size="icon"
            className="size-5"
            title={t("settings.sqlite.delete.row")}
            onClick={() => setPendingDelete(rowKeys ?? [])}
            disabled={!rowKeys || deleting}
          >
            <Trash2 className="size-3" />
          </Button>
        </td>
      )}
    </tr>
  );
}

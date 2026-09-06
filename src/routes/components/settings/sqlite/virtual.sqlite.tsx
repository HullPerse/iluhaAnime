import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, type RefObject } from "react";

import type { RowsTableProps } from "@/types/sqlite";

import { RowsTableHead } from "./table/head.sqlite";
import { DataRow, makeRowId } from "./table/row.sqlite";

export function VirtualRowsTable({
  columns,
  rowsArray,
  interactive,
  primaryKeys,
  selectedRows,
  sort,
  blobColumns,
  showImages,
  deleting,
  selectedDatabase,
  selectedTable,
  primaryKeyValues,
  toggleAllRows,
  toggleSort,
  toggleRowSelection,
  openCell,
  setPendingDelete,
  hideId,
  baseIndex,
  hasMore,
  loadingMore,
  onLoadMore,
  scrollRef,
}: RowsTableProps & {
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  scrollRef: RefObject<HTMLElement | null>;
}) {
  const rowVirtualizer = useVirtualizer({
    count: rowsArray.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 30,
    overscan: 8,
    getItemKey: (index) => {
      const row = rowsArray[index] as unknown[];
      return `${makeRowId(row, index, interactive, primaryKeyValues)}-${index}`;
    },
  });
  const virtualItems = rowVirtualizer.getVirtualItems();
  const first = virtualItems[0];
  const last = virtualItems.at(-1);
  const lastIndex = last ? last.index : -1;
  useEffect(() => {
    if (lastIndex >= rowsArray.length - 4 && hasMore && !loadingMore) onLoadMore();
  }, [lastIndex, rowsArray.length, hasMore, loadingMore, onLoadMore]);
  const topPad = first ? first.start : 0;
  const bottomPad = last ? rowVirtualizer.getTotalSize() - last.end : 0;
  const idHidden = hideId && columns.includes("id");
  const colCount =
    columns.length + (interactive ? 1 : 0) + (interactive && primaryKeys.length > 0 ? 1 : 0);
  return (
    <table className="min-w-full border-collapse text-left text-xs">
      <RowsTableHead
        columns={columns}
        interactive={interactive}
        hideId={hideId}
        primaryKeys={primaryKeys}
        rowsArray={rowsArray}
        selectedRows={selectedRows}
        primaryKeyValues={primaryKeyValues}
        sort={sort}
        toggleAllRows={toggleAllRows}
        toggleSort={toggleSort}
      />
      <tbody>
        {topPad > 0 && (
          <tr aria-hidden="true">
            <td colSpan={colCount} style={{ height: topPad, padding: 0, border: 0 }} />
          </tr>
        )}
        {virtualItems.map((virtualRow) => {
          const row = rowsArray[virtualRow.index] as unknown[];
          return (
            <DataRow
              key={`${makeRowId(row, virtualRow.index, interactive, primaryKeyValues)}-${virtualRow.index}`}
              row={row}
              rowIndex={virtualRow.index}
              columns={columns}
              interactive={interactive}
              selectedRows={selectedRows}
              primaryKeyValues={primaryKeyValues}
              toggleRowSelection={toggleRowSelection}
              showImages={showImages}
              blobColumns={blobColumns}
              selectedDatabase={selectedDatabase}
              selectedTable={selectedTable}
              openCell={openCell}
              setPendingDelete={setPendingDelete}
              deleting={deleting}
              idHidden={idHidden}
              rowNumber={idHidden ? baseIndex + virtualRow.index + 1 : null}
              measureRef={(el) => {
                if (el) rowVirtualizer.measureElement(el);
              }}
              dataIndex={virtualRow.index}
            />
          );
        })}
        {bottomPad > 0 && (
          <tr aria-hidden="true">
            <td colSpan={colCount} style={{ height: bottomPad, padding: 0, border: 0 }} />
          </tr>
        )}
      </tbody>
    </table>
  );
}

import type { RowsTableProps } from "@/types/sqlite";

import { RowsTableHead } from "./table/head.sqlite";
import { DataRow, makeRowId } from "./table/row.sqlite";

export function RowsTable({
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
}: RowsTableProps) {
  const idHidden = hideId && columns.includes("id");
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
        {rowsArray.map((row, rowIndex) => (
          <DataRow
            key={`${makeRowId(row, rowIndex, interactive, primaryKeyValues)}-${rowIndex}`}
            row={row}
            rowIndex={rowIndex}
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
            rowNumber={idHidden ? baseIndex + rowIndex + 1 : null}
          />
        ))}
      </tbody>
    </table>
  );
}

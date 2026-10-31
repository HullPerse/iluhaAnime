import { useRef, type ReactNode, type RefObject } from "react";

import { SmallLoader } from "@/components/shared/loader/small.loader";
import { PAGE_SIZE } from "@/config/system/sqlite.config";
import type { SqliteRowsPage } from "@/types/core/sqlite";

import { SqliteBrowseFooter } from "@/routes/components/settings/sqlite/browseFooter.sqlite";
import { SqliteBrowseStatus } from "@/routes/components/settings/sqlite/browseStatus.sqlite";

export function SqliteBrowseResult({
  loadingRows,
  rows,
  display,
  accRows,
  hideId,
  total,
  page,
  lastPage,
  from,
  to,
  onPageChange,
  renderRowsTable,
  renderVirtualRowsTable,
}: {
  loadingRows: boolean;
  rows: SqliteRowsPage | null;
  display: "pagination" | "scroll";
  accRows: Array<unknown>[];
  hideId: boolean;
  total: number;
  page: number;
  lastPage: number;
  from: number;
  to: number;
  onPageChange: (page: number) => void;
  renderRowsTable: (
    columns: string[],
    rowsArray: Array<unknown>[],
    interactive: boolean,
    hideIdValue: boolean,
    baseIndexValue: number
  ) => ReactNode;
  renderVirtualRowsTable: (
    columns: string[],
    rowsArray: Array<unknown>[],
    scrollRef: RefObject<HTMLElement | null>,
    hasMore: boolean,
    loadingMore: boolean
  ) => ReactNode;
}) {
  const scrollRef = useRef<HTMLElement | null>(null);
  const showScroll = display === "scroll";
  const hasMore = accRows.length < total;
  const loadingMore = loadingRows && page > 1 && showScroll;
  const initialLoading = loadingRows && (!showScroll || accRows.length === 0);
  const noRows =
    !initialLoading &&
    (!rows || (showScroll ? accRows.length === 0 : rows.rows.length === 0));
  const scrollReady = !initialLoading && !noRows && showScroll;
  const tableReady = !initialLoading && !noRows && !showScroll;

  return (
    <>
      <section
        ref={scrollRef}
        data-virtual-list
        className="ui-panel bg-field min-h-40 overflow-auto p-0"
      >
        <SqliteBrowseStatus loading={initialLoading} empty={noRows} />
        {scrollReady && (
          <>
            {renderVirtualRowsTable(rows?.columns ?? [], accRows, scrollRef, hasMore, loadingMore)}
            {loadingMore && (
              <div className="flex justify-center p-2">
                <SmallLoader />
              </div>
            )}
          </>
        )}
        {tableReady &&
          rows &&
          renderRowsTable(rows.columns, rows.rows, true, hideId, (page - 1) * PAGE_SIZE)}
      </section>
      <SqliteBrowseFooter
        scroll={showScroll}
        accCount={accRows.length}
        rows={rows}
        total={total}
        page={page}
        lastPage={lastPage}
        from={from}
        to={to}
        onPageChange={onPageChange}
      />
    </>
  );
}

import { useRef, type ReactNode, type RefObject } from "react";

import { SmallLoader } from "@/components/shared/loader.component";
import Pagination from "@/components/shared/pagination.component";
import { PAGE_SIZE } from "@/config/settings/sqlite.config";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { SqliteRowsPage } from "@/types";

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
  const { t } = useI18n();
  const scrollRef = useRef<HTMLElement | null>(null);
  const showScroll = display === "scroll";
  const hasMore = accRows.length < total;
  const loadingMore = loadingRows && page > 1 && showScroll;
  return (
    <>
      <section ref={scrollRef} className="ui-panel min-h-40 overflow-auto bg-white p-0">
        {loadingRows && (!showScroll || accRows.length === 0) ? (
          <div className="flex min-h-40 items-center justify-center">
            <SmallLoader />
          </div>
        ) : !rows || (showScroll ? accRows.length === 0 : rows.rows.length === 0) ? (
          <div className="text-hint flex min-h-40 items-center justify-center p-3 text-xs">
            {t("settings.sqlite.empty")}
          </div>
        ) : showScroll ? (
          <>
            {renderVirtualRowsTable(rows?.columns ?? [], accRows, scrollRef, hasMore, loadingMore)}
            {loadingMore && (
              <div className="flex justify-center p-2">
                <SmallLoader />
              </div>
            )}
          </>
        ) : (
          renderRowsTable(rows.columns, rows.rows, true, hideId, (page - 1) * PAGE_SIZE)
        )}
      </section>
      {showScroll ? (
        <div className="text-hint windows95-text px-1 text-xs">
          {t("common.pagination.shown", {
            from: accRows.length === 0 ? 0 : 1,
            to: accRows.length,
            total: rows?.total ?? 0,
          })}
        </div>
      ) : (
        <Pagination
          total={total}
          page={page}
          lastPage={lastPage}
          from={from}
          to={to}
          onPageChange={onPageChange}
          statusText={t("settings.sqlite.page", { page, total: lastPage })}
        />
      )}
    </>
  );
}

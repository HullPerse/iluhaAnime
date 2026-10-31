import Pagination from "@/components/shared/pagination.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { SqliteRowsPage } from "@/types/core/sqlite";

export function SqliteBrowseFooter({
  scroll,
  accCount,
  rows,
  total,
  page,
  lastPage,
  from,
  to,
  onPageChange,
}: {
  scroll: boolean;
  accCount: number;
  rows: SqliteRowsPage | null;
  total: number;
  page: number;
  lastPage: number;
  from: number;
  to: number;
  onPageChange: (page: number) => void;
}) {
  const { t } = useI18n();

  if (scroll) {
    return (
      <div className="text-hint windows95-text px-1 text-xs">
        {t("common.pagination.shown", {
          from: accCount === 0 ? 0 : 1,
          to: accCount,
          total: rows?.total ?? 0,
        })}
      </div>
    );
  }
  return (
    <Pagination
      total={total}
      page={page}
      lastPage={lastPage}
      from={from}
      to={to}
      onPageChange={onPageChange}
      statusText={t("settings.sqlite.page", { page, total: lastPage })}
    />
  );
}

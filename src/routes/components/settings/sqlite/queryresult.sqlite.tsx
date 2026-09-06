import { Download } from "lucide-react";
import type { ReactNode } from "react";

import { SmallLoader } from "@/components/shared/loader.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { SqliteRowsPage } from "@/types";

export function SqliteQueryResult({
  queryResult,
  queryLoading,
  onExport,
  renderRowsTable,
}: {
  queryResult: SqliteRowsPage | null;
  queryLoading: boolean;
  onExport: () => void;
  renderRowsTable: (
    columns: string[],
    rowsArray: Array<unknown>[],
    interactive: boolean,
    hideIdValue: boolean,
    baseIndexValue: number
  ) => ReactNode;
}) {
  const { t } = useI18n();
  return (
    <section className="ui-panel min-h-40 overflow-auto bg-white p-0">
      {queryLoading ? (
        <div className="flex min-h-40 items-center justify-center">
          <SmallLoader />
        </div>
      ) : !queryResult || queryResult.rows.length === 0 ? (
        <div className="text-hint flex min-h-40 items-center justify-center p-3 text-xs">
          {queryResult ? t("settings.sqlite.query.empty") : t("settings.sqlite.empty")}
        </div>
      ) : (
        <>
          <div className="text-hint sticky left-0 flex items-center justify-between gap-1 border-b border-black/10 p-1 text-xs">
            <span>
              {t("settings.sqlite.query.result.summary", { count: queryResult.rows.length })}
            </span>
            <Button className="h-5" onClick={onExport}>
              <Download className="size-3" />
              {t("settings.sqlite.export")}
            </Button>
          </div>
          {renderRowsTable(queryResult.columns, queryResult.rows, false, false, 0)}
        </>
      )}
    </section>
  );
}

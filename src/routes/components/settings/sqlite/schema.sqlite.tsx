import { useI18n } from "@/lib/locale/i18n.utils";
import type { SqliteTableInfo } from "@/types/sqlite";

export function SchemaSection({ tableInfo }: { tableInfo: SqliteTableInfo }) {
  const { t } = useI18n();
  return (
    <section className="ui-panel p-2">
      <div className="mb-1 flex items-center gap-1 text-xs">
        <strong className="windows95-text">{t("settings.sqlite.schema")}</strong>
        <span className="text-hint windows95-text">{tableInfo.name}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {tableInfo.columns.map((column) => (
          <span
            key={column.name}
            className="windows95-border bg-white px-1 py-0.5 text-xs"
            title={column.dataType || t("settings.sqlite.unknown.type")}
          >
            {column.name}
            {column.primaryKey ? " - PK" : ""}
          </span>
        ))}
      </div>
    </section>
  );
}

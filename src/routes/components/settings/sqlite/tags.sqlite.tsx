import { useI18n } from "@/lib/locale/i18n.utils";
import type { SqliteTableInfo } from "@/types/sqlite";

export function SqliteFilterTags({
  columns,
  isTextColumn,
  onTagClick,
}: {
  columns: SqliteTableInfo["columns"];
  isTextColumn: (column: string) => boolean;
  onTagClick: (column: string) => void;
}) {
  const { t } = useI18n();
  if (columns.length === 0) return null;
  return (
    <div className="ui-toolbar ui-panel h-14 p-1">
      <span className="text-hint windows95-text text-xs">{t("settings.sqlite.filter.fields")}</span>
      {columns.map((column) => (
        <button
          key={column.name}
          type="button"
          className="windows95-border hover:bg-surface active:bg-secondary windows95-text bg-white px-1 py-0.5 text-xs active:text-white"
          title={t("settings.sqlite.filter.tag", {
            template: `${column.name} ${isTextColumn(column.name) ? "~" : "="} `,
          })}
          onClick={() => onTagClick(column.name)}
        >
          {column.name}
        </button>
      ))}
    </div>
  );
}

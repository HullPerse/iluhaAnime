import Select from "@/components/ui/select.component";
import { useI18n } from "@/lib/locale/i18n.utils";

export function SqliteSelectorGrid({
  mode,
  selectedDatabase,
  onSelectDatabase,
  databaseOptions,
  selectedTable,
  onSelectTable,
  tableOptions,
  loading,
  deleting,
  tableCount,
}: {
  mode: "browse" | "query";
  selectedDatabase: string;
  onSelectDatabase: (value: string) => void;
  databaseOptions: { value: string; label: string }[];
  selectedTable: string;
  onSelectTable: (value: string) => void;
  tableOptions: { value: string; label: string }[];
  loading: boolean;
  deleting: boolean;
  tableCount: number;
}) {
  const { t } = useI18n();
  return (
    <section className="ui-panel grid gap-2 p-2 md:grid-cols-2">
      <label className="windows95-text flex flex-col gap-1 text-xs">
        {t("settings.sqlite.database")}
        <Select
          value={selectedDatabase}
          onChange={onSelectDatabase}
          options={databaseOptions}
          disabled={loading || deleting}
        />
      </label>
      {mode === "browse" && (
        <label className="windows95-text flex flex-col gap-1 text-xs">
          {t("settings.sqlite.table")}
          <Select
            value={selectedTable}
            onChange={onSelectTable}
            options={tableOptions}
            disabled={loading || deleting || tableCount === 0}
          />
        </label>
      )}
    </section>
  );
}

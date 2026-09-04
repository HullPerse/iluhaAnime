import { Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import { Input } from "@/components/ui/input.component";
import Select from "@/components/ui/select.component";
import { useI18n } from "@/lib/i18n";
import type { SqliteTableInfo } from "@/types";

export function BrowseToolbar({
  filterInput,
  setFilterInput,
  filterInputRef,
  applyFilter,
  rowsTotal,
  selectedCount,
  hasPrimaryKeys,
  deleting,
  onBatchDelete,
  showImages,
  setShowImages,
  canExport,
  onExport,
}: {
  filterInput: string;
  setFilterInput: (value: string) => void;
  filterInputRef: React.RefObject<HTMLInputElement | null>;
  applyFilter: () => void;
  rowsTotal?: number;
  selectedCount: number;
  hasPrimaryKeys: boolean;
  deleting: boolean;
  onBatchDelete: () => void;
  showImages: boolean;
  setShowImages: (value: boolean) => void;
  canExport: boolean;
  onExport: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="ui-toolbar ui-panel gap-1 p-1">
      <div className="flex min-w-56 flex-1 gap-1">
        <Input
          ref={filterInputRef}
          value={filterInput}
          onChange={(e) => setFilterInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") applyFilter();
          }}
          placeholder={t("settings.sqlite.filter.placeholder")}
          disabled={deleting}
        />
        <Button
          size="icon"
          className="size-6"
          onClick={applyFilter}
          title={t("settings.sqlite.filter")}
          disabled={deleting}
        >
          <Search className="size-3" />
        </Button>
      </div>
      <span className="text-hint windows95-text text-xs">
        {rowsTotal != null ? t("settings.sqlite.rows.summary", { count: rowsTotal }) : ""}
      </span>
      {hasPrimaryKeys && (
        <span className="text-hint windows95-text text-xs">
          {selectedCount > 0 ? t("settings.sqlite.selected.count", { count: selectedCount }) : ""}
        </span>
      )}
      {hasPrimaryKeys && (
        <Button
          className="h-5"
          variant="destructive"
          disabled={selectedCount === 0 || deleting}
          onClick={onBatchDelete}
          title={t("settings.sqlite.delete.selected", { count: selectedCount })}
        >
          <Trash2 className="size-3" />
          {t("settings.sqlite.delete.selected", { count: selectedCount })}
        </Button>
      )}
      <label className="windows95-text flex items-center gap-1 text-xs">
        <Checkbox checked={showImages} onChange={setShowImages} />
        {t("settings.sqlite.show.images")}
      </label>
      <Button
        className="h-5"
        disabled={!canExport}
        onClick={onExport}
        title={t("settings.sqlite.export")}
      >
        Export
      </Button>
    </div>
  );
}

export function SqliteFilterBuilder({
  columns,
  isTextColumn,
  filterInput,
  setFilterInput,
  filterInputRef,
  applyFilter,
}: {
  columns: SqliteTableInfo["columns"];
  isTextColumn: (column: string) => boolean;
  filterInput: string;
  setFilterInput: (value: string) => void;
  filterInputRef: React.RefObject<HTMLInputElement | null>;
  applyFilter: () => void;
}) {
  const [col, setCol] = useState(columns[0]?.name ?? "");
  const [op, setOp] = useState(isTextColumn(columns[0]?.name ?? "") ? "~" : "=");
  const [val, setVal] = useState("");
  useEffect(() => {
    if (columns.length > 0 && !columns.some((c) => c.name === col)) {
      const next = columns[0].name;
      setCol(next);
      setOp(isTextColumn(next) ? "~" : "=");
    }
  }, [columns, col, isTextColumn]);
  const add = () => {
    const v = val.trim();
    if (!col || !v) return;
    const quoted = isTextColumn(col) || v.includes(" ") ? `"${v.replace(/"/g, '""')}"` : v;
    const cond = `${col} ${op} ${quoted}`;
    const next = filterInput.trim() ? `${filterInput.trim()} && ${cond}` : cond;
    setFilterInput(next);
    setVal("");
    requestAnimationFrame(() => {
      filterInputRef.current?.focus();
      applyFilter();
    });
  };
  if (columns.length === 0) return null;
  return (
    <div className="ui-toolbar ui-panel gap-1 p-1">
      <Select
        value={col}
        onChange={(v) => {
          setCol(v);
          setOp(isTextColumn(v) ? "~" : "=");
        }}
        options={columns.map((c) => ({ value: c.name, label: c.name }))}
        className="max-w-40 min-w-28"
      />
      <Select
        value={op}
        onChange={setOp}
        options={[
          { value: "~", label: "contains (~)" },
          { value: "=", label: "= equals" },
          { value: "!=", label: "!= not" },
          { value: ">", label: ">" },
          { value: "<", label: "<" },
          { value: ">=", label: ">=" },
          { value: "<=", label: "<=" },
        ]}
        className="max-w-32 min-w-28"
      />
      <Input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") add();
        }}
        placeholder="value"
        className="min-w-24 flex-1"
      />
      <Button size="default" onClick={add} disabled={!val.trim()}>
        Add
      </Button>
    </div>
  );
}

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
    <div className="ui-toolbar ui-panel p-1">
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

export function SchemaSection({ tableInfo }: { tableInfo: import("@/types").SqliteTableInfo }) {
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

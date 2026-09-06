import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import Select from "@/components/ui/select.component";
import type { SqliteTableInfo } from "@/types";

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
    <div className="ui-toolbar ui-panel h-14 gap-1 p-1">
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

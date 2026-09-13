import { MAX_CELL_PREVIEW } from "@/config/settings/sqlite.config";

function formatDateCell(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  const date = new Date(value < 1e11 ? value * 1000 : value);
  if (Number.isNaN(date.getTime())) return null;
  const part = (n: number) => String(n).padStart(2, "0");
  return `${part(date.getDate())}.${part(date.getMonth() + 1)}.${String(date.getFullYear()).slice(-2)}`;
}

export function displayCell(value: unknown, column?: string): string {
  if (column?.toLowerCase() === "created_at") return formatDateCell(value) ?? String(value);
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function previewCell(value: unknown, column?: string): string {
  const rendered = displayCell(value, column);
  return rendered.length > MAX_CELL_PREVIEW
    ? `${rendered.slice(0, MAX_CELL_PREVIEW)}...`
    : rendered;
}

export function makeRowId(
  row: unknown[],
  rowIndex: number,
  interactive: boolean,
  primaryKeyValues: (row: unknown[]) => string[] | null
): string {
  const rowKeys = interactive ? primaryKeyValues(row) : null;
  return rowKeys ? rowKeys.join(" | ") : `${rowIndex}`;
}

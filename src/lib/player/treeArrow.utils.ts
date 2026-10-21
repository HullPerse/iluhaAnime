export interface TreeRow {
  path: string;
  depth: number;
  kind: "folder" | "file";
  expanded: boolean;
  parent?: string;
}

export type TreeArrowResult =
  | { kind: "toggle"; path: string }
  | { kind: "focus"; path: string }
  | null;

function parentOf(rows: readonly TreeRow[], index: number): TreeRow | null {
  const row = rows[index];
  if (!row) return null;
  for (let previous = index - 1; previous >= 0; previous -= 1) {
    const candidate = rows[previous];
    if (candidate && candidate.depth < row.depth) return candidate;
  }
  return null;
}

export function resolveTreeArrow(
  rows: readonly TreeRow[],
  focusedPath: string,
  direction: "left" | "right"
): TreeArrowResult {
  const index = rows.findIndex((row) => row.path === focusedPath);
  const row = rows[index];
  if (!row) return null;

  if (direction === "right") {
    if (row.kind === "file") return null;
    if (!row.expanded) return { kind: "toggle", path: row.path };
    const child = rows[index + 1];
    return child && child.depth > row.depth ? { kind: "focus", path: child.path } : null;
  }

  if (row.kind === "folder" && row.expanded) return { kind: "toggle", path: row.path };
  const parent = parentOf(rows, index);
  return parent ? { kind: "focus", path: parent.path } : null;
}

export function resolveTreeMove(
  rows: readonly TreeRow[],
  focusedPath: string,
  delta: number
): string | null {
  if (rows.length === 0) return null;
  const index = rows.findIndex((row) => row.path === focusedPath);
  if (index === -1) return null;
  const next = Math.min(rows.length - 1, Math.max(0, index + delta));
  const row = rows[next];
  return row ? row.path : null;
}

export interface RelativeRowNumber {
  label: number;
  current: boolean;
}

function parentDirname(path: string): string {
  const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return cut < 0 ? "" : path.slice(0, cut);
}

function rowScope(row: TreeRow): string {
  return row.parent ?? parentDirname(row.path);
}

export function relativeRowNumber(
  rows: readonly TreeRow[],
  anchorPath: string | null,
  rowPath: string
): RelativeRowNumber | null {
  const anchor = anchorPath ?? rows[0]?.path;
  if (!anchor) return null;
  const anchorRow = rows.find((row) => row.path === anchor);
  const row = rows.find((candidate) => candidate.path === rowPath);
  if (!anchorRow || !row) return null;
  const scope = rowScope(anchorRow);
  if (rowScope(row) !== scope) return null;
  const siblings = rows.filter((candidate) => rowScope(candidate) === scope);
  const anchorIndex = siblings.findIndex((candidate) => candidate.path === anchor);
  const rowIndex = siblings.findIndex((candidate) => candidate.path === rowPath);
  if (anchorIndex === -1 || rowIndex === -1) return null;
  if (rowIndex === anchorIndex) return { label: anchorIndex + 1, current: true };
  return { label: Math.abs(rowIndex - anchorIndex), current: false };
}

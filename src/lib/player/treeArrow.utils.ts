/** One visible row of a folder tree, in tree order and with the indentation
 *  that makes "the parent" and "the first child" well defined without a
 *  second tree walk. */
export interface TreeRow {
  path: string;
  depth: number;
  kind: "folder" | "file";
  expanded: boolean;
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

/**
 * Where `ArrowLeft`/`ArrowRight` should go from the focused row, using the
 * WAI-ARIA treeview rules: the arrow on a folder row itself opens/closes it,
 * otherwise the key walks to the parent (`Left`) or the first child (`Right`).
 * A file row has neither, so `Right` does nothing and `Left` goes back to the
 * folder holding it. Returns `null` when there is nothing to do, and the
 * caller then leaves the key alone.
 */
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

/**
 * The next row for `ArrowUp`/`ArrowDown` (or `J`/`K`), clamped at both ends so
 * holding the key stops on the first/last row instead of wrapping. Movement
 * covers folder *and* file rows: the file rows are not tab stops, they are
 * reached from the folder that is, which is what keeps a fully expanded tree
 * from costing a tab stop per episode.
 */
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
  /** The number to paint: absolute 1-based position for the anchor row. */
  label: number;
  current: boolean;
}

function parentDirname(path: string): string {
  const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return cut < 0 ? "" : path.slice(0, cut);
}

/**
 * Vim-style relative number for one row: siblings of the anchor row (same
 * parent directory) count 1..N above and below it, the anchor row itself
 * shows its absolute 1-based position. Rows from other folders get `null`
 * and render no number. Falls back to the first row while nothing focused.
 */
export function relativeRowNumber(
  rows: readonly TreeRow[],
  anchorPath: string | null,
  rowPath: string
): RelativeRowNumber | null {
  const anchor = anchorPath ?? rows[0]?.path;
  if (!anchor) return null;
  const parent = parentDirname(anchor);
  if (parentDirname(rowPath) !== parent) return null;
  const siblings = rows.filter((row) => parentDirname(row.path) === parent);
  const anchorIndex = siblings.findIndex((row) => row.path === anchor);
  const rowIndex = siblings.findIndex((row) => row.path === rowPath);
  if (anchorIndex === -1 || rowIndex === -1) return null;
  if (rowIndex === anchorIndex) return { label: anchorIndex + 1, current: true };
  return { label: Math.abs(rowIndex - anchorIndex), current: false };
}

import type { RefObject } from "react";

import { findRow } from "@/lib/ui/treeRow.utils";
import { resolveTreeMove } from "@/lib/core/treeArrow.utils";
import type { TreeRow } from "@/types/core/treeArrow";
import { setVimCount, vimAtoms } from "@/store/vim.store";

export const moveRingFocus = (
  treeRows: TreeRow[],
  treeRef: RefObject<HTMLDivElement | null>,
  nodePath: string,
  path: string,
  direction: -1 | 1
): void => {
  if (path === nodePath && !treeRows.some((row) => row.path === path)) {
    if (direction > 0) {
      const first = treeRows[0];
      if (first) findRow(treeRef.current, first.path)?.focus();
    }
    return;
  }
  const count = vimAtoms.count.get();
  setVimCount("");
  const step = count === "" ? 1 : Math.max(Number.parseInt(count, 10) || 1, 1);
  const next = resolveTreeMove(treeRows, path, direction * step);
  if (next) findRow(treeRef.current, next)?.focus();
};

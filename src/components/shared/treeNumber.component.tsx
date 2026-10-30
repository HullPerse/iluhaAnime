import { relativeRowNumber } from "@/lib/treeArrow.utils";
import type { TreeRow } from "@/types/treeArrow";

function TreeRowNumber({
  rows,
  anchorPath,
  rowPath,
}: {
  rows: readonly TreeRow[];
  anchorPath: string | null;
  rowPath: string;
}) {
  const number = relativeRowNumber(rows, anchorPath, rowPath);
  if (!number) return null;
  return (
    <span
      aria-hidden="true"
      data-tree-number
      className={
        number.current
          ? "bg-secondary text-title-text w-5 shrink-0 px-0.5 text-right text-[10px] tabular-nums select-none"
          : "text-hint w-5 shrink-0 text-right text-[10px] tabular-nums select-none"
      }
    >
      {number.label}
    </span>
  );
}

export default TreeRowNumber;

import { cn } from "cn";
import type { ReactNode, RefObject } from "react";

import TreeRowNumber from "@/components/shared/treeNumber.component";
import type { TreeRow } from "@/types/core/treeArrow";

export function TorrentRowShell({
  rootRef,
  rowKey,
  depth,
  virtualStart,
  type,
  completed,
  rows,
  anchorPath,
  children,
}: {
  rootRef: RefObject<HTMLDivElement | null>;
  rowKey: string;
  depth: number;
  virtualStart: number;
  type: "torrent" | "player";
  completed: boolean;
  rows?: readonly TreeRow[];
  anchorPath?: string | null;
  children: ReactNode;
}) {
  const player = type === "player";
  return (
    <div
      ref={rootRef}
      data-tree-row
      data-tree-path={rowKey}
      data-tree-kind="file"
      tabIndex={-1}
      onMouseDown={(event) => {
        if (event.target instanceof HTMLElement && event.target.closest("button, input")) return;
        event.preventDefault();
        event.currentTarget.focus();
      }}
      className={cn(
        "windows95-text focus-visible:outline-text absolute top-0 left-0 flex w-full items-center gap-1 px-1 select-none focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted",
        player ? "windows95-border bg-field" : undefined,
        (player || !(type === "torrent" && completed)) && "hover:bg-surface"
      )}
      style={{
        height: player ? 20 : 18,
        transform: `translateY(${virtualStart}px)`,
        paddingLeft: `${depth * 12 + 2}px`,
      }}
    >
      {player && anchorPath != null && (
        <TreeRowNumber rows={rows ?? []} anchorPath={anchorPath} rowPath={rowKey} />
      )}
      {children}
    </div>
  );
}

import { useCallback, useMemo, useState } from "react";

import { flattenTree } from "@/lib/player/playerTree.utils";
import type { TreeRow } from "@/types/core/treeArrow";
import type { FolderNode } from "@/types/torrent/torrent";

export function useFolderTree({
  node,
  searchQuery,
  disabledExtensions,
  depth,
  hideRoot,
  trackExts,
}: {
  node: FolderNode;
  searchQuery: string;
  disabledExtensions?: Set<string>;
  depth: number;
  hideRoot?: boolean;
  trackExts?: Set<string>;
}) {
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(node.children.length > 0 ? [node.path] : [])
  );
  const [anchorPath, setAnchorPath] = useState<string | null>(null);

  const toggle = useCallback((path: string) => {
    setOpen((previous) => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const flatItems = useMemo(
    () => flattenTree(node, open, searchQuery, disabledExtensions, depth, trackExts),
    [node, open, searchQuery, disabledExtensions, depth, trackExts]
  );

  const treeRows = useMemo<TreeRow[]>(() => {
    const header: TreeRow[] =
      !hideRoot || depth > 0
        ? [{ path: node.path, depth, kind: "folder", expanded: open.has(node.path) }]
        : [];
    return [
      ...header,
      ...flatItems.map((item) =>
        item.kind === "folder"
          ? {
              path: item.node.path,
              depth: item.depth,
              kind: "folder" as const,
              expanded: open.has(item.node.path),
            }
          : {
              path: item.file.path,
              depth: item.depth,
              kind: "file" as const,
              expanded: false,
            }
      ),
    ];
  }, [depth, flatItems, hideRoot, node.path, open]);

  return { open, toggle, anchorPath, setAnchorPath, flatItems, treeRows };
}

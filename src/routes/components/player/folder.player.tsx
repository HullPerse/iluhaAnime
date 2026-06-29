import { Button } from "@/components/ui/button.component";
import { nodeMatchesSearch } from "@/lib/player.utils";
import { fmtSize } from "@/lib/torrent.utils";
import type { FolderNode } from "@/types/index";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  ChevronDown,
  ChevronRight,
  FileVideo,
  FolderOpen,
  Monitor,
  Play,
  X,
} from "lucide-react";
import { useState } from "react";

function FolderView({
  node,
  depth,
  onPlay,
  searchQuery,
  onRemove,
}: {
  node: FolderNode;
  depth: number;
  onPlay: (path: string) => void;
  searchQuery: string;
  onRemove?: (path: string) => void;
}) {
  const [open, setOpen] = useState(depth === 0);

  const hasChildren = node.children.length > 0;
  const hasFiles = node.files.length > 0;

  if (!hasChildren && !hasFiles) return null;

  const filteredFiles = searchQuery
    ? node.files.filter((f) =>
        f.name.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : node.files;

  const hasFilteredChildren = searchQuery
    ? node.children.some((c) => nodeMatchesSearch(c, searchQuery))
    : hasChildren;

  if (searchQuery && filteredFiles.length === 0 && !hasFilteredChildren)
    return null;

  const countAll =
    node.files.length + node.children.reduce((s, c) => s + c.files.length, 0);

  return (
    <main className="flex flex-col w-full">
      {(hasChildren || hasFiles) && (
        <div
          role="button"
          className="flex items-center gap-1 windows95-text cursor-pointer hover:bg-surface px-0.5 py-0.5 w-full text-left"
          onClick={() => setOpen(!open)}
          style={{ paddingLeft: `${depth * 12 + 2}px` }}
        >
          {open ? (
            <ChevronDown className="size-3 shrink-0" />
          ) : (
            <ChevronRight className="size-3 shrink-0" />
          )}
          <FolderOpen className="size-3 shrink-0 text-muted" />
          <span className="truncate select-none" title={node.name}>{node.name}</span>
          <span className="text-muted ml-auto whitespace-nowrap">
            {countAll} файлов
          </span>
          {onRemove && depth === 0 && (
            <Button
              size="icon"
              className="h-5 w-5  ml-1"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(node.path);
              }}
            >
              <X />
            </Button>
          )}
        </div>
      )}

      {open &&
        filteredFiles.map((file) => (
          <section
            key={file.path}
            className="flex items-center gap-1 p-1 windows95-border h-5"
            style={{ paddingLeft: `${(depth + 1) * 12 + 2}px` }}
          >
            <FileVideo className="size-4 text-muted" />
            <span title={file.name} className="windows95-text truncate flex-1">
              {file.name}
            </span>

            <span className="windows95-text text-muted">
              {fmtSize(file.size)}
            </span>

            <Button
              size="icon"
              className="h-4 w-4"
              onClick={async () => {
                if (!file.path) return;

                openPath(`${file.path}`);
              }}
              title="Смотреть в нативном плеере"
            >
              <Monitor className="size-3" />
            </Button>
            <Button
              size="icon"
              className="h-4 w-4"
              onClick={() => onPlay(file.path)}
              title="Смотреть в плеере приложения"
            >
              <Play className="size-3" />
            </Button>
          </section>
        ))}

      {open &&
        node.children.map((child) => {
          return (
            <div key={child.name}>
              <FolderView
                node={child}
                depth={depth + 1}
                onPlay={onPlay}
                searchQuery={searchQuery}
              />
            </div>
          );
        })}
    </main>
  );
}

export default FolderView;

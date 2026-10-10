import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import ImageComponent from "@/components/ui/image.component";
import { torrentFileIcon } from "@/lib/torrent/fileIcon.utils";
import type { TorrentDetailFile } from "@/types/torrent";

interface TorrentFileNode {
  folders: Map<string, TorrentFileNode>;
  files: TorrentDetailFile[];
}

function buildTree(files: TorrentDetailFile[]): TorrentFileNode {
  const root: TorrentFileNode = { folders: new Map(), files: [] };
  for (const file of files) {
    const parts = file.name
      .split("/")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    if (parts.length === 0) continue;
    let node = root;
    for (const part of parts.slice(0, -1)) {
      let next = node.folders.get(part);
      if (!next) {
        next = { folders: new Map(), files: [] };
        node.folders.set(part, next);
      }
      node = next;
    }
    const leaf = parts.at(-1);
    if (leaf) node.files.push({ name: leaf, size: file.size });
  }
  return root;
}

function countFiles(node: TorrentFileNode): number {
  let total = node.files.length;
  node.folders.forEach((child) => {
    total += countFiles(child);
  });
  return total;
}

function TorrentFileLeaf({ file, depth }: { file: TorrentDetailFile; depth: number }) {
  return (
    <div
      className="windows95-text flex min-w-0 items-center gap-1 px-1 py-0.5 odd:bg-black/5"
      style={{ paddingLeft: `${depth * 12 + 2}px` }}
    >
      <ImageComponent
        src={`/images/${torrentFileIcon(file.name)}`}
        alt=""
        className="size-4 shrink-0"
      />
      <span className="min-w-0 flex-1 truncate text-xs" title={file.name}>
        {file.name}
      </span>
      <span className="windows95-border bg-surface text-hint shrink-0 px-1 text-xs">
        {file.size || "-"}
      </span>
    </div>
  );
}

function TorrentFolderNode({
  name,
  node,
  depth,
}: {
  name: string;
  node: TorrentFileNode;
  depth: number;
}) {
  const [open, setOpen] = useState(true);
  const total = useMemo(() => countFiles(node), [node]);
  return (
    <div className="min-w-0">
      <button
        type="button"
        className="windows95-text hover:bg-surface flex w-full cursor-pointer items-center gap-1 px-0.5 py-0.5 text-left select-none"
        style={{ paddingLeft: `${depth * 12 + 2}px` }}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="size-3 shrink-0" />
        ) : (
          <ChevronRight className="size-3 shrink-0" />
        )}
        <ImageComponent src="/images/w2k_folder_closed.ico" alt="" className="size-4 shrink-0" />
        <span className="truncate text-xs font-bold" title={name}>
          {name}
        </span>
        <span className="text-hint shrink-0 text-xs">({total})</span>
      </button>
      {open && (
        <div>
          {[...node.folders.entries()].map(([childName, child]) => (
            <TorrentFolderNode key={childName} name={childName} node={child} depth={depth + 1} />
          ))}
          {node.files.map((file, index) => (
            <TorrentFileLeaf key={`${file.name}-${index}`} file={file} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function TorrentFileTree({
  files,
  rootName,
}: {
  files: TorrentDetailFile[];
  rootName?: string;
}) {
  const root = useMemo(() => buildTree(files), [files]);
  if (root.folders.size === 0 && rootName && root.files.length > 0) {
    return (
      <div className="min-h-full overflow-y-auto">
        <TorrentFolderNode
          name={rootName}
          node={{ folders: new Map(), files: root.files }}
          depth={0}
        />
      </div>
    );
  }
  if (root.folders.size === 0) {
    return (
      <div className="grid min-h-full grid-cols-1 gap-x-2 sm:grid-cols-2">
        {root.files.map((file, index) => (
          <div
            key={`${file.name}-${index}`}
            className="flex min-w-0 items-center gap-2 border-b border-black/10 px-1 py-0.5 odd:bg-black/5"
          >
            <span className="windows95-text min-w-0 flex-1 truncate text-xs" title={file.name}>
              {file.name}
            </span>
            <span className="windows95-border bg-surface text-hint shrink-0 px-1 text-xs">
              {file.size || "-"}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="min-h-full">
      {[...root.folders.entries()].map(([name, node]) => (
        <TorrentFolderNode key={name} name={name} node={node} depth={0} />
      ))}
      {root.files.map((file, index) => (
        <TorrentFileLeaf key={`${file.name}-${index}`} file={file} depth={0} />
      ))}
    </div>
  );
}

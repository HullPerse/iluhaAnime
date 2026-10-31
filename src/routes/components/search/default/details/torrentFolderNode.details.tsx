import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import ImageComponent from "@/components/ui/image.component";
import { countFiles } from "@/lib/torrent/fileTree.utils";
import type { TorrentFileNode } from "@/lib/torrent/fileTree.utils";
import { TorrentFileLeaf } from "@/routes/components/search/default/details/torrentFileLeaf.details";

export function TorrentFolderNode({
  name,
  node,
  depth,
}: {
  name: string;
  node: TorrentFileNode;
  depth: number;
}) {
  const [open, setOpen] = useState<boolean>(true);
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

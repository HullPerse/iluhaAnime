import { useMemo } from "react";

import { buildTree } from "@/lib/torrent/fileTree.utils";
import type { TorrentDetailFile } from "@/types/torrent/torrent";
import { TorrentFileLeaf } from "@/routes/components/search/default/details/torrentFileLeaf.details";
import { TorrentFolderNode } from "@/routes/components/search/default/details/torrentFolderNode.details";

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
      <div className="min-h-full overflow-y-auto">
        {root.files.map((file, index) => (
          <TorrentFileLeaf key={`${file.name}-${index}`} file={file} depth={0} />
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

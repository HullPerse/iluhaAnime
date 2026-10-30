import ImageComponent from "@/components/ui/image.component";
import { torrentFileIcon } from "@/lib/core/fileIcon.utils";
import type { TorrentDetailFile } from "@/types/torrent/torrent";

export function TorrentFileLeaf({ file, depth }: { file: TorrentDetailFile; depth: number }) {
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

import { fmtSize, groupFilesByDirectory } from "@/lib/torrent.utils";
import { TorrentFileInfo } from "@/store/download.store";
import { useState } from "react";
import { FolderOpen } from "lucide-react";

function TorrentFilesSection({
  id,
  files,
  onToggle,
}: {
  id: number;
  files: TorrentFileInfo[];
  onToggle: (id: number, indices: number[]) => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(
    () =>
      new Set(
        files.filter((f) => f.selected || f.completed).map((f) => f.index),
      ),
  );

  const toggle = (index: number) => {
    const file = files.find((f) => f.index === index);
    if (file?.completed) return;

    const next = new Set(selected);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSelected(next);
    onToggle(id, [...next]);
  };

  return (
    <div className="windows95-border max-h-40 overflow-y-auto">
      {groupFilesByDirectory(files).map((group) => (
        <div key={group.dir || "__root__"}>
          {group.dir && (
            <div className="flex items-center gap-1 px-1 py-0.5 text-[10px] windows95-font bg-[#c0c0c0] select-none">
              <FolderOpen className="size-3 shrink-0" />
              <span className="font-bold truncate">{group.dir}</span>
              <span className="text-muted ml-auto">
                {fmtSize(group.files.reduce((s, f) => s + f.size, 0))}
              </span>
            </div>
          )}
          {group.files.map((fileItem) => (
            <label
              key={fileItem.index}
              className={`flex items-center gap-1 px-1 py-0.5 text-[10px] windows95-font select-none hover:bg-[#e0e0e0] ${group.dir ? "pl-5" : ""} ${fileItem.completed ? "opacity-60" : "cursor-pointer"}`}
            >
              <input
                type="checkbox"
                checked={selected.has(fileItem.index)}
                onChange={() => toggle(fileItem.index)}
                disabled={fileItem.completed}
                className="cursor-pointer size-3 shrink-0"
              />
              <span className="truncate flex-1">{fileItem.displayName}</span>
              <span className="text-muted shrink-0">
                {fmtSize(fileItem.size)}
              </span>
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}

export default TorrentFilesSection;

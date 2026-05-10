import { fmtSize } from "@/lib/torrent.utils";
import { TorrentFileInfo } from "@/store/download.store";
import { useState } from "react";

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
    () => new Set(
      files
        .filter((f) => f.selected || f.completed)
        .map((f) => f.index)
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
      {files.map((file) => (
        <label
          key={file.index}
          className={`flex items-center gap-1 px-1 py-0.5 text-[10px] windows95-font select-none hover:bg-[#e0e0e0] ${file.completed ? "opacity-60" : "cursor-pointer"}`}
        >
          <input
            type="checkbox"
            checked={selected.has(file.index)}
            onChange={() => toggle(file.index)}
            disabled={file.completed}
            className="cursor-pointer size-3"
          />
          <span className="truncate flex-1">{file.name}</span>
          <span className="text-muted shrink-0">{fmtSize(file.size)}</span>
        </label>
      ))}
    </div>
  );
}

export default TorrentFilesSection;

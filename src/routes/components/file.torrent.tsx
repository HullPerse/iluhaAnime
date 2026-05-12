import { fmtSize, groupFilesByDirectory } from "@/lib/torrent.utils";
import { TorrentFileInfo } from "@/store/download.store";
import { useEffect, useState } from "react";
import { FolderOpen, Monitor, Play } from "lucide-react";
import { openPath } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button.component";

function TorrentFilesSection({
  id,
  files,
  onToggle,
  type,
  path,
  onPlay,
}: {
  id: number;
  files: TorrentFileInfo[];
  type: "torrent" | "player";
  path?: string;
  onToggle?: (id: number, indices: number[]) => void;
  onPlay?: (filePath: string) => void;
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
    onToggle?.(id, [...next]);
  };

  useEffect(() => {
    setSelected(
      new Set(
        files.filter((f) => f.selected || f.completed).map((f) => f.index),
      ),
    );
  }, [files]);

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
          {group.files.map((fileItem, index) => {
            if (type === "player" && !fileItem.completed) return;

            return (
              <label
                key={fileItem.index}
                className={`flex items-center gap-1 px-1 py-0.5 text-[10px] windows95-font select-none ${type === "player" ? "" : "hover:bg-[#e0e0e0]"} ${group.dir ? "pl-5" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(fileItem.index)}
                  onChange={() => toggle(fileItem.index)}
                  disabled={fileItem.completed}
                  className="cursor-pointer size-3 shrink-0"
                  hidden={!onToggle}
                />
                <span className="truncate flex-1">
                  {`${index + 1}. `}
                  {fileItem.displayName}
                </span>
                <span className="text-muted shrink-0">
                  {fmtSize(fileItem.size)}
                </span>

                {type === "player" && (
                  <div className="flex flex-row gap-1 ml-auto">
                    {path && (
                      <Button
                        title="Открыть в медиа плеере"
                        size="icon"
                        variant="default"
                        className="size-5"
                        rendered={type === "player"}
                        onClick={async () => {
                          console.log(path);
                          if (!path) return;

                          openPath(`${path}/${fileItem.name}`);
                        }}
                      >
                        <Monitor />
                      </Button>
                    )}
                    {onPlay && (
                      <Button
                        title="Открыть в iluhaAnime плеере"
                        size="icon"
                        variant="default"
                        className="size-5"
                        rendered={type === "player"}
                        onClick={() =>
                          path && onPlay(`${path}/${fileItem.name}`)
                        }
                      >
                        <Play />
                      </Button>
                    )}
                  </div>
                )}
              </label>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default TorrentFilesSection;

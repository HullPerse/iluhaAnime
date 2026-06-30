import { fmtSize, groupFilesByDirectory } from "@/lib/torrent.utils";
import type { TorrentFileInfo } from "@/types/torrent";
import { useEffect, useState } from "react";
import { FolderOpen, Monitor, Play } from "lucide-react";
import { openPath } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";

import type { FilePriority } from "@/types";

function TorrentFilesSection({
  id,
  files,
  onToggle,
  type,
  path,
  onPlay,
  onFilePriorityChange,
}: {
  id: number;
  files: TorrentFileInfo[];
  type: "torrent" | "player";
  path?: string;
  onToggle?: (id: number, indices: number[]) => void;
  onPlay?: (filePath: string) => void;
  onFilePriorityChange?: (
    id: number,
    fileIndices: number[],
    priority: FilePriority,
  ) => void;
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
            <div className="flex items-center gap-1 px-1 py-0.5 text-[10px] windows95-font bg-primary select-none">
              <FolderOpen className="size-3 shrink-0" />
              <span className="font-bold truncate" title={group.dir}>
                {group.dir}
              </span>
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
                className={`flex items-center gap-1 px-1 py-0.5 text-[10px] windows95-font select-none ${type === "player" ? "" : "hover:bg-surface"} ${group.dir ? "pl-5" : ""}`}
              >
                {!!onToggle && (
                  <Checkbox
                    checked={selected.has(fileItem.index)}
                    onChange={() => toggle(fileItem.index)}
                    disabled={fileItem.completed}
                    className="size-3"
                  />
                )}
                <span
                  className={`shrink-0 text-[9px] ${fileItem.exists ? "text-green-700" : "text-red-600"}`}
                  title={
                    fileItem.exists ? "Файл существует" : "Файл отсутствует"
                  }
                >
                  {fileItem.exists ? "✓" : "✗"}
                </span>
                <span
                  className="truncate flex-1"
                  title={`${index + 1}. ${fileItem.displayName}`}
                >
                  {`${index + 1}. `}
                  {fileItem.displayName}
                </span>
                <span className="text-muted shrink-0">
                  {fmtSize(fileItem.size)}
                </span>

                {onFilePriorityChange &&
                  type === "torrent" &&
                  !fileItem.completed && (
                    <select
                      className="h-4 text-[9px] windows95-border px-0.5 ml-1 windows95-select bg-white"
                      value={fileItem.priority || "normal"}
                      onChange={(e) => {
                        onFilePriorityChange(
                          id,
                          [fileItem.index],
                          e.target.value as FilePriority,
                        );
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <option value="high">Высокий</option>
                      <option value="normal">Нормальный</option>
                      <option value="low">Маленький</option>
                      <option value="do_not_download">Пропуск</option>
                    </select>
                  )}

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

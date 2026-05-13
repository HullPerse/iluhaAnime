import { Play, Trash } from "lucide-react";
import { Button } from "@/components/ui/button.component";
import type { PlaylistEntry } from "@/store/playlist.store";

function Playlist({
  entries,
  activePath,
  onPlay,
  onRemove,
}: {
  entries: PlaylistEntry[];
  activePath?: string;
  onPlay: (entry: PlaylistEntry) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {entries?.map((entry, index) => {
        const isActive = entry.path === activePath;

        return (
          <div
            key={`${entry.path}-${index}`}
            title={entry.name}
            className={`flex items-center gap-1 px-1 py-0.5 windows95-border text-[10px] windows95-font "bg-secondary text-black text-cemter`}
          >
            <span className="flex flex-row truncate flex-1">
              {isActive ? `> ` : `${index + 1}. `}

              {entry.name}
            </span>
            <Button
              size="icon"
              className="size-5"
              variant={isActive ? "secondary" : "default"}
              onClick={() => onPlay(entry)}
            >
              <Play />
            </Button>
            <Button
              size="icon"
              className="size-5"
              variant="error"
              onClick={() => onRemove(index)}
            >
              <Trash />
            </Button>
          </div>
        );
      })}
    </div>
  );
}

export default Playlist;

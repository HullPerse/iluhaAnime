import { Button } from "@/components/ui/button.component";
import { useMediaStore } from "@/store/media.store";
import { Play, X } from "lucide-react";
import { useMemo } from "react";

function ContinueWatching({ onPlay }: { onPlay: (path: string) => void }) {
  const mediaEntries = useMediaStore((s) => s.entries);
  const clearEntries = useMediaStore((s) => s.clearEntries);

  const recentEntries = useMemo(
    () =>
      mediaEntries
        .filter((e) => e.position > 0)
        .sort((a, b) => b.lastPlayed - a.lastPlayed)
        .slice(0, 5),
    [mediaEntries],
  );

  if (recentEntries.length === 0) return null;

  return (
    <section className="windows95-border bg-primary p-1">
      <div className="flex items-center justify-between mb-1">
        <span className="windows95-text text-[10px] font-bold">
          Продолжить просмотр
        </span>
        <Button
          size="icon"
          className="size-4"
          onClick={clearEntries}
          title="Очистить историю"
        >
          <X className="size-3" />
        </Button>
      </div>
      <div className="flex flex-col gap-0.5">
        {recentEntries.map((e) => (
          <button
            key={e.path}
            className="flex items-center gap-1 text-[10px] windows95-text bg-white windows95-border hover:bg-surface px-0.5 py-0.5 text-left cursor-pointer truncate"
            onClick={() => onPlay(e.path)}
            title={e.path}
          >
            <Play className="size-3 shrink-0" />
            <span className="truncate">{e.path.split(/[/\\]/).pop()}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export default ContinueWatching;

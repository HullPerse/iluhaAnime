import { ListVideo, Play } from "lucide-react";

import { formatClock } from "@/lib/core/time.utils";

export function CardThumbnail({
  url,
  position,
  current,
  duration,
}: {
  url: string | undefined;
  position: number;
  current: boolean;
  duration: number;
}) {
  return (
    <div className="windows95-border bg-field relative flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden">
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <ListVideo className="text-hint size-4" />
      )}
      <span className="windows95-font bg-primary/90 text-text absolute top-0 left-0 px-1 text-xs tabular-nums">
        {position + 1}
      </span>
      {duration > 0 ? (
        <span className="windows95-font absolute right-0 bottom-0 bg-black/70 px-1 text-xs text-white tabular-nums">
          {formatClock(duration)}
        </span>
      ) : null}
      {current ? (
        <span className="absolute inset-0 flex items-center justify-center bg-black/45">
          <Play className="size-6 text-white" fill="currentColor" />
        </span>
      ) : null}
    </div>
  );
}

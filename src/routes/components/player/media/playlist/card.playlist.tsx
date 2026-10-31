import { GripVertical } from "lucide-react";
import { cn } from "cn";

import { useMediaEntry } from "@/hooks/media.hook";
import { useOnScreen } from "@/hooks/intersection.hook";
import { useCardArt } from "@/hooks/player/cardArt.hook";
import { ignore } from "@/lib/core/promise.utils";
import { formatVerticalDragTransform } from "@/lib/ui/drag.utils";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { PlaylistEntry } from "@/types/player/playback";
import type { TFunc } from "@/types/core/i18n";

import { cardClass, cardMetaText } from "@/lib/player/playlist.utils";
import { CardThumbnail } from "@/routes/components/player/media/playlist/thumbnail.playlist";
import { CurrentProgress } from "@/routes/components/player/media/playlist/progress.playlist";
import { PlaylistCardMeta } from "@/routes/components/player/media/playlist/meta.playlist";
import { PlaylistCardActions } from "@/routes/components/player/media/playlist/actions.playlist";

export function PlaylistCard({
  entry,
  position,
  current,
  focused,
  label,
  upDisabled,
  downDisabled,
  onPlay,
  onRemove,
  onMove,
  t,
}: {
  entry: PlaylistEntry;
  position: number;
  current: boolean;
  focused: boolean;
  label: string;
  upDisabled: boolean;
  downDisabled: boolean;
  onPlay: (index: number) => Promise<void>;
  onRemove: (index: number) => Promise<void>;
  onMove: (from: number, to: number) => Promise<void>;
  t: TFunc;
}) {
  const [cardRef, onScreen] = useOnScreen<HTMLDivElement>();
  const art = useCardArt(entry.filename, onScreen || current);
  const saved = useMediaEntry(entry.filename ?? null);
  const resumeRatio =
    !saved || saved.duration <= 0 || saved.position <= 0
      ? 0
      : Math.max(0, Math.min(1, saved.position / saved.duration));
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    setActivatorNodeRef,
    transform,
    isDragging,
  } = useDraggable({ id: entry.index });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: entry.index });
  const duration = art?.duration ?? 0;
  const meta = cardMetaText(art);

  return (
    <div
      ref={(node) => {
        cardRef.current = node;
        setDragRef(node);
        setDropRef(node);
      }}
      data-testid="playlist-card"
      data-current={current ? "true" : undefined}
      data-focused={focused ? "true" : undefined}
      className={cardClass(current, focused, isOver)}
      style={{
        transform: formatVerticalDragTransform(transform),
        zIndex: isDragging ? 10 : undefined,
        opacity: isDragging ? 0.6 : undefined,
      }}
    >
      <div className="flex items-center gap-1">
        <span
          ref={setActivatorNodeRef}
          data-testid="playlist-drag-handle"
          title={t("player.media.playlist.drag")}
          aria-label={t("player.media.playlist.drag")}
          className="text-hint flex shrink-0 cursor-grab touch-none items-center self-stretch px-0.5 select-none active:cursor-grabbing"
          {...listeners}
          {...attributes}
        >
          <GripVertical className="size-4" />
        </span>
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left"
          title={t("player.media.playlist.play")}
          aria-current={current ? "true" : undefined}
          onClick={() => ignore(onPlay(entry.index))}
        >
          <CardThumbnail url={art?.url} position={position} current={current} duration={duration} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span
              title={entry.filename || label}
              className={cn("windows95-font truncate text-xs", current && "font-bold")}
            >
              {label}
            </span>
            <PlaylistCardMeta meta={meta} current={current} />
          </span>
        </button>
        <PlaylistCardActions
          entry={entry}
          upDisabled={upDisabled}
          downDisabled={downDisabled}
          onMove={onMove}
          onRemove={onRemove}
          t={t}
        />
      </div>
      {current && <CurrentProgress />}
      {!current && resumeRatio > 0 && (
        <div className="bg-field h-0.5 w-full overflow-hidden" title={label}>
          <div className="bg-hint h-full" style={{ width: `${resumeRatio * 100}%` }} />
        </div>
      )}
    </div>
  );
}

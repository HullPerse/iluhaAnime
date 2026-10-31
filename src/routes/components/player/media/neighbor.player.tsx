import { ListVideo, SkipBack, SkipForward } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useKeybindTitle } from "@/hooks/keybindTitle.hook";
import { fileNameFromPath } from "@/lib/search/parse.utils";
import { scheduleTask } from "@/lib/core/shared.utils";
import { fetchVideoCard, getCachedCard } from "@/lib/core/cardCache.utils";
import type { CardArt } from "@/types/core/cardCache";
import { readPlaylistEntries } from "@/lib/player/playback.utils";
import type { PlaylistEntry } from "@/types/player/playback";
import { formatParsedTitle } from "@/lib/player/playerTitle.utils";
import { useCell } from "@/lib/core/signal.hook";
import { ignore } from "@/lib/core/promise.utils";
import { formatClock } from "@/lib/core/time.utils";
import { playbackAtoms } from "@/store/player.store";
import { settingsAtoms } from "@/store/settings.store";

import { HOVER_DEBOUNCE_MS, neighborAt } from "@/lib/player/neighbor.utils";

function NeighborFileButton({
  direction,
  hasTarget,
  title,
  ariaLabel,
  onActivate,
}: {
  direction: "prev" | "next";
  hasTarget: boolean;
  title: string;
  ariaLabel: string;
  onActivate: () => void;
}) {
  const { t } = useI18n();
  const currentPath = useCell(playbackAtoms.path);
  const playlistIndex = useCell(playbackAtoms.playlistIndex);
  const parseTitles = useCell(settingsAtoms.parseTitlesPlayer);
  const [open, setOpen] = useState(false);
  const [entry, setEntry] = useState<PlaylistEntry | null>(null);
  const [art, setArt] = useState<CardArt | null>(null);
  const requestRef = useRef(0);
  const hintedTitle = useKeybindTitle(
    title,
    direction === "prev" ? "player.prevFile" : "player.nextFile"
  );

  const close = () => {
    requestRef.current += 1;
    setOpen(false);
    setEntry(null);
    setArt(null);
  };

  useEffect(() => {
    if (!open || !hasTarget || !currentPath) return;
    const request = requestRef.current + 1;
    requestRef.current = request;
    const task = scheduleTask("timeout", HOVER_DEBOUNCE_MS, () => {
      ignore(
        readPlaylistEntries().then((entries) => {
          if (requestRef.current !== request) return;
          const neighbor = neighborAt(entries, currentPath, playlistIndex, direction);
          if (!neighbor) return;
          setEntry(neighbor);
          if (!neighbor.filename) return;
          const cached = getCachedCard(neighbor.filename);
          if (cached) {
            setArt(cached);
            return;
          }
          ignore(
            fetchVideoCard(neighbor.filename).then((card) => {
              if (requestRef.current !== request || !card) return null;
              setArt(card);
              return null;
            })
          );
          return null;
        })
      );
    });
    return () => task.cancel();
  }, [open, hasTarget, currentPath, playlistIndex, direction]);

  const label = entry
    ? entry.title ||
      (entry.filename
        ? parseTitles
          ? formatParsedTitle(entry.filename, t)
          : fileNameFromPath(entry.filename)
        : `#${entry.index + 1}`)
    : "";

  return (
    <div
      className="relative"
      onMouseEnter={() => {
        if (hasTarget) setOpen(true);
      }}
      onMouseLeave={close}
    >
      <Button
        size="icon"
        className="size-6"
        title={hintedTitle}
        aria-label={ariaLabel}
        onClick={() => {
          close();
          onActivate();
        }}
        onFocus={() => {
          if (hasTarget) setOpen(true);
        }}
        onBlur={close}
      >
        {direction === "prev" ? (
          <SkipBack className="size-4" />
        ) : (
          <SkipForward className="size-4" />
        )}
      </Button>
      {open && entry && (
        <div
          aria-hidden="true"
          className="windows95-border bg-primary pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 w-32 -translate-x-1/2 p-1"
        >
          {art?.url ? (
            <img src={art.url} alt="" className="h-16 w-full object-cover" draggable={false} />
          ) : (
            <div className="bg-field flex h-16 w-full items-center justify-center">
              <ListVideo className="text-hint size-4" />
            </div>
          )}
          <div className="windows95-font truncate text-xs" title={label}>
            {label}
          </div>
          {art && art.duration > 0 && (
            <div className="windows95-font text-hint text-xs tabular-nums">
              {formatClock(art.duration)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default NeighborFileButton;

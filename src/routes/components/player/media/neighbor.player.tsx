import { ListVideo, SkipBack, SkipForward } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { fileNameFromPath } from "@/lib/media/parse.utils";
import {
  fetchVideoCard,
  getCachedCard,
  isSameMediaPath,
  type CardArt,
} from "@/lib/player/cardCache.utils";
import { readPlaylistEntries, type PlaylistEntry } from "@/lib/player/playback.utils";
import { formatParsedTitle } from "@/lib/player/title.utils";
import { useCell } from "@/lib/state/signal.hook";
import { formatClock } from "@/lib/utils/time.utils";
import { playbackAtoms } from "@/store/player.store";
import { settingsAtoms } from "@/store/settings.store";

const HOVER_DEBOUNCE_MS = 150;

function neighborAt(
  entries: PlaylistEntry[],
  currentPath: string,
  playlistIndex: number,
  direction: "prev" | "next"
): PlaylistEntry | null {
  if (!currentPath) return null;
  const delta = direction === "prev" ? -1 : 1;
  const anchor =
    playlistIndex >= 0 && playlistIndex < entries.length ? entries[playlistIndex] : undefined;
  if (anchor && isSameMediaPath(anchor.filename, currentPath)) {
    return entries[playlistIndex + delta] ?? null;
  }
  let pos = entries.findIndex((entry) => entry.filename === currentPath);
  if (pos === -1) {
    pos = entries.findIndex(
      (entry) => entry.filename && isSameMediaPath(entry.filename, currentPath)
    );
  }
  if (pos === -1) return null;
  return entries[pos + delta] ?? null;
}

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
    const timer = window.setTimeout(() => {
      readPlaylistEntries()
        .then((entries) => {
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
          fetchVideoCard(neighbor.filename)
            .then((card) => {
              if (requestRef.current !== request || !card) return;
              setArt(card);
            })
            .catch(() => undefined);
        })
        .catch(() => undefined);
    }, HOVER_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
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
        title={title}
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
      {open && entry ? (
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
          {art && art.duration > 0 ? (
            <div className="windows95-font text-hint text-xs tabular-nums">
              {formatClock(art.duration)}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default NeighborFileButton;

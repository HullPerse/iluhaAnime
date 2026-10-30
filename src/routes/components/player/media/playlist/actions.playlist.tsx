import { ArrowDown, ArrowUp, X } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { ignore } from "@/lib/core/promise.utils";
import type { PlaylistEntry } from "@/types/player/playback";
import type { TFunc } from "@/types/core/i18n";

export function PlaylistCardActions({
  entry,
  upDisabled,
  downDisabled,
  onMove,
  onRemove,
  t,
}: {
  entry: PlaylistEntry;
  upDisabled: boolean;
  downDisabled: boolean;
  onMove: (from: number, to: number) => Promise<void>;
  onRemove: (index: number) => Promise<void>;
  t: TFunc;
}) {
  return (
    <>
      <div className="flex shrink-0 flex-col gap-0.5" role="group">
        <Button
          size="icon"
          className="size-5"
          title={t("player.media.playlist.move.up")}
          aria-label={t("player.media.playlist.move.up")}
          disabled={upDisabled}
          onClick={() => ignore(onMove(entry.index, entry.index - 1))}
        >
          <ArrowUp className="size-3" />
        </Button>
        <Button
          size="icon"
          className="size-5"
          title={t("player.media.playlist.move.down")}
          aria-label={t("player.media.playlist.move.down")}
          disabled={downDisabled}
          onClick={() => ignore(onMove(entry.index, entry.index + 1))}
        >
          <ArrowDown className="size-3" />
        </Button>
      </div>
      <Button
        size="icon"
        className="size-5 shrink-0"
        title={t("player.media.playlist.remove")}
        aria-label={t("player.media.playlist.remove")}
        onClick={() => ignore(onRemove(entry.index))}
      >
        <X className="size-3" />
      </Button>
    </>
  );
}

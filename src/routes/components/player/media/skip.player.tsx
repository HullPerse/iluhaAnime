import { SkipForward } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { scheduleTask } from "@/lib/core/shared.utils";
import {
  SKIP_AUTO_HIDE_MS,
  SKIP_SEEK_BACK_THRESHOLD,
  findActiveChapter,
  resolveSkipTarget,
  skipLabel,
} from "@/lib/core/skip.utils";
import { useCell } from "@/lib/core/signal.hook";
import { playbackAtoms } from "@/store/player.store";
import type { MpvChapter } from "@/types/player/videoPlayer";

function SkipButton({
  duration,
  chapters,
  hasNext,
  raised = false,
  onSkip,
  onFileNext,
}: {
  duration: number;
  chapters: MpvChapter[];
  hasNext: boolean;
  /**
   * The bar is drawn over the video, so the button has to clear it. Without
   * this the bar covers the button in the compact and cinema layouts, where
   * the video area runs to the bottom of the window.
   */
  raised?: boolean;
  onSkip: (time: number) => void;
  onFileNext: () => void;
}) {
  const { t } = useI18n();
  const timePos = useCell(playbackAtoms.timePos);

  const skip = resolveSkipTarget(chapters, timePos, duration, hasNext);
  const active = findActiveChapter(chapters, timePos, duration);
  const label = active ? skipLabel(active.chapter.title) : null;
  const key = active && label ? `${active.index}:${active.chapter.time}` : null;

  const [hidden, setHidden] = useState(false);
  const prevTime = useRef(timePos);

  useEffect(() => {
    if (key !== null) setHidden(false);
  }, [key]);

  useEffect(() => {
    if (!key || hidden) return;
    const task = scheduleTask("timeout", SKIP_AUTO_HIDE_MS, () => setHidden(true));
    return () => task.cancel();
  }, [key, hidden]);

  useEffect(() => {
    const delta = prevTime.current - timePos;
    prevTime.current = timePos;
    if (delta > SKIP_SEEK_BACK_THRESHOLD && key && hidden) setHidden(false);
  }, [timePos, key, hidden]);

  if (!active || !label || !skip || hidden) return null;

  return (
    <div
      data-testid="skip-button"
      className={`absolute right-1 z-30 ${raised ? "bottom-14" : "bottom-1"}`}
    >
      <Button
        className="flex h-auto items-center gap-1 px-3 py-1.5 text-sm"
        title={active.chapter.title}
        onClick={() => {
          onSkip(skip.target);
          if (skip.nextEpisode) onFileNext();
        }}
      >
        <SkipForward className="size-4" />
        {skip.nextEpisode ? t("player.media.skip.next.episode") : t("player.media.skip.chapter")}
      </Button>
    </div>
  );
}

export default SkipButton;

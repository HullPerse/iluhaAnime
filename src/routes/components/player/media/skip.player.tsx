import { SkipForward } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import {
  SKIP_AUTO_HIDE_MS,
  SKIP_SEEK_BACK_THRESHOLD,
  findActiveChapter,
  skipLabel,
} from "@/lib/player/skip.utils";
import { usePlaybackStore } from "@/store/player.store";
import type { MpvChapter } from "@/types/videoPlayer";

function SkipButton({
  duration,
  chapters,
  hasNext,
  onSkip,
  onFileNext,
}: {
  duration: number;
  chapters: MpvChapter[];
  hasNext: boolean;
  onSkip: (time: number) => void;
  onFileNext: () => void;
}) {
  const { t } = useI18n();
  const timePos = usePlaybackStore((state) => state.timePos);

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
    const id = window.setTimeout(() => setHidden(true), SKIP_AUTO_HIDE_MS);
    return () => window.clearTimeout(id);
  }, [key, hidden]);

  useEffect(() => {
    const delta = prevTime.current - timePos;
    prevTime.current = timePos;
    if (delta > SKIP_SEEK_BACK_THRESHOLD && key && hidden) setHidden(false);
  }, [timePos, key, hidden]);

  if (!active || !label || hidden) return null;

  const isLastChapter = active.index === chapters.length - 1;
  const isNextEpisode = isLastChapter && label === "ED" && hasNext;

  return (
    <div className="absolute right-1 bottom-1 z-20">
      <Button
        className="flex h-auto items-center gap-1 px-3 py-1.5 text-sm"
        title={active.chapter.title}
        onClick={() => {
          onSkip(active.target);
          if (isNextEpisode) onFileNext();
        }}
      >
        <SkipForward className="size-4" />
        {isNextEpisode ? t("player.media.skip.next.episode") : t("player.media.skip.chapter")}
      </Button>
    </div>
  );
}

export default SkipButton;

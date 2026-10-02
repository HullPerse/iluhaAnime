import { SkipForward } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { usePlaybackStore } from "@/store/player.store";
import type { MpvChapter } from "@/types/videoPlayer";

function skipLabel(title: string): string | null {
  const lower = title.toLowerCase();
  if (lower.includes("opening") || lower === "op") {
    return "OP";
  }
  if (lower.includes("ending") || lower === "ed" || lower.includes("credits")) {
    return "ED";
  }
  if (lower.includes("intro")) {
    return "Intro";
  }
  if (
    lower.includes("preview") ||
    lower.includes("next episode") ||
    lower.includes("next time") ||
    lower.includes("next week")
  ) {
    return "Preview";
  }
  if (
    lower.includes("intermission") ||
    lower.includes("interlude") ||
    lower.includes("interval")
  ) {
    return "Intermission";
  }
  if (lower.includes("recap")) {
    return "Recap";
  }
  return null;
}

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

  let active: MpvChapter | null = null;
  let index = -1;
  for (let i = 0; i < chapters.length; i += 1) {
    const start = chapters[i].time;
    const end = chapters[i].end ?? chapters[i + 1]?.time ?? duration;
    if (timePos >= start && timePos < end) {
      active = chapters[i];
      index = i;
      break;
    }
  }

  const label = active ? skipLabel(active.title) : null;
  if (!active || !label) return null;

  const isLastChapter = index === chapters.length - 1;
  const isNextEpisode = isLastChapter && label === "ED" && hasNext;
  const target = active.end ?? chapters[index + 1]?.time ?? duration;

  return (
    <div className="absolute bottom-1 right-1 z-20">
      <Button
        className="flex h-auto items-center gap-1 px-3 py-1.5 text-sm"
        onClick={() => {
          onSkip(target);
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

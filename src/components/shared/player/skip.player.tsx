import { selectPlayback, selectTime, usePlayer } from "@videojs/react";
import { Button } from "@/components/ui/button.component";
import { SkipForward } from "lucide-react";

function skipLabel(title: string): string | null {
  const lower = title.toLowerCase();
  if (
    lower.includes("opening") ||
    lower === "op"
  )
    return "OP";
  if (lower.includes("ending") || lower === "ed" || lower.includes("credits"))
    return "ED";
  if (lower.includes("intro")) return "Intro";
  if (
    lower.includes("preview") ||
    lower.includes("next episode") ||
    lower.includes("next time") ||
    lower.includes("next week")
  )
    return "Preview";
  if (
    lower.includes("intermission") ||
    lower.includes("interlude") ||
    lower.includes("interval")
  )
    return "Intermission";
  if (lower.includes("recap")) return "Recap";
  return null;
}

function SkipButton({
  chapters,
  onFileNext,
  hasNext,
}: {
  chapters?: { start_time: number; end_time: number; title: string }[];
  onFileNext?: () => void;
  hasNext?: boolean;
}) {
  const time = usePlayer(selectTime);
  const playback = usePlayer(selectPlayback);
  const ct = time?.currentTime ?? 0;

  const active = chapters?.find(
    (ch) => ct >= ch.start_time && ct < ch.end_time && skipLabel(ch.title),
  );
  if (!active) return null;

  const label = skipLabel(active.title);
  const isLastChapter = chapters
    ? chapters.indexOf(active) === chapters.length - 1
    : false;
  const isNextEpisode = isLastChapter && label === "ED" && hasNext;
  return (
    <div className="absolute bottom-1 right-1 z-20">
      <Button
        className="flex items-center gap-1 px-3 py-1.5 h-auto text-sm"
        onClick={() => {
          time?.seek?.(active.end_time);
          playback?.play();
          if (isNextEpisode) onFileNext?.();
        }}
      >
        <SkipForward className="size-4" />
        {isNextEpisode ? "Следующий эпизод" : "Пропустить"}
      </Button>
    </div>
  );
}

export default SkipButton;

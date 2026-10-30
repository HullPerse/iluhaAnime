import { Pause, Play } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useKeybindTitle } from "@/hooks/keybindTitle.hook";
import type { MpvChapter } from "@/types/player/videoPlayer";

import Timeline from "@/routes/components/player/media/timeline.player";

function PlayerSlimBar({
  paused,
  hasFile,
  duration,
  chapters,
  seekTarget,
  onPlayPause,
  onScrub,
  onCommitSeek,
}: {
  paused: boolean;
  hasFile: boolean;
  duration: number;
  chapters: MpvChapter[];
  seekTarget: number | null;
  onPlayPause: () => void;
  onScrub: (time: number) => void;
  onCommitSeek: (time: number) => void;
}) {
  const { t } = useI18n();
  const playPauseTitle = useKeybindTitle(t("player.media.key.play.pause"), "player.playPause");

  return (
    <main className="flex flex-row items-center gap-1 p-1">
      <Button
        size="icon"
        className="size-6 shrink-0"
        title={playPauseTitle}
        aria-label={t("player.media.key.play.pause")}
        onClick={onPlayPause}
        disabled={!hasFile}
      >
        {paused ? <Play /> : <Pause />}
      </Button>
      <div className="min-w-0 flex-1">
        <Timeline
          duration={duration}
          chapters={chapters}
          seekTarget={seekTarget}
          onScrub={onScrub}
          onCommitSeek={onCommitSeek}
        />
      </div>
    </main>
  );
}

export default PlayerSlimBar;

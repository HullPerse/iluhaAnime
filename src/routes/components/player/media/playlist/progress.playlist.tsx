import { useCell } from "@hullperse/hp_utils/react";
import { useDisplayDuration } from "@/hooks/player/displayDuration.hook";
import { playbackAtoms } from "@/store/player.store";

export function CurrentProgress() {
  const timePos = useCell(playbackAtoms.timePos);
  const liveDuration = useCell(playbackAtoms.duration);
  const durationHint = useCell(playbackAtoms.durationHint);
  const duration = useDisplayDuration(liveDuration, durationHint);
  if (duration <= 0) return null;
  const percent = Math.max(0, Math.min(100, (timePos / duration) * 100));
  return (
    <div className="windows95-border bg-field h-1.5 w-full overflow-hidden">
      <div className="bg-highlight h-full" style={{ width: `${percent}%` }} />
    </div>
  );
}

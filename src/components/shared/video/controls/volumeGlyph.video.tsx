import { selectVolume } from "@videojs/core/dom";
import { usePlayer } from "@videojs/react";
import { Volume, Volume1, Volume2, VolumeX } from "lucide-react";

export function VolumeGlyph() {
  const volume = usePlayer(selectVolume);
  const level = volume?.muted ? 0 : (volume?.volume ?? 1);
  if (level === 0) return <VolumeX className="size-3" />;
  if (level < 0.34) return <Volume className="size-3" />;
  if (level < 0.67) return <Volume1 className="size-3" />;
  return <Volume2 className="size-3" />;
}

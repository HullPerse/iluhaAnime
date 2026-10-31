import { cn } from "cn";

import type { PlayerBezelVariant } from "@/types/player/videoPlayer";

export default function PlayerBezel({
  variant,
  className,
}: {
  variant: PlayerBezelVariant;
  className?: string;
}) {
  return (
    <div className={cn("player-bezel", className)} data-variant={variant} aria-hidden="true">
      <div className="player-bezel-screen" />
      <div className="player-bezel-grain" />
      <div className="player-bezel-glare" />
      <span className="player-bezel-led" />
    </div>
  );
}

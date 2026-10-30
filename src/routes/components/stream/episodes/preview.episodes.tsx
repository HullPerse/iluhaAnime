import { createPortal } from "react-dom";

import { useStreamCover } from "@/hooks/remoteImage.hook";
import { previewPosition } from "@/lib/player/episodePreview.utils";
import type { PreviewAnchor } from "@/types/player/episodes.stream";

export function EpisodePreview({ anchor }: { anchor: PreviewAnchor }) {
  const src = useStreamCover(anchor.url);
  if (!src || typeof document === "undefined") return null;
  const position = previewPosition(anchor.rect, {
    width: window.innerWidth,
    height: window.innerHeight,
  });
  return createPortal(
    <div
      data-testid="episode-preview"
      className="windows95-active-border bg-primary pointer-events-none fixed z-50 p-0.5"
      style={position}
    >
      <img src={src} alt="" className="block h-24 w-44 object-cover" />
    </div>,
    document.body
  );
}

import { useMedia } from "@videojs/react";
import { useEffect, useRef } from "react";

import { DEFAULT_VOLUME } from "@/config/player/video.config";

export function VolumeInitializer() {
  const media = useMedia();
  const applied = useRef(false);
  useEffect(() => {
    if (!media || applied.current) return;
    applied.current = true;
    (media as { volume?: number }).volume = DEFAULT_VOLUME;
  }, [media]);
  return null;
}

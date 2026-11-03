import { useMedia } from "@videojs/react";
import { useEffect, useRef } from "react";

import { DEFAULT_VOLUME } from "@/config/player/video.config";
import { attemptSync } from "@hullperse/hp_utils/attempt";

export function VolumeInitializer() {
  const media = useMedia();
  const applied = useRef<boolean>(false);
  useEffect(() => {
    if (!media || applied.current) return;
    applied.current = true;

    const [, error] = attemptSync(() => ((media as { volume?: number }).volume = DEFAULT_VOLUME));
    if (error) return undefined;
  }, [media]);

  return null;
}

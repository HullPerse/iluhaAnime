import { useCallback } from "react";

import { OFFSET_LIMIT, OFFSET_STEP, OFFSET_STEP_FINE } from "@/config/settings/keybinds.config";
import { ignore } from "@/lib/core/promise.utils";
import { setMpvProperty } from "@/lib/player/playback.utils";
import { getMediaEntry, setMediaAudioOffset, setMediaSubOffset } from "@/store/media.store";
import { playbackAtoms } from "@/store/player.store";

export function usePlayerOffsets() {
  const nudgeOffset = useCallback((kind: "sub" | "audio", direction: number, fine: boolean) => {
    const current = playbackAtoms.path.get();
    if (!current) return;
    const entry = getMediaEntry(current);
    const base = (kind === "sub" ? entry?.subOffset : entry?.audioOffset) ?? 0;
    const step = fine ? OFFSET_STEP_FINE : OFFSET_STEP;
    const next = Math.max(
      -OFFSET_LIMIT,
      Math.min(OFFSET_LIMIT, Number((base + direction * step).toFixed(3)))
    );
    if (kind === "sub") setMediaSubOffset(current, next);
    else setMediaAudioOffset(current, next);
    if (kind === "sub") ignore(setMpvProperty("sub-delay", next));
    else ignore(setMpvProperty("audio-delay", next));
  }, []);

  const onResetDelays = useCallback(() => {
    const current = playbackAtoms.path.get();
    if (!current) return;
    setMediaSubOffset(current, 0);
    setMediaAudioOffset(current, 0);
    ignore(setMpvProperty("sub-delay", 0));
    ignore(setMpvProperty("audio-delay", 0));
  }, []);

  return { nudgeOffset, onResetDelays };
}

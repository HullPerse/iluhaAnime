import { useEffect, useRef } from "react";

import { streamApi } from "@/api/stream.api";
import { attempt } from "@/lib/core/attempt.utils";
import { findTrackByPreference } from "@/lib/torrent/tracks.utils";
import { ignore } from "@/lib/core/promise.utils";
import { markTrackSelected } from "@/store/player.store";
import { selectTrack } from "@/lib/player/playback.utils";
import type { MpvTrack } from "@/types/player/videoPlayer";
import type { StreamOpen } from "@/types/player/videoPlayer";

export function useStreamTrackPrefs(stream: StreamOpen | null, tracks: MpvTrack[]): void {
  const appliedRef = useRef<string>("");

  useEffect(() => {
    if (!stream || tracks.length === 0) return;
    const key = `${stream.mediaId}:${stream.episodeId}:${stream.variantId}:${stream.quality}`;
    if (appliedRef.current === key) return;
    appliedRef.current = key;
    let cancelled = false;
    const apply = async () => {
      const [prefs] = await attempt(streamApi.prefsGet(stream.sourceId, stream.mediaId));
      if (cancelled || !prefs) return;
      if (prefs.audioLang) {
        const audio = findTrackByPreference(tracks, "audio", prefs.audioLang);
        if (audio) {
          markTrackSelected("audio", audio.id);
          await selectTrack("audio", audio.id);
        }
      }
      if (cancelled) return;
      if (!prefs.subEnabled || prefs.subLang === "no") {
        markTrackSelected("sub", "no");
        await selectTrack("sub", "no");
        return;
      }
      const sub = prefs.subLang ? findTrackByPreference(tracks, "sub", prefs.subLang) : null;
      if (sub) {
        markTrackSelected("sub", sub.id);
        await selectTrack("sub", sub.id);
      }
    };
    ignore(apply());
    return () => {
      cancelled = true;
    };
  }, [stream, tracks]);
}

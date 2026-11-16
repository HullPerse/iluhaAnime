import { useEffect, useRef } from "react";

import { streamApi } from "@/api/stream.api";
import { attempt, reportBackgroundError } from "@hullperse/hp_utils/attempt";
import { findTrackByPreference } from "@/lib/torrent/tracks.utils";
import { ignore } from "@/lib/core/shared/promise.utils";
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
    let cancelled = false;
    const apply = async () => {
      const prefs = await streamApi.prefsGet(stream.sourceId, stream.mediaId);
      if (cancelled) return;
      if (!prefs) {
        appliedRef.current = key;
        return;
      }
      const selected: Array<["audio" | "sub", number | "no"]> = [];
      if (prefs.audioLang) {
        const audio = findTrackByPreference(tracks, "audio", prefs.audioLang);
        if (audio) {
          await selectTrack("audio", audio.id);
          selected.push(["audio", audio.id]);
        }
      }
      if (cancelled) return;
      if (!prefs.subEnabled || prefs.subLang === "no") {
        await selectTrack("sub", "no");
        selected.push(["sub", "no"]);
      } else {
        const sub = prefs.subLang ? findTrackByPreference(tracks, "sub", prefs.subLang) : null;
        if (sub) {
          await selectTrack("sub", sub.id);
          selected.push(["sub", sub.id]);
        }
      }
      if (cancelled) return;
      appliedRef.current = key;
      for (const [kind, id] of selected) markTrackSelected(kind, id);
    };
    ignore(
      attempt(apply()).then(([, failure]) => {
        if (failure) reportBackgroundError("player.track.restore", failure);
        return undefined;
      })
    );
    return () => {
      cancelled = true;
    };
  }, [stream, tracks]);
}

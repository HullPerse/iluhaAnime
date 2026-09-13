import type { TextTrackListLike, TextTrackLike } from "@videojs/media";
import { useMedia } from "@videojs/react";
import { useEffect, useState } from "react";

export function useCaptionTracks() {
  const media = useMedia();
  const [tracks, setTracks] = useState<TextTrackLike[]>([]);
  const [showingId, setShowingId] = useState<string | null>(null);

  useEffect(() => {
    if (!media) return;
    const list = (media as { textTracks?: TextTrackListLike }).textTracks;
    if (!list) return;
    const sync = () => {
      const subs = Array.from(list).filter(
        (track) => track.kind === "subtitles" || track.kind === "captions"
      );
      setTracks((prev) => {
        if (
          prev.length === subs.length &&
          prev.every((track, i) => track === subs[i] && track.mode === subs[i].mode)
        ) {
          return prev;
        }
        return [...subs];
      });
      setShowingId(subs.find((track) => track.mode === "showing")?.id ?? null);
    };
    sync();
    const onListEvent = () => sync();
    list.addEventListener?.("addtrack", onListEvent);
    list.addEventListener?.("removetrack", onListEvent);
    list.addEventListener?.("change", onListEvent);
    const retry = window.setTimeout(sync, 250);
    return () => {
      list.removeEventListener?.("addtrack", onListEvent);
      list.removeEventListener?.("removetrack", onListEvent);
      list.removeEventListener?.("change", onListEvent);
      window.clearTimeout(retry);
    };
  }, [media]);

  return { tracks, showingId };
}

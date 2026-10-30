import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useCallback } from "react";

import { streamApi } from "@/api/stream.api";
import { AUDIO_FILTERS, SUBTITLE_FILTERS } from "@/config/player/fileFilters.config";
import { useI18n } from "@/hooks/i18n.hook";
import { attempt, reportBackgroundError, withFallback } from "@/lib/core/attempt.utils";
import { ignore } from "@/lib/core/promise.utils";
import { addExternalAudio, addExternalSubtitle, selectTrack } from "@/lib/player/playback.utils";
import { emptyPrefs, withTrack } from "@/lib/player/streamPrefs.utils";
import { nextTrackId } from "@/lib/torrent/tracks.utils";
import { setMediaTrack } from "@/store/media.store";
import { markTrackSelected, playbackAtoms, streamSession } from "@/store/player.store";
import type { MpvTrack, StreamOpen } from "@/types/player/videoPlayer";

export function usePlayerTracks() {
  const { t } = useI18n();

  const rememberStreamTrack = useCallback(
    async (session: StreamOpen, kind: "audio" | "sub", language: string) => {
      const [loaded] = await attempt(streamApi.prefsGet(session.sourceId, session.mediaId));
      const base = loaded ?? emptyPrefs(session.sourceId, session.mediaId);
      const [failure] = await attempt(streamApi.prefsSave(withTrack(base, kind, language)));
      if (failure) reportBackgroundError("player.stream.prefs", failure);
    },
    []
  );

  const persistTrack = useCallback(
    (track: MpvTrack, kind: "audio" | "sub") => {
      const session = streamSession.get();
      if (session) {
        const language = track.lang?.trim() || track.title?.trim() || "";
        if (language) ignore(rememberStreamTrack(session, kind, language));
        return;
      }
      const current = playbackAtoms.path.get();
      if (current) setMediaTrack(current, kind, track.id);
    },
    [rememberStreamTrack]
  );

  const onSelectTrack = useCallback(
    (kind: "audio" | "sub") => (id: number | "no") => {
      const previous = playbackAtoms.tracks.get();
      markTrackSelected(kind, id);
      selectTrack(kind, id).catch(() => playbackAtoms.tracks.set(previous));
      if (typeof id === "number") {
        const track = playbackAtoms.tracks.get().find((entry) => entry.id === id);
        if (track) persistTrack(track, kind);
        return;
      }
      if (id === "no" && kind === "sub") {
        const session = streamSession.get();
        if (session) ignore(rememberStreamTrack(session, "sub", "no"));
      }
    },
    [persistTrack, rememberStreamTrack]
  );

  const onCycleTrack = useCallback(
    (kind: "audio" | "sub") => {
      const id = nextTrackId(playbackAtoms.tracks.get(), kind);
      if (id === null) return;
      onSelectTrack(kind)(id);
    },
    [onSelectTrack]
  );

  const pickFiles = useCallback(
    async (extensions: readonly string[]): Promise<string[]> => {
      const selection = await withFallback(
        openDialog({
          multiple: true,
          filters: [
            { name: t("player.media.tracks.external.filter"), extensions: [...extensions] },
          ],
        }),
        null
      );
      if (!selection) return [];
      return Array.isArray(selection) ? selection : [selection];
    },
    [t]
  );

  const onAddExternalSubtitle = useCallback(async () => {
    const files = await pickFiles(SUBTITLE_FILTERS);
    for (const file of files) await addExternalSubtitle(file);
  }, [pickFiles]);

  const onAddExternalAudio = useCallback(async () => {
    const files = await pickFiles(AUDIO_FILTERS);
    for (const file of files) await addExternalAudio(file);
  }, [pickFiles]);

  return { onSelectTrack, onCycleTrack, onAddExternalSubtitle, onAddExternalAudio };
}

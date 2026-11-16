import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useCallback } from "react";

import { AUDIO_FILTERS, SUBTITLE_FILTERS } from "@/config/player/fileFilters.config";
import { useI18n } from "@/hooks/i18n.hook";
import { attempt, reportBackgroundError, withFallback } from "@hullperse/hp_utils/attempt";
import { ignore } from "@/lib/core/shared/promise.utils";
import { addExternalAudio, addExternalSubtitle, selectTrack } from "@/lib/player/playback.utils";
import { rememberStreamPrefs } from "@/lib/player/streamPreferences.utils";
import { nextTrackId } from "@/lib/torrent/tracks.utils";
import { setMediaTrack } from "@/store/media.store";
import { markTrackSelected, playbackAtoms, streamSession } from "@/store/player.store";
import type { MpvTrack, StreamOpen } from "@/types/player/videoPlayer";

export function usePlayerTracks() {
  const { t } = useI18n();

  const rememberStreamTrack = useCallback(
    async (session: StreamOpen, kind: "audio" | "sub", language: string) => {
      await rememberStreamPrefs(
        session,
        kind === "audio"
          ? { audioLang: language }
          : { subLang: language, subEnabled: language !== "no" }
      );
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
    (kind: "audio" | "sub") => async (id: number | "no") => {
      const previous = playbackAtoms.tracks.get();
      const path = playbackAtoms.path.get();
      const session = streamSession.get();
      markTrackSelected(kind, id);
      const optimistic = playbackAtoms.tracks.get();
      const [, failure] = await attempt(selectTrack(kind, id));
      const current = playbackAtoms.path.get() === path && streamSession.get() === session;
      if (failure) {
        if (current && playbackAtoms.tracks.get() === optimistic) {
          playbackAtoms.tracks.set(previous);
        }
        reportBackgroundError("player.track.select", failure);
        return;
      }
      if (!current) return;
      if (typeof id === "number") {
        const track = previous.find((entry) => entry.type === kind && entry.id === id);
        if (track) persistTrack(track, kind);
        return;
      }
      if (id === "no" && kind === "sub") {
        if (session) ignore(rememberStreamTrack(session, "sub", "no"));
        else if (path) setMediaTrack(path, "sub", "no");
      }
    },
    [persistTrack, rememberStreamTrack]
  );

  const onCycleTrack = useCallback(
    (kind: "audio" | "sub") => {
      const id = nextTrackId(playbackAtoms.tracks.get(), kind);
      if (id === null) return;
      ignore(onSelectTrack(kind)(id));
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

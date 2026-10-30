import { AUDIO_FILTERS, SUBTITLE_FILTERS } from "@/config/player/fileFilters.config";
import { useTauriEvent } from "@/hooks/tauriEvent.hook";
import { reportBackgroundError } from "@/lib/core/attempt.utils";
import { ignore } from "@/lib/core/promise.utils";
import { addExternalAudio, addExternalSubtitle, appendFiles } from "@/lib/player/playback.utils";
import { settingsAtoms } from "@/store/settings.store";

const endsWithAny = (path: string, list: readonly string[]): boolean => {
  const lower = path.toLowerCase();
  return list.some((extension) => lower.endsWith(`.${extension.toLowerCase()}`));
};

export function usePlayerFileDrop(): void {
  useTauriEvent<{ paths: string[] }>(
    "tauri://drag-drop",
    (event) => {
      const extensions = settingsAtoms.videoExtensions.get();
      const files = event.payload.paths.filter((path) => endsWithAny(path, extensions));
      if (files.length > 0) ignore(appendFiles(files));
      for (const subtitle of event.payload.paths.filter((path) =>
        endsWithAny(path, SUBTITLE_FILTERS)
      )) {
        ignore(
          addExternalSubtitle(subtitle).catch((error: unknown) =>
            reportBackgroundError("player.subtitles.drop", error)
          )
        );
      }
      for (const audio of event.payload.paths.filter((path) => endsWithAny(path, AUDIO_FILTERS))) {
        ignore(
          addExternalAudio(audio).catch((error: unknown) =>
            reportBackgroundError("player.audio.drop", error)
          )
        );
      }
    },
    { errorTag: "drag-drop" }
  );
}

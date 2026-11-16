import { invokeValidated } from "@/lib/core/system/invoke.utils";
import { SidecarTrackListSchema } from "@/schemas/fileIndex.schema";
import { attempt, reportBackgroundError } from "@hullperse/hp_utils/attempt";
import { fileNameFromPath, mediaFileExtension } from "@hullperse/hp_utils/media/parse";
import { addExternalAudioAuto, addExternalSubtitleAuto } from "@/lib/player/playback.utils";
import { playbackAtoms } from "@/store/player.store";
import { settingsAtoms } from "@/store/settings.store";

interface SidecarTrack {
  path: string;
  name: string;
  kind: "audio" | "sub";
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").toLowerCase();
}

export async function loadSidecarTracks(
  videoPath: string,
  isCurrent: () => boolean = () => playbackAtoms.path.get() === videoPath
): Promise<void> {
  if (!settingsAtoms.autoLoadSidecarTracks.get()) return;
  if (!mediaFileExtension(fileNameFromPath(videoPath))) return;

  const [tracks, error] = await attempt(
    invokeValidated<SidecarTrack[]>("scan_sidecar_tracks", SidecarTrackListSchema, {
      path: videoPath,
      audioExtensions: settingsAtoms.audioExtensions.get(),
      subtitleExtensions: settingsAtoms.subtitleExtensions.get(),
      subfolders: settingsAtoms.sidecarScanSubfolders.get(),
    })
  );
  if (error) {
    reportBackgroundError("player.sidecar.scan", error);
    return;
  }
  if (!isCurrent()) return;

  const loaded = new Set(
    playbackAtoms.tracks
      .get()
      .map((track) => track["external-filename"])
      .filter((path): path is string => typeof path === "string")
      .map(normalizePath)
  );
  for (const track of tracks) {
    if (!isCurrent()) return;
    const key = normalizePath(track.path);
    if (loaded.has(key)) continue;
    loaded.add(key);
    const [, addError] = await attempt(
      track.kind === "sub"
        ? addExternalSubtitleAuto(track.path, videoPath)
        : addExternalAudioAuto(track.path, videoPath)
    );
    if (addError) reportBackgroundError("player.sidecar.add", addError);
  }
}

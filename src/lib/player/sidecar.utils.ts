import { invokeTyped } from "@/lib/core/system/invoke.utils";
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

export async function loadSidecarTracks(videoPath: string): Promise<void> {
  if (!settingsAtoms.autoLoadSidecarTracks.get()) return;
  if (!mediaFileExtension(fileNameFromPath(videoPath))) return;

  const [tracks, error] = await attempt(
    invokeTyped<SidecarTrack[]>("scan_sidecar_tracks", {
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

  const loaded = new Set(
    playbackAtoms.tracks
      .get()
      .map((track) => track["external-filename"])
      .filter((path): path is string => typeof path === "string")
      .map(normalizePath)
  );
  for (const track of tracks) {
    const key = normalizePath(track.path);
    if (loaded.has(key)) continue;
    loaded.add(key);
    const [, addError] = await attempt(
      track.kind === "sub" ? addExternalSubtitleAuto(track.path) : addExternalAudioAuto(track.path)
    );
    if (addError) reportBackgroundError("player.sidecar.add", addError);
  }
}

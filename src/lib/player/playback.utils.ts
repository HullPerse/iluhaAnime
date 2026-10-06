import { PLAYER_PROFILES } from "@/config/player/profiles.config";
import { attempt } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { clamp } from "@/lib/utils/math.utils";
import type {
  EndOfFileMode,
  HwdecMode,
  PlayerOpenRequest,
  PlayerProfileId,
  PlayerSettings,
  SeekMode,
  VideoMarginRatio,
  WatchState,
} from "@/types/videoPlayer";

export function rotateQueue(files: string[], startIndex: number): string[] {
  if (files.length === 0) return files;
  const index = ((startIndex % files.length) + files.length) % files.length;
  return [...files.slice(index), ...files.slice(0, index)];
}

export function parseTimecode(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":");
  const numbers = parts.map((part) => Number(part.replace(",", ".")));
  if (numbers.some((part) => !Number.isFinite(part) || part < 0)) return null;
  let seconds = 0;
  for (const part of numbers) seconds = seconds * 60 + part;
  return seconds;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function toMpvColor(color: string): string {
  return HEX_COLOR.test(color) ? color : "#ffffff";
}

function withAlpha(color: string, opacity: number): string {
  const alpha = Math.round((clamp(opacity, 0, 100) / 100) * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${alpha}${color.slice(1)}`;
}

export interface MpvInitParams {
  volume: number;
  hwdec: HwdecMode;
  settings: PlayerSettings;
}

export function transformOptions(settings: PlayerSettings): Record<string, unknown> {
  const options: Record<string, unknown> = {};

  const rotation = ((settings.rotation % 360) + 360) % 360;
  options["video-rotate"] = rotation;

  const filters: string[] = [];
  if (settings.flipH) filters.push("hflip");
  if (settings.flipV) filters.push("vflip");
  const blur = clamp(settings.blur, 0, 20);
  if (blur > 0) filters.push(`lavfi=[gblur=sigma=${blur}]`);
  const grayscale = clamp(settings.grayscale, 0, 100);
  if (grayscale > 0) filters.push(`lavfi=[hue=s=${(100 - grayscale) / 100}]`);
  const sepia = clamp(settings.sepia, 0, 100) / 100;
  if (sepia > 0) {
    const mix = (tint: number, identity: number) =>
      (sepia * tint + (1 - sepia) * identity).toFixed(3);
    const matrix = [
      `rr=${mix(0.393, 1)}`,
      `rg=${mix(0.769, 0)}`,
      `rb=${mix(0.189, 0)}`,
      `gr=${mix(0.349, 0)}`,
      `gg=${mix(0.686, 1)}`,
      `gb=${mix(0.168, 0)}`,
      `br=${mix(0.272, 0)}`,
      `bg=${mix(0.534, 0)}`,
      `bb=${mix(0.131, 1)}`,
    ].join(":");
    filters.push(`lavfi=[colorchannelmixer=${matrix}]`);
  }
  if (filters.length > 0) options.vf = filters.join(",");
  else options.vf = "";

  options["video-zoom"] = Number(Math.log2(clamp(settings.zoom, 0.1, 3)).toFixed(4));

  options.keepaspect = settings.aspectRatio !== "fill";

  options.brightness = clamp(Math.round(settings.brightness - 100), -100, 100);
  options.contrast = clamp(Math.round(settings.contrast - 100), -100, 100);
  options.saturation = clamp(Math.round(settings.saturation - 100), -100, 100);
  options.hue = clamp(Math.round(settings.hue), -100, 100);

  options["sub-font-size"] = Math.round((settings.subFontSize / 18) * 55);
  options["sub-font"] = settings.subFontFamily;
  options["sub-color"] = toMpvColor(settings.subColor);
  options["sub-back-color"] = withAlpha(toMpvColor(settings.subBgColor), settings.subBgOpacity);

  return options;
}

export function buildInitialOptions(params: MpvInitParams): Record<string, unknown> {
  return {
    hwdec: params.hwdec,
    volume: Math.round(clamp(params.volume, 0, 1) * 100),
    mute: false,
    ...transformOptions(params.settings),
  };
}

export function profileOptions(
  profile: PlayerProfileId
): Record<string, string | number | boolean> {
  return { ...PLAYER_PROFILES[profile].options };
}

export async function applyPlayerProfile(profile: PlayerProfileId): Promise<void> {
  const options = profileOptions(profile);
  for (const [name, value] of Object.entries(options)) {
    await setMpvProperty(name, value);
  }
}

export function hdrOptions(settings: PlayerSettings): Record<string, unknown> {
  if (settings.toneMap === "auto") {
    return {
      "tone-mapping": "auto",
      "target-peak": "auto",
      "hdr-compute-peak": "auto",
    };
  }
  return {
    "tone-mapping": "clip",
    "target-peak": String(clamp(settings.targetPeak, 100, 10_000)),
    "hdr-compute-peak": settings.hdrComputePeak ? "yes" : "no",
  };
}

export async function applyHdrOptions(settings: PlayerSettings): Promise<void> {
  const options = hdrOptions(settings);
  for (const [name, value] of Object.entries(options)) {
    await setMpvProperty(name, value);
  }
}

export function colorOptions(settings: PlayerSettings): Record<string, unknown> {
  return {
    "target-prim": settings.targetPrim,
    "target-trc": settings.targetTrc,
  };
}

export async function applyColorOptions(settings: PlayerSettings): Promise<void> {
  const options = colorOptions(settings);
  for (const [name, value] of Object.entries(options)) {
    await setMpvProperty(name, value);
  }
}

export function audioOptions(settings: PlayerSettings): Record<string, unknown> {
  return { af: settings.loudnorm ? "loudnorm" : "" };
}

export async function applyAudioOptions(settings: PlayerSettings): Promise<void> {
  const options = audioOptions(settings);
  for (const [name, value] of Object.entries(options)) {
    await setMpvProperty(name, value);
  }
}

export async function openPlayer(files: string[], resume?: number): Promise<void> {
  await invokeTyped("player_open", {
    files,
    resume,
  });
}

export async function takePendingOpen(): Promise<PlayerOpenRequest | null> {
  return invokeTyped<PlayerOpenRequest | null>("player_take_pending_open");
}

export async function initPlayer(initialOptions: Record<string, unknown>): Promise<string> {
  return invokeTyped<string>("player_init", { initialOptions });
}

export async function destroyPlayer(): Promise<void> {
  await invokeTyped("player_destroy");
}

export async function closePlayerWindow(): Promise<void> {
  await invokeTyped("player_close_window");
}

export async function loadQueue(files: string[], resume?: number): Promise<void> {
  await invokeTyped("player_load", { files, resume });
}

async function runMpvCommand(name: string, args: unknown[] = []): Promise<void> {
  await invokeTyped("player_command", { name, args });
}

export async function setMpvProperty(name: string, value: unknown): Promise<void> {
  await invokeTyped("player_set_property", { name, value });
}

async function getMpvProperty<T>(
  name: string,
  format: "double" | "flag" | "int64" | "string"
): Promise<T | null> {
  return invokeTyped<T | null>("player_get_property", { name, format });
}

export async function setVideoMarginRatio(ratio: VideoMarginRatio): Promise<void> {
  await invokeTyped("player_set_video_margin_ratio", {
    bottom: ratio.bottom,
    left: ratio.left,
    right: ratio.right,
    top: ratio.top,
  });
}

export async function setEofMode(mode: EndOfFileMode): Promise<void> {
  await invokeTyped("player_eof_mode", { mode });
}

export async function saveWatch(path: string, state: WatchState): Promise<void> {
  await invokeTyped("player_save_watch", { path, state });
}

export async function loadWatch(path: string): Promise<WatchState | null> {
  return invokeTyped<WatchState | null>("player_load_watch", { path });
}

export function seekTo(seconds: number, mode: SeekMode = "keyframes"): Promise<void> {
  const precision = mode === "exact" ? "exact" : "keyframes";
  return runMpvCommand("seek", [seconds, `absolute+${precision}`]);
}

export function setPaused(paused: boolean): Promise<void> {
  return setMpvProperty("pause", paused);
}

export function setSpeed(speed: number): Promise<void> {
  return setMpvProperty("speed", speed);
}

export function selectTrack(kind: "audio" | "sub", id: number | "no" | "auto"): Promise<void> {
  return setMpvProperty(kind === "audio" ? "aid" : "sid", String(id));
}

export function playPlaylistIndex(index: number): Promise<void> {
  return runMpvCommand("playlist-play-index", [index]);
}

export function removePlaylistIndex(index: number): Promise<void> {
  return runMpvCommand("playlist-remove", [index]);
}

export function movePlaylistIndex(from: number, to: number): Promise<void> {
  return runMpvCommand("playlist-move", [from, to]);
}

export async function appendFiles(files: string[]): Promise<void> {
  for (const file of files) {
    await runMpvCommand("loadfile", [file, "append-play"]);
  }
}

// "append" queues without starting playback; "append-play" would auto-start when idle.
export async function appendFilesQuiet(files: string[]): Promise<void> {
  for (const file of files) {
    await runMpvCommand("loadfile", [file, "append"]);
  }
}

export interface PlaylistEntry {
  index: number;
  filename: string;
  title: string;
}

export async function readPlaylistEntries(): Promise<PlaylistEntry[]> {
  return invokeTyped<PlaylistEntry[]>("player_playlist_entries");
}

export interface VideoCardInfo {
  path: string;
  duration: number;
  size: number;
}

export async function readVideoCard(path: string): Promise<VideoCardInfo> {
  return invokeTyped<VideoCardInfo>("get_video_card", { path });
}

export function startFrameStep(forward: boolean): Promise<void> {
  return runMpvCommand(forward ? "frame-step" : "frame-back-step");
}

export function nextFile(): Promise<void> {
  return runMpvCommand("playlist-next");
}

export function previousFile(): Promise<void> {
  return runMpvCommand("playlist-prev");
}

export function addExternalSubtitle(path: string): Promise<void> {
  return runMpvCommand("sub-add", [path, "select"]);
}

export function addExternalAudio(path: string): Promise<void> {
  return runMpvCommand("audio-add", [path, "select"]);
}

export async function readPath(): Promise<string> {
  const [value] = await attempt(getMpvProperty<string>("path", "string"));
  return typeof value === "string" ? value : "";
}

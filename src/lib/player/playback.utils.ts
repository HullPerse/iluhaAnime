import { PLAYER_PROFILES } from "@/config/player/profiles.config";
import { fileNameFromPath, isTrackFileName } from "@/lib/media/parse.utils";
import { attempt, reportBackgroundError } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { clamp } from "@/lib/utils/math.utils";
import { joinMediaPath } from "@/lib/utils/media.utils";
import type {
  EndOfFileMode,
  HwdecMode,
  PlayerOpenRequest,
  PlayerProfileId,
  PlayerSettings,
  PlaylistInsert,
  PlaylistWatch,
  SeekMode,
  VideoMarginRatio,
  WatchState,
} from "@/types/videoPlayer";

export function rotateQueue(files: string[], startIndex: number): string[] {
  if (files.length === 0) return files;
  const index = ((startIndex % files.length) + files.length) % files.length;
  return [...files.slice(index), ...files.slice(0, index)];
}

const PLAYLIST_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export interface TorrentPlaylistSource {
  name: string;
  fullPath?: string;
  completed: boolean;
  exists: boolean;
}

export function buildTorrentPlayerPlaylist(
  files: TorrentPlaylistSource[],
  saveDir: string,
  clickedFullPath: string,
  trackExts?: Set<string>,
  extraFullPaths?: string[]
): { files: string[]; startIndex: number } | null {
  const paths: string[] = [];
  for (const file of files) {
    if (!file.completed || !file.exists) continue;
    const full = file.fullPath ?? joinMediaPath(saveDir, file.name);
    if (trackExts && isTrackFileName(fileNameFromPath(full), trackExts)) continue;
    paths.push(full);
  }
  if (extraFullPaths) {
    for (const full of extraFullPaths) {
      if (trackExts && isTrackFileName(fileNameFromPath(full), trackExts)) continue;
      paths.push(full);
    }
  }
  const deduped = [...new Set(paths)].sort((a, b) => PLAYLIST_COLLATOR.compare(a, b));
  const startIndex = deduped.indexOf(clickedFullPath);
  if (deduped.length === 0 || startIndex === -1) return null;
  return { files: deduped, startIndex };
}

const TIMECODE_INT = /^\d+$/;
const TIMECODE_LAST = /^\d+([.,]\d+)?$/;

export function parseTimecode(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":");
  if (parts.length > 3) return null;
  const last = parts.at(-1);
  if (!last || !TIMECODE_LAST.test(last)) return null;
  for (const part of parts.slice(0, -1)) {
    if (!TIMECODE_INT.test(part)) return null;
  }
  const numbers = parts.map((part) => Number(part.replace(",", ".")));
  if (numbers.some((part) => !Number.isFinite(part))) return null;
  const ranged = parts.length > 1 ? numbers.slice(-2) : [];
  if (ranged.some((part) => part >= 60)) return null;
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

  options.brightness = clamp(Math.round(settings.brightness - 100), -100, 100);
  options.contrast = clamp(Math.round(settings.contrast - 100), -100, 100);
  options.saturation = clamp(Math.round(settings.saturation - 100), -100, 100);
  options.hue = clamp(Math.round(settings.hue), -100, 100);

  options["sub-font-size"] = Math.round((settings.subFontSize / 18) * 55);
  options["sub-font"] = settings.subFontFamily;
  options["sub-color"] = toMpvColor(settings.subColor);
  options["sub-back-color"] = withAlpha(toMpvColor(settings.subBgColor), settings.subBgOpacity);
  options["sub-use-margins"] = false;
  options["sub-ass-force-margins"] = false;

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

export function diffOptions(
  previous: Record<string, unknown>,
  next: Record<string, unknown>
): Record<string, unknown> {
  const changed: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(next)) {
    if (!Object.is(previous[name], value)) changed[name] = value;
  }
  return changed;
}

export async function applyProperties(options: Record<string, unknown>): Promise<string[]> {
  const names = Object.keys(options);
  const settled = await Promise.allSettled(
    Object.entries(options).map(([name, value]) =>
      setMpvProperty(name, value).then(
        () => undefined,
        (error: unknown) => {
          throw new Error(`set ${name} failed: ${String(error)}`);
        }
      )
    )
  );
  const failed: string[] = [];
  settled.forEach((result, index) => {
    if (result.status === "rejected") {
      failed.push(names[index]);
      reportBackgroundError("player.settings.property", result.reason);
    }
  });
  return failed;
}

export async function applyPlayerProfile(profile: PlayerProfileId): Promise<void> {
  await applyProperties(profileOptions(profile));
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
  await applyProperties(hdrOptions(settings));
}

export function colorOptions(settings: PlayerSettings): Record<string, unknown> {
  return {
    "target-prim": settings.targetPrim,
    "target-trc": settings.targetTrc,
  };
}

export async function applyColorOptions(settings: PlayerSettings): Promise<void> {
  await applyProperties(colorOptions(settings));
}

export function audioOptions(settings: PlayerSettings): Record<string, unknown> {
  return { af: settings.loudnorm ? "loudnorm" : "" };
}

export async function applyAudioOptions(settings: PlayerSettings): Promise<void> {
  await applyProperties(audioOptions(settings));
}

export async function applyBatchProperties(
  properties: Record<string, unknown>
): Promise<void> {
  const entries = Object.entries(properties);
  await invokeTyped("player_apply_batch", {
    properties: entries.map(([name, value]) => [name, value]),
  });
}

export async function openPlayer(
  files: string[],
  resume?: number,
  startIndex?: number,
  watch?: PlaylistWatch
): Promise<void> {
  await invokeTyped("player_open", {
    files,
    resume,
    startIndex,
    watch,
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

export async function loadQueue(
  files: string[],
  resume?: number,
  startIndex?: number
): Promise<void> {
  await invokeTyped("player_load", { files, resume, startIndex });
}

async function runMpvCommand(name: string, args: unknown[] = []): Promise<void> {
  await invokeTyped("player_command", { name, args });
}

export async function runPlayerCommand(name: string, args: string[] = []): Promise<void> {
  await runMpvCommand(name, args);
}

export async function playerShaderPath(id: string): Promise<string> {
  return invokeTyped<string>("player_shader_path", { id });
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

export interface FilePlaybackState {
  speed: number;
  subDelay: number;
  audioDelay: number;
  audioTrack?: number;
  subtitleTrack?: number;
}

export async function applyFileState(state: FilePlaybackState): Promise<void> {
  await invokeTyped("player_apply_file_state", {
    speed: state.speed,
    subDelay: state.subDelay,
    audioDelay: state.audioDelay,
    audioTrack: state.audioTrack ?? null,
    subtitleTrack: state.subtitleTrack ?? null,
  });
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
  if (files.length === 0) return;
  await invokeTyped("player_append_files", { files, mode: "append-play" });
}

export async function appendFilesQuiet(files: string[]): Promise<void> {
  if (files.length === 0) return;
  await invokeTyped("player_append_files", { files, mode: "append" });
}

export async function insertPlaylistFiles(items: PlaylistInsert[]): Promise<void> {
  if (items.length === 0) return;
  await invokeTyped("player_insert_files", { items });
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

export async function readDuration(): Promise<number> {
  const [value] = await attempt(getMpvProperty<number>("duration", "double"));
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export async function readPlaylistIndex(): Promise<number> {
  const [value] = await attempt(getMpvProperty<number>("playlist-pos", "int64"));
  return typeof value === "number" && Number.isFinite(value) ? value : -1;
}

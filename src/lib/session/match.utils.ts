import { LOBBY_DURATION_TOLERANCE_SEC } from "@/config/lobby/common.config";
import { formatBytes } from "@/lib/utils/bytes.utils";
import { formatClock } from "@/lib/utils/time.utils";
import type {
  CompatibilityDelta,
  CompatibilityReport,
  ItemReport,
  MatchLevel,
  MediaIdentity,
  MediaPlanItem,
  VideoInfo,
} from "@/types/session";

const FPS_TOLERANCE = 0.01;

function videoMatches(host: VideoInfo, local: VideoInfo): boolean {
  return (
    host.codec === local.codec &&
    host.width === local.width &&
    host.height === local.height &&
    Math.abs(host.fps - local.fps) <= FPS_TOLERANCE
  );
}

function videoDeltas(host: VideoInfo, local: VideoInfo): CompatibilityDelta[] {
  const deltas: CompatibilityDelta[] = [];
  if (host.codec !== local.codec) {
    deltas.push({ field: "codec", host: host.codec, local: local.codec });
  }
  const hostRes = `${host.width}x${host.height}`;
  const localRes = `${local.width}x${local.height}`;
  if (hostRes !== localRes) {
    deltas.push({ field: "resolution", host: hostRes, local: localRes });
  }
  if (Math.abs(host.fps - local.fps) > FPS_TOLERANCE) {
    deltas.push({
      field: "fps",
      host: host.fps.toFixed(3),
      local: local.fps.toFixed(3),
    });
  }
  if (host.bitrate !== local.bitrate) {
    deltas.push({
      field: "bitrate",
      host: `${Math.round(host.bitrate / 1000)} kbps`,
      local: `${Math.round(local.bitrate / 1000)} kbps`,
    });
  }
  return deltas;
}

// Only exact/compatible open gate.
export function analyzeCompatibility(
  host: MediaIdentity,
  local: MediaIdentity
): CompatibilityReport {
  if (host.sha256 === local.sha256) return { level: "exact", deltas: [] };
  const deltas: CompatibilityDelta[] = [];
  if (host.size !== local.size) {
    deltas.push({
      field: "size",
      host: formatBytes(host.size),
      local: formatBytes(local.size),
    });
  }
  if (Math.abs(host.duration - local.duration) > 0.001) {
    deltas.push({
      field: "duration",
      host: formatClock(host.duration),
      local: formatClock(local.duration),
    });
  }
  const hostVideo = host.video ?? null;
  const localVideo = local.video ?? null;
  if (hostVideo && localVideo) deltas.push(...videoDeltas(hostVideo, localVideo));
  const durationClose =
    Math.abs(host.duration - local.duration) <= LOBBY_DURATION_TOLERANCE_SEC;
  const videoSame =
    hostVideo === null || localVideo === null
      ? hostVideo === localVideo
      : videoMatches(hostVideo, localVideo);
  const level: MatchLevel = durationClose
    ? videoSame
      ? "compatible"
      : "risky"
    : "incompatible";
  return { level, deltas };
}

export function itemReports(
  plan: MediaPlanItem[],
  matches: Record<string, MatchLevel>
): ItemReport[] {
  return plan.map((item) => {
    const level = matches[item.itemId];
    return {
      itemId: item.itemId,
      present: level === "exact" || level === "compatible",
      verified: level === "exact",
    };
  });
}

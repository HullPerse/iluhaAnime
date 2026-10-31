import type { StreamQuality } from "@/types/player/stream";

export const STREAM_QUALITIES = ["360p", "480p", "720p", "1080p", "1440p", "2160p"] as const;

export const DEFAULT_STREAM_QUALITY: StreamQuality = "1080p";

export function streamQualityLabel(quality: StreamQuality): string {
  return quality === "2160p" ? "2160p (4K)" : quality;
}

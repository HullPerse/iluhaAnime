import type { StreamQuality } from "@/types/player/stream";

/** Qualities the stream settings select offers, lowest first. */
export const STREAM_QUALITIES = ["360p", "480p", "720p", "1080p", "1440p", "2160p"] as const;

/** The quality a title without a remembered choice starts at. */
export const DEFAULT_STREAM_QUALITY: StreamQuality = "1080p";

/** The numeric label, with the 4K row spelled out once. */
export function streamQualityLabel(quality: StreamQuality): string {
  return quality === "2160p" ? "2160p (4K)" : quality;
}

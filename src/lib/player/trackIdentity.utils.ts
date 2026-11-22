import type { MpvTrack } from "@/types/player/videoPlayer";

function normalize(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().replaceAll("\\", "/").replace(/\s+/g, " ");
}

/**
 * Stable identity for a track. External tracks use their file path, because
 * mpv reassigns numeric ids when the sidecar set changes. Embedded tracks use
 * the metadata that survives a reload of the same file.
 */
export function trackIdentity(track: MpvTrack): string {
  const external = normalize(track["external-filename"]);

  if (external) return `external:${track.type}:${external}`;
  const metadata = [
    normalize(track.lang),
    normalize(track.title),
    normalize(track.codec),
    normalize(track["demux-channels"]),
    track.forced ? "forced" : "",
  ]
    .filter(Boolean)
    .join("|");

  return metadata ? `${track.type}:${metadata}` : "";
}

export function resolveTrackId(
  tracks: MpvTrack[],
  kind: "audio" | "sub",
  id: number | undefined,
  identity: string | undefined
): number | undefined {
  if (identity) {
    const match = tracks.find((track) => track.type === kind && trackIdentity(track) === identity);

    if (match) return match.id;
  }

  return id;
}

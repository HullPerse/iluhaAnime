import type { MpvTrack } from "@/types/videoPlayer";

import { languageName, normalizeLangCode } from "./language.utils";

export interface TrackDisplay {
  id: number;
  main: string;
  language: string;
}

function langCodeOf(track: MpvTrack): string {
  const raw = track.lang?.trim() ?? "";
  if (!raw || normalizeLangCode(raw) === "") return "";
  return raw;
}

function channelsOf(track: MpvTrack): string {
  if (track.type !== "audio") return "";
  const raw = track["demux-channels"]?.trim() ?? "";
  if (!raw || raw.toLowerCase().startsWith("unknown")) return "";
  return raw;
}

export function trackMainLabel(track: MpvTrack): string {
  const parts: string[] = [];
  const code = langCodeOf(track);
  const title = track.title?.trim() ?? "";
  if (title) {
    const withCode =
      code && !title.toLowerCase().includes(code.toLowerCase()) ? `${title} [${code}]` : title;
    parts.push(withCode);
  } else if (code) {
    parts.push(code);
  }
  const codec = track.codec?.trim() ?? "";
  if (codec) parts.push(codec.toUpperCase());
  const channels = channelsOf(track);
  if (channels) parts.push(channels);
  const flags: string[] = [];
  if (track.default) flags.push("[default]");
  if (track.forced) flags.push("[forced]");
  if (track.external) flags.push("[external]");
  const main = parts.length > 0 ? parts.join(" - ") : `#${track.id}`;
  return flags.length > 0 ? `${main} ${flags.join(" ")}` : main;
}

export function trackLanguageName(track: MpvTrack): string {
  return languageName(track.lang);
}

export function toTrackDisplay(track: MpvTrack): TrackDisplay {
  return { id: track.id, main: trackMainLabel(track), language: trackLanguageName(track) };
}

export function trackLabel(track: MpvTrack): string {
  const display = toTrackDisplay(track);
  return display.language ? `${display.main} - ${display.language}` : display.main;
}

export function sortTracksByLanguage(tracks: MpvTrack[]): MpvTrack[] {
  return tracks
    .map((track, index) => ({ index, track }))
    .sort((left, right) => {
      const leftName = trackLanguageName(left.track);
      const rightName = trackLanguageName(right.track);
      if (!leftName && !rightName) return left.index - right.index;
      if (!leftName) return 1;
      if (!rightName) return -1;
      const compared = leftName.localeCompare(rightName, "en");
      return compared !== 0 ? compared : left.index - right.index;
    })
    .map((entry) => entry.track);
}

import type { VideoStreamInfo } from "@/types";

export interface TrackPreferences {
  preferredAudioLangs: string[];
  preferredAudioPatterns: string[];
  preferredSubLangs: string[];
  preferredSubPatterns: string[];
  preferForcedSubs: boolean;
  fallbackToFirstTrack: boolean;
}

function matchPattern(name: string, pattern: string): boolean {
  const n = name.toLowerCase();
  const p = pattern.trim().toLowerCase();
  if (p.startsWith("!")) {
    return !n.includes(p.slice(1));
  }
  return n.includes(p);
}

function scorePatterns(name: string, patterns: string[]): number {
  let score = 0;
  for (const p of patterns) {
    const parts = p.split("+").map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) continue;
    let matched = true;
    for (const part of parts) {
      if (!matchPattern(name, part)) {
        matched = false;
        break;
      }
    }
    if (matched) score += 50;
  }
  return score;
}

export function selectBestTrack(
  tracks: VideoStreamInfo[],
  prefs: TrackPreferences,
  type: "audio" | "subtitle",
): number | null {
  const langs = type === "audio" ? prefs.preferredAudioLangs : prefs.preferredSubLangs;
  const patterns = type === "audio" ? prefs.preferredAudioPatterns : prefs.preferredSubPatterns;
  const langSet = new Set(langs.map((l) => l.toLowerCase()));

  let bestScore = -Infinity;
  let bestIdx: number | null = null;

  for (const t of tracks) {
    let score = 0;
    const name = `${t.language ?? ""} ${t.title ?? ""} ${t.codec_name}`.toLowerCase();

    if (t.language && langSet.has(t.language.toLowerCase())) {
      score += 50;
    }

    score += scorePatterns(name, patterns);

    if (t.is_default) score += 10;
    if (t.is_forced && prefs.preferForcedSubs && type === "subtitle") score += 20;

    if (t.is_comment) score -= 1000;

    if (score > bestScore) {
      bestScore = score;
      bestIdx = t.index;
    }
  }

  if (bestScore > 0) return bestIdx;

  if (prefs.fallbackToFirstTrack) {
    const firstNonComment = tracks.find((t) => !t.is_comment);
    return firstNonComment?.index ?? tracks[0]?.index ?? null;
  }

  return null;
}

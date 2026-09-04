const QUALITY_RE =
  /(?:^|[\s._\-[\]()])(2160p|1440p|1080p|720p|576p|480p|4k|8k)(?:$|[\s._\-[\]()])/i;
const CODEC_RE = /(?:^|[\s._\-[\]])(x26[45]|h[ ._-]?26[45]|av1|hevc|vp9|avc)(?:$|[\s._\-[\]])/i;

function withoutExtension(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

function normalizeTitle(value: string): string {
  return value
    .replaceAll(/[._]+/g, " ")
    .replaceAll(/\[[^\]]*\]|\([^)]*\)/g, " ")
    .replace(/\b(?:S\d{1,2}E\d{1,4}|\d{1,2}x\d{1,4}|E\d{1,4})\b.*$/i, "")
    .replaceAll(/\s+/g, " ")
    .replace(/[\s-]+$/, "")
    .trim();
}

export function parseVaultFilename(name: string): {
  title: string;
  season: number;
  episode: number | null;
  quality: string | null;
  codec: string | null;
} {
  const stem = withoutExtension(name);
  const seasonEpisode = stem.match(/S(\d{1,2})E(\d{1,4})/i);
  const altEpisode = stem.match(/(?:^|[\s._\-[\]])E?(\d{1,4})(?:$|[\s._\-[\]])/i);
  const season = seasonEpisode ? Number(seasonEpisode[1]) : 1;
  const episode = seasonEpisode
    ? Number(seasonEpisode[2])
    : altEpisode
      ? Number(altEpisode[1])
      : null;
  const quality = stem.match(QUALITY_RE)?.[1] ?? null;
  const codec =
    stem
      .match(CODEC_RE)?.[1]
      ?.replaceAll(/[ ._-]/g, "")
      .toLowerCase() ?? null;
  return { codec, episode, quality, season, title: normalizeTitle(stem) };
}

const RELEASE_TOKENS = new Set(
  [
    "web",
    "dl",
    "webdl",
    "web-dl",
    "webrip",
    "bdrip",
    "bdremux",
    "remux",
    "bluray",
    "blu-ray",
    "hdtv",
    "dvdrip",
    "hdcam",
    "hevc",
    "x264",
    "x265",
    "h264",
    "h265",
    "av1",
    "aac",
    "flac",
    "ddp",
    "ddp51",
    "dts",
    "ac3",
    "opus",
    "ma10p",
    "10bit",
    "10bits",
    "8bit",
    "hi10p",
    "dual",
    "multi",
    "gekijouban",
    "rus",
    "eng",
    "jpn",
    "sub",
    "dub",
    "uncensored",
    "censored",
    "amzn",
    "nf",
    "cr",
    "kp",
  ].map((token) => token.toLowerCase())
);

const QUALITY_RE = /^\d{3,4}p$/i;
const RESOLUTION_RE = /^\d{3,4}x\d{3,4}$/i;
const TRAILING_GROUP_RE = /-[A-Z0-9]{2,}$/;
const SEASON_LIKE_RE = /^(s\d{1,2}|tv-?\d*|part-?\d*|season-?\d*)$/i;

function isReleaseToken(token: string): boolean {
  const lower = token.toLowerCase();
  return (
    RELEASE_TOKENS.has(lower) ||
    RELEASE_TOKENS.has(lower.replaceAll("-", "")) ||
    QUALITY_RE.test(token) ||
    RESOLUTION_RE.test(token)
  );
}

function stripBracketGroups(query: string): string {
  return query.replaceAll(/\[[^\]]*\]/g, " ").replaceAll(/\{[^}]*\}/g, " ");
}

export function stripReleaseNoise(query: string): string {
  let rest = stripBracketGroups(query);
  rest = rest.replaceAll(/[._]+/g, " ");
  rest = rest.replace(TRAILING_GROUP_RE, " ");
  const kept: string[] = [];
  for (const token of rest.split(/\s+/)) {
    if (!token) continue;
    if (isReleaseToken(token)) continue;
    if (SEASON_LIKE_RE.test(token)) {
      kept.push(token);
      continue;
    }
    kept.push(token);
  }
  return kept.join(" ").replace(/\s+/g, " ").trim();
}

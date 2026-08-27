const EXTENSION = /\.(mp4|mkv|avi|webm|mov|ts|m4v|mpg|mpeg|wmv|flv)$/i;

const BRACKET_GROUPS = /\[[^\]]*\]/g;

const QUALITY_TAGS =
  /\(\s*(?:1080p|720p|480p|2160p|4k|8k|bd|bdrip|web|webrip|web-?dl|bluray|blu-?ray|dvd|dvdrip|hdtv|tv|hevc|avc|x264|x265|h264|h265|aac|flac|opus|10bit|8bit|hi10p|ntsc|pal)\s*\)/gi;

const TRAILING_QUALITY =
  /\s*[- ]\s*(?:1080p|720p|480p|2160p|4k|8k|hevc|avc|x264|x265|h264|h265|aac|flac|opus|10bit|8bit|hi10p|webrip|web-?dl|dvdrip|bluray|hdtv)\s*$/gi;

const STANDALONE_QUALITY =
  /\b(?:1080p|720p|480p|2160p|4k|8k|hevc|avc|x264|x265|h264|h265|aac|flac|opus|10bit|8bit|hi10p|webrip|web-?dl|dvdrip|bluray|hdtv)\b/gi;

const SEASON_EPISODE = /\s*[sS]\d{1,2}\s*[eE]\d{1,3}\b/g;

const DASH_EPISODE = /\s*-\s*(?:ep\.?\s*)?\d{1,3}(?:v\d+)?\s*$/;

const BRACKET_EPISODE = /\[\s*\d{1,3}(?:v\d+)?\s*\]\s*$/;

const JAPANESE_EPISODE = /\s*第\s*\d{1,3}\s*話\s*$/;

const YEAR_IN_PARENS = /\s*\(\s*(?:19|20)\d{2}\s*\)\s*$/;

const TRAILING_YEAR = /\s*(?:19|20)\d{2}\s*$/;

export function parseAnimeSearchTitle(fileName: string): string {
  let name = fileName.trim().replace(EXTENSION, "");
  name = name.replace(BRACKET_GROUPS, " ");
  name = name.replace(QUALITY_TAGS, " ");
  name = name.replace(SEASON_EPISODE, " ");
  name = name.replace(DASH_EPISODE, " ");
  name = name.replace(BRACKET_EPISODE, " ");
  name = name.replace(JAPANESE_EPISODE, " ");
  name = name.replace(TRAILING_QUALITY, " ");
  name = name.replace(STANDALONE_QUALITY, " ");
  name = name.replace(/\s+-\s*$/g, " ");
  name = name.replace(YEAR_IN_PARENS, " ");
  name = name.replace(TRAILING_YEAR, " ");
  return name.replace(/\s+/g, " ").trim();
}

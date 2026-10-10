export const RELEASE_GROUPS: readonly string[] = [
  "SubsPlease",
  "Erai-raws",
  "VCB-Studio",
  "BudLightSubs",
  "SubsPlus+",
  "Moozzi2",
  "SOFCJ-Raws",
  "Zagzad",
  "Nekomoe kissaten",
  "SweetSub",
  "Kawaiika-Raws",
  "AniDub",
  "YMDR",
  "ViPHD",
  "MALD",
  "DragsterPS",
  "Kagura",
  "Salender-Raws",
  "anti-raws",
  "RGzsRutracker",
  "Jaskier",
  "Seein",
  "AKTEP",
  "HQCLUB",
  "HDCLUB",
  "ToonsHub",
  "Delia_EniaHD",
  "VietHD",
  "RHS",
  "pk",
  "TVShows",
  "Mustadio",
  "SOFCJ",
];

export const TRACK_STUDIOS: readonly string[] = [
  "AniLibria",
  "AlexFilm",
  "StudioBand",
  "TVShows",
  "SB",
  "KS",
  "CR",
  "Alisma",
  "2nd Division",
  "YSS",
];

export const STREAM_SERVICES: readonly string[] = ["CR", "AMZN", "DSNP", "HMAX", "KP"];

export const SOURCES: readonly string[] = [
  "BDRip",
  "WEB-DL",
  "WEBRip",
  "BluRay",
  "BDRemux",
  "REMUX",
  "Remux",
  "WEB",
  "BD",
];

export const VIDEO_CODECS: readonly string[] = [
  "x264",
  "x265",
  "H.264",
  "H264",
  "HEVC",
  "AVC",
  "XviD",
];

export const AUDIO_TERMS: readonly string[] = ["AAC", "FLAC", "AC3", "DTS", "DDP", "EAC3", "THD"];

export const LANGS: readonly string[] = ["rus", "eng", "jpn", "ukr", "chi"];

export const LANG_ALIASES: Readonly<Record<string, string>> = {
  ru: "rus",
  RUS: "rus",
  Rus: "rus",
  en: "eng",
  Eng: "eng",
  jp: "jpn",
  Jpn: "jpn",
  JPN: "jpn",
  JAP: "jpn",
  jap: "jpn",
  jpn: "jpn",
  Ukr: "ukr",
  CHI: "chi",
  por: "por",
  spa: "spa",
  ara: "ara",
  fre: "fre",
  fra: "fre",
  ger: "ger",
  deu: "ger",
  ita: "ita",
};

export const SUB_FORMATS: readonly string[] = ["ASS", "SRT", "SSA", "SUB"];

export const SUB_VARIANTS: readonly string[] = ["GB", "BIG5", "CHS", "CHT"];

export const EDITION_TAGS: readonly string[] = ["Unrated", "DC"];

export const DUB_MARKERS: readonly string[] = ["DUB", "MVO", "VO"];

export const SPECIAL_MARKERS: readonly string[] = ["OP", "ED", "NCOP", "NCED", "OVA", "ONA", "SP"];

export const TYPE_MARKERS: readonly string[] = ["TV", "Movie", "Gekijouban"];

export const IGNORE_SUFFIXES: readonly string[] = ["upscaled"];

export const VIDEO_EXTS: readonly string[] = ["mkv", "mp4", "avi"];

export const SUBTITLE_EXTS: readonly string[] = ["ass", "srt", "ssa", "sub"];

export const AUDIO_EXTS: readonly string[] = ["mka", "opus", "flac"];

export const SEARCH_ALIASES: ReadonlyArray<readonly [string, string]> = [
  ["Bounen no Xamdou", "Bounen no Zamned"],
  ["Grandmaster of Demonic Cultivation", "Mo Dao Zu Shi"],
  ["Re Zero kara Hajimeru Isekai Seikatsu III", "Re:Zero kara Hajimeru Isekai Seikatsu"],
];

export const KNOWN_ARCS: readonly string[] = [
  "Hashira Geiko-hen",
  "Katanakaji no Sato-hen",
  "Mugen Ressha-hen",
  "Yuukaku-hen",
  "Sei Oukoku-hen",
  "Kanketsu-hen",
];

export const SEASON_EPISODE_RX = /S(\d{1,2})E(\d{1,3})/i;

export const COMPACT_SPE_RX = /S(\d{1,2})\s*-\s*P(\d{1,2})\s*-\s*E(\d{1,3})/i;

export const OF_TOTAL_RX = /(\d{1,3})_of_(\d{1,3})/i;

export const LEADING_NUMBER_RX = /^(\d{1,3})\.\s*(.+)$/;

export const CRC32_RX = /\[([0-9A-Fa-f]{8})\]/;

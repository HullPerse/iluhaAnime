import {
  AUDIO_TERMS,
  CRC32_RX,
  DUB_MARKERS,
  EDITION_TAGS,
  LANG_ALIASES,
  LANGS,
  OF_TOTAL_RX,
  RELEASE_GROUPS,
  SEASON_EPISODE_RX,
  STREAM_SERVICES,
  SOURCES,
  SUB_FORMATS,
  SUB_VARIANTS,
  TRACK_STUDIOS,
  TYPE_MARKERS,
  VIDEO_CODECS,
} from "@/config/media/tokens.config";
import type {
  FieldBag,
  MediaClassifiedToken,
  MediaNameToken,
  MediaTokenEnclosed,
  MediaTokenKind,
} from "@/types/media";

function buildSet(values: readonly string[]): Set<string> {
  return new Set(values.map((value) => value.toLowerCase()));
}

const GROUP_SET = buildSet(RELEASE_GROUPS);
const STUDIO_SET = buildSet(TRACK_STUDIOS);
const SERVICE_SET = buildSet(STREAM_SERVICES);
const SOURCE_SET = buildSet(SOURCES);
const CODEC_SET = buildSet(VIDEO_CODECS);
const AUDIO_SET = buildSet(AUDIO_TERMS);
const LANG_SET = buildSet(LANGS);
const DUB_SET = buildSet(DUB_MARKERS);
const TYPE_SET = buildSet(TYPE_MARKERS);
const SUBS_SET = buildSet(SUB_FORMATS);
const SUB_VARIANT_SET = buildSet(SUB_VARIANTS);
const TAG_SET = buildSet(EDITION_TAGS);

// Cyrillic KHA seen in real codec spellings, normalized to latin x.
const CYRILLIC_HE = String.fromCodePoint(0x0445);

const SPECIAL_RX = /^(ncop|nced|op|ed|ova|ona|sp)(\d*)$/i;
const SEASON_RX = /^(season|s\d+)$/i;
const ORDINAL_RX = /^(\d+)(st|nd|rd|th)$/i;
const PART_RX = /^(p(art)?\d+|part|cour)$/i;
const EP_RX = /^e\d+$/i;
const RES_RX = /^\d{3,4}[pix]$/i;
const DIM_RX = /^\d{3,4}x\d{3,4}$/i;
const DEPTH_RX = /^(ma)?(10|12)p$|^(10|12)(bit|bits|b)$/i;
const YEAR_RX = /^(19|20)\d{2}$/;
const RANGE_RX = /^\d{1,3}[-~～〜]\d{1,3}$/;
const COUNTED_LANG_RX = /^\d+x[a-z]+$/i;
const PLAIN_DIGITS_RX = /^\d{1,3}$/;
const MULTI_SUB_RX = /^multisubs?$|^multiple[ _-]+subtitles?$/i;
// Subtitle variant tags glued as lang-region pairs: [POR-BR], [SPA-LA].
// Without this the pair expands into loose words and the region half
// (BR, LA) leaks into the release title.
const LANG_REGION_RX = /^([a-z]{2,3})-([a-z]{2})$/;

interface SingleRule {
  test: (value: string, lower: string, enclosed: MediaTokenEnclosed) => boolean;
  kind: MediaTokenKind;
}

const SINGLE_RULES: SingleRule[] = [
  { test: (_v, l) => GROUP_SET.has(l), kind: "group" },
  { test: (_v, l) => SERVICE_SET.has(l), kind: "service" },
  { test: (_v, l) => STUDIO_SET.has(l), kind: "studio" },
  { test: (_v, l) => SOURCE_SET.has(l), kind: "source" },
  { test: (_v, l) => CODEC_SET.has(l), kind: "codec" },
  { test: (_v, l) => AUDIO_SET.has(l), kind: "audio" },
  { test: (_v, l) => LANG_SET.has(l) || l in LANG_ALIASES || isLangRegionPair(l), kind: "lang" },
  { test: (_v, l) => DUB_SET.has(l), kind: "dub" },
  {
    test: (_v, l) => SUBS_SET.has(l) || SUB_VARIANT_SET.has(l) || MULTI_SUB_RX.test(l),
    kind: "subs",
  },
  { test: (_v, l) => TYPE_SET.has(l), kind: "type" },
  { test: (v) => SPECIAL_RX.test(v), kind: "special" },
  { test: (v) => SEASON_EPISODE_RX.test(v), kind: "seasonEpisode" },
  { test: (v) => SEASON_RX.test(v) || ORDINAL_RX.test(v), kind: "season" },
  { test: (v) => PART_RX.test(v), kind: "part" },
  {
    test: (v) => EP_RX.test(v) || OF_TOTAL_RX.test(v) || RANGE_RX.test(v),
    kind: "episode",
  },
  { test: (v) => RES_RX.test(v) || DIM_RX.test(v), kind: "resolution" },
  { test: (v) => DEPTH_RX.test(v), kind: "depth" },
  { test: (v) => YEAR_RX.test(v), kind: "year" },
  { test: (v, _l, e) => e !== "plain" && CRC32_RX.test(`[${v}]`), kind: "crc" },
  { test: (v) => COUNTED_LANG_RX.test(v), kind: "lang" },
  { test: (v) => /^(ddp|eac3)/i.test(v), kind: "audio" },
  { test: (_v, l) => TAG_SET.has(l), kind: "tag" },
];

export function classifyTokenValue(value: string, enclosed: MediaTokenEnclosed): MediaTokenKind {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase().split(CYRILLIC_HE).join("x");
  for (const rule of SINGLE_RULES) {
    if (rule.test(trimmed, lower, enclosed)) return rule.kind;
  }
  if (PLAIN_DIGITS_RX.test(trimmed)) return "episode";
  return enclosed === "plain" ? "title" : "unknown";
}

const INNER_SPLIT_RX = /[ _.,;()+-]+/;
const AMP_RX = /\s*&\s*/;
const URL_RX = /^(www\.)?[\w-]+\.(org|com|net|ru|to|si|info)$/i;

function expandEnclosed(token: MediaNameToken): MediaClassifiedToken[] {
  const whole = classifyTokenValue(token.value, token.enclosed);
  if (whole !== "unknown") return [{ ...token, kind: whole }];
  if (URL_RX.test(token.value)) return [{ ...token, kind: "tag" }];
  const fragments: string[] = [];
  for (const ampPart of token.value.split(AMP_RX)) {
    const part = ampPart.trim();
    if (!part) continue;
    if (classifyTokenValue(part, token.enclosed) !== "unknown") {
      fragments.push(part);
    } else {
      for (const piece of part.split(INNER_SPLIT_RX)) {
        if (piece) fragments.push(piece);
      }
    }
  }
  if (fragments.length <= 1) return [{ ...token, kind: whole }];
  return fragments.map((fragment) => ({
    value: fragment,
    enclosed: "plain",
    kind: classifyTokenValue(fragment, "plain"),
  }));
}

const PAIR_JOIN: Record<string, { value: string; kind: MediaTokenKind }> = {
  "web-dl": { value: "WEB-DL", kind: "source" },
  h264: { value: "H.264", kind: "codec" },
  bdremux: { value: "BDRemux", kind: "source" },
  delia_eniahd: { value: "Delia_EniaHD", kind: "group" },
};

const VERSION_HEAD_RX = /^(ddp|eac3)\d+$/i;
const VERSION_TAIL_RX = /^\d{1,2}$/;

function mergePairs(tokens: MediaClassifiedToken[]): MediaClassifiedToken[] {
  const merged: MediaClassifiedToken[] = [];
  let index = 0;
  while (index < tokens.length) {
    const current = tokens[index];
    const next = tokens[index + 1];
    if (current && next) {
      const dashed = `${current.value}-${next.value}`.toLowerCase();
      const glued = `${current.value}${next.value}`.toLowerCase();
      const underscored = `${current.value}_${next.value}`.toLowerCase();
      const spaced = `${current.value} ${next.value}`.toLowerCase();
      const hit =
        PAIR_JOIN[dashed] ?? PAIR_JOIN[glued] ?? PAIR_JOIN[underscored] ?? PAIR_JOIN[spaced];
      if (hit) {
        merged.push({ value: hit.value, enclosed: current.enclosed, kind: hit.kind });
        index += 2;
        continue;
      }
      if (VERSION_HEAD_RX.test(current.value) && VERSION_TAIL_RX.test(next.value)) {
        merged.push({
          value: `${current.value}.${next.value}`,
          enclosed: current.enclosed,
          kind: "audio",
        });
        index += 2;
        continue;
      }
    }
    if (current) merged.push(current);
    index += 1;
  }
  return merged;
}

function isLangRegionPair(lower: string): boolean {
  const match = LANG_REGION_RX.exec(lower);
  if (!match?.[1]) return false;
  return canonicalLang(match[1]) !== null;
}

export function canonicalLang(value: string): string | null {
  const cleaned = value.replace(/^\d+x/i, "");
  const aliased = LANG_ALIASES[cleaned] ?? LANG_ALIASES[cleaned.toLowerCase()];
  if (aliased) return aliased;
  const lower = cleaned.toLowerCase();
  if (LANG_SET.has(lower)) return lower;
  const pair = LANG_REGION_RX.exec(lower);
  if (pair?.[1]) return canonicalLang(pair[1]);
  return null;
}

const BARE_RES_RX = /^(480|720|1080|2160)$/;
const RES_SIBLING_KINDS: ReadonlySet<MediaTokenKind> = new Set([
  "source",
  "service",
  "codec",
  "audio",
  "resolution",
  "depth",
  "lang",
  "group",
  "studio",
  "crc",
  "year",
]);

function resolveBareResolutions(tokens: MediaClassifiedToken[]): MediaClassifiedToken[] {
  const techGroups = new Set<number>();
  for (const token of tokens) {
    if (token.bracketGroup !== undefined && RES_SIBLING_KINDS.has(token.kind)) {
      techGroups.add(token.bracketGroup);
    }
  }
  return tokens.map((token) =>
    token.kind === "title" &&
    token.bracketGroup !== undefined &&
    BARE_RES_RX.test(token.value) &&
    techGroups.has(token.bracketGroup)
      ? { ...token, kind: "resolution" }
      : token
  );
}

export function classifyMediaTokens(tokens: MediaNameToken[]): MediaClassifiedToken[] {
  const flat: MediaClassifiedToken[] = [];
  let group = 0;
  for (const token of tokens) {
    if (token.enclosed === "plain") {
      flat.push({ ...token, kind: classifyTokenValue(token.value, token.enclosed) });
    } else {
      group += 1;
      for (const expanded of expandEnclosed(token)) {
        flat.push({ ...expanded, bracketGroup: group });
      }
    }
  }
  return resolveBareResolutions(mergePairs(flat));
}

interface TechRule {
  match: (token: MediaClassifiedToken) => boolean;
  apply: (bag: FieldBag, token: MediaClassifiedToken) => void;
}

function firstWins(
  read: (bag: FieldBag) => string | undefined,
  write: (bag: FieldBag, value: string) => void
): TechRule["apply"] {
  return (bag, token) => {
    if (read(bag) === undefined) write(bag, token.value);
  };
}

const TECH_RULES: TechRule[] = [
  {
    match: (token) => token.kind === "group" || token.kind === "studio",
    apply: (bag, token) => {
      if (!bag.groups.includes(token.value)) bag.groups.push(token.value);
    },
  },
  {
    match: (token) => token.kind === "service",
    apply: firstWins(
      (bag) => bag.service,
      (bag, value) => {
        bag.service = value;
      }
    ),
  },
  {
    match: (token) => token.kind === "source",
    apply: firstWins(
      (bag) => bag.source,
      (bag, value) => {
        bag.source = value;
      }
    ),
  },
  {
    match: (token) => token.kind === "codec",
    apply: firstWins(
      (bag) => bag.codec,
      (bag, value) => {
        bag.codec = value;
      }
    ),
  },
  {
    match: (token) => token.kind === "resolution",
    apply: firstWins(
      (bag) => bag.resolution,
      (bag, value) => {
        bag.resolution = value;
      }
    ),
  },
  {
    match: (token) => token.kind === "depth",
    apply: firstWins(
      (bag) => bag.depth,
      (bag, value) => {
        bag.depth = value;
      }
    ),
  },
  {
    match: (token) => token.kind === "audio",
    apply: firstWins(
      (bag) => bag.audio,
      (bag, value) => {
        bag.audio = value;
      }
    ),
  },
  {
    match: (token) => token.kind === "subs",
    apply: (bag, token) => {
      if (SUBS_SET.has(token.value.toLowerCase())) {
        bag.subs.push(token.value.toLowerCase());
      } else if (bag.subVariant === undefined) bag.subVariant = token.value;
    },
  },
  {
    match: (token) => token.kind === "dub",
    apply: (bag) => {
      bag.dub = true;
    },
  },
  {
    match: (token) => token.kind === "crc",
    apply: firstWins(
      (bag) => bag.crc,
      (bag, value) => {
        bag.crc = value;
      }
    ),
  },
  {
    match: (token) => token.kind === "year",
    apply: (bag, token) => {
      if (bag.year === undefined) bag.year = Number.parseInt(token.value, 10);
    },
  },
  {
    match: (token) => token.kind === "tag",
    apply: (bag, token) => {
      bag.tags.push(token.value);
    },
  },
  {
    match: (token) => token.kind === "lang",
    apply: (bag, token) => {
      const lang = canonicalLang(token.value);
      if (lang && !bag.langs.includes(lang)) bag.langs.push(lang);
    },
  },
  {
    match: (token) => token.kind === "type",
    apply: (bag, token) => {
      if (bag.type === undefined) bag.type = token.value;
    },
  },
  {
    match: (token) => token.kind === "special",
    apply: (bag, token) => {
      if (bag.special === undefined) bag.special = token.value;
    },
  },
];

export function emptyFieldBag(): FieldBag {
  return { groups: [], langs: [], dub: false, subs: [], tags: [] };
}

export function collectFields(tokens: MediaClassifiedToken[], consumed: Set<number>): FieldBag {
  const bag = emptyFieldBag();
  for (const [index, token] of tokens.entries()) {
    if (!token || consumed.has(index)) continue;
    const rule = TECH_RULES.find((candidate) => candidate.match(token));
    if (rule) {
      rule.apply(bag, token);
      consumed.add(index);
    }
  }
  return bag;
}

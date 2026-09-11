import { DEFAULT_TAG_TOLERANCES } from "@/config/search/tolerance.config";
import type {
  CompareOp,
  IntentToken,
  NumericCond,
  ParsedIntent,
  TagToleranceKey,
} from "@/types/search";

export const FILTER_KEYS: Record<string, true> = {
  year: true,
  date: true,
  studio: true,
  genre: true,
  type: true,
  status: true,
  rating: true,
  episodes: true,
  progress: true,
  sort: true,
  priority: true,
  provider: true,
  source: true,
  tag: true,
};

export function isTagLikeQuery(rawQuery: string, normalizedQuery: string): boolean {
  if (rawQuery.includes("=")) return true;
  if (normalizedQuery.length < 2) return false;
  for (const key of Object.keys(FILTER_KEYS)) {
    if (key.startsWith(normalizedQuery)) return true;
  }
  return false;
}

function parseYear(value: string): number | undefined {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1900 || n > 2100) return undefined;
  return n;
}

export function parseDateValue(value: string): { iso: string; yearOnly: boolean } | undefined {
  const yearOnly = /^(\d{4})$/.exec(value);
  if (yearOnly) {
    const text = yearOnly[1];
    const year = Number(text);
    if (text === undefined || year < 1900 || year > 2100) return undefined;
    return { iso: text, yearOnly: true };
  }
  const ru = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value);
  if (ru) {
    const day = Number(ru[1]);
    const month = Number(ru[2]);
    const year = Number(ru[3]);
    if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900 || year > 2100)
      return undefined;
    return {
      iso: `${ru[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      yearOnly: false,
    };
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) {
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    const year = Number(iso[1]);
    if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900 || year > 2100)
      return undefined;
    return { iso: value, yearOnly: false };
  }
  return undefined;
}

function parseRating(value: string): number | undefined {
  const n = Number(value.replace(",", "."));
  if (Number.isNaN(n) || n < 0 || n > 10) return undefined;
  return n;
}
function parseEpisodes(value: string): number | undefined {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 100000) return undefined;
  return n;
}

function parseSort(
  value: string
): { by: "date" | "name" | "rating" | "year"; dir: "asc" | "desc" } | undefined {
  const [field, dir] = value.toLowerCase().split(":");
  if (field !== "date" && field !== "name" && field !== "rating" && field !== "year")
    return undefined;
  if (dir !== undefined && dir !== "asc" && dir !== "desc") return undefined;
  return { by: field, dir: dir ?? (field === "name" ? "asc" : "desc") };
}

const TOKEN_RE = /(?:[^\s"]+|"[^"]*")+/g;

function matchFilterToken(token: string): { key: string; op: CompareOp; value: string } | null {
  const opMatch = token.match(/^(.*?)(~=|>=|<=|!=|=|>|<)(.*)$/);
  if (!opMatch) return null;
  const key = (opMatch[1] ?? "").toLowerCase();
  const op = opMatch[2] as CompareOp;
  let value = opMatch[3] ?? "";
  if (!key || !FILTER_KEYS[key] || !value) return null;
  if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
  if (!value) return null;
  return { key, op, value };
}

export function tokenizeIntent(query: string): IntentToken[] {
  const out: IntentToken[] = [];
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(query)) !== null) {
    const found = matchFilterToken(m[0]);
    if (found) out.push({ start: m.index, end: m.index + m[0].length, ...found });
  }
  return out;
}

type FilterToken = { key: string; op: CompareOp; value: string };

const SPACED_OP_RE = new RegExp(
  `\\b(${Object.keys(FILTER_KEYS).join("|")})\\s*(~=|>=|<=|!=|=|>|<)\\s*`,
  "g"
);

function joinSpacedOps(query: string): string {
  return query.replace(/([\d"'])\s*\.\.\.\s*([\d"'])/g, "$1...$2").replace(SPACED_OP_RE, "$1$2");
}

function isRangeValue(key: string, value: string): boolean {
  if (!value.includes("...")) return false;
  return key in NUMERIC_CONDITIONS || key === "date";
}

function collectFilterTokens(tokens: string[]): {
  rawFilters: Record<string, string>;
  conditions: FilterToken[];
  remaining: string[];
} {
  const rawFilters: Record<string, string> = {};
  const conditions: FilterToken[] = [];
  const remaining: string[] = [];
  for (const token of tokens) {
    const found = matchFilterToken(token);
    if (found) {
      if (found.op === "=" && !isRangeValue(found.key, found.value))
        rawFilters[found.key] = found.value;
      conditions.push(found);
      continue;
    }
    remaining.push(token);
  }
  return { rawFilters, conditions, remaining };
}

const RAW_APPLIED_FIELD: Record<string, keyof ParsedIntent | undefined> = {
  episodes: "episodes",
  genre: "genre",
  priority: "priority",
  progress: "progress",
  provider: "provider",
  rating: "rating",
  sort: "sortBy",
  source: "provider",
  status: "status",
  studio: "studio",
  tag: "genre",
  type: "type",
  year: "year",
};

function rawFilterApplied(out: ParsedIntent, key: string): boolean {
  const field = RAW_APPLIED_FIELD[key];
  return field === undefined || out[field] !== undefined;
}

export function parseIntent(
  query: string,
  tolerances: Record<TagToleranceKey, number> = DEFAULT_TAG_TOLERANCES
): ParsedIntent {
  const tokens = joinSpacedOps(query).match(TOKEN_RE) ?? [];
  const { rawFilters, conditions, remaining } = collectFilterTokens(tokens);
  const out: ParsedIntent = {
    cleanQuery: "",
    yearOps: [],
    ratingOps: [],
    episodesOps: [],
    progressOps: [],
    dateConds: [],
    negations: [],
    rawFilters,
  };
  applyRawFilters(out, rawFilters);
  for (const [key, raw] of Object.entries(rawFilters)) {
    if (!rawFilterApplied(out, key)) remaining.push(`${key}=${raw}`);
  }
  for (const cond of conditions) {
    if (!applyCondition(out, cond, tolerances))
      remaining.push(`${cond.key}${cond.op}${cond.value}`);
  }
  out.cleanQuery = remaining.join(" ").trim();
  return out;
}

function applyRawFilters(out: ParsedIntent, rawFilters: Record<string, string>): void {
  applyNumericFilter(rawFilters["year"], parseYear, (value) => (out.year = value));
  if (rawFilters["studio"]) out.studio = rawFilters["studio"];
  if (rawFilters["genre"] ?? rawFilters["tag"])
    out.genre = [rawFilters["genre"], rawFilters["tag"]].filter(Boolean).join("|");
  if (rawFilters["type"]) out.type = rawFilters["type"].toLowerCase();
  if (rawFilters["status"]) out.status = rawFilters["status"].toLowerCase();
  applyNumericFilter(rawFilters["rating"], parseRating, (value) => (out.rating = value));
  applyNumericFilter(rawFilters["episodes"], parseEpisodes, (value) => (out.episodes = value));
  applyNumericFilter(rawFilters["progress"], parseEpisodes, (value) => (out.progress = value));
  if (rawFilters["sort"]) {
    const s = parseSort(rawFilters["sort"]);
    if (s !== undefined) {
      out.sortBy = s.by;
      out.sortDir = s.dir;
    }
  }
  if (rawFilters["priority"]) out.priority = rawFilters["priority"].toLowerCase();
  if (rawFilters["provider"] ?? rawFilters["source"])
    out.provider = (rawFilters["provider"] ?? rawFilters["source"] ?? "").toLowerCase();
}

function applyNumericFilter(
  raw: string | undefined,
  parse: (value: string) => number | undefined,
  assign: (value: number) => void
): void {
  if (raw === undefined) return;
  const value = parse(raw);
  if (value !== undefined) assign(value);
}

const NUMERIC_CONDITIONS: Record<
  string,
  { parse: (value: string) => number | undefined; target: (out: ParsedIntent) => NumericCond[] }
> = {
  year: { parse: parseYear, target: (out) => out.yearOps },
  rating: { parse: parseRating, target: (out) => out.ratingOps },
  episodes: { parse: parseEpisodes, target: (out) => out.episodesOps },
  progress: { parse: parseEpisodes, target: (out) => out.progressOps },
};

const NEGATION_ALIAS: Record<string, string> = { tag: "genre", source: "provider" };

function applyCondition(
  out: ParsedIntent,
  cond: FilterToken,
  tolerances: Record<TagToleranceKey, number>
): boolean {
  if (cond.op === "=" && cond.key !== "date") {
    const numeric = NUMERIC_CONDITIONS[cond.key];
    if (numeric && cond.value.includes("...")) return applyNumericRange(out, numeric, cond.value);
    return true;
  }
  if (cond.op === "!=" && !(cond.key in NUMERIC_CONDITIONS)) {
    out.negations.push({ key: NEGATION_ALIAS[cond.key] ?? cond.key, value: cond.value });
    return true;
  }
  if (cond.key === "date") {
    if (cond.op === "~=") return false;
    if (cond.op === "=" && cond.value.includes("...")) {
      return applyDateRange(out, cond.value);
    }
    const parsed = parseDateValue(cond.value);
    if (!parsed) return false;
    out.dateConds.push({ op: cond.op, iso: parsed.iso, yearOnly: parsed.yearOnly });
    return true;
  }
  const numeric = NUMERIC_CONDITIONS[cond.key];
  if (!numeric) return false;
  if (cond.op === "~=") {
    const value = numeric.parse(cond.value);
    if (value === undefined) return false;
    const tolerance = tolerances[cond.key as TagToleranceKey] ?? 0;
    numeric.target(out).push({ op: ">=", value: value - tolerance });
    numeric.target(out).push({ op: "<=", value: value + tolerance });
    return true;
  }
  const value = numeric.parse(cond.value);
  if (value === undefined) return false;
  numeric.target(out).push({ op: cond.op as NumericCond["op"], value });
  return true;
}

function applyNumericRange(
  out: ParsedIntent,
  numeric: {
    parse: (value: string) => number | undefined;
    target: (out: ParsedIntent) => NumericCond[];
  },
  raw: string
): boolean {
  const [fromRaw = "", toRaw = ""] = raw.split("...");
  const from = fromRaw ? numeric.parse(fromRaw) : undefined;
  const to = toRaw ? numeric.parse(toRaw) : undefined;
  if (fromRaw && from === undefined) return false;
  if (toRaw && to === undefined) return false;
  if (from === undefined && to === undefined) return false;
  const [low, high] = from !== undefined && to !== undefined && from > to ? [to, from] : [from, to];
  if (low !== undefined) numeric.target(out).push({ op: ">=", value: low });
  if (high !== undefined) numeric.target(out).push({ op: "<=", value: high });
  return true;
}

function applyDateRange(out: ParsedIntent, raw: string): boolean {
  const [fromRaw = "", toRaw = ""] = raw.split("...");
  const from = fromRaw ? parseDateValue(fromRaw) : undefined;
  const to = toRaw ? parseDateValue(toRaw) : undefined;
  if (fromRaw && !from) return false;
  if (toRaw && !to) return false;
  if (!from && !to) return false;
  const bounds = [
    from && { op: ">=" as const, iso: from.iso, yearOnly: from.yearOnly },
    to && { op: "<=" as const, iso: to.iso, yearOnly: to.yearOnly },
  ];
  const ordered = from && to && from.iso > to.iso ? [bounds[1], bounds[0]] : bounds;
  for (const bound of ordered) {
    if (bound) out.dateConds.push(bound);
  }
  return true;
}

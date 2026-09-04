import { normalizeSearchText } from "./search.suggestions";

export interface ParsedIntent {
  cleanQuery: string;
  year?: number;
  studio?: string;
  genre?: string;
  type?: string;
  status?: string;
  rating?: number;
  priority?: string;
  season?: string;
  provider?: string;
  language?: string;
  quality?: string;
  rawFilters: Record<string, string>;
}

const FILTER_KEYS = new Set([
  "year",
  "studio",
  "genre",
  "type",
  "status",
  "rating",
  "priority",
  "season",
  "provider",
  "language",
  "quality",
  "source",
]);

function parseYear(value: string): number | undefined {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1900 || n > 2100) return undefined;
  return n;
}

function parseRating(value: string): number | undefined {
  const n = Number(value);
  if (Number.isNaN(n) || n < 0 || n > 10) return undefined;
  return n;
}

const TOKEN_RE = /(?:[^\s"]+|"[^"]*")+/g;

function matchFilterToken(token: string): { key: string; value: string } | null {
  const colon = token.indexOf(":");
  if (colon <= 0) return null;
  const key = token.slice(0, colon).toLowerCase();
  let value = token.slice(colon + 1);
  if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
  if (!FILTER_KEYS.has(key) || !value) return null;
  return { key, value };
}

export interface IntentToken {
  start: number;
  end: number;
  key: string;
  value: string;
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

// oxlint-disable-next-line complexity
export function parseIntent(query: string): ParsedIntent {
  const rawFilters: Record<string, string> = {};
  const remaining: string[] = [];
  // split by space but keep quoted values together: key:"value with space"
  const tokens = query.match(TOKEN_RE) ?? [];
  for (const token of tokens) {
    const found = matchFilterToken(token);
    if (found) {
      rawFilters[found.key] = found.value;
      continue;
    }
    remaining.push(token);
  }

  const cleanQuery = remaining.join(" ").trim();
  const out: ParsedIntent = { cleanQuery, rawFilters };

  if (rawFilters["year"]) {
    const y = parseYear(rawFilters["year"]);
    if (y !== undefined) out.year = y;
  }
  if (rawFilters["studio"]) out.studio = rawFilters["studio"];
  if (rawFilters["genre"]) out.genre = rawFilters["genre"];
  if (rawFilters["type"]) out.type = rawFilters["type"].toLowerCase();
  if (rawFilters["status"]) out.status = rawFilters["status"].toLowerCase();
  if (rawFilters["rating"]) {
    const r = parseRating(rawFilters["rating"]);
    if (r !== undefined) out.rating = r;
  }
  if (rawFilters["priority"]) out.priority = rawFilters["priority"].toLowerCase();
  if (rawFilters["season"]) out.season = rawFilters["season"].toLowerCase();
  if (rawFilters["provider"] ?? rawFilters["source"])
    out.provider = (rawFilters["provider"] ?? rawFilters["source"] ?? "").toLowerCase();
  if (rawFilters["language"]) out.language = rawFilters["language"].toLowerCase();
  if (rawFilters["quality"]) out.quality = rawFilters["quality"].toLowerCase();

  return out;
}

export function applyIntentToCollectionFilters(
  intent: ParsedIntent,
  current: Record<string, unknown>
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...current };
  if (intent.year !== undefined) (next as { year?: number }).year = intent.year;
  if (intent.studio !== undefined) (next as { studio?: string }).studio = intent.studio;
  if (intent.genre !== undefined) (next as { genre?: string }).genre = intent.genre;
  return next;
}

export function stripIntentForSearch(query: string): string {
  return parseIntent(query).cleanQuery;
}

// For search suggestions: if query contains intent, we should search by cleanQuery
export function intentAwareNormalize(query: string): string {
  return normalizeSearchText(parseIntent(query).cleanQuery);
}

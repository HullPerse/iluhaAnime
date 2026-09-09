import type { CompareOp, IntentToken, NumericCond, ParsedIntent } from "@/types/search";

export const FILTER_KEYS: Record<string, true> = {
  year: true,
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
  if (rawQuery.includes(":")) return true;
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

function parseRating(value: string): number | undefined {
  const n = Number(value);
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
): { by: "date" | "name" | "rating"; dir: "asc" | "desc" } | undefined {
  const [field, dir] = value.toLowerCase().split(":");
  if (field !== "date" && field !== "name" && field !== "rating") return undefined;
  if (dir !== undefined && dir !== "asc" && dir !== "desc") return undefined;
  return { by: field, dir: dir ?? (field === "name" ? "asc" : "desc") };
}

const TOKEN_RE = /(?:[^\s"]+|"[^"]*")+/g;

function matchFilterToken(token: string): { key: string; op: CompareOp; value: string } | null {
  const colon = token.indexOf(":");
  const opMatch = token.match(/^(.*?)(>=|<=|!=|=|>|<|:)(.*)$/);
  if (!opMatch) return null;
  const key = (opMatch[1] ?? "").toLowerCase();
  const op = (opMatch[2] ?? ":") as CompareOp;
  let value = opMatch[3] ?? "";
  if (!key || !FILTER_KEYS[key] || !value) return null;
  if (colon > 0 && op !== ":") return null;
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

// oxlint-disable-next-line complexity
export function parseIntent(query: string): ParsedIntent {
  const rawFilters: Record<string, string> = {};
  const conditions: Array<{ key: string; op: CompareOp; value: string }> = [];
  const remaining: string[] = [];
  const tokens = query.match(TOKEN_RE) ?? [];
  for (const token of tokens) {
    const found = matchFilterToken(token);
    if (found) {
      if (found.op === ":" || found.op === "=") rawFilters[found.key] = found.value;
      conditions.push(found);
      continue;
    }
    remaining.push(token);
  }

  const cleanQuery = remaining.join(" ").trim();
  const out: ParsedIntent = {
    cleanQuery,
    yearOps: [],
    ratingOps: [],
    episodesOps: [],
    progressOps: [],
    negations: [],
    rawFilters,
  };

  if (rawFilters["year"]) {
    const y = parseYear(rawFilters["year"]);
    if (y !== undefined) out.year = y;
  }
  if (rawFilters["studio"]) out.studio = rawFilters["studio"];
  if (rawFilters["genre"] ?? rawFilters["tag"])
    out.genre = [rawFilters["genre"], rawFilters["tag"]].filter(Boolean).join("|");
  if (rawFilters["type"]) out.type = rawFilters["type"].toLowerCase();
  if (rawFilters["status"]) out.status = rawFilters["status"].toLowerCase();
  if (rawFilters["rating"]) {
    const r = parseRating(rawFilters["rating"]);
    if (r !== undefined) out.rating = r;
  }
  if (rawFilters["episodes"]) {
    const e = parseEpisodes(rawFilters["episodes"]);
    if (e !== undefined) out.episodes = e;
  }
  if (rawFilters["progress"]) {
    const p = parseEpisodes(rawFilters["progress"]);
    if (p !== undefined) out.progress = p;
  }
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

  for (const cond of conditions) {
    if (
      cond.op === "!=" &&
      cond.key !== "year" &&
      cond.key !== "rating" &&
      cond.key !== "episodes" &&
      cond.key !== "progress"
    ) {
      out.negations.push({ key: cond.key, value: cond.value });
      continue;
    }
    if (cond.key === "year" && cond.op !== ":" && cond.op !== "=") {
      const y = parseYear(cond.value);
      if (y !== undefined) out.yearOps.push({ op: cond.op as NumericCond["op"], value: y });
      continue;
    }
    if (cond.key === "rating" && cond.op !== ":" && cond.op !== "=") {
      const r = parseRating(cond.value);
      if (r !== undefined) out.ratingOps.push({ op: cond.op as NumericCond["op"], value: r });
      continue;
    }
    if (cond.key === "episodes" && cond.op !== ":" && cond.op !== "=") {
      const e = parseEpisodes(cond.value);
      if (e !== undefined) out.episodesOps.push({ op: cond.op as NumericCond["op"], value: e });
      continue;
    }
    if (cond.key === "progress" && cond.op !== ":" && cond.op !== "=") {
      const p = parseEpisodes(cond.value);
      if (p !== undefined) out.progressOps.push({ op: cond.op as NumericCond["op"], value: p });
    }
  }
  return out;
}

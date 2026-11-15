/**
 * Checks that every daily-pool title has enough frame screenshots and a usable
 * AniThemes video for OP/audio. The pool is shipped separately from the
 * metadata snapshot, so a title can parse fine but fail again at runtime.
 *
 * Usage:
 *   bun scripts/check-daily-pool.ts
 *   bun scripts/check-daily-pool.ts --limit 32 --allow-failures
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const POOL_PATH = join("src-tauri", "data", "daily-pool-v1.json");
const DEFAULT_REPORT = join("src-tauri", "data", "daily-pool-quality.json");
const SHIKIMORI = "https://shikimori.io/api/animes";
const TENRAI = "https://api.tenrai.org/v1";
const ANIMETHEMES = "https://graphql.animethemes.moe/";
const MIN_FRAMES = 6;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const THEME_QUERY = `query($mal: [Int!]!) {
  findAnimeByExternalSite(site: MAL, id: $mal) {
    resources { nodes { site externalId } }
    animethemes {
      type
      animethemeentries {
        nsfw
        spoiler
        videos { nodes { link resolution size mimetype } }
      }
    }
  }
}`;

interface PoolEntry {
  mediaId: number;
  malId: number;
  title: string;
  tier: string;
}

interface PoolFile {
  version: number;
  entries: PoolEntry[];
}

type CheckMode = "frames" | "op" | "audio";

interface CheckResult {
  mediaId: number;
  malId: number;
  title: string;
  tier: string;
  frames: number;
  frameSource: "shikimori" | "tenrai" | "none";
  hasOp: boolean;
  hasTheme: boolean;
  modes: CheckMode[];
  ok: boolean;
  error: string | null;
}

interface ThemeCheck {
  hasOp: boolean;
  hasTheme: boolean;
}

const args = process.argv.slice(2);

function argument(flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function numericArgument(flag: string, fallback: number, max: number): number {
  const raw = Number(argument(flag));
  return Number.isFinite(raw) ? Math.min(max, Math.max(1, Math.floor(raw))) : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const hostNextRequest = new Map<string, number>();

function hostInterval(host: string): number {
  if (host === "shikimori.one" || host === "shikimori.io") return 500;
  if (host === "api.tenrai.org") return 700;
  return 250;
}

async function paceHost(url: string): Promise<void> {
  const host = new URL(url).host;
  const now = Date.now();
  const earliest = Math.max(now, hostNextRequest.get(host) ?? 0);
  hostNextRequest.set(host, earliest + hostInterval(host));
  if (earliest > now) await sleep(earliest - now);
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const timeout = numericArgument("--timeout", 8_000, 60_000);
  const attempts = numericArgument("--attempts", 4, 6);
  let lastError = "request failed";
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await paceHost(url);
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeout),
        headers: {
          Accept: "application/json",
          "User-Agent": "iluhaAnime/daily-quality",
          ...init?.headers,
        },
      });
      if (response.status === 429 || response.status >= 500) {
        lastError = `HTTP ${response.status} (${new URL(url).host})`;
        const retryAfter = Number(response.headers.get("retry-after"));
        await sleep(
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1_000
            : 2_000 * (attempt + 1)
        );
        continue;
      }
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await sleep(1_500 * (attempt + 1));
    }
  }
  throw new Error(lastError);
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    out.push(value.trim());
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
    return;
  }
  const record = object(value);
  if (record !== null) {
    for (const item of Object.values(record)) collectStrings(item, out);
  }
}

function normalizeUrl(raw: string): string {
  if (raw.startsWith("//")) return `https:${raw}`;
  if (raw.startsWith("/")) return `https://shikimori.one${raw}`;
  return raw;
}

function isImageUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return (
      url.protocol === "https:" &&
      /\.(?:jpe?g|png|webp)(?:[?#]|$)/i.test(url.pathname + url.search)
    );
  } catch {
    return false;
  }
}

function imageUrls(value: unknown): string[] {
  const raw: string[] = [];
  collectStrings(value, raw);
  return [...new Set(raw.map(normalizeUrl).filter(isImageUrl))];
}

function videoUrl(raw: string, size: unknown, mimetype: unknown): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return false;
    if (url.hostname !== "animethemes.moe" && !url.hostname.endsWith(".animethemes.moe")) {
      return false;
    }
    if (!/\.(?:webm|mp4)$/i.test(url.pathname)) return false;
    if (
      typeof mimetype === "string" &&
      !mimetype.toLowerCase().startsWith("video/")
    ) {
      return false;
    }
    return typeof size === "number" && size > 0 && size <= MAX_VIDEO_BYTES;
  } catch {
    return false;
  }
}

async function checkFrames(entry: PoolEntry): Promise<{
  frames: number;
  source: "shikimori" | "tenrai" | "none";
  error: string | null;
}> {
  const errors: string[] = [];
  let frames = 0;
  let source: "shikimori" | "tenrai" | "none" = "none";
  try {
    const payload = await fetchJson(`${SHIKIMORI}/${entry.malId}/screenshots`);
    frames = imageUrls(payload).length;
    if (frames > 0) source = "shikimori";
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  if (frames < MIN_FRAMES) {
    try {
      const payload = await fetchJson(`${TENRAI}/anime/${entry.malId}/videos/episodes`);
      const extra = imageUrls(payload);
      if (extra.length > frames) {
        frames = extra.length;
        source = "tenrai";
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return {
    frames,
    source,
    error: frames >= MIN_FRAMES ? null : errors.join("; ") || "not enough screenshots",
  };
}

function malIdOfAnime(anime: unknown): number | null {
  for (const resource of array(object(object(anime)?.resources)?.nodes)) {
    const record = object(resource);
    const externalId = record?.externalId;
    if (string(record?.site) === "MAL" && typeof externalId === "number") {
      return externalId;
    }
  }
  return null;
}

function themeCheckOfAnime(anime: unknown): ThemeCheck {
  let hasOp = false;
  let hasTheme = false;
  for (const theme of array(object(anime)?.animethemes)) {
    const themeRecord = object(theme);
    const type = string(themeRecord?.type);
    if (type !== "OP" && type !== "ED") continue;
    for (const entryRecord of array(themeRecord?.animethemeentries)) {
      const entryObject = object(entryRecord);
      if (entryObject?.nsfw === true || entryObject?.spoiler === true) continue;
      for (const video of array(object(entryObject?.videos)?.nodes)) {
        const videoObject = object(video);
        const link = string(videoObject?.link);
        if (
          link !== null &&
          videoUrl(link, videoObject?.size, videoObject?.mimetype)
        ) {
          hasTheme = true;
          if (type === "OP") hasOp = true;
        }
      }
    }
  }
  return { hasOp, hasTheme };
}

async function checkThemes(malIds: number[]): Promise<Map<number, ThemeCheck>> {
  const result = new Map<number, ThemeCheck>();
  for (let index = 0; index < malIds.length; index += 50) {
    const batch = malIds.slice(index, index + 50);
    const payload = await fetchJson(ANIMETHEMES, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: THEME_QUERY, variables: { mal: batch } }),
    });
    const data = object(object(payload)?.data);
    for (const anime of array(data?.findAnimeByExternalSite)) {
      const malId = malIdOfAnime(anime);
      if (malId !== null) result.set(malId, themeCheckOfAnime(anime));
    }
  }
  return result;
}

async function checkEntry(
  entry: PoolEntry,
  themes: ThemeCheck
): Promise<CheckResult> {
  try {
    const frames = await checkFrames(entry);
    const modes: CheckMode[] = [];
    if (frames.frames >= MIN_FRAMES) modes.push("frames");
    if (themes.hasOp && themes.hasTheme) modes.push("op");
    if (themes.hasTheme) modes.push("audio");
    return {
      mediaId: entry.mediaId,
      malId: entry.malId,
      title: entry.title,
      tier: entry.tier,
      frames: frames.frames,
      frameSource: frames.source,
      hasOp: themes.hasOp,
      hasTheme: themes.hasTheme,
      modes,
      ok: modes.length > 0,
      error: modes.length > 0 ? null : frames.error,
    };
  } catch (error) {
    return {
      mediaId: entry.mediaId,
      malId: entry.malId,
      title: entry.title,
      tier: entry.tier,
      frames: 0,
      frameSource: "none",
      hasOp: false,
      hasTheme: false,
      modes: [],
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main(): Promise<void> {
  const pool = JSON.parse(await readFile(POOL_PATH, "utf8")) as PoolFile;
  const offset = Math.max(
    0,
    Math.min(pool.entries.length, Math.floor(Number(argument("--offset") ?? 0)))
  );
  const remaining = pool.entries.length - offset;
  const limit = numericArgument("--limit", remaining, remaining);
  const concurrency = numericArgument("--concurrency", 12, 12);
  const entries = pool.entries.slice(offset, offset + limit);
  const themesByMal = await checkThemes(entries.map((entry) => entry.malId));
  const results: CheckResult[] = new Array(entries.length);
  let next = 0;
  let completed = 0;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, entries.length) }, async () => {
      for (;;) {
        const index = next;
        next += 1;
        if (index >= entries.length) return;
        const entry = entries[index]!;
        results[index] = await checkEntry(
          entry,
          themesByMal.get(entry.malId) ?? { hasOp: false, hasTheme: false }
        );
        completed += 1;
        if (completed % 25 === 0 || completed === entries.length) {
          process.stdout.write(
            `[daily-quality] ${completed}/${entries.length} checked\n`
          );
        }
      }
    })
  );

  const failed = results.filter((result) => !result.ok);
  const byTier = new Map<string, { checked: number; passed: number }>();
  for (const result of results) {
    const row = byTier.get(result.tier) ?? { checked: 0, passed: 0 };
    row.checked += 1;
    if (result.ok) row.passed += 1;
    byTier.set(result.tier, row);
  }
  const reportPath = argument("--report") ?? DEFAULT_REPORT;
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(
    reportPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        poolVersion: pool.version,
        offset,
        checked: results.length,
        passed: results.length - failed.length,
        failed: failed.length,
        tiers: Object.fromEntries(byTier),
        results,
      },
      null,
      2
    )}\n`
  );

  process.stdout.write(
    `[daily-quality] passed ${results.length - failed.length}/${results.length}; report ${reportPath}\n`
  );
  for (const result of failed.slice(0, 20)) {
    process.stdout.write(
      `  FAIL ${result.tier} ${result.title}: frames=${result.frames} op=${result.hasOp} theme=${result.hasTheme}${result.error ? ` error=${result.error}` : ""}\n`
    );
  }
  if (failed.length > 0 && !args.includes("--allow-failures")) {
    process.exitCode = 1;
  }
}

await main();

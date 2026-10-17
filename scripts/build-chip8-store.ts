/**
 * Builds the embedded ROM store index from chip8Archive (CC0-1.0).
 *
 * Source: https://github.com/JohnEarnest/chip8Archive, pinned to one commit so
 * every recorded SHA-1 keeps matching the bytes the app later downloads from
 * raw.githubusercontent.com. Per-program archive options (tickrate, quirk
 * flags) are kept as metadata only: v1 runs the platform quirk profiles and
 * ignores them (see src-tauri/src/game/store.rs). The archive `howto` text is
 * trimmed and kept so the UI can show each ROM's controls (store list and game
 * screen); entries without it stay hint-free.
 *
 * Usage:
 *   bun scripts/build-chip8-store.ts                 # fetch (cached), build
 *   bun scripts/build-chip8-store.ts --force         # refetch files and the commit
 *   bun scripts/build-chip8-store.ts --commit <sha>  # build from an explicit commit
 *
 * Output: src-tauri/data/chip8-store-v1.json (embedded via include_str!)
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const REPO = "JohnEarnest/chip8Archive";
const RAW = `https://raw.githubusercontent.com/${REPO}`;
const COMMITS_API = `https://api.github.com/repos/${REPO}/commits/master`;
const CACHE_DIR = join("node_modules", ".cache", "iluha-chip8-store");
const OUTPUT = join("src-tauri", "data", "chip8-store-v1.json");
// Keep in sync with MAX_PROGRAM_BYTES in src-tauri/src/game/chip8.rs.
const MAX_PROGRAM_BYTES = 3584;
const PLATFORMS = ["chip8", "schip", "xochip"] as const;

type Platform = (typeof PLATFORMS)[number];

interface ArchiveProgram {
  title: string;
  authors: string[];
  platform: string;
  desc: string;
  howto?: string;
  options?: Record<string, unknown>;
}

interface CompactOptions {
  tickrate?: number;
  shiftQuirks?: boolean;
  loadStoreQuirks?: boolean;
  vfOrderQuirks?: boolean;
  clipQuirks?: boolean;
  jumpQuirks?: boolean;
}

interface StoreEntry {
  key: string;
  title: string;
  authors: string[];
  platform: Platform;
  desc: string;
  howto?: string;
  file: string;
  sha1: string;
  size: number;
  options?: CompactOptions;
}

const force = process.argv.includes("--force");

/** Build scripts report progress; oxlint only tolerates warn and error on the console. */
function log(message: string) {
  process.stdout.write(`${message}\n`);
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`--${name} needs a value`);
  return value;
}

function normalizePlatform(value: string): Platform | null {
  if (value === "chip8") return "chip8";
  if (value === "schip") return "schip";
  if (value === "xochip") return "xochip";
  return null;
}

function sha1Hex(bytes: Uint8Array): string {
  return createHash("sha1").update(bytes).digest("hex");
}

function compactOptions(options: Record<string, unknown> | undefined): CompactOptions | undefined {
  if (!options) return undefined;
  const compact: CompactOptions = {};
  const tickrate =
    typeof options["tickrate"] === "number" ? options["tickrate"] : Number(options["tickrate"]);
  if (Number.isFinite(tickrate) && tickrate > 0) compact.tickrate = tickrate;
  for (const flag of ["shiftQuirks", "loadStoreQuirks", "vfOrderQuirks", "clipQuirks", "jumpQuirks"] as const) {
    const value = options[flag];
    if (typeof value === "boolean") compact[flag] = value;
  }
  return Object.keys(compact).length > 0 ? compact : undefined;
}

/** Trims the archive controls text; blank or absent becomes undefined. */
function normalizeHowto(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : undefined;
}

async function cachedFetch(commit: string, relative: string): Promise<Uint8Array> {
  const cacheDir = join(CACHE_DIR, commit);
  const cachePath = join(cacheDir, relative.split("/").join("__"));
  if (!force) {
    const cached = await stat(cachePath).catch(() => null);
    if (cached?.size) {
      const bytes = new Uint8Array(await readFile(cachePath));
      log(`[chip8-store] cached ${relative} (${bytes.length} bytes)`);
      return bytes;
    }
  }
  const url = `${RAW}/${commit}/${relative}`;
  log(`[chip8-store] fetching ${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`fetch ${relative}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  await mkdir(cacheDir, { recursive: true });
  await writeFile(cachePath, bytes);
  return bytes;
}

async function resolveCommit(): Promise<string> {
  const override = argValue("commit");
  if (override) return override;
  const pinPath = join(CACHE_DIR, "latest.json");
  if (!force) {
    const cached = await readFile(pinPath, "utf-8").catch(() => null);
    if (cached !== null) {
      const parsed = JSON.parse(cached) as { commit?: string };
      if (parsed.commit) {
        log(`[chip8-store] cached commit ${parsed.commit}`);
        return parsed.commit;
      }
    }
  }
  log(`[chip8-store] resolving the latest commit via ${COMMITS_API}`);
  const response = await fetch(COMMITS_API, { headers: { "user-agent": "iluhaAnime-build" } });
  if (!response.ok) throw new Error(`commits API: HTTP ${response.status}`);
  const payload = (await response.json()) as {
    sha?: string;
    commit?: { committer?: { date?: string } };
  };
  if (!payload.sha) throw new Error("commits API: no sha in the response");
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(
    pinPath,
    JSON.stringify({ commit: payload.sha, date: payload.commit?.committer?.date ?? null })
  );
  return payload.sha;
}

async function main() {
  const commit = await resolveCommit();
  const programs = JSON.parse(
    new TextDecoder().decode(await cachedFetch(commit, "programs.json"))
  ) as Record<string, ArchiveProgram>;
  const entries: StoreEntry[] = [];
  const skipped: string[] = [];
  for (const [key, program] of Object.entries(programs)) {
    const platform = normalizePlatform(program.platform);
    if (platform === null) {
      skipped.push(`${key}: unknown platform "${program.platform}"`);
      continue;
    }
    const bytes = await cachedFetch(commit, `roms/${key}.ch8`);
    if (platform !== "xochip" && (bytes.length === 0 || bytes.length > MAX_PROGRAM_BYTES)) {
      skipped.push(
        `${key}: ${bytes.length} bytes do not fit the ${MAX_PROGRAM_BYTES}-byte address space`
      );
      continue;
    }
    entries.push({
      key,
      title: program.title,
      authors: program.authors,
      platform,
      desc: program.desc,
      howto: normalizeHowto(program.howto),
      file: `roms/${key}.ch8`,
      sha1: sha1Hex(bytes),
      size: bytes.length,
      options: compactOptions(program.options),
    });
  }
  entries.sort((a, b) => a.title.localeCompare(b.title, "en"));
  const payload = {
    version: 1,
    repo: REPO,
    commit,
    license: "CC0-1.0",
    generated: new Date().toISOString().slice(0, 10),
    entries,
  };
  await writeFile(OUTPUT, `${JSON.stringify(payload, null, 2)}\n`);
  const counts: Record<string, number> = {};
  let totalBytes = 0;
  for (const entry of entries) {
    counts[entry.platform] = (counts[entry.platform] ?? 0) + 1;
    totalBytes += entry.size;
  }
  log(
    `[chip8-store] wrote ${OUTPUT}: ${entries.length} entries ${JSON.stringify(counts)} (${totalBytes} bytes) at commit ${commit}`
  );
  for (const reason of skipped) log(`[chip8-store] skipped ${reason}`);
}

await main();

/**
 * Applies the checked modes from one or more quality reports to the daily
 * pool. Entries with no usable mode stay in the pool but are never picked.
 *
 * Usage:
 *   bun scripts/apply-daily-pool-quality.ts report-1.json report-2.json
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const POOL_PATH = join("src-tauri", "data", "daily-pool-v1.json");
const DEFAULT_REPORT = join("src-tauri", "data", "daily-pool-quality.json");
type CheckMode = "frames" | "op" | "audio";

interface PoolEntry {
  mediaId: number;
  title: string;
  modes?: CheckMode[];
}

interface PoolFile {
  version: number;
  entries: PoolEntry[];
}

interface QualityResult {
  mediaId: number;
  modes: CheckMode[];
  ok: boolean;
}

interface QualityReport {
  results: QualityResult[];
}

const paths = process.argv.slice(2);
const reportPaths = paths.length > 0 ? paths : [DEFAULT_REPORT];
const byMedia = new Map<number, CheckMode[]>();

for (const path of reportPaths) {
  const report = JSON.parse(await readFile(path, "utf8")) as QualityReport;
  for (const result of report.results) {
    byMedia.set(result.mediaId, result.ok ? result.modes : []);
  }
}

const pool = JSON.parse(await readFile(POOL_PATH, "utf8")) as PoolFile;
let changed = 0;
for (const entry of pool.entries) {
  const modes = byMedia.get(entry.mediaId);
  if (modes === undefined) {
    throw new Error(`quality report has no result for ${entry.mediaId} (${entry.title})`);
  }
  if (JSON.stringify(entry.modes ?? null) !== JSON.stringify(modes)) {
    entry.modes = modes;
    changed += 1;
  }
}

if (changed > 0) pool.version += 1;
await writeFile(POOL_PATH, `${JSON.stringify(pool, null, 2)}\n`);
const usable = pool.entries.filter((entry) => (entry.modes?.length ?? 0) > 0).length;
console.log(
  `[daily-pool] ${usable}/${pool.entries.length} usable; ${changed} entries updated; version ${pool.version}`
);

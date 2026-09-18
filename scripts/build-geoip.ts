/**
 * Builds the compact country-range table used to flag peers by country.
 *
 * Source: DB-IP Lite country database (CC-BY-4.0, https://db-ip.com), fetched through
 * the `@ip-location-db/dbip-country` mirror because it ships the ranges as plain numbers
 * instead of text addresses. Attribution is required by the license, so keep this
 * header and `src-tauri/src/torrent/geoip.rs` in sync when the data is regenerated.
 *
 * Usage:
 *   bun scripts/build-geoip.ts             # fetch (cached), build, gzip
 *   bun scripts/build-geoip.ts --force     # ignore the download cache
 *   bun scripts/build-geoip.ts --v4 a.csv --v6 b.csv --out path.bin.gz
 *
 * Output format (little endian), documented in the Rust reader as well:
 *   0   "ILG1"
 *   4   u8   version = 1
 *   5   u16  country count
 *   7   u32  v4 range count
 *   11  u32  v6 range count
 *   15  country table, `count` * 2 ASCII bytes
 *   then v4 range starts as varint deltas from the previous start (first from 0)
 *   then v4 country indices, one byte per range
 *   then v6 range starts as varint deltas
 *   then v6 country indices, one byte per range
 *
 * Ranges are made contiguous by inserting `XX` ("unknown") for every hole, and the table
 * always ends at the last address of the space, so a lookup is just "the last range whose
 * start is <= address" - no end bound has to be stored at all.
 */
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";

const MIRROR = "https://cdn.jsdelivr.net/npm/@ip-location-db/dbip-country";
const SOURCES = {
  v4: `${MIRROR}/dbip-country-ipv4-num.csv`,
  v6: `${MIRROR}/dbip-country-ipv6-num.csv`,
} as const;
const CACHE_DIR = join("node_modules", ".cache", "iluha-geoip");
const DEFAULT_OUT = join("src-tauri", "data", "geoip-v1.bin.gz");
const UNKNOWN = "XX";
const V4_MAX = 0xffff_ffffn;
const V6_MAX = (1n << 128n) - 1n;

interface Range {
  country: string;
  end: bigint;
  start: bigint;
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`--${name} needs a value`);
  return value;
}

const force = process.argv.includes("--force");

/** Build scripts report progress; oxlint only tolerates warn and error on the console. */
function log(message: string) {
  process.stdout.write(`${message}\n`);
}

async function sourcePath(kind: keyof typeof SOURCES, override?: string): Promise<string> {
  if (override) return override;
  await mkdir(CACHE_DIR, { recursive: true });
  const path = join(CACHE_DIR, `${kind}.csv`);
  if (!force) {
    const cached = await stat(path).catch(() => null);
    if (cached?.size) {
      log(`[geoip] cached ${kind}: ${path} (${cached.size} bytes)`);
      return path;
    }
  }
  const url = SOURCES[kind];
  log(`[geoip] downloading ${kind}: ${url}`);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`download failed for ${url}: ${response.status} ${response.statusText}`);
  }
  await writeFile(path, new Uint8Array(await response.arrayBuffer()));
  const saved = await stat(path);
  log(`[geoip] saved ${path} (${saved.size} bytes)`);
  return path;
}

function countryCode(raw: string): string {
  const code = raw.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : UNKNOWN;
}

async function parseCsv(path: string, max: bigint): Promise<Range[]> {
  const text = await readFile(path, "utf-8");
  const ranges: Range[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    const parts = trimmed.split(",");
    if (parts.length !== 3) throw new Error(`unexpected row in ${path}: ${trimmed}`);
    const start = BigInt(parts[0]);
    const end = BigInt(parts[1]);
    if (start > end || end > max) throw new Error(`bad range in ${path}: ${trimmed}`);
    const previous = ranges.at(-1);
    if (previous && start <= previous.end) {
      throw new Error(`ranges are not sorted/unique in ${path}: ${trimmed}`);
    }
    ranges.push({ country: countryCode(parts[2]), end, start });
  }
  if (ranges.length === 0) throw new Error(`no ranges parsed from ${path}`);
  return ranges;
}

/** Merges neighbours, then fills every hole so the table is searchable by start alone. */
function seal(ranges: Range[], max: bigint): Range[] {
  const merged: Range[] = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && last.country === range.country && range.start === last.end + 1n) {
      last.end = range.end;
      continue;
    }
    merged.push({ ...range });
  }
  const sealed: Range[] = [];
  let next = 0n;
  for (const range of merged) {
    if (range.start > next) sealed.push({ country: UNKNOWN, end: range.start - 1n, start: next });
    sealed.push(range);
    next = range.end + 1n;
  }
  if (next <= max) sealed.push({ country: UNKNOWN, end: max, start: next });
  return sealed;
}

function varint(value: bigint): number[] {
  const out: number[] = [];
  let rest = value;
  while (rest >= 0x80n) {
    out.push(Number((rest & 0x7fn) | 0x80n));
    rest >>= 7n;
  }
  out.push(Number(rest));
  return out;
}

function encodeRanges(ranges: Range[], codes: Map<string, number>) {
  const starts: number[] = [];
  const indices: number[] = [];
  let previous = 0n;
  for (const range of ranges) {
    starts.push(...varint(range.start - previous));
    previous = range.start;
    indices.push(codes.get(range.country) ?? 0);
  }
  return { indices: Uint8Array.from(indices), starts: Uint8Array.from(starts) };
}

async function main() {
  const v4 = seal(await parseCsv(await sourcePath("v4", argValue("v4")), V4_MAX), V4_MAX);
  const v6 = seal(await parseCsv(await sourcePath("v6", argValue("v6")), V6_MAX), V6_MAX);
  const outPath = argValue("out") ?? DEFAULT_OUT;

  const codes = new Map<string, number>([[UNKNOWN, 0]]);
  for (const range of [...v4, ...v6]) {
    if (!codes.has(range.country)) codes.set(range.country, codes.size);
  }
  if (codes.size > 255) throw new Error(`too many country codes: ${codes.size}`);
  const codeList = [...codes.keys()];

  const v4Encoded = encodeRanges(v4, codes);
  const v6Encoded = encodeRanges(v6, codes);

  const header = new Uint8Array(15 + codeList.length * 2);
  header.set(new TextEncoder().encode("ILG1"), 0);
  const view = new DataView(header.buffer);
  view.setUint8(4, 1);
  view.setUint16(5, codeList.length, true);
  view.setUint32(7, v4.length, true);
  view.setUint32(11, v6.length, true);
  codeList.forEach((code, index) => {
    header[15 + index * 2] = code.codePointAt(0) ?? 0;
    header[15 + index * 2 + 1] = code.codePointAt(1) ?? 0;
  });

  const parts = [header, v4Encoded.starts, v4Encoded.indices, v6Encoded.starts, v6Encoded.indices];
  const raw = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    raw.set(part, offset);
    offset += part.length;
  }

  const packed = gzipSync(raw, { level: 9 });
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, packed);

  log(
    [
      `[geoip] countries: ${codeList.length}`,
      `[geoip] v4 ranges: ${v4.length} (${v4Encoded.starts.length} start bytes)`,
      `[geoip] v6 ranges: ${v6.length} (${v6Encoded.starts.length} start bytes)`,
      `[geoip] raw: ${raw.length} bytes`,
      `[geoip] gzip: ${packed.length} bytes -> ${outPath}`,
    ].join("\n")
  );
}

await main();

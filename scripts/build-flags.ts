/**
 * Builds the single-file country flag sprite shown next to peer addresses.
 *
 * Art: flag-icons (MIT) rendered to 16x12 PNGs by https://flagcdn.com, one request per
 * country. Every code the GeoIP table can emit gets a cell, so a peer never loses its flag
 * to a missing sprite entry - the build fails instead when a code has no art.
 *
 * The source flags are 8-bit PNGs (RGBA in some cases, palette in others, never interlaced),
 * so the sheet is assembled with the small codec below rather than a native image
 * dependency: decode each flag to RGBA, blit it into the grid, encode the grid back to PNG.
 *
 * Usage:
 *   bun scripts/build-flags.ts              # fetch (cached), build both outputs
 *   bun scripts/build-flags.ts --force      # ignore the download cache
 *   bun scripts/build-flags.ts --geoip path # read the country list from elsewhere
 *
 * Outputs:
 *   public/images/flags.sprite.png          the spritesheet
 *   src/lib/torrent/flags.generated.ts      country code -> cell offset + sheet size
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { deflateSync, gunzipSync, inflateSync } from "node:zlib";

const CDN = "https://flagcdn.com";
const CACHE_DIR = join("node_modules", ".cache", "iluha-flags");
const SPRITE_OUT = join("public", "images", "flags.sprite.png");
const INDEX_OUT = join("src", "lib", "torrent", "flags.generated.ts");
const DEFAULT_GEOIP = join("src-tauri", "data", "geoip-v1.bin.gz");
const CELL_WIDTH = 16;
const CELL_HEIGHT = 12;
const COLUMNS = 16;

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

/* ------------------------------------------------------------------ PNG codec */

const SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xed_b8_83_20 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xff_ff_ff_ff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xff_ff_ff_ff) >>> 0;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const head = new Uint8Array(4);
  new DataView(head.buffer).setUint32(0, data.length);
  const body = concat([new TextEncoder().encode(type), data]);
  const tail = new Uint8Array(4);
  new DataView(tail.buffer).setUint32(0, crc32(body));
  return concat([head, body, tail]);
}

interface ChunkInfo {
  data: Uint8Array;
  type: string;
}

function readChunks(bytes: Uint8Array): ChunkInfo[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: ChunkInfo[] = [];
  let at = SIGNATURE.length;
  while (at + 8 <= bytes.length) {
    const length = view.getUint32(at);
    const type = String.fromCodePoint(...bytes.subarray(at + 4, at + 8));
    out.push({ type, data: bytes.subarray(at + 8, at + 8 + length) });
    at += 12 + length;
  }
  return out;
}

/** Paeth predictor, straight from the PNG spec. */
function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toUpLeft = Math.abs(estimate - upLeft);
  if (toLeft <= toUp && toLeft <= toUpLeft) return left;
  return toUp <= toUpLeft ? up : upLeft;
}

function unfilter(kind: number, line: Uint8Array, previous: Uint8Array, bytesPerPixel: number) {
  for (let index = 0; index < line.length; index += 1) {
    const left = index >= bytesPerPixel ? line[index - bytesPerPixel]! : 0;
    const up = previous[index]!;
    const upLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel]! : 0;
    const value = line[index]!;
    switch (kind) {
      case 0: {
        break;
      }
      case 1: {
        line[index] = (value + left) & 0xff;
        break;
      }
      case 2: {
        line[index] = (value + up) & 0xff;
        break;
      }
      case 3: {
        line[index] = (value + ((left + up) >> 1)) & 0xff;
        break;
      }
      case 4: {
        line[index] = (value + paeth(left, up, upLeft)) & 0xff;
        break;
      }
      default: {
        throw new Error(`unknown PNG filter ${kind}`);
      }
    }
  }
}

interface Raster {
  height: number;
  rgba: Uint8Array;
  width: number;
}

/** Writes one source pixel as RGBA, resolving palette entries and their transparency. */
function expandPixel(
  line: Uint8Array,
  rgba: Uint8Array,
  target: number,
  source: number,
  colour: number | undefined,
  palette: Uint8Array | undefined,
  transparency: Uint8Array | undefined
) {
  if (colour === 3) {
    const index = line[source]!;
    rgba[target] = palette![index * 3]!;
    rgba[target + 1] = palette![index * 3 + 1]!;
    rgba[target + 2] = palette![index * 3 + 2]!;
    rgba[target + 3] = transparency && index < transparency.length ? transparency[index]! : 255;
    return;
  }
  rgba[target] = line[source]!;
  rgba[target + 1] = line[source + 1]!;
  rgba[target + 2] = line[source + 2]!;
  rgba[target + 3] = colour === 6 ? line[source + 3]! : 255;
}

/** Decodes the 8-bit, non-interlaced greyscale-free PNGs the flag CDN serves. */
function decodePng(bytes: Uint8Array): Raster {
  if (!SIGNATURE.every((byte, index) => bytes[index] === byte)) {
    throw new Error("not a PNG");
  }
  const info = readChunks(bytes);
  const header = info.find((entry) => entry.type === "IHDR");
  if (!header) throw new Error("PNG has no IHDR");
  const view = new DataView(header.data.buffer, header.data.byteOffset, header.data.byteLength);
  const width = view.getUint32(0);
  const height = view.getUint32(4);
  const [depth, colour, compression, filtering, interlace] = header.data.subarray(8, 13);
  if (depth !== 8 || compression !== 0 || filtering !== 0 || interlace !== 0) {
    throw new Error(`unsupported PNG: depth ${depth} interlace ${interlace}`);
  }
  // 0 greyscale and 4 greyscale+alpha are never served by the CDN, only 2/3/6 are handled.
  const channels = colour === 6 ? 4 : colour === 2 ? 3 : colour === 3 ? 1 : 0;
  if (channels === 0) throw new Error(`unsupported PNG colour type ${colour}`);

  const palette = info.find((entry) => entry.type === "PLTE")?.data;
  const transparency = info.find((entry) => entry.type === "tRNS")?.data;
  if (colour === 3 && !palette) throw new Error("palette PNG has no PLTE");
  const compressed = concat(info.filter((entry) => entry.type === "IDAT").map((e) => e.data));
  const raw = new Uint8Array(inflateSync(compressed));

  const stride = width * channels;
  if (raw.length !== (stride + 1) * height) {
    throw new Error(`PNG payload is ${raw.length} bytes, expected ${(stride + 1) * height}`);
  }
  const rgba = new Uint8Array(width * height * 4);
  const line = new Uint8Array(stride);
  const previous = new Uint8Array(stride);
  let at = 0;
  for (let row = 0; row < height; row += 1) {
    const kind = raw[at]!;
    at += 1;
    line.set(raw.subarray(at, at + stride));
    at += stride;
    unfilter(kind, line, previous, channels);
    for (let column = 0; column < width; column += 1) {
      expandPixel(
        line,
        rgba,
        (row * width + column) * 4,
        column * channels,
        colour,
        palette,
        transparency
      );
    }
    previous.set(line);
  }
  return { width, height, rgba };
}

/** Flat flag art compresses much better under Sub/Up/Paeth than under no filter at all. */
function encodePng({ width, height, rgba }: Raster): Uint8Array {
  const stride = width * 4;
  const candidates = [0, 1, 2, 4].map((kind) => {
    const raw = new Uint8Array((stride + 1) * height);
    const previous = new Uint8Array(stride);
    const line = new Uint8Array(stride);
    for (let row = 0; row < height; row += 1) {
      const start = row * stride;
      raw[row * (stride + 1)] = kind;
      for (let index = 0; index < stride; index += 1) {
        const value = rgba[start + index]!;
        const left = index >= 4 ? rgba[start + index - 4]! : 0;
        const up = previous[index]!;
        const upLeft = index >= 4 ? previous[index - 4]! : 0;
        const predicted =
          kind === 1 ? left : kind === 2 ? up : kind === 4 ? paeth(left, up, upLeft) : 0;
        line[index] = (value - predicted) & 0xff;
      }
      raw.set(line, row * (stride + 1) + 1);
      previous.set(rgba.subarray(start, start + stride));
    }
    return new Uint8Array(deflateSync(raw, { level: 9 }));
  });
  const deflated = candidates.reduce((best, next) => (next.length < best.length ? next : best));
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8;
  header[9] = 6;
  return concat([
    SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", deflated),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

/* ------------------------------------------------------------------- sources */

async function download(code: string): Promise<Uint8Array> {
  await mkdir(CACHE_DIR, { recursive: true });
  const path = join(CACHE_DIR, `${code}.png`);
  if (!force) {
    const cached = await readFile(path).catch(() => null);
    if (cached?.byteLength) return cached;
  }
  const response = await fetch(`${CDN}/16x12/${code}.png`);
  if (!response.ok) throw new Error(`no art for ${code}: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  await writeFile(path, bytes);
  return bytes;
}

/** Country codes the GeoIP table can produce, read straight out of its header. */
async function geoipCountries(path: string): Promise<string[]> {
  if (!existsSync(path)) throw new Error(`${path} is missing, run \`bun run data:geoip\``);
  const raw = gunzipSync(await readFile(path));
  if (new TextDecoder().decode(raw.subarray(0, 4)) !== "ILG1") {
    throw new Error(`${path} is not an ILG1 table`);
  }
  const count = raw[5]! | (raw[6]! << 8);
  const codes: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const at = 15 + index * 2;
    codes.push(String.fromCodePoint(raw[at]!, raw[at + 1]!).toLowerCase());
  }
  // XX is the table's "no country" bucket, not a place to put on a map.
  return [...new Set(codes.filter((code) => code !== "xx"))].sort();
}

/* --------------------------------------------------------------------- build */

async function main() {
  const codes = await geoipCountries(argValue("geoip") ?? DEFAULT_GEOIP);
  const rows = Math.ceil(codes.length / COLUMNS);
  const sheetWidth = COLUMNS * CELL_WIDTH;
  const sheetHeight = rows * CELL_HEIGHT;
  const sheet = new Uint8Array(sheetWidth * sheetHeight * 4);

  let cursor = 0;
  const fetched: { code: string; raster: Raster }[] = [];
  await Promise.all(
    Array.from({ length: 12 }, async () => {
      while (cursor < codes.length) {
        const code = codes[cursor++]!;
        fetched.push({ code, raster: decodePng(await download(code)) });
      }
    })
  );

  for (const { code, raster } of fetched) {
    if (raster.width !== CELL_WIDTH || raster.height !== CELL_HEIGHT) {
      throw new Error(
        `${code} is ${raster.width}x${raster.height}, expected ${CELL_WIDTH}x${CELL_HEIGHT}`
      );
    }
  }

  fetched.sort((left, right) => (left.code < right.code ? -1 : 1));
  const cells = new Map<string, { x: number; y: number }>();
  fetched.forEach(({ code, raster }, index) => {
    const originX = (index % COLUMNS) * CELL_WIDTH;
    const originY = Math.floor(index / COLUMNS) * CELL_HEIGHT;
    cells.set(code, { x: originX, y: originY });
    for (let row = 0; row < CELL_HEIGHT; row += 1) {
      const from = row * CELL_WIDTH * 4;
      const to = ((originY + row) * sheetWidth + originX) * 4;
      sheet.set(raster.rgba.subarray(from, from + CELL_WIDTH * 4), to);
    }
  });

  const missing = codes.filter((code) => !cells.has(code));
  if (missing.length > 0) throw new Error(`no sprite cell for ${missing.join(" ")}`);

  const png = encodePng({ width: sheetWidth, height: sheetHeight, rgba: sheet });
  // A third-party decoder has to accept the sheet; a broken encoder must not ship as an asset.
  const back = decodePng(png);
  if (back.width !== sheetWidth || back.height !== sheetHeight)
    throw new Error("sheet did not round-trip");
  if (back.rgba.some((byte, index) => byte !== sheet[index])) {
    throw new Error("sheet pixels changed on round-trip");
  }

  const entries = [...cells].map(([code, cell]) => `  ${code}: [${cell.x}, ${cell.y}],`).join("\n");
  const index = `// Generated by scripts/build-flags.ts from flagcdn 16x12 flags (flag-icons, MIT) - do not edit.
export const FLAG_SPRITE_PATH = "/images/flags.sprite.png";
export const FLAG_CELL_WIDTH = ${CELL_WIDTH};
export const FLAG_CELL_HEIGHT = ${CELL_HEIGHT};
export const FLAG_SHEET_WIDTH = ${sheetWidth};
export const FLAG_SHEET_HEIGHT = ${sheetHeight};
export const FLAG_CELLS: Record<string, readonly [number, number]> = {
${entries}
};
`;

  await mkdir(dirname(SPRITE_OUT), { recursive: true });
  await mkdir(dirname(INDEX_OUT), { recursive: true });
  await writeFile(SPRITE_OUT, png);
  await writeFile(INDEX_OUT, index);

  const sprite = await stat(SPRITE_OUT);
  log(
    [
      `[flags] cells: ${codes.length} in a ${sheetWidth}x${sheetHeight} sheet`,
      `[flags] sprite: ${sprite.size} bytes -> ${SPRITE_OUT}`,
      `[flags] index: -> ${INDEX_OUT}`,
    ].join("\n")
  );
}

await main();

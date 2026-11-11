import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

import { outRoot } from "./harness";

const VIDEO_EXTENSIONS = new Set([".mkv", ".mp4", ".m4v", ".avi", ".mov", ".webm", ".ts"]);
const DEFAULT_MEDIA_ROOT = "D:\\Anime & Movies";
const PROBE_CONCURRENCY = 4;

export interface MediaStream {
  index: number;
  codec: string;
  profile: string | null;
  pixFmt: string | null;
  width: number | null;
  height: number | null;
  bitDepth: number | null;
  bitRate: number | null;
  channels: number | null;
  language: string | null;
  title: string | null;
}

export interface MediaFile {
  path: string;
  size: number;
  duration: number;
  format: string;
  bitRate: number | null;
  video: MediaStream[];
  audio: MediaStream[];
  subtitle: MediaStream[];
}

export interface SelectedMedia {
  file: MediaFile;
  reasons: string[];
}

export interface MediaInventory {
  root: string;
  generatedAt: string;
  scannedCount: number;
  probedCount: number;
  failedCount: number;
  errors: string[];
  files: MediaFile[];
  selected: SelectedMedia[];
}

interface ProbeStream {
  index?: number;
  codec_type?: string;
  codec_name?: string;
  profile?: string;
  pix_fmt?: string;
  width?: number;
  height?: number;
  bit_rate?: string;
  channels?: number;
  tags?: { language?: string; title?: string };
}

interface ProbeResult {
  format?: {
    format_name?: string;
    duration?: string;
    size?: string;
    bit_rate?: string;
  };
  streams?: ProbeStream[];
}

function mediaRoot(): string {
  return process.env.ILUHA_E2E_MEDIA_ROOT ?? DEFAULT_MEDIA_ROOT;
}

function ffprobePath(): string {
  return process.env.ILUHA_FFPROBE ?? "ffprobe";
}

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    const chunks: Buffer[] = [];
    let size = 0;
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 8 * 1024 * 1024) {
        child.kill();
        reject(new Error(`${command} output exceeded 8 MB`));
        return;
      }
      chunks.push(chunk);
    });
    child.stderr.on("data", () => undefined);
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(chunks).toString("utf-8"));
      else reject(new Error(`${command} exited with code ${code ?? "null"}`));
    });
  });
}

function bitDepth(pixFmt: string | undefined, profile: string | undefined): number | null {
  if (pixFmt) {
    const match = /p(\d{1,2})(?:le|be)?$/i.exec(pixFmt);
    if (match) return Number(match[1]);
  }
  if (profile?.includes("10")) return 10;
  return null;
}

function streamOf(stream: ProbeStream): MediaStream {
  return {
    index: Number(stream.index ?? 0),
    codec: stream.codec_name ?? "unknown",
    profile: stream.profile ?? null,
    pixFmt: stream.pix_fmt ?? null,
    width: stream.width ?? null,
    height: stream.height ?? null,
    bitDepth: bitDepth(stream.pix_fmt, stream.profile),
    bitRate: stream.bit_rate === undefined ? null : Number(stream.bit_rate),
    channels: stream.channels ?? null,
    language: stream.tags?.language ?? null,
    title: stream.tags?.title ?? null,
  };
}

async function probe(path: string, size: number): Promise<MediaFile> {
  const output = await run(ffprobePath(), [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    path,
  ]);
  const parsed = JSON.parse(output) as ProbeResult;
  const streams = parsed.streams ?? [];
  const video = streams
    .filter((stream) => stream.codec_type === "video" && !stream.tags?.title?.toLowerCase().includes("cover"))
    .map(streamOf);
  const audio = streams.filter((stream) => stream.codec_type === "audio").map(streamOf);
  const subtitle = streams.filter((stream) => stream.codec_type === "subtitle").map(streamOf);
  const duration = Number(parsed.format?.duration ?? 0);
  if (video.length === 0 || !Number.isFinite(duration) || duration <= 0) {
    throw new Error("no playable video stream or duration");
  }
  return {
    path,
    size,
    duration,
    format: parsed.format?.format_name ?? "unknown",
    bitRate: parsed.format?.bit_rate === undefined ? null : Number(parsed.format.bit_rate),
    video,
    audio,
    subtitle,
  };
}

async function walk(
  directory: string,
  files: Array<{ path: string; size: number }>,
  errors: string[]
): Promise<void> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    errors.push(`${directory}: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(path, files, errors);
      continue;
    }
    if (!entry.isFile() || !VIDEO_EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf(".")).toLowerCase())) {
      continue;
    }
    try {
      const details = await stat(path);
      files.push({ path, size: details.size });
    } catch (error) {
      errors.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index] as T);
    }
  });
  await Promise.all(lanes);
  return results;
}

function selectMedia(files: MediaFile[]): SelectedMedia[] {
  const bySize = [...files].sort((left, right) => right.size - left.size);
  const selected = new Map<string, SelectedMedia>();
  const add = (file: MediaFile | undefined, reason: string): void => {
    if (!file) return;
    const current = selected.get(file.path);
    if (current) current.reasons.push(reason);
    else selected.set(file.path, { file, reasons: [reason] });
  };
  add(bySize[0], "largest valid video");
  add(
    bySize.find((file) =>
      file.video.some(
        (stream) =>
          stream.codec === "hevc" &&
          (stream.profile?.toLowerCase().includes("10") || (stream.bitDepth ?? 0) >= 10)
      )
    ),
    "largest HEVC 10-bit video"
  );
  add(
    bySize.find((file) => file.audio.length > 1 || file.subtitle.length > 1),
    "largest multi-track video"
  );
  return [...selected.values()];
}

export async function buildMediaInventory(root = mediaRoot()): Promise<MediaInventory> {
  if (!existsSync(root)) throw new Error(`media root is not accessible: ${root}`);
  const files: Array<{ path: string; size: number }> = [];
  const errors: string[] = [];
  await walk(root, files, errors);
  const probed = await mapLimit(files, PROBE_CONCURRENCY, async (file) => {
    try {
      return await probe(file.path, file.size);
    } catch (error) {
      errors.push(`${file.path}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  });
  const valid = probed.filter((file): file is MediaFile => file !== null);
  if (valid.length === 0) throw new Error(`no valid video files under ${root}`);
  return {
    root,
    generatedAt: new Date().toISOString(),
    scannedCount: files.length,
    probedCount: valid.length,
    failedCount: files.length - valid.length,
    errors: errors.slice(0, 100),
    files: valid,
    selected: selectMedia(valid),
  };
}

function markdown(inventory: MediaInventory): string {
  const rows = inventory.selected.map(({ file, reasons }) => {
    const video = file.video[0];
    return `| ${file.path} | ${file.size} | ${file.duration.toFixed(0)} s | ${video?.codec ?? "?"} | ${video?.pixFmt ?? "?"} | ${file.audio.length} | ${file.subtitle.length} | ${reasons.join(", ")} |`;
  });
  return [
    "# Local E2E media inventory",
    "",
    `- root: ${inventory.root}`,
    `- scanned: ${inventory.scannedCount}`,
    `- probed: ${inventory.probedCount}`,
    `- failed: ${inventory.failedCount}`,
    `- generated: ${inventory.generatedAt}`,
    "",
    "| path | bytes | duration | video | pix_fmt | audio | subtitle | selected because |",
    "| --- | ---: | ---: | --- | --- | ---: | ---: | --- |",
    ...rows,
  ].join("\n");
}

export async function ensureMediaInventory(outDir: string): Promise<MediaInventory> {
  const cacheDir = outRoot();
  mkdirSync(cacheDir, { recursive: true });
  const cachePath = join(cacheDir, "media-inventory.json");
  const root = mediaRoot();
  let inventory: MediaInventory | null = null;
  if (!process.env.ILUHA_E2E_REFRESH_MEDIA && existsSync(cachePath)) {
    const cached = JSON.parse(readFileSync(cachePath, "utf-8")) as MediaInventory;
    if (cached.root === root) inventory = cached;
  }
  inventory ??= await buildMediaInventory(root);
  writeFileSync(cachePath, JSON.stringify(inventory, null, 2));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "media-inventory.json"), JSON.stringify(inventory, null, 2));
  writeFileSync(join(outDir, "media-inventory.md"), markdown(inventory));
  return inventory;
}

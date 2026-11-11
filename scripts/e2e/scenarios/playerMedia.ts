import { writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Browser, Page } from "playwright-core";

import { TAB, clickTabByAnyOf, findPlayerPage, invoke, sleep } from "../cdp";
import type { Scenario } from "../harness";
import { ensureMediaInventory, type MediaFile } from "../media";
import { formatBytes, sampleProcessTree, type TreeSample } from "../process-tree";

interface Track {
  index: number;
  id: number;
  type: string;
  selected: boolean;
}

function requireOpen(opened: OpenMedia | null): OpenMedia {
  if (!opened) throw new Error("player was not opened");
  return opened;
}

interface OpenMedia {
  page: Page;
  startedAt: number;
  ms: number;
  prewarmed: boolean;
}

interface PlayerSample extends TreeSample {
  phase: string;
}

interface PlayerMeasurement {
  media: MediaFile;
  /** True when the open reused the hidden prewarmed window instead of building one. */
  prewarmed: boolean;
  openedMs: number;
  playbackStartedMs: number;
  seekMs: number[];
  trackChanges: string[];
}

const TRACK_SCAN_LIMIT = 32;

function normalizePath(value: string | null): string {
  return (value ?? "").replace(/^\\\\\?\\/, "").replaceAll("\\", "/").toLowerCase();
}

function samePath(value: string | null, expected: string): boolean {
  return normalizePath(value) === normalizePath(expected);
}

async function prop<T>(page: Page, name: string, format: "double" | "flag" | "int64" | "string"): Promise<T | null> {
  try {
    return await invoke<T | null>(page, "player_get_property", { name, format });
  } catch {
    return null;
  }
}

async function waitFor<T>(
  read: () => Promise<T | null>,
  accept: (value: T) => boolean,
  what: string,
  timeoutMs = 30_000
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T | null = null;
  while (Date.now() < deadline) {
    last = await read();
    if (last !== null && accept(last)) return last;
    await sleep(200);
  }
  throw new Error(`${what} did not settle within ${timeoutMs}ms; last value: ${String(last)}`);
}

async function timePos(page: Page): Promise<number> {
  return (await prop<number>(page, "time-pos", "double")) ?? 0;
}

async function setProperty(page: Page, name: string, value: unknown): Promise<void> {
  await invoke(page, "player_set_property", { name, value });
}

async function playerPages(browser: Browser): Promise<Page[]> {
  return browser
    .contexts()
    .flatMap((context) => context.pages())
    .filter((page) => page.url().includes("/player-window"));
}

async function closePlayer(browser: Browser): Promise<void> {
  const open = await playerPages(browser);
  const page = open[0];
  if (!page) return;
  await invoke(page, "player_close_window").catch(() => undefined);
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const remaining = await playerPages(browser);
    if (remaining.length === 0) return;
    await sleep(200);
  }
  throw new Error("player window did not close");
}

async function openMedia(
  browser: Browser,
  main: Page,
  media: MediaFile,
  reusePrewarmed = false
): Promise<OpenMedia> {
  const openPages = await playerPages(browser);
  const prewarmed = reusePrewarmed && openPages.length > 0;
  if (!prewarmed) await closePlayer(browser);
  const started = Date.now();
  await invoke(main, "player_open", {
    files: [media.path],
    resume: null,
    startIndex: 0,
    watch: null,
  });
  const page = await findPlayerPage(browser, 120_000);
  const path = await waitFor(
    () => prop<string>(page, "path", "string"),
    (value) => samePath(value, media.path),
    "mpv path",
    120_000
  );
  if (!samePath(path, media.path)) throw new Error(`mpv opened ${path}, expected ${media.path}`);
  await waitFor(
    () => prop<number>(page, "duration", "double"),
    (value) => value > 0,
    "media duration",
    120_000
  );
  await waitFor(
    () => prop<boolean>(page, "vo-configured", "flag"),
    (value) => value,
    "video output",
    120_000
  );
  return { page, startedAt: started, ms: Date.now() - started, prewarmed };
}

async function startPlayback(player: Page): Promise<number> {
  const before = await timePos(player);
  await setProperty(player, "pause", false);
  await waitFor(
    () => timePos(player),
    (value) => value > before + 0.4,
    "playback position to advance",
    20_000
  );
  return Date.now();
}

async function pauseAndVerify(player: Page): Promise<void> {
  await setProperty(player, "pause", true);
  const pausedAt = await timePos(player);
  await sleep(1200);
  const after = await timePos(player);
  if (Math.abs(after - pausedAt) > 0.4) {
    throw new Error(`paused position moved from ${pausedAt} to ${after}`);
  }
}

async function seekTo(player: Page, target: number, tolerance: number): Promise<number> {
  const started = Date.now();
  await setProperty(player, "time-pos", target);
  await waitFor(
    () => timePos(player),
    (value) => Math.abs(value - target) <= tolerance,
    `seek to ${target.toFixed(1)}s`,
    30_000
  );
  return Date.now() - started;
}

async function tracksOf(player: Page): Promise<Track[]> {
  const count = (await prop<number>(player, "track-list/count", "int64")) ?? 0;
  const tracks: Track[] = [];
  for (let index = 0; index < Math.min(count, TRACK_SCAN_LIMIT); index += 1) {
    const type = await prop<string>(player, `track-list/${index}/type`, "string");
    const id = await prop<number>(player, `track-list/${index}/id`, "int64");
    if (type === null || id === null) continue;
    const selected = (await prop<boolean>(player, `track-list/${index}/selected`, "flag")) ?? false;
    tracks.push({ index, id, type, selected });
  }
  return tracks;
}

async function switchTrack(
  player: Page,
  tracks: Track[],
  type: "audio" | "subtitle",
  property: "aid" | "sid"
): Promise<string | null> {
  const available = tracks.filter((track) => track.type === type);
  if (available.length < 2) return `only ${available.length} ${type} track(s)`;
  const target = available.find((track) => !track.selected) ?? available[0];
  if (!target) return `no alternate ${type} track`;
  const before = await timePos(player);
  await setProperty(player, property, String(target.id));
  await waitFor(
    () => prop<boolean>(player, `track-list/${target.index}/selected`, "flag"),
    (value) => value,
    `${type} track selection`
  );
  await sleep(500);
  if (Math.abs((await timePos(player)) - before) > 2) {
    throw new Error(`${type} switch moved playback away from ${before.toFixed(1)}s`);
  }
  return null;
}

async function subtitleToggle(player: Page, tracks: Track[]): Promise<string | null> {
  const subtitles = tracks.filter((track) => track.type === "sub" || track.type === "subtitle");
  if (subtitles.length === 0) return "no subtitle track";
  const first = subtitles[0];
  if (!first) return "no subtitle track";
  await setProperty(player, "sid", String(first.id));
  await waitFor(
    () => prop<boolean>(player, `track-list/${first.index}/selected`, "flag"),
    (value) => value,
    "subtitle enable"
  );
  await setProperty(player, "sid", "no");
  await waitFor(
    () => prop<string>(player, "sid", "string"),
    (value) => value === "no" || value === "auto",
    "subtitle disable"
  );
  await setProperty(player, "sid", String(first.id));
  return null;
}

function report(measurements: PlayerMeasurement[], samples: PlayerSample[]): string {
  return [
    "# Real media player report",
    "",
    "| media | window | bytes | open ms | first playback ms | seeks | tracks |",
    "| --- | --- | ---: | ---: | ---: | ---: | --- |",
    ...measurements.map(
      (item) =>
        `| ${item.media.path} | ${item.prewarmed ? "prewarmed" : "cold"} | ${formatBytes(item.media.size)} | ${item.openedMs} | ${item.playbackStartedMs} | ${item.seekMs.join(", ")} | ${item.trackChanges.join("; ") || "none"} |`
    ),
    "",
    "| phase | processes | working set | private | cpu one-core % |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...samples.map(
      (sample) =>
        `| ${sample.phase} | ${sample.processCount} | ${formatBytes(sample.workingSetBytes)} | ${formatBytes(sample.privateBytes)} | ${sample.cpuPercentOneCore?.toFixed(1) ?? "n/a"} |`
    ),
  ].join("\n");
}

export const playerMedia: Scenario = {
  name: "playerMedia",
  async run({ browser, page, outDir, step, skip }) {
    let inventory;
    try {
      inventory = await ensureMediaInventory(outDir);
    } catch (error) {
      await skip("media inventory", error instanceof Error ? error.message : String(error));
      return;
    }
    const candidates = inventory.selected.slice(0, 3);
    if (candidates.length === 0) {
      await skip("media inventory", "inventory selected no playable candidates");
      return;
    }

    const measurements: PlayerMeasurement[] = [];
    const samples: PlayerSample[] = [];
    let previous: TreeSample | undefined;
    const take = async (phase: string): Promise<void> => {
      const sample = await sampleProcessTree(previous);
      previous = sample;
      samples.push({ ...sample, phase });
    };

    try {
      await step("media candidates selected", async () => {
        if (inventory.selected.length === 0) throw new Error("no selected media candidates");
      });

      await step("prewarm lifecycle", async () => {
        await closePlayer(browser);
        await invoke(page, "player_prewarm");
        await findPlayerPage(browser, 30_000);
        const released = await invoke<boolean>(page, "player_release_prewarm");
        if (!released) throw new Error("idle prewarm was not released");
        const deadline = Date.now() + 20_000;
        let remaining = await playerPages(browser);
        while (remaining.length > 0) {
          if (Date.now() > deadline) throw new Error("released prewarm window stayed open");
          await sleep(200);
          remaining = await playerPages(browser);
        }
        const again = await invoke<boolean>(page, "player_release_prewarm");
        if (again) throw new Error("release reported a window that did not exist");
        // With E2E_PREWARM=1 the first open below measures the warm path that
        // the settings toggle enables; otherwise it measures a cold open.
        if (process.env.E2E_PREWARM === "1") {
          await invoke(page, "player_prewarm");
          await findPlayerPage(browser, 30_000);
          // The settings toggle warms the window when the tab opens; a user
          // spends at least this long browsing before clicking a file.
          await sleep(2000);
        }
      });

      for (const [index, candidate] of candidates.entries()) {
        const label = `${index + 1}:${candidate.file.path.split(/[\\/]/).pop() ?? "media"}`;
        let opened: OpenMedia | null = null;
        const measurement: PlayerMeasurement = {
          media: candidate.file,
          prewarmed: false,
          openedMs: 0,
          playbackStartedMs: 0,
          seekMs: [],
          trackChanges: [],
        };

        await step(`open ${label}`, async () => {
          await take(`before:${label}`);
          // The first open reuses the startup-prewarmed window when it exists,
          // so the report has one warm baseline next to the cold opens. Every
          // later open starts from a closed window on purpose: it measures the
          // worst case a user sees after closing the player.
          const reuse = index === 0;
          opened = await openMedia(browser, page, candidate.file, reuse);
          measurement.prewarmed = opened.prewarmed;
          measurement.openedMs = opened.ms;
          await take(`open:${label}`);
        });

        await step(`play and pause ${label}`, async () => {
          const current = requireOpen(opened);
          const started = await startPlayback(current.page);
          measurement.playbackStartedMs = started - current.startedAt;
          await sleep(1500);
          await pauseAndVerify(current.page);
          await setProperty(current.page, "pause", false);
          await waitFor(
            () => timePos(current.page),
            (value) => value > 0,
            "resume playback",
            15_000
          );
          await take(`play:${label}`);
        });

        await step(`seek ${label}`, async () => {
          const current = requireOpen(opened);
          const duration = (await prop<number>(current.page, "duration", "double")) ?? 0;
          if (duration <= 0) throw new Error("duration is unavailable");
          const tolerance = Math.max(2, duration * 0.02);
          for (const fraction of [0.2, 0.5, 0.75]) {
            measurement.seekMs.push(await seekTo(current.page, duration * fraction, tolerance));
          }
          for (const fraction of [0.3, 0.6, 0.8, 0.4]) {
            await setProperty(current.page, "time-pos", duration * fraction);
            await sleep(120);
          }
          await seekTo(current.page, duration * 0.4, tolerance);
          await take(`seek:${label}`);
        });

        await step(`tracks ${label}`, async () => {
          const current = requireOpen(opened);
          const tracks = await tracksOf(current.page);
          const audio = await switchTrack(current.page, tracks, "audio", "aid");
          if (audio) await skip(`audio track ${label}`, audio);
          else measurement.trackChanges.push("audio");
          const subtitles = await subtitleToggle(current.page, tracks);
          if (subtitles) await skip(`subtitle track ${label}`, subtitles);
          else measurement.trackChanges.push("subtitle");
          await take(`tracks:${label}`);
        });

        await step(`close ${label}`, async () => {
          await closePlayer(browser);
          await take(`close:${label}`);
          measurements.push(measurement);
        });
      }

      await step("repeated player cycles", async () => {
        const media = candidates[0]?.file;
        if (!media) throw new Error("no media candidate for cycles");
        const cycles = Math.max(1, Number.parseInt(process.env.E2E_PLAYER_CYCLES ?? "3", 10));
        for (let cycle = 1; cycle <= cycles; cycle += 1) {
          await take(`cycle:${cycle}:before`);
          const opened = await openMedia(browser, page, media);
          await startPlayback(opened.page);
          const duration = (await prop<number>(opened.page, "duration", "double")) ?? 0;
          await seekTo(opened.page, duration * 0.5, Math.max(2, duration * 0.02));
          await pauseAndVerify(opened.page);
          await closePlayer(browser);
          await take(`cycle:${cycle}:after`);
        }
      });

      await step("preview generation", async () => {
        if (process.env.E2E_PREVIEW !== "1") {
          await skip("preview generation", "set E2E_PREVIEW=1 to run the real FFmpeg preview");
          return;
        }
        const hevc = candidates.find((candidate) =>
          candidate.file.video.some((stream) => stream.codec === "hevc")
        );
        const media = hevc?.file ?? candidates[0]?.file;
        if (!media) throw new Error("no media candidate for preview");
        const started = Date.now();
        const frames = await invoke<Array<{ timestamp: number; before: string; after: string }>>(
          page,
          "preview_upscale_frames",
          { inputPath: media.path, width: 0, height: 0 }
        );
        if (frames.length === 0) throw new Error("preview returned no frames");
        await take(`preview:${Date.now() - started}ms`);
      });
    } finally {
      await closePlayer(browser).catch(() => undefined);
      writeFileSync(join(outDir, "player-media.json"), JSON.stringify({ measurements, samples }, null, 2));
      writeFileSync(join(outDir, "player-media.md"), report(measurements, samples));
      await clickTabByAnyOf(page, TAB.search).catch(() => undefined);
    }
  },
};

// Live playlist extension: a file that appears in a watched folder while the
// app player is open must land in the live mpv playlist at its sorted
// position, without disturbing the currently playing file. This exercises the
// same plan/execute/verify path as the torrent branch (only the trigger and
// the desired-list builder differ, and both are unit-tested).

import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";

import type { Page } from "playwright-core";

import { findPlayerPage, invoke, sleep, visibleText } from "../cdp";
import { fixtureRoot, type Scenario } from "../harness";

interface PlaylistEntry {
  index: number;
  filename: string;
  title: string;
}

const LIVE_DIR = join(fixtureRoot(), "live-playlist");
const EP01 = join(LIVE_DIR, "ep01.mp4");
const EP02 = join(LIVE_DIR, "ep02.mp4");
const EP03 = join(LIVE_DIR, "ep03.mp4");

function makeVideo(target: string): void {
  mkdirSync(LIVE_DIR, { recursive: true });
  const result = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=black:s=320x240:d=60",
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=44100:cl=mono",
      "-shortest",
      "-pix_fmt",
      "yuv420p",
      target,
    ],
    { stdio: "ignore" }
  );
  if (result.status !== 0) throw new Error(`ffmpeg failed for ${target}`);
}

function baseName(path: string): string {
  return path.replaceAll("\\", "/").split("/").pop() ?? path;
}

async function playlistNames(playerPage: Page): Promise<string> {
  const entries = await invoke<PlaylistEntry[]>(playerPage, "player_playlist_entries", {});
  return entries.map((entry) => baseName(entry.filename)).join(",");
}

async function waitPlaylist(
  playerPage: Page,
  expected: string,
  timeoutMs: number,
  context: string
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let names = "";
  for (;;) {
    names = await playlistNames(playerPage);
    if (names === expected) return;
    if (Date.now() > deadline) {
      throw new Error(
        `${context}; playlist shows: ${names}; window shows: ${await visibleText(playerPage)}`
      );
    }
    await sleep(1000);
  }
}

export const livePlaylist: Scenario = {
  name: "livePlaylist",
  async run({ browser, page, step }) {
    await step("fixture videos ready", async () => {
      for (const target of [EP01, EP03]) {
        let exists = true;
        try {
          statSync(target);
        } catch {
          exists = false;
        }
        if (!exists) makeVideo(target);
      }
    });

    await step("folder watching started", async () => {
      await invoke(page, "start_watching_folders", { folders: [LIVE_DIR] });
    });

    await step("player opens a watched folder playlist", async () => {
      await invoke(page, "player_open", {
        files: [EP01, EP03],
        startIndex: 0,
        watch: { kind: "folder", root: LIVE_DIR, anchor: EP01 },
      });
      const playerPage = await findPlayerPage(browser);
      await playerPage.locator("body").waitFor({ timeout: 15_000 });
      await waitPlaylist(playerPage, "ep01.mp4,ep03.mp4", 30_000, "initial playlist never loaded");
      await invoke(playerPage, "player_set_property", { name: "pause", value: true });
    });

    await step("late file lands in the middle of the live playlist", async () => {
      copyFileSync(EP01, EP02);
      const playerPage = await findPlayerPage(browser, 10_000);
      await waitPlaylist(
        playerPage,
        "ep01.mp4,ep02.mp4,ep03.mp4",
        90_000,
        "late file never landed in order"
      );
    });

    await step("current file keeps its position", async () => {
      const playerPage = await findPlayerPage(browser, 10_000);
      const pos = await invoke<number>(playerPage, "player_get_property", {
        name: "playlist-pos",
        format: "int64",
      });
      const path = await invoke<string>(playerPage, "player_get_property", {
        name: "path",
        format: "string",
      });
      if (pos !== 0) throw new Error(`playlist-pos moved to ${pos}, expected 0`);
      if (baseName(path) !== "ep01.mp4") throw new Error(`current path is ${path}, expected ep01`);
    });

    await step("playlist panel shows three cards", async () => {
      const playerPage = await findPlayerPage(browser, 10_000);
      const toggle = playerPage.getByTitle("Плейлист").first();
      if ((await toggle.count()) === 0) {
        throw new Error(`no playlist toggle; window shows: ${await visibleText(playerPage)}`);
      }
      await toggle.click({ timeout: 10_000 });
      await playerPage.locator('[data-testid="playlist-card"]').nth(2).waitFor({ timeout: 15_000 });
      const count = await playerPage.locator('[data-testid="playlist-card"]').count();
      if (count !== 3) throw new Error(`panel shows ${count} cards, expected 3`);
    });
  },
};

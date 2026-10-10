// Player scenario: opens a file through the real player_open command and waits
// for a playback snapshot. The mpv surface is a native child window, so this
// asserts DOM and state, not pixels.

import { spawnSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { TAB, clickTabByAnyOf, findPlayerPage, invoke, visibleText } from "../cdp";
import { fixtureRoot, type Scenario } from "../harness";

const MEDIA_DIR = join(fixtureRoot(), "media");
const FIXTURE_VIDEO = join(MEDIA_DIR, "sample.mp4");

function ensureVideo(): string | null {
  const fromEnv = process.env.E2E_PLAYER_FILE;
  if (fromEnv) return fromEnv;
  mkdirSync(MEDIA_DIR, { recursive: true });
  let exists = true;
  try {
    statSync(FIXTURE_VIDEO);
  } catch {
    exists = false;
  }
  if (!exists) {
    const result = spawnSync(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=black:s=320x240:d=1",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=44100:cl=mono",
        "-shortest",
        "-pix_fmt",
        "yuv420p",
        FIXTURE_VIDEO,
      ],
      { stdio: "ignore" }
    );
    if (result.status !== 0) return null;
  }
  try {
    statSync(FIXTURE_VIDEO);
    return FIXTURE_VIDEO;
  } catch {
    return null;
  }
}

export const player: Scenario = {
  name: "player",
  async run({ browser, page, step, skip }) {
    const video = ensureVideo();
    if (!video) {
      await skip(
        "player opens a file",
        "no playable fixture and ffmpeg unavailable; set E2E_PLAYER_FILE to a real video"
      );
      return;
    }

    await step("player window opens on its route", async () => {
      await invoke(page, "player_open", { files: [video] });
      const playerPage = await findPlayerPage(browser);
      await playerPage.locator("body").waitFor({ timeout: 10_000 });
    });

    await step("playback state renders", async () => {
      const playerPage = await findPlayerPage(browser, 10_000);
      // The timecode is plain text like "0:00 / 0:01", so match its shape.
      const state = playerPage.locator("text=/0:00 / 0:01/").first();
      const found = await state
        .waitFor({ timeout: 30_000 })
        .then(() => true)
        .catch(() => false);
      if (!found) {
        const text = await visibleText(playerPage);
        if (/0:00\s*\/\s*0:01/.test(text)) return;
        throw new Error(`no playback state visible; window shows: ${text}`);
      }
    });

    await step("player reports no load error", async () => {
      const playerPage = await findPlayerPage(browser, 10_000);
      const failed = await playerPage
        .locator("text=/could not|failed to load|не удалось|ошибка/i")
        .first()
        .count();
      if (failed > 0) {
        throw new Error(
          `player shows a load error; window shows: ${await visibleText(playerPage)}`
        );
      }
    });

    await step("return to main window closes the player route", async () => {
      await clickTabByAnyOf(page, TAB.player);
      await page.locator("body").waitFor({ timeout: 10_000 });
    });
  },
};

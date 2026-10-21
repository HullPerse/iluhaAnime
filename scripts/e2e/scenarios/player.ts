// Player scenario: opens a file through the real player_open command and waits
// for a playback snapshot. The mpv surface is a native child window, so this
// asserts DOM and state, not pixels.

import { spawnSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";

import type { Page } from "playwright-core";

import { TAB, clickTabByAnyOf, findPlayerPage, invoke, visibleText } from "../cdp";
import { fixtureRoot, type Scenario } from "../harness";

const MEDIA_DIR = join(fixtureRoot(), "media");
const FIXTURE_VIDEO = join(MEDIA_DIR, "sample.mp4");

// The settings panel is a portal, so the mode combobox is the stable marker of
// whether it is open: the header button toggles it.
const MODE_SELECT = /Режим плеера|Player mode/;
const CABINET_SELECT = /Корпус|Cabinet/;

async function ensureSettings(page: Page): Promise<void> {
  if ((await page.getByRole("combobox", { name: MODE_SELECT }).count()) > 0) return;
  await page.mouse.move(320, 180);
  await page
    .getByRole("button", { name: /Настройки|Settings/ })
    .first()
    .click();
  await page.getByRole("combobox", { name: MODE_SELECT }).waitFor({ timeout: 5000 });
}

async function chooseOption(page: Page, select: RegExp, option: RegExp): Promise<void> {
  await page.getByRole("combobox", { name: select }).click();
  await page.getByRole("option", { name: option }).click();
}

async function playerProperty(page: Page, name: string): Promise<string> {
  return invoke<string>(page, "player_get_property", { name, format: "string" });
}

async function settle(
  probe: () => Promise<string>,
  done: (value: string) => boolean,
  what: string
): Promise<string> {
  let last = "";
  for (let attempt = 0; attempt < 24; attempt += 1) {
    last = await probe();
    if (done(last)) return last;
    await new Promise((resolve) => {
      setTimeout(resolve, 250);
    });
  }
  throw new Error(`${what} did not settle; last value: ${last}`);
}

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

    await step("screen mode applies the CRT shader and cabinet", async () => {
      const playerPage = await findPlayerPage(browser, 10_000);
      const shaderPath = await invoke<string>(playerPage, "player_shader_path", { id: "crt-tv" });
      if (!shaderPath.endsWith("crt-tv.glsl")) {
        throw new Error(`player_shader_path returned ${shaderPath}`);
      }

      await ensureSettings(playerPage);
      await chooseOption(playerPage, MODE_SELECT, /^Телевизор$|^Television$/);

      await settle(
        () => playerProperty(playerPage, "glsl-shaders"),
        (value) => value.includes("crt-tv.glsl"),
        "glsl-shaders"
      );
      await settle(
        () => playerProperty(playerPage, "glsl-shader-opts"),
        (value) => value.includes("crt-tv/curvature="),
        "glsl-shader-opts"
      );

      await chooseOption(playerPage, CABINET_SELECT, /^Дерево$|^Wood$/);
      await settle(
        () =>
          playerPage
            .locator(".player-bezel")
            .first()
            .evaluate((element) => (element as HTMLElement).dataset.variant ?? "")
            .catch(() => ""),
        (value) => value === "wood",
        "cabinet variant"
      );
    });

    await step("switching the shader family replaces the previous one", async () => {
      const playerPage = await findPlayerPage(browser, 10_000);
      await ensureSettings(playerPage);
      await chooseOption(playerPage, MODE_SELECT, /^VHS$/);
      await settle(
        () => playerProperty(playerPage, "glsl-shaders"),
        (value) => value.includes("vhs.glsl") && !value.includes("crt-tv.glsl"),
        "glsl-shaders after VHS"
      );

      await chooseOption(playerPage, MODE_SELECT, /^Обычный$|^Normal$/);
      await settle(
        () => playerProperty(playerPage, "glsl-shaders"),
        (value) => !value.includes("vhs.glsl") && !value.includes("crt-tv.glsl"),
        "glsl-shaders after Normal"
      );

      const keptVariant = await playerPage
        .locator(".player-bezel")
        .first()
        .evaluate((element) => (element as HTMLElement).dataset.variant ?? "")
        .catch(() => "");
      if (keptVariant !== "wood") {
        throw new Error(`cabinet should survive a mode change, got ${keptVariant}`);
      }

      await chooseOption(playerPage, CABINET_SELECT, /^Выключено$|^Off$/);
      await settle(
        () => playerPage.locator(".player-bezel").count().then(String),
        (value) => value === "0",
        "cabinet count after Off"
      );
    });

    await step("compact presets keep the screen mode", async () => {
      const playerPage = await findPlayerPage(browser, 10_000);
      await ensureSettings(playerPage);
      await chooseOption(playerPage, MODE_SELECT, /^Телевизор$|^Television$/);
      await chooseOption(playerPage, CABINET_SELECT, /^Дерево$|^Wood$/);
      await settle(
        () => playerProperty(playerPage, "glsl-shaders"),
        (value) => value.includes("crt-tv.glsl"),
        "glsl-shaders before presets"
      );

      await playerPage
        .getByRole("dialog")
        .getByRole("button", { name: /^Закрыть$|^Close$/ })
        .click();
      await settle(
        () => playerPage.getByRole("combobox", { name: MODE_SELECT }).count().then(String),
        (value) => value === "0",
        "settings panel close"
      );

      const headerVisible = (): Promise<string> =>
        playerPage
          .getByRole("button", { name: /Настройки|Settings/ })
          .first()
          .isVisible()
          .then(String)
          .catch(() => "false");

      for (const [key, label] of [
        ["1", "minimal"],
        ["2", "compact"],
      ] as const) {
        await playerPage.keyboard.press(key);
        await settle(headerVisible, (value) => value === "false", `${label} preset`);

        const variant = await playerPage
          .locator(".player-bezel")
          .first()
          .evaluate((element) => (element as HTMLElement).dataset.variant ?? "")
          .catch(() => "");
        if (variant !== "wood") {
          throw new Error(`${label} preset dropped the cabinet, got ${variant}`);
        }
        const shaders = await playerProperty(playerPage, "glsl-shaders");
        if (!shaders.includes("crt-tv.glsl")) {
          throw new Error(`${label} preset dropped the shader: ${shaders}`);
        }
      }

      await playerPage.keyboard.press("3");
      await settle(headerVisible, (value) => value === "true", "normal preset");
    });

    await step("fullscreen keeps the screen mode", async () => {
      const playerPage = await findPlayerPage(browser, 10_000);
      const windowSize = (): Promise<string> =>
        playerPage.evaluate(() => `${window.innerWidth}x${window.innerHeight}`);

      const before = await windowSize();
      await playerPage.keyboard.press("f");
      await settle(windowSize, (value) => value !== before, "fullscreen window size");

      const shaders = await playerProperty(playerPage, "glsl-shaders");
      if (!shaders.includes("crt-tv.glsl")) {
        throw new Error(`fullscreen dropped the shader: ${shaders}`);
      }
      const variant = await playerPage
        .locator(".player-bezel")
        .first()
        .evaluate((element) => (element as HTMLElement).dataset.variant ?? "")
        .catch(() => "");
      if (variant !== "wood") {
        throw new Error(`fullscreen dropped the cabinet, got ${variant}`);
      }

      await playerPage.keyboard.press("f");
      await settle(windowSize, (value) => value === before, "windowed size");
    });

    await step("return to main window closes the player route", async () => {
      await clickTabByAnyOf(page, TAB.player);
      await page.locator("body").waitFor({ timeout: 10_000 });
    });
  },
};

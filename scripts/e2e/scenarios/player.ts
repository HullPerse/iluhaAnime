import { spawnSync } from "node:child_process";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Page } from "playwright-core";

import { TAB, clickTabByAnyOf, findPlayerPage, invoke, visibleText } from "../cdp";
import { fixtureRoot, type Scenario } from "../harness";
import { PlayerDiagnosticsSchema } from "../../../src/schemas/player.schema";
import { readZipEntry } from "./repro";

const MEDIA_DIR = join(fixtureRoot(), "media");
const FIXTURE_VIDEO = join(MEDIA_DIR, "sample.mp4");

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
  async run({ browser, page, step, skip, outDir }) {
    const video = ensureVideo();

    if (!video) {
      await skip(
        "player opens a file",
        "no playable fixture and ffmpeg unavailable; set E2E_PLAYER_FILE to a real video"
      );

      return;
    }

    await step(
      "hidden prewarm waits for frontend setup and rejects obsolete readiness",
      async () => {
        let previousInstance = 0;

        for (let cycle = 0; cycle < 2; cycle++) {
          await Promise.all([invoke(page, "player_prewarm"), invoke(page, "player_prewarm")]);
          const hidden = await findPlayerPage(browser);
          const configured = await hidden.evaluate(() =>
            ["native-init", "settings", "profile"].every(
              (phase) => performance.getEntriesByName(`player:${phase}`, "measure").length > 0
            )
          );

          if (!configured) throw new Error("Prewarm returned before frontend configuration");

          for (const command of ["is_visible", "is_focused"]) {
            if (await invoke<boolean>(hidden, `plugin:window|${command}`, { label: "player" })) {
              throw new Error(`Hidden prewarm unexpectedly ${command}`);
            }
          }

          const instanceId = await invoke<number>(hidden, "player_init", { initialOptions: {} });

          if (!Number.isSafeInteger(instanceId) || instanceId <= previousInstance) {
            throw new Error("Recreated prewarm did not return a fresh instance identity");
          }

          if (previousInstance !== 0) {
            let rejected = false;

            try {
              await invoke(hidden, "player_take_pending_open", { instanceId: previousInstance });
            } catch (error) {
              rejected = String(error).includes("obsolete instance");
            }

            if (!rejected) throw new Error("An obsolete instance acknowledged readiness");
          }

          await invoke(page, "player_prewarm");

          if (!(await invoke<boolean>(page, "player_release_prewarm"))) {
            throw new Error("Idle prewarm could not be released");
          }

          if (!hidden.isClosed()) await hidden.waitForEvent("close", { timeout: 15_000 });
          previousInstance = instanceId;
        }
      }
    );

    await step("player window opens on its route", async () => {
      await invoke(page, "player_open", { files: [video] });
      const playerPage = await findPlayerPage(browser);
      await playerPage.locator("body").waitFor({ timeout: 10_000 });
    });

    await step("playback state renders", async () => {
      const playerPage = await findPlayerPage(browser, 10_000);
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

    await step("player diagnostics match native outputs and the exported bundle", async () => {
      const playerPage = await findPlayerPage(browser);

      for (const name of ["current-tracks/video/decoder", "current-vo", "current-ao"]) {
        await settle(
          () => playerProperty(playerPage, name).catch(() => ""),
          (value) => typeof value === "string" && value.length > 0,
          name
        );
      }

      const report = PlayerDiagnosticsSchema.parse(
        await invoke<unknown>(playerPage, "player_diagnostics")
      );

      if (!report.active || report.preparation !== "ready")
        throw new Error("Loaded player is not ready");

      for (const [key, property] of [
        ["decoder", "current-tracks/video/decoder"],
        ["hwdec", "hwdec-current"],
        ["videoOutput", "current-vo"],
        ["gpuContext", "current-gpu-context"],
        ["audioOutput", "current-ao"],
      ] as const) {
        const actual = await playerProperty(playerPage, property).catch(() => null);

        if (report[key] !== actual) throw new Error(`Diagnostic ${key} differs from mpv`);
      }

      for (const time of Object.values(report.startup)) {
        if (time === null || time < 0) throw new Error("Preparation milestone is missing");
      }

      const archive = join(outDir, "player-diagnostics.zip");
      await invoke(page, "collect_repro_bundle", { outPath: archive, frontendJson: "{}" });
      const bundled = PlayerDiagnosticsSchema.parse(
        JSON.parse(readZipEntry(archive, "player.json"))
      );

      if (JSON.stringify(bundled) !== JSON.stringify(report))
        throw new Error("Exported player snapshot differs from the live report");
      await playerPage.keyboard.press("i");
      const panel = playerPage.locator("[data-player-diagnostics]");

      if (report.audioOutput === null) throw new Error("No actual audio output was reported");
      await panel.getByText(report.audioOutput, { exact: true }).waitFor();
      const bounds = await panel.boundingBox();
      const height = await playerPage.evaluate(() => window.innerHeight);

      if (!bounds || bounds.height > height * 0.66)
        throw new Error("Diagnostic panel overflows its height budget");
      await playerPage.screenshot({ path: join(outDir, "player-diagnostics.png") });
      writeFileSync(
        join(outDir, "player-diagnostics.html"),
        await panel.evaluate((node) => node.outerHTML)
      );
      writeFileSync(join(outDir, "player-diagnostics.json"), JSON.stringify(report, null, 2));
      await playerPage.keyboard.press("i");
      await panel.waitFor({ state: "detached" });
    });

    await step("debanding toggles the native filter on and off", async () => {
      const playerPage = await findPlayerPage(browser);
      await ensureSettings(playerPage);
      const checkbox = playerPage.getByRole("checkbox", { name: "Сгладить цветовые полосы" });
      await checkbox.click();
      await settle(
        () => playerProperty(playerPage, "deband"),
        (v) => v === "yes",
        "deband enabled"
      );
      await checkbox.click();
      await settle(
        () => playerProperty(playerPage, "deband"),
        (v) => v === "no",
        "deband disabled"
      );
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

    await step("player switches an actual Windows audio device", async () => {
      const playerPage = await findPlayerPage(browser);
      const raw = await invoke<string>(playerPage, "player_get_property", {
        name: "audio-device-list",
        format: "json",
      });
      const devices = JSON.parse(raw) as { name: string; description: string }[];
      const device = devices.find((item) => item.name !== "auto");

      if (!device) throw new Error("No Windows audio output available for switching");
      await ensureSettings(playerPage);
      await playerPage.getByRole("combobox", { name: "Устройство вывода", exact: true }).click();
      await playerPage.getByRole("option", { name: device.description, exact: true }).click();
      await settle(
        () => playerProperty(playerPage, "audio-device"),
        (value) => value === device.name,
        "selected Windows audio device"
      );
      const tested = [];

      for (const output of devices.filter((item) => item.name !== "auto")) {
        await invoke(playerPage, "player_set_property", {
          name: "audio-device",
          value: output.name,
        });
        await settle(
          () => playerProperty(playerPage, "audio-device"),
          (value) => value === output.name,
          output.description
        );
        tested.push(output);
      }

      writeFileSync(join(outDir, "audio-outputs.json"), JSON.stringify(tested, null, 2));
      await invoke(playerPage, "player_set_property", {
        name: "audio-device",
        value: "wasapi/missing-e2e-device",
      });
      await settle(
        () => playerProperty(playerPage, "audio-device"),
        (value) => value === "auto",
        "missing device fallback"
      );
    });

    await step("Windows SMTC controls playback without player focus", async () => {
      await page.bringToFront();

      for (const action of ["play", "pause"]) {
        const result = spawnSync(
          "powershell",
          [
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            "scripts/e2e/player-smtc.ps1",
            "-Action",
            action,
          ],
          { encoding: "utf-8" }
        );

        if (result.status !== 0) throw new Error(result.stderr || result.stdout);
        const playerPage = await findPlayerPage(browser);
        await settle(
          () => playerProperty(playerPage, "pause"),
          (value) => value === (action === "pause" ? "yes" : "no"),
          "SMTC transport action"
        );
      }
    });

    await step("Windows media key toggles playback without player focus", async () => {
      const playerPage = await findPlayerPage(browser);
      await page.bringToFront();
      await invoke(page, "plugin:window|set_focus", { label: "main" });
      if (await invoke<boolean>(playerPage, "plugin:window|is_focused", { label: "player" })) {
        throw new Error("Player still has focus during the media-key test");
      }
      for (const expected of ["no", "yes"]) {
        const result = spawnSync(
          "powershell",
          ["-NoProfile", "-File", "scripts/e2e/player-smtc.ps1", "-Action", "media-toggle"],
          { encoding: "utf-8" }
        );
        if (result.status !== 0) throw new Error(result.stderr || result.stdout);
        await settle(
          () => playerProperty(playerPage, "pause"),
          (value) => value === expected,
          "Windows media key"
        );
      }
    });

    await step("local language preferences select real embedded tracks", async () => {
      const fixture = join(MEDIA_DIR, "languages.mkv");
      const subtitles = join(MEDIA_DIR, "languages.srt");
      writeFileSync(subtitles, "1\n00:00:00,000 --> 00:00:03,000\nSubtitle fixture\n");
      const generated = spawnSync(
        "ffmpeg",
        [
          "-y",
          "-hide_banner",
          "-loglevel",
          "error",
          "-f",
          "lavfi",
          "-i",
          "color=c=black:s=320x240:d=4",
          "-f",
          "lavfi",
          "-i",
          "anullsrc=r=44100:cl=mono",
          "-i",
          subtitles,
          "-map",
          "0:v",
          "-map",
          "1:a",
          "-map",
          "1:a",
          "-map",
          "2:s",
          "-c:s",
          "srt",
          "-metadata:s:s:0",
          "language=rus",
          "-t",
          "4",
          "-c:v",
          "libx264",
          "-c:a",
          "aac",
          "-metadata:s:a:0",
          "language=eng",
          "-metadata:s:a:1",
          "language=jpn",
          fixture,
        ],
        { encoding: "utf-8" }
      );

      if (generated.status !== 0)
        throw new Error(`language fixture generation failed: ${generated.stderr}`);
      const playerPage = await findPlayerPage(browser);
      await ensureSettings(playerPage);
      await chooseOption(playerPage, /^Язык аудио$/, /^Японский$/);
      await chooseOption(playerPage, /^Язык субтитров$/, /^Русский$/);
      await invoke(page, "player_open", { files: [fixture] });
      await settle(
        async () => {
          const tracks = await invoke<
            { id: number; type: string; lang?: string; selected?: boolean }[]
          >(playerPage, "player_get_property", { name: "track-list", format: "json" });
          const parsed =
            typeof tracks === "string" ? (JSON.parse(tracks) as typeof tracks) : tracks;

          return parsed.find((track) => track.type === "audio" && track.selected)?.lang ?? "";
        },
        (value) => value === "jpn",
        "preferred Japanese audio"
      );
      const subtitleTracks = JSON.parse(
        await invoke<string>(playerPage, "player_get_property", {
          name: "track-list",
          format: "json",
        })
      ) as { type: string; lang?: string; selected?: boolean }[];

      if (
        !subtitleTracks.some(
          (track) => track.type === "sub" && track.lang === "rus" && track.selected
        )
      )
        throw new Error("Preferred Russian subtitle was not selected");
      await playerPage.screenshot({ path: join(outDir, "language-preferences.png") });
    });

    await step("return to main window closes the player route", async () => {
      const playerPage = await findPlayerPage(browser);
      await invoke(playerPage, "player_close_window").catch((error: unknown) => {
        if (
          !/Target page, context or browser has been closed|Execution context was destroyed/.test(
            String(error)
          )
        ) {
          throw error;
        }
      });

      if (!playerPage.isClosed()) await playerPage.waitForEvent("close", { timeout: 15_000 });
      const closed = PlayerDiagnosticsSchema.parse(
        await invoke<unknown>(page, "player_diagnostics")
      );

      if (closed.active || closed.preparation !== "closed" || closed.decoder !== null) {
        throw new Error("Closed player retained a live diagnostic output");
      }

      const released = spawnSync(
        "powershell",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          "scripts/e2e/player-smtc.ps1",
          "-Action",
          "absent",
        ],
        { encoding: "utf-8" }
      );

      if (released.status !== 0) throw new Error(released.stderr || released.stdout);
      await clickTabByAnyOf(page, TAB.player);
      await page.locator("body").waitFor({ timeout: 10_000 });
    });

    await step("SMTC releases and recreates across three file sessions", async () => {
      for (let cycle = 0; cycle < 3; cycle++) {
        await invoke(page, "player_open", { files: [video] });
        const current = await findPlayerPage(browser);
        await settle(
          () =>
            playerProperty(current, "path").catch((error: unknown) => {
              if (String(error).includes("mpv instance not found")) return "";
              throw error;
            }),
          (value) => value.length > 0,
          "cycle file loaded"
        );
        const control = spawnSync(
          "powershell",
          [
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            "scripts/e2e/player-smtc.ps1",
            "-Action",
            "pause",
          ],
          { encoding: "utf-8" }
        );

        if (control.status !== 0) throw new Error(control.stderr || control.stdout);
        await invoke(current, "player_close_window").catch((error: unknown) => {
          if (!/closed|destroyed/.test(String(error))) throw error;
        });

        if (!current.isClosed()) await current.waitForEvent("close", { timeout: 15_000 });
        const released = spawnSync(
          "powershell",
          [
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            "scripts/e2e/player-smtc.ps1",
            "-Action",
            "absent",
          ],
          { encoding: "utf-8" }
        );

        if (released.status !== 0) throw new Error(released.stderr || released.stdout);
      }
    });
  },
};

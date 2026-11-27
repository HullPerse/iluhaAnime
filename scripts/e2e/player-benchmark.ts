import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  connectCdp,
  E2E_IDENTIFIER,
  findPlayerPage,
  invoke,
  mainPage,
  sleep,
  waitForReady,
} from "./cdp";
import {
  buildOptimizedTauri,
  ensureCdpFree,
  ensureVite,
  launchOptimizedTauri,
  launchTauri,
  outRoot,
  stopProcessTree,
  stopVite,
} from "./harness";
import { sampleProcessTree, type TreeSample } from "./process-tree";

const optimized = process.argv.includes("--optimized");
const series = Number(process.env.BENCH_SERIES ?? "3");
const legacyCacheFiles = Number(process.env.BENCH_LEGACY_CACHE_FILES ?? "0");

if (!Number.isInteger(legacyCacheFiles) || legacyCacheFiles < 0 || legacyCacheFiles > 10_000) {
  throw new Error("BENCH_LEGACY_CACHE_FILES must be an integer from 0 to 10000");
}

if (!Number.isInteger(series) || series < 1)
  throw new Error("BENCH_SERIES must be a positive integer");

if (!process.env.BENCH_CORPUS) throw new Error("BENCH_CORPUS is required");

if (process.argv.includes("--build")) {
  if (!optimized) throw new Error("--build requires --optimized");
  await buildOptimizedTauri();
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const out = join(outRoot(), `player-benchmark-${stamp}`);
mkdirSync(out, { recursive: true });
const vite = optimized ? null : await ensureVite();

async function timingRun(index: number, warm: boolean, appPid: number): Promise<void> {
  const name = `${index}-${warm ? "prewarm" : "cold"}`;
  const child = spawn("bun", ["scripts/e2e/player-timing.ts"], {
    env: {
      ...process.env,
      BENCH_RUNS: process.env.BENCH_RUNS ?? "10",
      BENCH_WARM: warm ? "1" : "0",
      BENCH_SKIP_STREAM: "1",
      BENCH_SKIP_TRACKS: "1",
      BENCH_PROFILE: optimized ? "release-isolated" : "dev-isolated",
      BENCH_REPORT: join(out, `${name}.json`),
      BENCH_APP_PID: String(appPid),
      BENCH_SCREEN_CONTROL: process.env.BENCH_SCREEN_CONTROL ?? "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let log = "";
  child.stdout?.on("data", (data: Buffer) => {
    log += data.toString();
  });
  child.stderr?.on("data", (data: Buffer) => {
    log += data.toString();
  });
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  writeFileSync(join(out, `${name}.log`), log);

  if (code !== 0) throw new Error(`Timing ${name} failed (${code}); see ${out}`);
}

try {
  for (let index = 1; index <= series; index++) {
    await ensureCdpFree();
    let legacyCache: string | null = null;
    let lateProbe: string | null = null;

    if (legacyCacheFiles > 0) {
      if (!process.env.LOCALAPPDATA) throw new Error("Legacy cache fixture requires LOCALAPPDATA");
      legacyCache = resolve(
        process.env.LOCALAPPDATA,
        E2E_IDENTIFIER,
        "player-thumbs",
        "player-hover"
      );
      mkdirSync(legacyCache, { recursive: true });

      for (let file = 0; file < legacyCacheFiles; file++) {
        writeFileSync(join(legacyCache, `frame-${file}.jpg`), "legacy fixture");
      }
    }

    const processStarted = performance.now();
    const child = optimized ? launchOptimizedTauri() : launchTauri();
    let appLog = "";
    child.stdout?.on("data", (data: Buffer) => {
      appLog += data.toString();
    });
    child.stderr?.on("data", (data: Buffer) => {
      appLog += data.toString();
    });

    try {
      const browser = await connectCdp(900_000, () => child.exitCode);

      try {
        const main = await mainPage(browser);
        const identifier = await invoke<string>(main, "plugin:app|identifier");

        if (identifier !== E2E_IDENTIFIER) throw new Error("Refusing a non-E2E app identifier");
        await waitForReady(main);
        writeFileSync(
          join(out, `${index}-app-start.json`),
          JSON.stringify({ processToMainReadyMs: performance.now() - processStarted }, null, 2)
        );
        await main.evaluate(() => localStorage.removeItem("iluha.v1.player"));
        await main.reload();
        await waitForReady(main);
        const settings = await main.evaluate(() => {
          const raw = localStorage.getItem("iluha.v1.player");

          if (!raw) return null;
          const envelope: unknown = JSON.parse(raw);

          if (typeof envelope !== "object" || envelope === null || !("data" in envelope))
            return null;
          const data = envelope.data;

          if (typeof data !== "object" || data === null) return null;
          const row = data as Record<string, unknown>;

          return {
            volume: row.volume,
            hwdec: row.hwdec,
            profile: row.profile,
            settings: row.settings,
            eofMode: row.eofMode,
          };
        });
        writeFileSync(
          join(out, `${index}-settings.json`),
          JSON.stringify(
            {
              identifier,
              profile: optimized ? "release-isolated" : "dev-isolated",
              settings,
              legacyCacheFiles,
              missingSettings:
                "null means no persisted player settings; defaults come from the recorded source revision",
            },
            null,
            2
          )
        );
        const resources: Array<{ state: string; sample: TreeSample }> = [];
        let previous: TreeSample | undefined;
        const sampleIdle = async (state: string): Promise<void> => {
          for (let count = 0; count < 4; count++) {
            await sleep(1000);
            previous = await sampleProcessTree(previous);
            resources.push({ state, sample: previous });
          }

          writeFileSync(
            join(out, `${index}-resources.json`),
            JSON.stringify(
              {
                gpu: "unavailable: process-tree collector has no GPU counters",
                resources,
              },
              null,
              2
            )
          );
        };

        await sampleIdle("main only");

        if (legacyCache) {
          const actualCache = await invoke<string>(main, "plugin:path|resolve_directory", {
            directory: 16,
          });

          if (resolve(actualCache, "player-thumbs", "player-hover") !== legacyCache) {
            throw new Error("Legacy fixture path differs from the native E2E cache path");
          }

          const cleanupDeadline = Date.now() + 30_000;

          while (existsSync(legacyCache) && Date.now() < cleanupDeadline) await sleep(25);

          if (existsSync(legacyCache))
            throw new Error("Startup did not remove the legacy cache fixture within 30s");
          mkdirSync(legacyCache, { recursive: true });
          lateProbe = join(legacyCache, "after-startup.txt");
          writeFileSync(lateProbe, "must survive repeated player opens");
        }

        if (child.pid === undefined) throw new Error("Application has no PID");
        await timingRun(index, false, child.pid);
        await invoke(main, "player_prewarm");
        const player = await findPlayerPage(browser);
        await player.waitForFunction(
          async () => {
            const runtime = window as unknown as {
              __TAURI_INTERNALS__: { invoke: (name: string, args: unknown) => Promise<unknown> };
            };

            try {
              return (
                (await runtime.__TAURI_INTERNALS__.invoke("player_get_property", {
                  name: "volume",
                  format: "double",
                })) !== null
              );
            } catch {
              return false;
            }
          },
          undefined,
          { timeout: 45_000, polling: 50 }
        );
        await sampleIdle("hidden prewarm; mpv property available");

        if (await invoke<boolean>(player, "plugin:window|is_visible", { label: "player" })) {
          throw new Error("Prewarm unexpectedly showed its window");
        }

        const released = await invoke<boolean>(main, "player_release_prewarm");

        if (!released) throw new Error("The idle prewarm was not released");

        if (!player.isClosed()) await player.waitForEvent("close", { timeout: 15_000 });
        await sampleIdle("after prewarm release");
      } finally {
        await browser.close();
      }

      if (child.pid === undefined) throw new Error("Application has no PID");
      await timingRun(index, true, child.pid);

      if (lateProbe && !existsSync(lateProbe)) {
        throw new Error("Opening the player retried legacy cache cleanup");
      }

      console.log(`Series ${index}/${series} complete: ${out}`);
    } finally {
      writeFileSync(join(out, `${index}-app.log`), appLog);
      stopProcessTree(child);
    }
  }
} finally {
  stopVite(vite);
}

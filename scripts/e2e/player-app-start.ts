import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { connectCdp, E2E_IDENTIFIER, findPlayerPage, invoke, mainPage, waitForReady } from "./cdp";
import { ensureCdpFree, launchOptimizedTauri, outRoot, stopProcessTree } from "./harness";
import type { PlayerDiagnostics } from "../../src/types/player/diagnostics";

const file = process.env.BENCH_CORPUS;

if (!file) throw new Error("BENCH_CORPUS is required");
const corpus: unknown = JSON.parse(readFileSync(file, "utf-8"));

if (
  typeof corpus !== "object" ||
  corpus === null ||
  !("playlist" in corpus) ||
  !Array.isArray(corpus.playlist) ||
  typeof corpus.playlist[0] !== "string"
)
  throw new Error("Invalid corpus");
const media = resolve(dirname(file), corpus.playlist[0]);
const output = join(outRoot(), `player-app-start-${Date.now()}`);
mkdirSync(output, { recursive: true });
const samples: Array<{
  series: number;
  run: number;
  appReadyMs: number;
  processToControlsMs: number;
  actionToControlsMs: number;
  diagnostics: PlayerDiagnostics;
}> = [];

async function measure(series: number, run: number): Promise<void> {
  await ensureCdpFree();
  const start = performance.now();
  const app = launchOptimizedTauri();

  try {
    const browser = await connectCdp(120_000, () => app.exitCode);

    try {
      const main = await mainPage(browser);

      if ((await invoke(main, "plugin:app|identifier")) !== E2E_IDENTIFIER)
        throw new Error("Wrong identity");
      await waitForReady(main);
      const appReadyMs = performance.now() - start;
      const action = performance.now();
      await invoke(main, "player_open", {
        files: [media],
        resume: null,
        startIndex: 0,
        watch: null,
      });
      const player = await findPlayerPage(browser);
      await player.waitForFunction(
        () => {
          const field = document.querySelector<HTMLFieldSetElement>("[data-player-controls]");

          return field !== null && !field.disabled;
        },
        undefined,
        { timeout: 30_000, polling: 10 }
      );
      const ready = performance.now();
      const path = await invoke<unknown>(player, "player_get_property", {
        name: "path",
        format: "string",
      });

      if (typeof path !== "string" || resolve(path) !== media)
        throw new Error("Wrong media loaded");
      const diagnostics = await invoke<PlayerDiagnostics>(player, "player_diagnostics");

      if (diagnostics.preparation !== "ready") throw new Error("Player not ready");
      samples.push({
        series,
        run,
        appReadyMs,
        processToControlsMs: ready - start,
        actionToControlsMs: ready - action,
        diagnostics,
      });
      writeFileSync(
        join(output, "report.json"),
        JSON.stringify(
          {
            media,
            samples,
            limitations: [
              "Fresh app process and first player; warm OS/file caches",
              "CDP app discovery and main-ready polling add overhead; physical first-frame timing is a separate workload",
              "Uses existing isolated profile defaults; no preference reset/reload inside measured launch",
            ],
          },
          null,
          2
        )
      );
    } finally {
      await browser.close();
    }
  } finally {
    stopProcessTree(app);
  }
}

for (let series = 1; series <= 3; series++) {
  for (let run = 1; run <= 10; run++) await measure(series, run);
  console.log(`App-start series ${series}/3 complete: ${output}`);
}

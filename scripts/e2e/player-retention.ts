import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  connectCdp,
  E2E_IDENTIFIER,
  findPlayerPage,
  invoke,
  mainPage,
  sleep,
  waitForReady,
} from "./cdp";
import { ensureCdpFree, launchOptimizedTauri, outRoot, stopProcessTree } from "./harness";
import { sampleProcessTree, type TreeSample } from "./process-tree";
import type { Page } from "playwright-core";

const corpusFile = process.env.BENCH_CORPUS;
const retentionMs = Number(process.env.BENCH_RETENTION_MS ?? "250");

if (!Number.isSafeInteger(retentionMs) || retentionMs < 0 || retentionMs > 300_000)
  throw new Error("BENCH_RETENTION_MS must be an integer from 0 to 300000");

if (!corpusFile) throw new Error("BENCH_CORPUS is required");
const corpus: unknown = JSON.parse(readFileSync(corpusFile, "utf-8"));

if (
  typeof corpus !== "object" ||
  corpus === null ||
  !("playlist" in corpus) ||
  !Array.isArray(corpus.playlist) ||
  typeof corpus.playlist[0] !== "string"
)
  throw new Error("Invalid corpus");
const media = resolve(dirname(corpusFile), corpus.playlist[0]);
const out = join(outRoot(), `player-retention-${Date.now()}`);
mkdirSync(out, { recursive: true });
const samples: Array<{ series: number; run: number; scenario: string; ms: number }> = [];
const resources: Array<{ series: number; state: string; sample: TreeSample }> = [];

async function until(probe: () => Promise<boolean>): Promise<void> {
  const deadline = performance.now() + 30_000;

  while (performance.now() < deadline) {
    if (await probe()) return;
    await sleep(10);
  }

  throw new Error("Player state timed out");
}

async function property(page: Page, name: string): Promise<unknown> {
  return invoke(page, "player_get_property", { name, format: "flag" });
}

async function ready(page: Page): Promise<boolean> {
  if ((await property(page, "idle-active")) !== false) return false;

  return page.evaluate(() => {
    const field = document.querySelector<HTMLFieldSetElement>("[data-player-controls]");

    return field !== null && !field.disabled;
  });
}

async function open(main: Page): Promise<void> {
  await invoke(main, "player_open", { files: [media], resume: null, startIndex: 0, watch: null });
}

function save(): void {
  writeFileSync(
    join(out, "report.json"),
    JSON.stringify(
      {
        media,
        retentionMs,
        samples,
        resources,
        limitations: [
          "Explicit short stopped retention experiment; no production retention policy",
          "Upper-bound IPC/DOM polling; warm OS caches; resource samples outside latency samples",
          `Hidden retained duration is ${retentionMs} ms; experimental setting only`,
        ],
      },
      null,
      2
    )
  );
}

async function sampleResources(series: number, state: string): Promise<void> {
  const previous = await sampleProcessTree();
  await sleep(1000);
  resources.push({ series, state, sample: await sampleProcessTree(previous) });
}

async function exercise(series: number): Promise<void> {
  await ensureCdpFree();
  const app = launchOptimizedTauri();

  try {
    const browser = await connectCdp(120_000, () => app.exitCode);

    try {
      const main = await mainPage(browser);

      if ((await invoke(main, "plugin:app|identifier")) !== E2E_IDENTIFIER)
        throw new Error("Wrong app identity");
      await waitForReady(main);
      await main.evaluate(() => localStorage.removeItem("iluha.v1.player"));
      await main.reload();
      await waitForReady(main);
      await sampleResources(series, "main");
      await open(main);
      const player = await findPlayerPage(browser);
      await until(() => ready(player));

      for (let run = 1; run <= 10; run++) {
        await invoke(player, "player_command", { name: "playlist-remove", args: [0] });
        await until(async () => (await property(player, "idle-active")) === true);
        await invoke(player, "plugin:window|hide", { label: "player" });
        await sleep(retentionMs);

        if (run === 1) await sampleResources(series, "hidden stopped");
        const start = performance.now();
        await open(main);
        await until(() => ready(player));

        if ((await invoke(player, "plugin:window|is_visible", { label: "player" })) !== true)
          throw new Error("Retained window was not shown");
        samples.push({
          series,
          run,
          scenario: "hidden stopped to controls",
          ms: performance.now() - start,
        });
        save();
      }

      await invoke(player, "player_close_window").catch(() => undefined);

      if (!player.isClosed()) await player.waitForEvent("close", { timeout: 15_000 });
      await sampleResources(series, "released");
      save();
    } finally {
      await browser.close();
    }
  } finally {
    stopProcessTree(app);
  }
}

for (let series = 1; series <= 3; series++) {
  await exercise(series);
  console.log(`Retention series ${series}/3 complete: ${out}`);
}

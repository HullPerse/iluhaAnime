import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  cdpPort,
  connectCdp,
  createConsoleCollector,
  mainPage,
  waitForReady,
  invoke,
  E2E_IDENTIFIER,
} from "./cdp";
import {
  createStepRunner,
  ensureCdpFree,
  ensureVite,
  killE2eProcesses,
  stopProcessTree,
  launchTauri,
  launchOptimizedTauri,
  outRoot,
  stopVite,
  summarizeIpcMetrics,
  warnAboutForeignApp,
  wipeData,
  writeReport,
  type Scenario,
  type StepResult,
} from "./harness";
import { boot } from "./scenarios/boot";
import { collection } from "./scenarios/collection";
import { collectionFilled } from "./scenarios/collectionFilled";
import { diagnostics } from "./scenarios/diagnostics";
import { livePlaylist } from "./scenarios/livePlaylist";
import { manga } from "./scenarios/manga";
import { navigation } from "./scenarios/navigation";
import { player } from "./scenarios/player";
import { playerMedia } from "./scenarios/playerMedia";
import { repro } from "./scenarios/repro";
import { torrent } from "./scenarios/torrent";

import { streaming } from "./scenarios/streaming";

const SMOKE: Scenario[] = [
  boot,
  collection,
  torrent,
  player,
  livePlaylist,
  repro,
  manga,
  collectionFilled,
];
const SUITES: Record<string, Scenario[]> = {
  smoke: SMOKE,
  streaming: [streaming],
  diagnostics: [diagnostics],
  manga: [manga],
  media: [playerMedia],
  perf: [navigation, playerMedia],
  all: [...SMOKE, navigation, playerMedia],
};

function selectedSuite(): string {
  const fromArg = process.argv.find((value) => value.startsWith("--suite="));

  return fromArg?.slice("--suite=".length) ?? process.env.E2E_SUITE ?? "smoke";
}

interface ChildLog {
  text: string;
}

function pipe(child: import("node:child_process").ChildProcess, sink: ChildLog): void {
  const on = (chunk: Buffer): void => {
    sink.text += chunk.toString();
  };

  child.stdout?.on("data", on);
  child.stderr?.on("data", on);
}

async function main(): Promise<number> {
  const suiteName = selectedSuite();
  const suite = SUITES[suiteName];

  if (!suite) {
    console.error(`unknown suite "${suiteName}"; use ${Object.keys(SUITES).join(", ")}`);

    return 2;
  }

  const only = (process.env.E2E_ONLY ?? "").split(",").filter(Boolean);
  const scenarios =
    only.length > 0 ? suite.filter((scenario) => only.includes(scenario.name)) : suite;

  if (scenarios.length === 0) {
    console.error(
      `no scenario matched E2E_ONLY=${process.env.E2E_ONLY ?? ""} in suite ${suiteName}`
    );

    return 2;
  }

  console.log(`[e2e] suite: ${suiteName}`);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = join(outRoot(), stamp);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const results: StepResult[] = [];
  console.log(`[e2e] scenarios: ${scenarios.map((scenario) => scenario.name).join(", ")}`);
  console.log(`[e2e] report: ${outDir}`);

  const optimized = process.argv.includes("--optimized");
  console.log(`[e2e] profile: ${optimized ? "release-isolated" : "dev-isolated"}`);
  const vite = optimized ? null : await ensureVite();
  warnAboutForeignApp();
  console.log(`[e2e] cdp port: ${cdpPort()}`);
  await ensureCdpFree();
  wipeData();

  const child = optimized ? launchOptimizedTauri() : launchTauri();
  const collector = createConsoleCollector();
  const appLog: ChildLog = { text: "" };
  pipe(child, appLog);
  const dumpAppLog = (reason: string): void => {
    const tail = appLog.text.slice(-3000);

    if (tail.trim().length === 0) return;
    console.log(`[e2e] app log (${reason}):\n${tail}`);
  };

  const dumpOnce = new Set<string>();
  const dumpAppLogOnce = (key: string, reason: string): void => {
    if (dumpOnce.has(key)) return;
    dumpOnce.add(key);
    dumpAppLog(reason);
  };

  let browser;

  try {
    console.log(
      optimized
        ? "[e2e] connecting to the isolated optimized app"
        : "[e2e] launching app (first run builds the e2e target dir)"
    );
    browser = await connectCdp(undefined, () => child.exitCode);
    const page = await mainPage(browser);

    if ((await invoke<string>(page, "plugin:app|identifier")) !== E2E_IDENTIFIER) {
      throw new Error("Refusing a non-E2E app identifier");
    }

    collector.attach(page);
    await waitForReady(page);
    await page.reload();
    await waitForReady(page);

    for (const scenario of scenarios) {
      console.log(`[e2e] --- ${scenario.name}`);
      const runner = createStepRunner(scenario.name, page, outDir, results);

      try {
        await scenario.run({ browser, page, outDir, ...runner });
      } catch (error) {
        if (
          !results.some((result) => result.scenario === scenario.name && result.status === "fail")
        ) {
          results.push({
            scenario: scenario.name,
            step: "scenario",
            status: "fail",
            ms: 0,
            detail: String(error),
          });
        }

        console.log(`[e2e] scenario ${scenario.name} aborted: ${String(error)}`);
        dumpAppLogOnce(scenario.name, `after ${scenario.name} failed`);
      } finally {
        const summary = summarizeIpcMetrics(scenario.name, runner.metrics);

        writeFileSync(join(outDir, `ipc-${scenario.name}.json`), JSON.stringify(summary, null, 2));
        console.log(
          `[e2e] ipc ${scenario.name}: ${summary.totals.invokes} calls, ` +
            `${summary.totals.bodyBytes} argument bytes`
        );
      }
    }
  } catch (error) {
    console.error(`[e2e] harness failure: ${String(error)}`);
    dumpAppLog("harness failure");
    writeReport(outDir, results, collector.errors);

    return 1;
  } finally {
    writeFileSync(join(outDir, "app.log"), appLog.text);
    stopProcessTree(child);
    killE2eProcesses();
    stopVite(vite);
  }

  writeReport(outDir, results, collector.errors);
  const failed = results.filter((result) => result.status === "fail").length;
  console.log(`[e2e] done: ${results.length} steps, ${failed} failed`);
  console.log(`[e2e] report: ${join(outDir, "report.md")}`);

  return failed > 0 ? 1 : 0;
}

process.exit(await main());

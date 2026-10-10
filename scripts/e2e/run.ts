// Live E2E entry point. Drives the real Tauri app over CDP.
//
// Prerequisites: `bun run dev` must already be serving 1420 (the harness does
// not start it), and nothing else may occupy CDP port 9222.
//
// Run: bun run test:e2e
// Options via env: E2E_PLAYER_FILE=<video>, E2E_ONLY=boot,collection

import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { connectCdp, createConsoleCollector, mainPage, waitForReady } from "./cdp";
import {
  createStepRunner,
  ensureVite,
  killE2eProcesses,
  launchTauri,
  outRoot,
  waitForCdpFree,
  wipeData,
  writeReport,
  type Scenario,
  type StepResult,
} from "./harness";
import { boot } from "./scenarios/boot";
import { collection } from "./scenarios/collection";
import { player } from "./scenarios/player";
import { repro } from "./scenarios/repro";
import { torrent } from "./scenarios/torrent";

const ALL: Scenario[] = [boot, collection, torrent, player, repro];

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
  const only = (process.env.E2E_ONLY ?? "").split(",").filter(Boolean);
  const scenarios = only.length > 0 ? ALL.filter((scenario) => only.includes(scenario.name)) : ALL;
  if (scenarios.length === 0) {
    console.error(`no scenario matched E2E_ONLY=${process.env.E2E_ONLY ?? ""}`);
    return 2;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = join(outRoot(), stamp);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const results: StepResult[] = [];
  console.log(`[e2e] scenarios: ${scenarios.map((scenario) => scenario.name).join(", ")}`);
  console.log(`[e2e] report: ${outDir}`);

  const vite = await ensureVite();
  killE2eProcesses();
  await waitForCdpFree();
  wipeData();

  const child = launchTauri();
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
    console.log("[e2e] launching app (first run builds the e2e target dir)");
    browser = await connectCdp();
    const page = await mainPage(browser);
    collector.attach(page);
    await waitForReady(page);
    // Reload so the boot scenario captures a cold mount with listeners live.
    await page.reload();
    await waitForReady(page);
    for (const scenario of scenarios) {
      console.log(`[e2e] --- ${scenario.name}`);
      const runner = createStepRunner(scenario.name, page, outDir, results);
      try {
        await scenario.run({ browser, page, outDir, ...runner });
      } catch (error) {
        console.log(`[e2e] scenario ${scenario.name} aborted: ${String(error)}`);
        dumpAppLogOnce(scenario.name, `after ${scenario.name} failed`);
      }
    }
  } catch (error) {
    console.error(`[e2e] harness failure: ${String(error)}`);
    dumpAppLog("harness failure");
    writeReport(outDir, results, collector.errors);
    return 1;
  } finally {
    child.kill();
    killE2eProcesses();
    vite?.kill();
  }

  writeReport(outDir, results, collector.errors);
  const failed = results.filter((result) => result.status === "fail").length;
  console.log(`[e2e] done: ${results.length} steps, ${failed} failed`);
  console.log(`[e2e] report: ${join(outDir, "report.md")}`);
  return failed > 0 ? 1 : 0;
}

process.exit(await main());

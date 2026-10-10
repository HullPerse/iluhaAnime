// Live E2E harness lifecycle: isolate data, launch the real Tauri app with a
// CDP endpoint, drive scenarios, write a report.
//
// Safety properties, deliberately:
// - data goes to %APPDATA%\iluhaAnime.e2e (identifier override), wiped per run
// - the Rust build uses a dedicated target dir so it never locks the dev build
// - release builds never register the iluhaanime:// scheme (debug_assertions),
//   so a dev harness run does not touch the Windows registry
// - only processes whose exe lives in target-e2e are killed, never the user's
//   installed app or a running dev instance

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Browser, Page } from "playwright-core";

import { CDP_PORT, E2E_IDENTIFIER } from "./cdp";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface StepResult {
  scenario: string;
  step: string;
  status: "pass" | "fail" | "skip";
  ms: number;
  detail?: string;
}

export interface ScenarioContext {
  browser: Browser;
  page: Page;
  outDir: string;
  step: (name: string, fn: () => Promise<void> | void) => Promise<void>;
  skip: (name: string, reason: string) => Promise<void>;
}

export interface Scenario {
  name: string;
  run: (context: ScenarioContext) => Promise<void>;
}

export function repoRoot(): string {
  return process.cwd();
}

export function e2eTargetDir(): string {
  return join(repoRoot(), "src-tauri", "target-e2e");
}

// Reports, screenshots and generated fixtures deliberately live under the e2e
// target dir: Vite only ignores `**/src-tauri/**`, so anything written inside
// the watched tree (a screenshot per step, a torrent fixture, the repro zip)
// makes the dev server fire a full page reload in the middle of a run.
export function outRoot(): string {
  return join(e2eTargetDir(), "harness", "out");
}

export function fixtureRoot(): string {
  return join(e2eTargetDir(), "harness", "fixtures");
}

export function appDataDir(): string {
  const base = process.env.APPDATA ?? join(e2eTargetDir(), "appdata");
  return join(base, E2E_IDENTIFIER);
}

// WebView2 keeps localStorage, IndexedDB and cache in its own profile under
// the local app data dir. Without wiping it, a search query or a persisted UI
// atom from one run leaks into the next one, which makes scenarios depend on
// execution history.
export function webViewDataDir(): string {
  const base = process.env.LOCALAPPDATA ?? join(e2eTargetDir(), "localappdata");
  return join(base, E2E_IDENTIFIER);
}

// Never build these through execSync: shell quoting mangles the inner quotes,
// PowerShell silently fails, and the stale WebView2 (the real CDP port owner)
// survives into the next run.
function powershell(script: string): string {
  const result = spawnSync("powershell", ["-NoProfile", "-Command", script], {
    encoding: "utf-8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`powershell failed: ${result.stderr ?? "unknown error"}`);
  }
  return result.stdout ?? "";
}

function port9222Owners(): string[] {
  const script =
    "Get-NetTCPConnection -LocalPort 9222 -State Listen -ErrorAction SilentlyContinue | " +
    "Select-Object -ExpandProperty OwningProcess -Unique";
  try {
    return powershell(script)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^\d+$/.test(line));
  } catch {
    return [];
  }
}

// The app and its WebView2 are separate processes and only the WebView2 holds
// the CDP port. Leaving either alive makes the next run attach to a stale app
// that reports unrelated errors.
export function killE2eProcesses(): void {
  powershell(
    "Get-CimInstance Win32_Process -Filter \"Name='iluhaAnime.exe'\" | " +
      "Where-Object { $_.ExecutablePath -like '*target-e2e*' } | " +
      "ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
  );
  powershell(
    "Get-CimInstance Win32_Process -Filter \"Name='msedgewebview2.exe'\" | " +
      "Where-Object { $_.CommandLine -like '*iluhaAnime.e2e*' } | " +
      "ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
  );
  for (const pid of port9222Owners()) {
    spawnSync("taskkill", ["/PID", pid, "/T", "/F"], { stdio: "ignore", windowsHide: true });
  }
}

export async function waitForCdpFree(timeoutMs = 20_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (port9222Owners().length === 0) return;
    await sleep(500);
  }
  throw new Error(`CDP port 9222 is still held after ${timeoutMs}ms`);
}

export async function ensureVite(): Promise<ChildProcess | null> {
  // 127.0.0.1 on purpose: hosts resolves localhost to ::1 first and Vite is
  // pinned to IPv4 (host: 127.0.0.1, strictPort), so localhost fails in fetch
  // even though WebView2 falls back to IPv4 correctly.
  const up = async (): Promise<boolean> => {
    try {
      const response = await fetch("http://127.0.0.1:1420", { method: "HEAD" });
      return response.status < 500;
    } catch {
      return false;
    }
  };
  if (await up()) return null;

  console.log("[e2e] starting frontend dev server (nothing on 1420)");
  const child = spawn("bun", ["run", "dev"], {
    cwd: repoRoot(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const started = Date.now();
  while (Date.now() - started < 120_000) {
    if (await up()) return child;
    if (child.exitCode !== null) {
      throw new Error(`vite exited with code ${child.exitCode}; run bun run dev manually`);
    }
    await sleep(500);
  }
  child.kill();
  throw new Error("frontend dev server did not come up on 1420 in 120s");
}

export function wipeData(): void {
  const dirs = [appDataDir(), webViewDataDir()];
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    mkdirSync(dir, { recursive: true });
  }
  if (!existsSync(appDataDir())) {
    throw new Error(`could not recreate the e2e data dir: ${appDataDir()}`);
  }
}

export function launchTauri(): ChildProcess {
  const config = JSON.stringify({
    identifier: E2E_IDENTIFIER,
    build: { beforeDevCommand: "echo skip" },
  });
  return spawn("bunx", ["tauri", "dev", "--no-dev-server-wait", "--config", config], {
    cwd: repoRoot(),
    env: {
      ...process.env,
      CARGO_TARGET_DIR: e2eTargetDir(),
      RUST_LOG: process.env.RUST_LOG ?? "iluhaanime=debug,tauri=warn",
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${CDP_PORT}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function createStepRunner(
  scenario: string,
  page: Page,
  outDir: string,
  results: StepResult[]
): Pick<ScenarioContext, "step" | "skip"> {
  const shots = join(outDir, "shots");
  mkdirSync(shots, { recursive: true });
  const slug = (name: string): string => name.replace(/\W+/g, "-").toLowerCase();

  const screenshot = async (name: string): Promise<void> => {
    await page.screenshot({ path: join(shots, `${scenario}-${slug(name)}.png`) });
  };

  return {
    async step(name, fn) {
      const started = Date.now();
      try {
        await fn();
        await screenshot(name);
        results.push({ scenario, step: name, status: "pass", ms: Date.now() - started });
        console.log(`  ok   ${name} (${Date.now() - started}ms)`);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        await screenshot(`FAIL ${name}`);
        const dom = await page.evaluate(() => document.documentElement.outerHTML).catch(() => "");
        writeFileSync(join(shots, `${scenario}-FAIL-${slug(name)}.dom.html`), dom.slice(0, 40_000));
        results.push({ scenario, step: name, status: "fail", ms: Date.now() - started, detail });
        console.log(`  FAIL ${name} (${Date.now() - started}ms): ${detail}`);
        throw error;
      }
    },
    async skip(name, reason) {
      results.push({ scenario, step: name, status: "skip", ms: 0, detail: reason });
      console.log(`  skip ${name}: ${reason}`);
    },
  };
}

export function writeReport(outDir: string, results: StepResult[], consoleErrors: string[]): void {
  const failed = results.filter((result) => result.status === "fail").length;
  const skipped = results.filter((result) => result.status === "skip").length;
  const rows: string[] = [
    "# Live E2E report",
    "",
    `- steps: ${results.length}`,
    `- passed: ${results.length - failed - skipped}`,
    `- failed: ${failed}`,
    `- skipped: ${skipped}`,
    `- console errors: ${consoleErrors.length}`,
    "",
    "| scenario | step | status | ms | detail |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const result of results) {
    rows.push(
      `| ${result.scenario} | ${result.step} | ${result.status} | ${result.ms} | ${result.detail ?? ""} |`
    );
  }
  if (consoleErrors.length > 0) {
    rows.push("", "## Console errors", "");
    for (const error of consoleErrors.slice(0, 50)) rows.push(`- ${error}`);
  }
  writeFileSync(join(outDir, "report.md"), rows.join("\n"));
}

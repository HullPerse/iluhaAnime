import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { attempt, attemptSync } from "@hullperse/hp_utils/attempt";

import type { Browser, Page } from "playwright-core";

import { cdpPort, E2E_IDENTIFIER } from "./cdp";

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

export interface IpcCommandStat {
  command: string;
  invokes: number;
  bodyBytes: number;
  responseBytes: number;
  totalMs: number;
  errors: number;
  dedupHits: number;
  cacheHits: number;
  durationsMs: number[];
  p50Ms: number;
  p95Ms: number;
}

export interface IpcStepMetric {
  scenario: string;
  step: string;
  status: "pass" | "fail";
  ms: number;
  invokes: number;
  bodyBytes: number;
  responseBytes: number;
  totalMs: number;
  errors: number;
  dedupHits: number;
  cacheHits: number;
  p50Ms: number;
  p95Ms: number;
  commands: IpcCommandStat[];
  detail?: string;
}

export interface IpcScenarioMetric {
  scenario: string;
  steps: IpcStepMetric[];
  totals: {
    invokes: number;
    bodyBytes: number;
    responseBytes: number;
    totalMs: number;
    errors: number;
    dedupHits: number;
    cacheHits: number;
    commands: IpcCommandStat[];
  };
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

function repoRoot(): string {
  return process.cwd();
}

function e2eTargetDir(): string {
  return join(repoRoot(), "src-tauri", "target-e2e");
}

export function outRoot(): string {
  return join(e2eTargetDir(), "harness", "out");
}

export function fixtureRoot(): string {
  return join(e2eTargetDir(), "harness", "fixtures");
}

function appDataDir(): string {
  const base = process.env.APPDATA ?? join(e2eTargetDir(), "appdata");

  return join(base, E2E_IDENTIFIER);
}

export function e2eDatabaseFile(): string {
  return join(appDataDir(), "app_data.sqlite3");
}

function webViewDataDir(): string {
  const base = process.env.LOCALAPPDATA ?? join(e2eTargetDir(), "localappdata");

  return join(base, E2E_IDENTIFIER);
}

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
}

interface PortOwner {
  pid: string;
  detail: string;
}

function portOwnerPids(port: number): number[] {
  const script =
    `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ` +
    "Select-Object -ExpandProperty OwningProcess -Unique";
  const [output] = attemptSync(() => powershell(script));

  return (output ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\d+$/.test(line))
    .map((line) => Number.parseInt(line, 10));
}

function describeProcess(pid: number): string {
  const script =
    `Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" | ` +
    "Select-Object -ExpandProperty CommandLine";
  const [commandLine] = attemptSync(() => powershell(script).trim());

  if (!commandLine) return `PID ${pid}`;

  return `PID ${pid} (${commandLine.slice(0, 120)})`;
}

function portOwners(port: number): PortOwner[] {
  return portOwnerPids(port).map((pid) => ({ pid: String(pid), detail: describeProcess(pid) }));
}

export async function ensureCdpFree(timeoutMs = 30_000): Promise<void> {
  const port = cdpPort();
  killE2eProcesses();
  const started = Date.now();
  let held = portOwners(port);

  while (Date.now() - started < timeoutMs) {
    if (held.length === 0) return;
    killE2eProcesses();
    await sleep(1000);
    held = portOwners(port);
  }

  if (held.length > 0) {
    const detail = held.map((owner) => owner.detail).join("; ");
    throw new Error(
      `CDP port ${port} is held by a process this harness does not own: ${detail}. ` +
        "Close it, or set E2E_CDP_PORT to a free port for this run."
    );
  }
}

export function warnAboutForeignApp(): void {
  const script =
    "Get-CimInstance Win32_Process -Filter \"Name='iluhaAnime.exe'\" | " +
    "Where-Object { $_.ExecutablePath -notlike '*target-e2e*' } | " +
    'ForEach-Object { "$($_.ProcessId) $($_.ExecutablePath)" }';
  const [output] = attemptSync(() => powershell(script));

  if (output === null) return;
  const foreign = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (foreign.length > 0) {
    const list = foreign.map((line) => `        ${line}`).join("\n");
    console.log(
      `[e2e] note: another install of the app is running. This is fine, the harness ` +
        `gives its own instance a separate torrent port:\n${list}`
    );
  }
}

export async function ensureVite(): Promise<ChildProcess | null> {
  const up = async (): Promise<boolean> => {
    const [response] = await attempt(fetch("http://127.0.0.1:1420", { method: "HEAD" }));

    return response !== null && response.status < 500;
  };

  if (await up()) return null;

  console.log("[e2e] starting frontend dev server (nothing on 1420)");
  const child = spawn("bun", ["run", "dev"], {
    cwd: repoRoot(),
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform === "win32",
  });
  const started = Date.now();

  while (Date.now() - started < 180_000) {
    if (await up()) return child;

    if (child.exitCode !== null) {
      throw new Error(`vite exited with code ${child.exitCode}; run bun run dev manually`);
    }

    await sleep(500);
  }

  stopVite(child);
  throw new Error("frontend dev server did not come up on 1420 in 180s");
}

export function stopVite(child: ChildProcess | null): void {
  stopProcessTree(child);
}

export function stopProcessTree(child: ChildProcess | null): void {
  if (!child || child.pid === undefined) return;

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  }

  child.kill();
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

  seedSessionConfig();
}

const E2E_LISTEN_PORT = 51413;

function seedSessionConfig(): void {
  const path = join(appDataDir(), "session_config.json");
  const config = {
    disablePersistence: false,
    enableUpnp: false,
    fastresume: true,
    fileOrder: "list",
    ipv4Only: true,
    listenPort: E2E_LISTEN_PORT,
    peerConnectTimeout: 10,
    peerReadWriteTimeout: 30,
    proxyUrl: null,
  };
  writeFileSync(path, JSON.stringify(config, null, 2));
}

export function launchTauri(): ChildProcess {
  const config = JSON.stringify({
    identifier: E2E_IDENTIFIER,
    build: { beforeDevCommand: "echo skip" },
  });

  return spawn("bunx", ["tauri", "dev", "--no-watch", "--no-dev-server-wait", "--config", config], {
    cwd: repoRoot(),
    env: {
      ...process.env,
      CARGO_TARGET_DIR: e2eTargetDir(),
      RUST_LOG: process.env.RUST_LOG ?? "iluhaanime=debug,tauri=warn",
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort()}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** Build with production optimization/assets, but retain the harness identity. */
export async function buildOptimizedTauri(): Promise<void> {
  const config = JSON.stringify({ identifier: E2E_IDENTIFIER });
  const child = spawn(
    "bunx",
    ["tauri", "build", "--no-bundle", "--config", config, "--", "--locked"],
    {
      cwd: repoRoot(),
      env: { ...process.env, CARGO_TARGET_DIR: e2eTargetDir() },
      stdio: "inherit",
      windowsHide: true,
    }
  );

  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`isolated optimized build failed (${code})`));
    });
  });
  const executable = join(e2eTargetDir(), "release", "iluhaAnime.exe");
  writeFileSync(
    `${executable}.e2e.json`,
    JSON.stringify({
      identifier: E2E_IDENTIFIER,
      sha256: createHash("sha256").update(readFileSync(executable)).digest("hex"),
    })
  );
}

/** Only launch the executable built above; never fall back to an installed app. */
export function launchOptimizedTauri(): ChildProcess {
  const executable = join(e2eTargetDir(), "release", "iluhaAnime.exe");

  if (!existsSync(executable) || !existsSync(`${executable}.e2e.json`)) {
    throw new Error("Build the isolated optimized application before launching it");
  }

  const stamp: unknown = JSON.parse(readFileSync(`${executable}.e2e.json`, "utf-8"));
  const hash = createHash("sha256").update(readFileSync(executable)).digest("hex");

  if (
    typeof stamp !== "object" ||
    stamp === null ||
    !("identifier" in stamp) ||
    stamp.identifier !== E2E_IDENTIFIER ||
    !("sha256" in stamp) ||
    stamp.sha256 !== hash
  )
    throw new Error("Optimized executable does not match the isolated E2E build stamp");

  return spawn(executable, [], {
    cwd: repoRoot(),
    env: {
      ...process.env,
      RUST_LOG: process.env.RUST_LOG ?? "iluhaanime=debug,tauri=warn",
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort()}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

function percentile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * q)));

  return sorted[index] ?? 0;
}

type IpcRawStat = Omit<IpcCommandStat, "p50Ms" | "p95Ms">;

async function readIpcStats(page: Page): Promise<IpcRawStat[]> {
  return page.evaluate(() => {
    const read = (
      window as unknown as {
        __iluhaTransportStats?: () => Array<{
          command: string;
          invokes: number;
          bodyBytes: number;
          responseBytes: number;
          totalMs: number;
          errors: number;
          dedupHits: number;
          cacheHits: number;
          durationsMs: number[];
        }>;
      }
    ).__iluhaTransportStats;

    return read ? read() : [];
  });
}

function diffIpcStats(before: IpcRawStat[], after: IpcRawStat[]): IpcCommandStat[] {
  const previous = new Map(before.map((stat) => [stat.command, stat]));

  return after
    .flatMap((stat) => {
      const old = previous.get(stat.command);
      const reset =
        old === undefined ||
        stat.invokes < old.invokes ||
        stat.durationsMs.length < old.durationsMs.length;
      const invokes = reset ? stat.invokes : stat.invokes - old.invokes;
      const bodyBytes = reset ? stat.bodyBytes : stat.bodyBytes - old.bodyBytes;
      const responseBytes = reset ? stat.responseBytes : stat.responseBytes - old.responseBytes;
      const totalMs = reset ? stat.totalMs : stat.totalMs - old.totalMs;
      const errors = reset ? stat.errors : stat.errors - old.errors;
      const dedupHits = reset ? stat.dedupHits : stat.dedupHits - old.dedupHits;
      const cacheHits = reset ? stat.cacheHits : stat.cacheHits - old.cacheHits;
      const durationsMs = reset ? stat.durationsMs : stat.durationsMs.slice(old.durationsMs.length);

      if (invokes === 0 && dedupHits === 0) return [];

      return [
        {
          command: stat.command,
          invokes,
          bodyBytes,
          responseBytes,
          totalMs,
          errors,
          dedupHits,
          cacheHits,
          durationsMs,
          p50Ms: percentile(durationsMs, 0.5),
          p95Ms: percentile(durationsMs, 0.95),
        },
      ];
    })
    .sort(
      (left, right) => right.invokes - left.invokes || left.command.localeCompare(right.command)
    );
}

export function summarizeIpcMetrics(scenario: string, steps: IpcStepMetric[]): IpcScenarioMetric {
  const totals = new Map<string, IpcCommandStat>();

  for (const step of steps) {
    for (const stat of step.commands) {
      const current = totals.get(stat.command) ?? {
        command: stat.command,
        invokes: 0,
        bodyBytes: 0,
        responseBytes: 0,
        totalMs: 0,
        errors: 0,
        dedupHits: 0,
        cacheHits: 0,
        durationsMs: [],
        p50Ms: 0,
        p95Ms: 0,
      };
      current.invokes += stat.invokes;
      current.bodyBytes += stat.bodyBytes;
      current.responseBytes += stat.responseBytes;
      current.totalMs += stat.totalMs;
      current.errors += stat.errors;
      current.dedupHits += stat.dedupHits;
      current.cacheHits += stat.cacheHits;
      current.durationsMs.push(...stat.durationsMs);
      totals.set(stat.command, current);
    }
  }

  const commands = [...totals.values()]
    .map((stat) => ({
      ...stat,
      p50Ms: percentile(stat.durationsMs, 0.5),
      p95Ms: percentile(stat.durationsMs, 0.95),
    }))
    .sort(
      (left, right) => right.invokes - left.invokes || left.command.localeCompare(right.command)
    );

  return {
    scenario,
    steps,
    totals: {
      invokes: commands.reduce((sum, stat) => sum + stat.invokes, 0),
      bodyBytes: commands.reduce((sum, stat) => sum + stat.bodyBytes, 0),
      responseBytes: commands.reduce((sum, stat) => sum + stat.responseBytes, 0),
      totalMs: commands.reduce((sum, stat) => sum + stat.totalMs, 0),
      errors: commands.reduce((sum, stat) => sum + stat.errors, 0),
      dedupHits: commands.reduce((sum, stat) => sum + stat.dedupHits, 0),
      cacheHits: commands.reduce((sum, stat) => sum + stat.cacheHits, 0),
      commands,
    },
  };
}

export function createStepRunner(
  scenario: string,
  page: Page,
  outDir: string,
  results: StepResult[]
): Pick<ScenarioContext, "step" | "skip"> & { metrics: IpcStepMetric[] } {
  const shots = join(outDir, "shots");
  mkdirSync(shots, { recursive: true });
  const slug = (name: string): string => name.replace(/\W+/g, "-").toLowerCase();

  const screenshot = async (name: string): Promise<void> => {
    await page.screenshot({ path: join(shots, `${scenario}-${slug(name)}.png`) });
  };

  const metrics: IpcStepMetric[] = [];

  return {
    metrics,
    async step(name, fn) {
      const started = Date.now();
      const before = await readIpcStats(page).catch(() => []);
      let status: "pass" | "fail" = "pass";
      let detail: string | undefined;

      try {
        await fn();
        await screenshot(name);
        results.push({ scenario, step: name, status, ms: Date.now() - started });
        console.log(`  ok   ${name} (${Date.now() - started}ms)`);
      } catch (error) {
        status = "fail";
        detail = error instanceof Error ? error.message : String(error);
        results.push({ scenario, step: name, status, ms: Date.now() - started, detail });
        console.log(`  FAIL ${name} (${Date.now() - started}ms): ${detail}`);
        await screenshot(`FAIL ${name}`).catch(() => undefined);
        const dom = await page.evaluate(() => document.documentElement.outerHTML).catch(() => "");
        writeFileSync(join(shots, `${scenario}-FAIL-${slug(name)}.dom.html`), dom.slice(0, 40_000));
        throw error;
      } finally {
        const after = await readIpcStats(page).catch(() => []);
        const commands = diffIpcStats(before, after);
        const stepMs = Date.now() - started;
        const durationsMs = commands.flatMap((stat) => stat.durationsMs);

        metrics.push({
          scenario,
          step: name,
          status,
          ms: stepMs,
          invokes: commands.reduce((sum, stat) => sum + stat.invokes, 0),
          bodyBytes: commands.reduce((sum, stat) => sum + stat.bodyBytes, 0),
          responseBytes: commands.reduce((sum, stat) => sum + stat.responseBytes, 0),
          totalMs: commands.reduce((sum, stat) => sum + stat.totalMs, 0),
          errors: commands.reduce((sum, stat) => sum + stat.errors, 0),
          dedupHits: commands.reduce((sum, stat) => sum + stat.dedupHits, 0),
          cacheHits: commands.reduce((sum, stat) => sum + stat.cacheHits, 0),
          p50Ms: percentile(durationsMs, 0.5),
          p95Ms: percentile(durationsMs, 0.95),
          commands,
          ...(detail === undefined ? {} : { detail }),
        });
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

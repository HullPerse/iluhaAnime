import { spawnSync } from "node:child_process";
import { cpus } from "node:os";

import { E2E_IDENTIFIER } from "./cdp";

interface RawProcess {
  ProcessId?: number | string;
  ParentProcessId?: number | string;
  Name?: string | null;
  ExecutablePath?: string | null;
  CommandLine?: string | null;
  WorkingSetSize?: number | string | null;
  PrivatePageCount?: number | string | null;
  ThreadCount?: number | string | null;
  HandleCount?: number | string | null;
  UserModeTime?: number | string | null;
  KernelModeTime?: number | string | null;
  ReadTransferCount?: number | string | null;
  WriteTransferCount?: number | string | null;
}

export interface ProcessSample {
  pid: number;
  parentPid: number;
  name: string;
  commandLine: string | null;
  workingSetBytes: number | null;
  privateBytes: number | null;
  threadCount: number | null;
  handleCount: number | null;
  cpuTicks: number | null;
  cpuPercentOneCore: number | null;
  diskReadBytes: number | null;
  diskWriteBytes: number | null;
}

export interface TreeSample {
  sampledAt: string;
  sampledAtMs: number;
  appRootPids: number[];
  processes: ProcessSample[];
  processCount: number;
  workingSetBytes: number | null;
  privateBytes: number | null;
  threadCount: number | null;
  handleCount: number | null;
  cpuPercentOneCore: number | null;
  cpuPercentTotal: number | null;
  diskReadBytes: number | null;
  diskWriteBytes: number | null;
  networkBytes: null;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function processSnapshot(): RawProcess[] {
  const script =
    "$ErrorActionPreference='Stop'; " +
    "Get-CimInstance Win32_Process | " +
    "Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine," +
    "WorkingSetSize,PrivatePageCount,ThreadCount,HandleCount,UserModeTime,KernelModeTime," +
    "ReadTransferCount,WriteTransferCount | ConvertTo-Json -Compress";
  const result = spawnSync("powershell", ["-NoProfile", "-Command", script], {
    encoding: "utf-8",
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`process inventory failed: ${String(result.stderr ?? "unknown error")}`);
  }
  const parsed = JSON.parse(result.stdout || "[]") as RawProcess | RawProcess[];
  return Array.isArray(parsed) ? parsed : [parsed];
}

function normalizePath(value: string | null | undefined): string {
  return (value ?? "").replaceAll("\\", "/").toLowerCase();
}

function isAppRoot(process: RawProcess): boolean {
  return (
    process.Name?.toLowerCase() === "iluhaanime.exe" &&
    normalizePath(process.ExecutablePath).includes("/target-e2e/")
  );
}

function isE2eWebView(process: RawProcess): boolean {
  return (
    process.Name?.toLowerCase() === "msedgewebview2.exe" &&
    (process.CommandLine ?? "").includes(E2E_IDENTIFIER)
  );
}

function appRoots(processes: RawProcess[]): Set<number> {
  const roots = new Set<number>();
  for (const process of processes) {
    if (!isAppRoot(process)) continue;
    const pid = numberOrNull(process.ProcessId);
    if (pid !== null) roots.add(pid);
  }
  if (roots.size > 0) return roots;
  for (const process of processes) {
    if (!isE2eWebView(process)) continue;
    const pid = numberOrNull(process.ProcessId);
    if (pid !== null) roots.add(pid);
  }
  return roots;
}

function descendants(roots: Set<number>, processes: RawProcess[]): Set<number> {
  const selected = new Set(roots);
  let changed = true;
  while (changed) {
    changed = false;
    for (const process of processes) {
      const pid = numberOrNull(process.ProcessId);
      const parent = numberOrNull(process.ParentProcessId);
      if (pid === null || parent === null) continue;
      if (selected.has(parent) && !selected.has(pid)) {
        selected.add(pid);
        changed = true;
      }
    }
  }
  return selected;
}

function sum(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length === 0 ? null : present.reduce((total, value) => total + value, 0);
}

function cpuTicks(process: RawProcess): number | null {
  const user = numberOrNull(process.UserModeTime);
  const kernel = numberOrNull(process.KernelModeTime);
  if (user === null && kernel === null) return null;
  return (user ?? 0) + (kernel ?? 0);
}

function cpuPercent(ticks: number | null, previous: number | null, elapsedMs: number): number | null {
  if (ticks === null || previous === null || elapsedMs <= 0) return null;
  return ((ticks - previous) / elapsedMs / 10_000) * 100;
}

export function formatBytes(value: number | null): string {
  if (value === null) return "n/a";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = value;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`;
}

export async function sampleProcessTree(previous?: TreeSample): Promise<TreeSample> {
  const raw = processSnapshot();
  const roots = appRoots(raw);
  if (roots.size === 0) {
    throw new Error("no isolated iluhaAnime E2E process tree found");
  }
  const selected = descendants(roots, raw);
  const sampledAtMs = Date.now();
  const elapsedMs = previous === undefined ? 0 : sampledAtMs - previous.sampledAtMs;
  const previousByPid = new Map(previous?.processes.map((process) => [process.pid, process]) ?? []);
  const processes: ProcessSample[] = [];
  for (const process of raw) {
    const pid = numberOrNull(process.ProcessId);
    const parentPid = numberOrNull(process.ParentProcessId);
    if (pid === null || parentPid === null || !selected.has(pid)) continue;
    const ticks = cpuTicks(process);
    const previousTicks = previousByPid.get(pid)?.cpuTicks ?? null;
    const oneCore = cpuPercent(ticks, previousTicks, elapsedMs);
    processes.push({
      pid,
      parentPid,
      name: process.Name ?? "",
      commandLine: process.CommandLine ?? null,
      workingSetBytes: numberOrNull(process.WorkingSetSize),
      privateBytes: numberOrNull(process.PrivatePageCount),
      threadCount: numberOrNull(process.ThreadCount),
      handleCount: numberOrNull(process.HandleCount),
      cpuTicks: ticks,
      cpuPercentOneCore: oneCore,
      diskReadBytes: numberOrNull(process.ReadTransferCount),
      diskWriteBytes: numberOrNull(process.WriteTransferCount),
    });
  }
  const oneCore = sum(processes.map((process) => process.cpuPercentOneCore));
  return {
    sampledAt: new Date(sampledAtMs).toISOString(),
    sampledAtMs,
    appRootPids: [...roots],
    processes,
    processCount: processes.length,
    workingSetBytes: sum(processes.map((process) => process.workingSetBytes)),
    privateBytes: sum(processes.map((process) => process.privateBytes)),
    threadCount: sum(processes.map((process) => process.threadCount)),
    handleCount: sum(processes.map((process) => process.handleCount)),
    cpuPercentOneCore: oneCore,
    cpuPercentTotal: oneCore === null ? null : oneCore / cpus().length,
    diskReadBytes: sum(processes.map((process) => process.diskReadBytes)),
    diskWriteBytes: sum(processes.map((process) => process.diskWriteBytes)),
    networkBytes: null,
  };
}

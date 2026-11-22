#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { attempt } from "@hullperse/hp_utils/attempt";
import * as z from "zod/mini";

import {
  diffFingerprintEntries,
  fingerprintEntries,
  type FingerprintEntry,
} from "../src/lib/core/system/buildFingerprint.utils";

const ROOT = process.cwd();
const STATE_DIR = resolve(ROOT, ".build-cache");
const STATE_FILE = join(STATE_DIR, "build-stages.json");
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "target",
  "target-e2e",
  "dist",
  ".build-cache",
  "logs",
]);

interface StageDefinition {
  name: "frontend" | "rust";
  roots: string[];
  command: string[];
}

const stageStateSchema = z.record(
  z.string(),
  z.object({
    fingerprint: z.string(),
    entries: z.array(z.object({ path: z.string(), size: z.number(), modifiedMs: z.number() })),
    at: z.number(),
  })
);

type StageStateMap = z.infer<typeof stageStateSchema>;

function stateKey(stage: StageDefinition, release: boolean): string {
  return stage.name === "rust" && release ? "rust:release" : stage.name;
}

function commandEntry(command: string[]): FingerprintEntry {
  const text = command.join(" ");
  let checksum = 0;

  for (const character of text) {
    checksum = (checksum * 31 + (character.codePointAt(0) ?? 0)) % 0xff_ff_ff_ff;
  }

  return { path: "<stage-command>", size: text.length, modifiedMs: checksum };
}

const frontendStage: StageDefinition = {
  name: "frontend",
  roots: [
    "src",
    "public",
    "index.html",
    "vite.config.ts",
    "package.json",
    "tsconfig.json",
    "tsconfig.node.json",
    "oxlint.config.ts",
    "oxfmt.config.ts",
  ],
  command: ["bun", "run", "build"],
};

const rustStage: StageDefinition = {
  name: "rust",
  roots: [
    "src-tauri/src",
    "src-tauri/.cargo",
    "src-tauri/capabilities",
    "src-tauri/resources",
    "src-tauri/icons",
    "src-tauri/lib",
    "src-tauri/Cargo.toml",
    "src-tauri/Cargo.lock",
    "src-tauri/build.rs",
    "src-tauri/tauri.conf.json",
  ],
  command: ["cargo", "check", "--manifest-path", "src-tauri/Cargo.toml"],
};

async function walk(path: string, files: FingerprintEntry[]): Promise<void> {
  const info = await stat(path);

  if (info.isFile()) {
    files.push({ path, size: info.size, modifiedMs: info.mtimeMs });

    return;
  }

  const entries = await readdir(path, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    await walk(join(path, entry.name), files);
  }
}

async function snapshot(roots: string[]): Promise<FingerprintEntry[]> {
  const files: FingerprintEntry[] = [];

  for (const root of roots) {
    const absolute = resolve(ROOT, root);

    if (!existsSync(absolute)) continue;
    await walk(absolute, files);
  }

  return files.map((entry) => ({ ...entry, path: entry.path.slice(ROOT.length + 1) }));
}

async function loadState(): Promise<StageStateMap> {
  if (!existsSync(STATE_FILE)) return {};
  const [loaded] = await attempt(
    readFile(STATE_FILE, "utf-8").then((raw) => stageStateSchema.parse(JSON.parse(raw)))
  );

  return loaded ?? {};
}

function getReleaseCommand(stage: StageDefinition): string[] {
  return stage.name === "rust"
    ? ["cargo", "build", "--release", "--manifest-path", "src-tauri/Cargo.toml"]
    : stage.command;
}

function run(command: string[]): number {
  const started = performance.now();
  const result = spawnSync(command[0] ?? "", command.slice(1), {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
  });
  const elapsed = performance.now() - started;
  const status = result.status ?? 1;
  console.log(`  ${status === 0 ? "done" : "failed"} in ${(elapsed / 1000).toFixed(1)}s`);

  return status;
}

async function planStage(
  stage: StageDefinition,
  key: string,
  state: StageStateMap,
  force: boolean
): Promise<{ entries: FingerprintEntry[]; reason: string; skip: boolean }> {
  const entries = [...(await snapshot(stage.roots)), commandEntry(stage.command)];
  const stored = state[key];

  if (force) return { entries, reason: "--force", skip: false };

  if (!stored) return { entries, reason: "no stored fingerprint", skip: false };

  const diff = diffFingerprintEntries(stored.entries, entries);
  const total = diff.added.length + diff.changed.length + diff.removed.length;

  if (total === 0 && stored.fingerprint === fingerprintEntries(entries)) {
    return { entries, reason: `${entries.length} inputs unchanged`, skip: true };
  }

  const sample = [...diff.added, ...diff.changed, ...diff.removed].slice(0, 3).join(", ");

  return { entries, reason: `${total} changed (${sample})`, skip: false };
}

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--plan");
const force = args.has("--force");
const release = args.has("--release");

const state = await loadState();
const stages: StageDefinition[] = [frontendStage, rustStage];
const nextState: StageStateMap = { ...state };
let failed = false;

for (const stage of stages) {
  const effective = release ? { ...stage, command: getReleaseCommand(stage) } : stage;
  const key = stateKey(stage, release);
  const decision = await planStage(effective, key, state, force);
  const label = decision.skip ? "skip" : "run";
  console.log(`[${stage.name}] ${label} - ${decision.reason}`);

  if (dryRun || decision.skip) continue;

  console.log(`[${stage.name}] ${effective.command.join(" ")}`);

  if (run(effective.command) !== 0) {
    failed = true;
    break;
  }

  nextState[key] = {
    entries: decision.entries,
    fingerprint: fingerprintEntries(decision.entries),
    at: Date.now(),
  };
}

if (!dryRun && !failed) {
  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(STATE_FILE, `${JSON.stringify(nextState, null, 2)}\n`);
}

if (failed) process.exit(1);

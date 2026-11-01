#!/usr/bin/env bun
/**
 * Runs only the build stages whose inputs changed.
 *
 * The Windows release build spends most of its time in Cargo and linking, while
 * the frontend stage is seconds. Rebuilding both because one moved is wasted
 * work; this wrapper fingerprints each stage's inputs and skips the untouched
 * one, printing what it skipped and why.
 *
 *   bun scripts/build-incremental.ts            frontend build + cargo check
 *   bun scripts/build-incremental.ts --plan     report decisions, run nothing
 *   bun scripts/build-incremental.ts --force    ignore stored fingerprints
 *   bun scripts/build-incremental.ts --release  cargo build --release
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  diffFingerprintEntries,
  fingerprintEntries,
  type FingerprintEntry,
} from "../src/lib/core/buildFingerprint.utils";

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

interface StageState {
  fingerprint: string;
  entries: FingerprintEntry[];
  at: number;
}

type StageStateMap = Record<string, StageState>;

/**
 * `cargo check` and `cargo build --release` read the same sources but produce
 * different artefacts, so each mode keeps its own state. Sharing one key would
 * let a check run make the next release build look up to date.
 */
function stateKey(stage: StageDefinition, release: boolean): string {
  return stage.name === "rust" && release ? "rust:release" : stage.name;
}

/**
 * The stage command is an input too: changing what a stage runs must invalidate
 * the state that was recorded by the previous command.
 */
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
  // `bun run build` is the real stage: typecheck plus the Rolldown bundle.
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
  // `vendor/` is deliberately absent: it holds the pinned dependency sources
  // that Cargo.lock already identifies, and walking it would cost more than the
  // check it gates.
  // Resolved at runtime so --release only swaps the build command.
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
  try {
    return JSON.parse(await readFile(STATE_FILE, "utf-8")) as StageStateMap;
  } catch {
    return {};
  }
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

#!/usr/bin/env bun

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

import {
  formatIpcContract,
  parseIpcCommandContracts,
} from "../src/lib/core/system/ipcContract.utils";

const RUST_ROOT = "src-tauri/src";
const OUTPUT = "docs/codebase-audit/ipc-contract.md";

function rustFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? rustFiles(path) : path.endsWith(".rs") ? [path] : [];
  });
}

function moduleName(path: string): string {
  const parts = relative(RUST_ROOT, path).split(/[\\/]/);
  return parts.length > 1 ? parts[0] : (parts[0]?.replace(/\.rs$/, "") ?? "root");
}

const contracts = rustFiles(RUST_ROOT).flatMap((path) =>
  parseIpcCommandContracts(readFileSync(path, "utf-8"), moduleName(path))
);
const generated = formatIpcContract(contracts);
const commandCount = new Set(contracts.map((contract) => contract.name)).size;

if (process.argv.includes("--check")) {
  const current = readFileSync(OUTPUT, "utf-8");
  if (current !== generated) {
    console.error(`${OUTPUT} is stale; run bun run check:ipc`);
    process.exit(1);
  }
  console.log(`ipc contract: ${commandCount} commands in ${OUTPUT}`);
} else {
  writeFileSync(OUTPUT, generated);
  console.log(`ipc contract: wrote ${commandCount} commands to ${OUTPUT}`);
}

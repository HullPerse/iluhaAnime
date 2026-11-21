#!/usr/bin/env bun

import { readFileSync } from "node:fs";

const IPCS_PATH = "src/types/core/ipc.d.ts";
const LIB_PATH = "src-tauri/src/lib.rs";

function rustCommands(source: string): string[] {
  const start = source.indexOf("generate_handler![");
  if (start === -1) {
    throw new Error(`generate_handler! is not in ${LIB_PATH}`);
  }
  const end = source.indexOf("\n        ])", start);
  if (end === -1) {
    throw new Error(`the generate_handler! list in ${LIB_PATH} has no closing bracket`);
  }
  const block = source.slice(start, end);
  const names = new Set<string>();
  for (const line of block.split("\n")) {
    const match = /^\s+([a-zA-Z_0-9:]+),/.exec(line);
    if (match) {
      names.add(match[1].split("::").at(-1) ?? match[1]);
    }
  }
  return [...names].sort();
}

function tsCommands(source: string): string[] {
  const names = new Set<string>();
  for (const match of source.matchAll(/^\s+\| "([a-z_0-9]+)"/gm)) {
    names.add(match[1]);
  }
  return [...names].sort();
}

const rust = rustCommands(readFileSync(LIB_PATH, "utf-8"));
const ts = tsCommands(readFileSync(IPCS_PATH, "utf-8"));
const rustSet = new Set(rust);
const tsSet = new Set(ts);

const missingInRust = ts.filter((name) => !rustSet.has(name));
const missingInTs = rust.filter((name) => !tsSet.has(name));

console.log(`commands: ${ts.length} in ${IPCS_PATH}, ${rust.length} in ${LIB_PATH}`);

if (missingInTs.length > 0) {
  console.log("\nregistered in Rust but not named in the union:");
  for (const name of missingInTs) {
    console.log(`  ${name}`);
  }
}

if (missingInRust.length > 0) {
  console.error("\ncalled from TypeScript but not registered in Rust:");
  for (const name of missingInRust) {
    console.error(`  ${name}`);
  }
  process.exit(1);
}

console.log("\nno missing command registration");

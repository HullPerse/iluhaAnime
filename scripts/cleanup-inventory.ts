import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const TS_EXTENSIONS = /\.(ts|tsx)$/;
const TEXT_EXTENSIONS = /\.(ts|tsx|css|md|json|toml|rs|html)$/;
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "target", "vendor", "build"]);

const FORBIDDEN = new Map<number, string>([
  [0x00a0, "nbsp"],
  [0x00ab, "guillemet"],
  [0x00b7, "middle dot"],
  [0x00bb, "guillemet"],
  [0x2013, "en dash"],
  [0x2014, "em dash"],
  [0x2018, "quote"],
  [0x2019, "quote"],
  [0x201c, "quote"],
  [0x201d, "quote"],
  [0x2026, "ellipsis"],
]);

interface FileCount {
  count: number;
  path: string;
}

interface TextHit {
  column: number;
  codepoint: number;
  label: string;
  line: number;
  path: string;
}

async function walk(path: string): Promise<string[]> {
  const info = await stat(path);
  if (info.isFile()) return [path];
  const entries = await readdir(path, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    files.push(...(await walk(join(path, entry.name))));
  }
  return files;
}

function countMatches(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}

function stripNonCode(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/^import[\s\S]*?from\s+["'][^"']+["'];?$/gm, "")
    .replace(/^export\s*(?:type\s*)?\{[\s\S]*?\}\s*from\s+["'][^"']+["'];?$/gm, "");
}

function countCasts(text: string): number {
  let count = 0;
  for (const line of stripNonCode(text).split("\n")) {
    if (/\bas\s+(?!const\b)[A-Za-z_{[(]/.test(line)) count += 1;
  }
  return count;
}

function total(rows: FileCount[]): number {
  let sum = 0;
  for (const row of rows) sum += row.count;
  return sum;
}

function printTop(label: string, rows: FileCount[]): void {
  console.log(`${label}: ${total(rows)}`);
  const top = [...rows]
    .filter((row) => row.count > 0)
    .sort((left, right) => right.count - left.count)
    .slice(0, 8);
  for (const row of top) console.log(`  ${row.count} ${relative(ROOT, row.path)}`);
}

function printFileCount(label: string, rows: FileCount[], threshold: number): void {
  const matches = rows.filter((row) => row.count > threshold);
  console.log(`${label}: ${matches.length} files`);
  const top = [...matches].sort((left, right) => right.count - left.count).slice(0, 8);
  for (const row of top) console.log(`  ${row.count} ${relative(ROOT, row.path)}`);
}

function findForbidden(text: string, path: string): TextHit[] {
  const hits: TextHit[] = [];
  const lines = text.split("\n");
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? "";
    for (let column = 0; column < line.length; column += 1) {
      const codepoint = line.codePointAt(column) ?? 0;
      const label = FORBIDDEN.get(codepoint);
      if (label === undefined) continue;
      hits.push({ column: column + 1, codepoint, label, line: lineIndex + 1, path });
    }
  }
  return hits;
}

const sourceList = await walk(join(ROOT, "src"));
const sourceFiles = sourceList.filter((path) => TS_EXTENSIONS.test(path));
const casts: FileCount[] = [];
const comments: FileCount[] = [];
const multiComponent: FileCount[] = [];
const multiExport: FileCount[] = [];
const nullTernary: FileCount[] = [];
const overflow: FileCount[] = [];
const typesOutside: FileCount[] = [];
const untypedRef: FileCount[] = [];
const untypedState: FileCount[] = [];

let testFileCount = 0;
for (const path of sourceFiles) {
  const text = await readFile(path, "utf-8");
  const rel = relative(ROOT, path).replaceAll("\\", "/");
  if (rel.startsWith("src/tests/")) {
    testFileCount += 1;
    continue;
  }
  casts.push({ count: countCasts(text), path });
  comments.push({
    count: countMatches(text, /^\s*\/\//gm) + countMatches(text, /\/\*\*/g),
    path,
  });
  if (path.endsWith(".tsx")) {
    multiComponent.push({ count: countMatches(text, /^(?:export )?(?:default )?function [A-Z]/gm), path });
  }
  multiExport.push({ count: countMatches(text, /^export (?:function|const) /gm), path });
  nullTernary.push({ count: countMatches(text, /\?[^\n;]*:\s*null/g), path });
  overflow.push({ count: countMatches(text, /overflow(?:-y)?-(?:auto|scroll)/g), path });
  untypedRef.push({ count: countMatches(text, /\buseRef\(/g), path });
  untypedState.push({ count: countMatches(text, /\buseState\(/g), path });
  if (!rel.startsWith("src/types/")) {
    typesOutside.push({ count: countMatches(text, /^export (?:interface|type) /gm), path });
  }
}

const textRoots = [
  "src",
  ".docs",
  "scripts",
  "benches",
  "src-tauri/src",
  "README.md",
  "AGENTS.md",
  "package.json",
];
const textFiles: string[] = [];
for (const root of textRoots) {
  const path = join(ROOT, root);
  if (!existsSync(path)) continue;
  const files = await walk(path);
  textFiles.push(...files.filter((file) => TEXT_EXTENSIONS.test(file)));
}

const hits: TextHit[] = [];
for (const path of textFiles) {
  const text = await readFile(path, "utf-8");
  hits.push(...findForbidden(text, relative(ROOT, path)));
}

console.log(`== Cleanup inventory (${new Date().toISOString().slice(0, 10)}) ==`);
console.log(`ts/tsx files: ${sourceFiles.length}`);
console.log(`test files: ${testFileCount}`);
printTop("casts (non const)", casts);
printTop("comments", comments);
printFileCount("multi-component tsx (>1)", multiComponent, 1);
printFileCount("multi-export ts (>2)", multiExport, 2);
printTop("null ternaries", nullTernary);
printTop("overflow sites", overflow);
printTop("types outside src/types", typesOutside);
printTop("untyped useRef", untypedRef);
printTop("untyped useState", untypedState);

console.log("\n== Forbidden punctuation ==");
for (const hit of hits.slice(0, 100)) {
  const codepoint = hit.codepoint.toString(16).toUpperCase().padStart(4, "0");
  console.log(`${hit.path}:${hit.line}:${hit.column} U+${codepoint} ${hit.label}`);
}
if (hits.length > 100) console.log(`... and ${hits.length - 100} more`);
console.log(`total: ${hits.length}`);

if (process.argv.includes("--check") && hits.length > 0) process.exitCode = 1;

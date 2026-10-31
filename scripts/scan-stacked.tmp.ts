import { Glob } from "bun";
import { readFileSync } from "node:fs";
import { parseSync } from "oxc-parser";

type Node = {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
};

type Hit = { file: string; line: number; depth: number; snippet: string };

const hits: Hit[] = [];

function walk(node: unknown, file: string, code: string, depth: number): void {
  if (!node || typeof node !== "object") return;
  const n = node as Node;
  if (n.type === "ConditionalExpression") {
    const nested = (n.consequent as Node | undefined)?.type === "ConditionalExpression";
    const nestedAlt = (n.alternate as Node | undefined)?.type === "ConditionalExpression";
    if ((nested || nestedAlt) && depth === 0) {
      const line = code.slice(0, n.start).split("\n").length;
      const text = code.slice(n.start, n.end).replace(/\s+/g, " ");
      hits.push({ file, line, depth, snippet: text.slice(0, 160) });
    }
    for (const child of [n.test, n.consequent, n.alternate]) {
      walk(child, file, code, depth + 1);
    }
    return;
  }
  for (const key of Object.keys(n)) {
    if (key === "start" || key === "end" || key === "type") continue;
    const value = n[key];
    if (Array.isArray(value)) {
      for (const child of value) walk(child, file, code, depth);
    } else if (value && typeof value === "object" && "type" in (value as Node)) {
      walk(value, file, code, depth);
    }
  }
}

const files: string[] = [];
for await (const path of new Glob("src/**/*.{ts,tsx}").scan(".")) {
  if (path.includes("tests") || path.endsWith(".d.ts")) continue;
  files.push(path);
}

for (const file of files) {
  const code = readFileSync(file, "utf-8");
  const result = parseSync(file, code, { lang: file.endsWith(".tsx") ? "tsx" : "ts" });
  walk(result.program, file, code, 0);
}

console.log(`stacked=${hits.length}`);
for (const hit of hits) {
  console.log(`${hit.file}:${hit.line}  ${hit.snippet}`);
}

import { Glob } from "bun";
import { readFileSync } from "node:fs";

type Hit = { file: string; line: number; subject: string; count: number; sample: string };

const hits: Hit[] = [];
const CONDITION = /^\s*(?:\}\s*)?(?:else\s+)?if\s*\(\s*([\w.$?[\]]+?)\s*(?:===|!==|==|!=)\s*"[^"]*"\s*(?:\)|\|\|)/;

for await (const file of new Glob("src/**/*.{ts,tsx}").scan(".")) {
  if (file.includes("tests") || file.endsWith(".d.ts")) continue;
  const lines = readFileSync(file, "utf-8").split("\n");
  let index = 0;
  while (index < lines.length) {
    const match = CONDITION.exec(lines[index] ?? "");
    if (!match) {
      index += 1;
      continue;
    }
    const subject = match[1];
    let count = 0;
    let cursor = index;
    let lastLine = index;
    while (cursor < lines.length) {
      const line = lines[cursor] ?? "";
      const next = CONDITION.exec(line);
      if (next && next[1] === subject) {
        count += 1;
        lastLine = cursor;
        cursor += 1;
        continue;
      }
      if (line.trim() === "" || line.trim().startsWith("//") || cursor - lastLine < 6) {
        cursor += 1;
        continue;
      }
      break;
    }
    if (count >= 3) {
      hits.push({ file, line: index + 1, subject, count, sample: (lines[index] ?? "").trim() });
      index = cursor;
    } else {
      index += 1;
    }
  }
}

hits.sort((a, b) => b.count - a.count);
console.log(`chains=${hits.length}`);
for (const hit of hits) {
  console.log(`${hit.file}:${hit.line} ${hit.subject} x${hit.count}  ${hit.sample}`);
}

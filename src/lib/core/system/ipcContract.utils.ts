export interface IpcCommandContract {
  name: string;
  args: string[];
  result: string;
}

const COMMAND_ATTRIBUTE = "#[tauri::command]";

function matchingParen(source: string, openIndex: number): number {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") depth += 1;
    if (char === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function splitParams(source: string): string[] {
  const params: string[] = [];
  let current = "";
  let depth = 0;
  for (const char of source) {
    if (char === "<" || char === "(" || char === "[") depth += 1;
    if (char === ">" || char === ")" || char === "]") depth -= 1;
    if (char === "," && depth === 0) {
      if (current.trim()) params.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) params.push(current.trim());
  return params;
}

function returnType(source: string, start: number): string {
  const arrow = source.indexOf("->", start);
  if (arrow === -1) return "()";
  let depth = 0;
  for (let index = arrow + 2; index < source.length; index += 1) {
    const char = source[index];
    if (char === "<" || char === "(" || char === "[") depth += 1;
    if (char === ">" || char === ")" || char === "]") depth -= 1;
    if (char === "{" && depth === 0) {
      return source.slice(arrow + 2, index).replace(/\s+/g, " ").trim();
    }
  }
  return "";
}

export function parseIpcCommandContracts(source: string): IpcCommandContract[] {
  const contracts: IpcCommandContract[] = [];
  let cursor = 0;
  while (true) {
    const attribute = source.indexOf(COMMAND_ATTRIBUTE, cursor);
    if (attribute === -1) break;
    const fn = source.indexOf("fn ", attribute);
    if (fn === -1) break;
    const nameStart = fn + 3;
    const open = source.indexOf("(", nameStart);
    const name = source.slice(nameStart, open).trim();
    const close = matchingParen(source, open);
    if (open === -1 || close === -1) break;
    const args = splitParams(source.slice(open + 1, close)).map((param) =>
      param.slice(0, param.indexOf(":")).trim()
    );
    contracts.push({
      name,
      args,
      result: returnType(source, close),
    });
    cursor = close;
  }
  return contracts;
}

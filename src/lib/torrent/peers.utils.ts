export function splitAddr(addr: string): { host: string; port: string } {
  const closingBracket = addr.lastIndexOf("]");
  if (addr.startsWith("[") && closingBracket > 0) {
    return { host: addr.slice(0, closingBracket + 1), port: addr.slice(closingBracket + 2) };
  }
  const at = addr.lastIndexOf(":");
  if (at === -1) return { host: addr, port: "" };
  return { host: addr.slice(0, at), port: addr.slice(at + 1) };
}

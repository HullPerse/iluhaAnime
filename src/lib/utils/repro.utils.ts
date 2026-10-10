export const REPRO_REDACTED = "[redacted]";
export const REPRO_TRUNCATED = "[truncated]";
export const REPRO_MAX_STRING = 500;
export const REPRO_MAX_ARRAY = 200;
export const REPRO_MAX_DEPTH = 8;
export const REPRO_FRONTEND_MAX_BYTES = 256 * 1024;

const SECRET_KEY_PARTS = [
  "token",
  "secret",
  "password",
  "passwd",
  "apikey",
  "api_key",
  "auth",
  "cookie",
  "credential",
  "privatekey",
  "private_key",
];

export function isSecretKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SECRET_KEY_PARTS.some((part) => lower.includes(part));
}

export function redactProxyUrl(value: string): string {
  return value.replace(/^([^:/?#]+:\/\/)[^/@]+@/, "$1***@");
}

export function sanitizeReproValue(value: unknown, depth = 0): unknown {
  if (depth > REPRO_MAX_DEPTH) return REPRO_TRUNCATED;
  if (typeof value === "string") {
    return value.length > REPRO_MAX_STRING
      ? `${value.slice(0, REPRO_MAX_STRING)}${REPRO_TRUNCATED}`
      : value;
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (typeof value === "bigint") return value.toString();
  if (value === undefined || typeof value === "function" || typeof value === "symbol") {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.slice(0, REPRO_MAX_ARRAY).map((item) => sanitizeReproValue(item, depth + 1));
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (isSecretKey(key)) {
        out[key] = REPRO_REDACTED;
      } else if (key.toLowerCase().includes("proxy") && typeof item === "string") {
        out[key] = redactProxyUrl(item);
      } else {
        out[key] = sanitizeReproValue(item, depth + 1);
      }
    }
    return out;
  }
  return REPRO_TRUNCATED;
}

export interface ReproFrontendInput {
  version: string;
  settings: unknown;
  counts: Record<string, number>;
}

export function buildReproFrontend(input: ReproFrontendInput): string {
  return JSON.stringify({
    counts: input.counts,
    generatedAt: new Date().toISOString(),
    settings: sanitizeReproValue(input.settings),
    version: input.version,
  });
}

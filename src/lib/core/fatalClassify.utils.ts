import type { FatalInfo, FatalKind } from "@/types/core/fatal";

export const GLOBAL_ESCALATE_COUNT = 3;
export const GLOBAL_ESCALATE_WINDOW_MS = 10_000;

const SCOPE_FATAL_KINDS: Record<string, FatalKind> = {
  startup: "startup",
  "global-loop": "global-loop",
};

const CHUNK_PATTERNS = [
  /loading chunk/i,
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /dynamically imported module/i,
];

function readName(value: unknown): string {
  if (typeof value === "object" && value !== null && "name" in value) {
    const name = (value as { name?: unknown }).name;
    return typeof name === "string" ? name : "";
  }
  return "";
}

function readMessage(value: unknown): string {
  if (value instanceof Error) return value.message || String(value);
  if (typeof value === "object" && value !== null && "message" in value) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return String(value);
}

function readStack(value: unknown): string | undefined {
  if (value instanceof Error && typeof value.stack === "string") return value.stack;
  return undefined;
}

function readCode(value: unknown): string {
  if (typeof value === "object" && value !== null && "code" in value) {
    const code = (value as { code?: unknown }).code;
    return typeof code === "string" ? code : "";
  }
  return "";
}

export function isChunkError(value: unknown): boolean {
  if (readName(value) === "ChunkLoadError") return true;
  if (readCode(value) === "CHUNK_LOAD_FAILED") return true;
  return CHUNK_PATTERNS.some((pattern) => pattern.test(readMessage(value)));
}

const RESIZE_OBSERVER_LOOP = /resizeobserver loop/i;

/**
 * Chrome reports a warning when a ResizeObserver callback changes the observed layout in the same
 * delivery loop. The layout is still correct and the loop finishes; the browser only drops the
 * extra notification for that frame. Animating a content-sized modal necessarily does this, so the
 * warning must not be counted as an application failure.
 */
export function isResizeObserverLoopError(value: unknown): boolean {
  return RESIZE_OBSERVER_LOOP.test(readMessage(value));
}

export function toFatalInfo(
  value: unknown,
  context?: { scope: string; route?: string; themeName?: string; timestamp?: number }
): FatalInfo {
  const scope = context?.scope ?? "render";
  const kind: FatalKind = SCOPE_FATAL_KINDS[scope] ?? (isChunkError(value) ? "chunk" : "render");
  return {
    kind,
    message: readMessage(value),
    stack: readStack(value),
    scope,
    themeName: context?.themeName ?? "win95",
    route: context?.route ?? "/",
    timestamp: context?.timestamp ?? Date.now(),
    retryCount: 0,
  };
}

export function shouldEscalateGlobal(stamps: readonly number[], now: number): boolean {
  const recent = stamps.filter((stamp) => now - stamp < GLOBAL_ESCALATE_WINDOW_MS);
  return recent.length >= GLOBAL_ESCALATE_COUNT;
}

const globalStamps: number[] = [];

export function noteGlobalError(now: number = Date.now()): boolean {
  globalStamps.push(now);
  while (globalStamps.length > 0 && now - globalStamps[0] >= GLOBAL_ESCALATE_WINDOW_MS) {
    globalStamps.shift();
  }
  return globalStamps.length >= GLOBAL_ESCALATE_COUNT;
}

export function resetGlobalErrors(): void {
  globalStamps.length = 0;
}

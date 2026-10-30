import { attemptSync, reportBackgroundError } from "@/lib/core/attempt.utils";
import type { FatalInfo } from "@/types/core/fatal";

export const FATAL_STORAGE_KEY = "iluha.fatal.last";
export const FATAL_SAFE_KEY = "iluha.fatal.safe";

type FatalListener = (info: FatalInfo | null) => void;

let current: FatalInfo | null = null;
const listeners = new Set<FatalListener>();
let sessionSafe = false;

export function markSessionSafe(): void {
  sessionSafe = true;
}

export function isCurrentSessionSafe(): boolean {
  return sessionSafe;
}

function readStorage(): Storage | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage;
}

function isFatalInfo(value: unknown): value is FatalInfo {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    (record.kind === "render" ||
      record.kind === "chunk" ||
      record.kind === "startup" ||
      record.kind === "global-loop") &&
    typeof record.message === "string" &&
    typeof record.scope === "string"
  );
}

function normalize(info: FatalInfo): FatalInfo {
  return {
    kind: info.kind,
    message: info.message,
    stack: typeof info.stack === "string" ? info.stack : undefined,
    scope: info.scope,
    themeName: typeof info.themeName === "string" ? info.themeName : "win95",
    route: typeof info.route === "string" ? info.route : "/",
    timestamp: typeof info.timestamp === "number" ? info.timestamp : Date.now(),
    retryCount: typeof info.retryCount === "number" ? info.retryCount : 0,
  };
}

function emit(info: FatalInfo | null): void {
  for (const listener of listeners) {
    try {
      listener(info);
    } catch (error) {
      reportBackgroundError("fatal.emit", error);
    }
  }
}

export function subscribeFatal(listener: FatalListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCurrentFatal(): FatalInfo | null {
  return current;
}

export function reportFatal(info: FatalInfo): void {
  const safe = normalize(info);
  current = safe;
  const storage = readStorage();
  if (storage) {
    const [, error] = attemptSync(() => storage.setItem(FATAL_STORAGE_KEY, JSON.stringify(safe)));
    if (error !== null) reportBackgroundError("fatal.persist", error);
  }
  emit(safe);
}

export function clearFatal(): void {
  current = null;
  const storage = readStorage();
  if (storage) {
    const [, error] = attemptSync(() => storage.removeItem(FATAL_STORAGE_KEY));
    if (error !== null) reportBackgroundError("fatal.persist.clear", error);
  }
  emit(null);
}

export function readLastFatal(): FatalInfo | null {
  const storage = readStorage();
  if (!storage) return null;
  const [raw, readError] = attemptSync(() => storage.getItem(FATAL_STORAGE_KEY));
  if (readError !== null || !raw) return null;
  const [parsed, parseError] = attemptSync(() => JSON.parse(raw) as unknown);
  if (parseError !== null || !isFatalInfo(parsed)) return null;
  return normalize(parsed);
}

export function requestSafeMode(): void {
  const storage = readStorage();
  if (!storage) return;
  const [, error] = attemptSync(() => storage.setItem(FATAL_SAFE_KEY, "1"));
  if (error !== null) reportBackgroundError("fatal.safe.request", error);
}

export function isSafeMode(): boolean {
  const storage = readStorage();
  if (!storage) return false;
  const [raw, error] = attemptSync(() => storage.getItem(FATAL_SAFE_KEY));
  if (error !== null) return false;
  return raw === "1";
}

export function consumeSafeMode(): boolean {
  const storage = readStorage();
  const active = isSafeMode();
  if (storage && active) {
    const [, error] = attemptSync(() => storage.removeItem(FATAL_SAFE_KEY));
    if (error !== null) reportBackgroundError("fatal.safe.consume", error);
  }
  return active;
}

export function resetFatalModule(): void {
  current = null;
  listeners.clear();
  sessionSafe = false;
}

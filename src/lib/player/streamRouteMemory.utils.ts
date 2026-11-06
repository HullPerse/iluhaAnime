const STORAGE_KEY = "iluha.stream.route-memory";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 32;

export type StreamRoute = "direct" | "proxy";

interface RouteEntry {
  route: StreamRoute;
  at: number;
}

type RouteMemory = Record<string, RouteEntry>;

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function isEntry(value: unknown): value is RouteEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    (entry.route === "direct" || entry.route === "proxy") &&
    typeof entry.at === "number" &&
    Number.isFinite(entry.at)
  );
}

function readMemory(now: number): RouteMemory {
  const store = storage();
  if (!store) return {};
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const memory: RouteMemory = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (isEntry(value) && now - value.at <= TTL_MS) memory[key] = value;
    }
    return memory;
  } catch {
    return {};
  }
}

function writeMemory(memory: RouteMemory): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // A disabled or full storage must never break playback.
  }
}

function hostOf(mediaUrl: string): string {
  try {
    return new URL(mediaUrl).host;
  } catch {
    return "";
  }
}

/** One route decision per player and media host. */
function routeMemoryKey(variantId: string, mediaUrl: string): string {
  return `${variantId.split(":")[0] ?? ""}|${hostOf(mediaUrl)}`;
}

export function readRememberedRoute(
  variantId: string,
  mediaUrl: string,
  now = Date.now()
): StreamRoute | null {
  return readMemory(now)[routeMemoryKey(variantId, mediaUrl)]?.route ?? null;
}

/**
 * Store the route that actually produced a frame. A stale entry is replaced on
 * the first successful playback through the other route, and the TTL keeps a
 * one-off VPN failure from directing every episode for months.
 */
export function rememberStreamRoute(
  variantId: string,
  mediaUrl: string,
  proxyUrl: string | null | undefined,
  now = Date.now()
): void {
  const key = routeMemoryKey(variantId, mediaUrl);
  const route: StreamRoute = proxyUrl?.trim() ? "proxy" : "direct";
  const memory = readMemory(now);
  const previous = memory[key];
  if (previous && previous.route === route && now - previous.at < TTL_MS / 2) return;
  memory[key] = { route, at: now };
  const kept = Object.entries(memory)
    .filter(([, entry]) => now - entry.at <= TTL_MS)
    .sort(([, left], [, right]) => right.at - left.at)
    .slice(0, MAX_ENTRIES);
  writeMemory(Object.fromEntries(kept));
}

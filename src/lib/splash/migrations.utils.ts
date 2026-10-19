import { attemptSync } from "@/lib/utils/attempt.utils";

export interface StoreMigration {
  store: string;
  from: number;
  to: number;
}

export interface TrackedStore {
  store: string;
  current: number;
}

export const TRACKED_STORES: TrackedStore[] = [
  { store: "settings", current: 55 },
  { store: "theme", current: 0 },
  { store: "cache", current: 5 },
  { store: "search", current: 3 },
  { store: "collection-ui", current: 9 },
  { store: "notifications", current: 1 },
  { store: "anilistFriends", current: 1 },
  { store: "anilistReleaseObservations", current: 6 },
  { store: "player", current: 2 },
  { store: "media", current: 0 },
  { store: "categories", current: 1 },
  { store: "coverCorrections", current: 3 },
];

export function detectMigrations(): StoreMigration[] {
  if (typeof localStorage === "undefined") return [];
  const found: StoreMigration[] = [];
  for (const tracked of TRACKED_STORES) {
    const [raw, readError] = attemptSync(() => localStorage.getItem(`iluha.v1.${tracked.store}`));
    if (readError !== null || !raw) continue;
    const [parsed, parseError] = attemptSync(() => JSON.parse(raw) as unknown);
    if (parseError !== null || typeof parsed !== "object" || parsed === null) continue;
    const stored = (parsed as { sv?: unknown }).sv;
    if (typeof stored === "number" && stored < tracked.current) {
      found.push({ store: tracked.store, from: stored, to: tracked.current });
    }
  }
  return found;
}

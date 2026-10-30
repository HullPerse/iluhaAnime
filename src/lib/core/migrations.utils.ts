import { attemptSync } from "@/lib/core/attempt.utils";
import type { StoreMigration, TrackedStore } from "@/types/core/migrations";

export const TRACKED_STORES: TrackedStore[] = [
  { store: "settings", current: 59 },
  { store: "theme", current: 1 },
  { store: "cache", current: 5 },
  { store: "search", current: 4 },
  { store: "collection-ui", current: 9 },
  { store: "notifications", current: 1 },
  { store: "anilistFriends", current: 1 },
  { store: "anilistReleaseObservations", current: 6 },
  { store: "player", current: 3 },
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

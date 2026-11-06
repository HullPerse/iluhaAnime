import { attemptSync } from "@hullperse/hp_utils/attempt";
import { SCHEMA_VERSIONS } from "@/config/persistence/schemaVersions.config";
import type { StoreMigration, TrackedStore } from "@/types/core/migrations";

export const TRACKED_STORES: TrackedStore[] = [
  { store: "settings", current: SCHEMA_VERSIONS.settings },
  { store: "theme", current: SCHEMA_VERSIONS.theme },
  { store: "cache", current: SCHEMA_VERSIONS.cache },
  { store: "search", current: SCHEMA_VERSIONS.search },
  { store: "collection-ui", current: SCHEMA_VERSIONS.collection },
  { store: "notifications", current: SCHEMA_VERSIONS.notifications },
  { store: "anilistFriends", current: SCHEMA_VERSIONS.anilistFriends },
  { store: "anilistReleaseObservations", current: SCHEMA_VERSIONS.anilistReleaseObservations },
  { store: "player", current: SCHEMA_VERSIONS.player },
  { store: "media", current: SCHEMA_VERSIONS.media },
  { store: "categories", current: SCHEMA_VERSIONS.categories },
  { store: "coverCorrections", current: SCHEMA_VERSIONS.coverCorrections },
];

export function detectMigrations(): StoreMigration[] {
  if (typeof localStorage === "undefined") return [];
  const found: StoreMigration[] = [];
  for (const tracked of TRACKED_STORES) {
    const [raw, readError] = attemptSync(() => localStorage.getItem(`iluha.v1.${tracked.store}`));
    if (readError !== null || !raw) continue;
    const [parsed, parseError] = attemptSync((): unknown => JSON.parse(raw));
    if (parseError !== null || typeof parsed !== "object" || parsed === null) continue;
    const stored = (parsed as { sv?: unknown }).sv;
    if (typeof stored === "number" && stored < tracked.current) {
      found.push({ store: tracked.store, from: stored, to: tracked.current });
    }
  }
  return found;
}

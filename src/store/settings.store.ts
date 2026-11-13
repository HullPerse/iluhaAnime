import { SCHEMA_VERSIONS } from "@/config/persistence/schemaVersions.config";
import { DEFAULT_SETTINGS } from "@/config/settings/settingsDefaults.config";
import { DITHER_PLACEHOLDER_ID } from "@/config/graphics/dither.config";
import { applyWindowChrome } from "@/lib/core/system/window.utils";
import {
  applyAtomValues,
  buildMirrorAtoms,
  createPersistedStoreContext,
} from "@/lib/core/persistence/persisted.utils";
import { isRecord } from "@/lib/core/text/record.utils";
import { attemptSync, reportBackgroundError } from "@hullperse/hp_utils/attempt";
import { applyFontFamily } from "@/lib/graphics/font.utils";
import type { SettingsData, SettingsSignalStore } from "@/types/store/settings";
import type { SignalStoreOptions } from "@/types/store/options";
import { migrateSettingsData } from "@/store/settings/settings.migrations";

export { migrateSettingsData };
import {
  applyPatchSideEffects,
  applyUiPreferences,
  applyWindowEffect,
  applyWindowTint,
  applyYorhaScanlines,
} from "@/store/settings/settings.effects";

export const SETTINGS_SCHEMA_VERSION = SCHEMA_VERSIONS.settings;

function readLegacyMigrated(
  getStorage: () => Storage | undefined
): { data: Record<string, unknown>; schemaVersion: number } | null {
  const [storage, storageError] = attemptSync(() => getStorage());
  if (storageError !== null || !storage) return null;
  const [raw, readError] = attemptSync(() => storage.getItem("settings"));
  if (readError !== null || !raw) return null;
  const [parsed, parseError] = attemptSync((): unknown => JSON.parse(raw));
  if (parseError !== null || !isRecord(parsed)) return null;
  const state = isRecord(parsed.state) ? parsed.state : parsed;
  const version = typeof parsed.version === "number" ? parsed.version : 0;
  const [migrated, migrateError] = attemptSync(() => migrateSettingsData(state, version));
  if (migrateError !== null) return null;
  return { data: { ...migrated }, schemaVersion: SETTINGS_SCHEMA_VERSION };
}

export function createSettingsSignalStore(options: SignalStoreOptions = {}): SettingsSignalStore {
  const { store, persistor, getStorage, finishAdopt } = createPersistedStoreContext({
    storeName: "settings",
    short: "settings",
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    getStorage: options.getStorage,
    debounceMs: options.debounceMs,
    onFallback: (get) => readLegacyMigrated(get),
  });

  const persisted = persistor.read();
  const data: SettingsData = persisted
    ? migrateSettingsData(persisted.data, persisted.schemaVersion)
    : { ...DEFAULT_SETTINGS, language: "ru" };
  if (data.selectedDitherId === DITHER_PLACEHOLDER_ID) data.selectedDitherId = null;
  const mirror: Record<string, unknown> = { ...data };
  const atoms = buildMirrorAtoms(store, data, mirror);

  store.subscribeAll(() => {
    persistor.write(mirror);
  });

  const snapshot = (): SettingsData => ({ ...mirror }) as SettingsData;


  const handle: SettingsSignalStore = {
    atoms,
    persistor,
    snapshot,
    subscribeAll: (fn) => store.subscribeAll(fn),
    rehydrate: (): void => {
      const state = snapshot();
      const [, cleanupError] = attemptSync(() => {
        const storage = getStorage();
        storage?.removeItem("lobbyConnections");
        storage?.removeItem("sessionIdentity");
      });
      if (cleanupError !== null)
        reportBackgroundError("settings.signal.cleanup-lobby", cleanupError);
      applyUiPreferences(state.retroStyle, state.uiDensity, state.cardEffects);
      applyWindowEffect(state.windowEffect);
      applyWindowChrome({
        customTitleBarEnabled: state.customTitleBarEnabled,
        roundedWindowCorners: state.roundedWindowCorners,
        windowEffect: state.windowEffect,
      });
      applyWindowTint(state.windowTintOpacity);
      applyYorhaScanlines(state.yorhaScanlinesEnabled);
      if (state.appFont) applyFontFamily(state.appFont);
    },
    patch: (partial) => {
      applyPatchSideEffects(atoms, partial);
      store.batch(() => applyAtomValues(atoms, partial));
    },
  };

  finishAdopt(() => ({ ...snapshot() }), { remove: "settings" });

  return handle;
}

const settings = createSettingsSignalStore();

export const settingsAtoms = settings.atoms;
export const settingsPersistor = settings.persistor;
export const getSettingsSnapshot = settings.snapshot;
export const rehydrateSettings = settings.rehydrate;
export const patchSettings = settings.patch;
export function syncCoverModeWithAnilistAuth(loggedIn: boolean): void {
  if (settingsAtoms.torrentCoverModeManual.get()) return;
  const mode = loggedIn ? "full" : "off";
  if (settingsAtoms.torrentCoverMode.get() === mode) return;
  settings.patch({ torrentCoverMode: mode });
}
export function subscribeSettings(listener: () => void): () => void {
  return settings.subscribeAll(listener);
}

const INITIAL_SETTINGS_SNAPSHOT: SettingsData = getSettingsSnapshot();

export function resetSettingsAtoms(): void {
  applyAtomValues(settingsAtoms, INITIAL_SETTINGS_SNAPSHOT);
}

settings.rehydrate();
applyUiPreferences(
  settingsAtoms.retroStyle.get(),
  settingsAtoms.uiDensity.get(),
  settingsAtoms.cardEffects.get()
);
applyWindowEffect(settingsAtoms.windowEffect.get());
applyWindowTint(settingsAtoms.windowTintOpacity.get());
applyYorhaScanlines(settingsAtoms.yorhaScanlinesEnabled.get());
{
  const appFont = settingsAtoms.appFont.get();
  if (appFont) applyFontFamily(appFont);
}

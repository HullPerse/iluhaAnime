import { useCallback, useSyncExternalStore } from "react";

import { INTERNAL_SETTING_KEYS } from "@/config/settings/internalKeys.config";
import { DEFAULT_SETTINGS } from "@/config/settings/settingsDefaults.config";
import { keysOf } from "@/lib/core/hotkeys/keysOf.utils";
import { getSettingsSnapshot, subscribeSettings } from "@/store/settings.store";
import type { SettingsData } from "@/types/store/settings";

const INTERNAL_KEYS = new Set<string>(INTERNAL_SETTING_KEYS);
const DEFAULT_KEYS = keysOf(DEFAULT_SETTINGS).filter((key) => !INTERNAL_KEYS.has(key));

function changedSignature(snapshot: SettingsData): string {
  const changed: string[] = [];
  for (const key of DEFAULT_KEYS) {
    if (JSON.stringify(snapshot[key]) !== JSON.stringify(DEFAULT_SETTINGS[key])) {
      changed.push(key);
    }
  }
  return changed.join("\n");
}

let cachedSignature: string | null = null;
let cachedKeys: ReadonlySet<string> = new Set<string>();

function keysForSignature(signature: string): ReadonlySet<string> {
  if (cachedSignature === signature) return cachedKeys;
  cachedSignature = signature;
  cachedKeys = signature.length === 0 ? new Set<string>() : new Set(signature.split("\n"));
  return cachedKeys;
}

/** Subscribes only to the set of settings that differ from their defaults. */
export function useChangedSettingsKeys(): ReadonlySet<string> {
  const getSnapshot = useCallback(
    () => keysForSignature(changedSignature(getSettingsSnapshot())),
    []
  );
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      let current = getSnapshot();
      return subscribeSettings(() => {
        const next = getSnapshot();
        if (next === current) return;
        current = next;
        onStoreChange();
      });
    },
    [getSnapshot]
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

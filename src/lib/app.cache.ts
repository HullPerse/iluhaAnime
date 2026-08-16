import { invoke } from "@tauri-apps/api/core";

import type { AppCacheRecord, RawAppCacheRecord } from "@/types/cache";

export type { AppCacheRecord, RawAppCacheRecord } from "@/types/cache";

export async function readAppCache<T>(
  namespace: string,
  key: string
): Promise<AppCacheRecord<T> | null> {
  try {
    const record = await invoke<RawAppCacheRecord | null>("get_app_cache", {
      key,
      namespace,
    });
    if (!record) return null;
    return {
      ...record,
      payload: JSON.parse(record.payload) as T,
    };
  } catch {
    // The web preview and older installations may not have the command yet.
    return null;
  }
}

export async function writeAppCache<T>(
  namespace: string,
  key: string,
  payload: T,
  ttlSeconds?: number
): Promise<boolean> {
  try {
    await invoke("put_app_cache", {
      key,
      namespace,
      payload: JSON.stringify(payload),
      ttlSeconds: ttlSeconds ?? null,
    });
    return true;
  } catch {
    return false;
  }
}

export async function deleteAppCache(
  namespace: string,
  key: string
): Promise<boolean> {
  try {
    await invoke("delete_app_cache", { key, namespace });
    return true;
  } catch {
    return false;
  }
}

export async function clearAppCache(namespace?: string): Promise<boolean> {
  try {
    await invoke("clear_app_cache", { namespace: namespace ?? null });
    return true;
  } catch {
    return false;
  }
}

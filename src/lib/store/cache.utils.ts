import { invokeTyped } from "@/lib/utils/invoke.utils";
import type { AppCacheRecord, RawAppCacheRecord } from "@/types/cache";

export type { AppCacheRecord } from "@/types/cache";

export async function readAppCache<T>(
  namespace: string,
  key: string
): Promise<AppCacheRecord<T> | null> {
  try {
    const record = await invokeTyped<RawAppCacheRecord | null>("get_app_cache", {
      key,
      namespace,
    });
    if (!record) return null;
    return {
      ...record,
      payload: JSON.parse(record.payload) as T,
    };
  } catch {
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
    await invokeTyped("put_app_cache", {
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

export async function deleteAppCache(namespace: string, key: string): Promise<boolean> {
  try {
    await invokeTyped("delete_app_cache", { key, namespace });
    return true;
  } catch {
    return false;
  }
}

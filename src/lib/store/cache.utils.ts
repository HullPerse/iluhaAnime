import { attemptAll } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import type { AppCacheRecord, RawAppCacheRecord } from "@/types/cache";

export type { AppCacheRecord } from "@/types/cache";

export async function readAppCache<T>(
  namespace: string,
  key: string
): Promise<AppCacheRecord<T> | null> {
  let record: AppCacheRecord<T> | null = null;
  const error = await attemptAll([
    async () => {
      const raw = await invokeTyped<RawAppCacheRecord | null>("get_app_cache", { key, namespace });
      record = raw === null ? null : { ...raw, payload: JSON.parse(raw.payload) as T };
    },
  ]);
  return error === null ? record : null;
}

export async function writeAppCache<T>(
  namespace: string,
  key: string,
  payload: T,
  ttlSeconds?: number
): Promise<boolean> {
  const error = await attemptAll([
    () =>
      invokeTyped("put_app_cache", {
        key,
        namespace,
        payload: JSON.stringify(payload),
        ttlSeconds: ttlSeconds ?? null,
      }),
  ]);
  return error === null;
}

export async function deleteAppCache(namespace: string, key: string): Promise<boolean> {
  const error = await attemptAll([() => invokeTyped("delete_app_cache", { key, namespace })]);
  return error === null;
}

import { systemApi } from "@/api/system.api";
import { attemptAll } from "@/lib/utils/attempt.utils";
import type { AppCacheRecord, RawAppCacheRecord } from "@/types/cache";

export type { AppCacheRecord } from "@/types/cache";

export async function readAppCache<T>(
  namespace: string,
  key: string
): Promise<AppCacheRecord<T> | null> {
  let record: AppCacheRecord<T> | null = null;
  const error = await attemptAll([
    async () => {
      const raw = await systemApi.getAppCache<RawAppCacheRecord | null>(namespace, key);
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
    () => systemApi.putAppCache(namespace, key, JSON.stringify(payload), ttlSeconds ?? null),
  ]);
  return error === null;
}

export async function deleteAppCache(namespace: string, key: string): Promise<boolean> {
  const error = await attemptAll([() => systemApi.deleteAppCache(namespace, key)]);
  return error === null;
}

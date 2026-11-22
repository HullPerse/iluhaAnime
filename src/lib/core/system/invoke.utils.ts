import { invoke } from "@tauri-apps/api/core";
import * as z from "zod/mini";

import { attempt, attemptSync } from "@hullperse/hp_utils/attempt";
import { parseValue } from "@/lib/core/persistence/schema.utils";
import { normalizeIpcError } from "@/lib/core/system/ipcError.utils";
import { beginIpcInvoke, finishIpcInvoke } from "@/lib/core/system/ipcStats.utils";
import type { CommandName } from "@/types/core/ipc";

export type { CommandName };

function responseSize(value: unknown): number {
  if (value instanceof ArrayBuffer) return value.byteLength;

  if (ArrayBuffer.isView(value)) return value.byteLength;

  if (typeof Blob !== "undefined" && value instanceof Blob) return value.size;

  if (typeof value === "string") return value.length;

  const [json] = attemptSync(() => JSON.stringify(value ?? null));

  return json?.length ?? 0;
}

export async function invokeCommand<T>(
  command: CommandName,
  args?: Record<string, unknown>
): Promise<Awaited<T>> {
  const startedAt = beginIpcInvoke(command, args);
  const [value, error] = await attempt(invoke<Awaited<T>>(command, args));

  finishIpcInvoke(command, startedAt, error !== null, error === null ? responseSize(value) : 0);

  if (error !== null) throw normalizeIpcError(error);

  return value;
}

export async function invokeTyped<T>(
  command: CommandName,
  args?: Record<string, unknown>
): Promise<Awaited<T>> {
  return invokeCommand<T>(command, args);
}

export function assertSchema<T>(value: unknown, schema: z.ZodMiniType<T>): T {
  const result = parseValue(value, schema);

  if (!result.ok) throw result.error;

  return result.value;
}

export async function invokeValidated<T>(
  command: CommandName,
  schema: z.ZodMiniType<T>,
  args?: Record<string, unknown>
): Promise<T> {
  const value = await invokeTyped<unknown>(command, args);

  return assertSchema(value, schema);
}

import { invoke } from "@tauri-apps/api/core";
import * as z from "zod/mini";

import { attempt } from "@hullperse/hp_utils/attempt";
import { parseValue } from "@/lib/core/persistence/schema.utils";
import { normalizeIpcError } from "@/lib/core/system/ipcError.utils";
import type { CommandName } from "@/types/core/ipc";

export type { CommandName };

export async function invokeTyped<T>(
  command: CommandName,
  args?: Record<string, unknown>
): Promise<Awaited<T>> {
  const [value, error] = await attempt(invoke<Awaited<T>>(command, args));
  if (error !== null) throw normalizeIpcError(error);
  return value;
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

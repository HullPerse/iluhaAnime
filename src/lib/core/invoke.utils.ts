import { invoke } from "@tauri-apps/api/core";
import * as z from "zod/mini";

import { attempt } from "@/lib/core/attempt.utils";
import type { Result } from "@/types/core/result";
import { err } from "@/lib/core/result.utils";
import { parseValue } from "@/lib/core/schema.utils";
import type { CommandName } from "@/types/core/ipc";

export type { CommandName };

export async function invokeTyped<T>(
  command: CommandName,
  args?: Record<string, unknown>
): Promise<Awaited<T>> {
  return invoke<Awaited<T>>(command, args);
}

export async function invokeValidated<T>(
  command: CommandName,
  schema: z.ZodMiniType<T>,
  args?: Record<string, unknown>
): Promise<Result<T>> {
  const [value, error] = await attempt(invoke<unknown>(command, args));
  return error === null ? parseValue(value, schema) : err(error);
}

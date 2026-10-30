import { invoke } from "@tauri-apps/api/core";
import * as z from "zod/mini";

import { attempt } from "@/lib/attempt.utils";
import type { Result } from "@/types/result";
import { err } from "@/lib/result.utils";
import { parseValue } from "@/lib/schema.utils";
import type { CommandName } from "@/types/ipc";

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

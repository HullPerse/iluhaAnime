import { invoke } from "@tauri-apps/api/core";
import * as z from "zod/mini";

import { attempt } from "@/lib/utils/attempt.utils";
import type { Result } from "@/lib/utils/result.utils";
import { err } from "@/lib/utils/result.utils";
import { parseValue } from "@/lib/utils/schema.utils";
import type { CommandName } from "@/types/ipc";

export type { CommandName };

export async function invokeTyped<T>(
  command: CommandName,
  args?: Record<string, unknown>
): Promise<T> {
  return invoke<T>(command, args);
}

/**
 * Invokes a command and validates the payload it returns, so a Rust rename or
 * an unexpected shape fails at the boundary with a reason instead of flowing
 * into UI state as an unchecked value.
 */
export async function invokeValidated<T>(
  command: CommandName,
  schema: z.ZodMiniType<T>,
  args?: Record<string, unknown>
): Promise<Result<T>> {
  const [value, error] = await attempt(invoke<unknown>(command, args));
  return error === null ? parseValue(value, schema) : err(error);
}

import { invoke } from "@tauri-apps/api/core";

import type { CommandName } from "@/types/ipc";

export type { CommandName };

export async function invokeTyped<T>(
  command: CommandName,
  args?: Record<string, unknown>
): Promise<T> {
  return invoke<T>(command, args);
}
